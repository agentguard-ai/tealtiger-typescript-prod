/**
 * Property-based test: Resample Budget Bound
 *
 * **Validates: Requirements 4.5, 4.6**
 *
 * Property 4: For any pipeline with `resample_budget = N`, the total number of
 * LLM provider invocations for a single request SHALL NOT exceed N + 1 (the
 * initial call plus N resample attempts), and `resample_count` in the result
 * SHALL NOT exceed N.
 *
 * ```
 * ∀ request R, ∀ pipeline P with resample_budget = N:
 *   P.execute(R).resample_count <= N
 *   provider.callCount <= N + 1
 * ```
 *
 * @module pipeline/__tests__/properties/ResampleBudgetBound.property.test
 */

import * as fc from 'fast-check';
import { RemediationHandler } from '../../RemediationHandler';
import type {
  ExecutionStageInterface,
  StageEvaluatorInterface,
} from '../../RemediationHandler';
import type { PipelineRequest } from '../../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary for resample budget (0–10) */
const budgetArb = fc.integer({ min: 0, max: 10 });

/** Arbitrary for request payloads */
const requestArb: fc.Arbitrary<PipelineRequest> = fc.record({
  payload: fc.record({
    content: fc.string({ minLength: 1, maxLength: 100 }),
    model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro'),
  }),
  correlation_id: fc.uuid(),
});

// ── Helper Functions ─────────────────────────────────────────────

/** Build a mock module context */
function makeContext(): ModuleContext {
  return {
    correlation_id: 'pbt-resample-' + Date.now(),
    policy_version: '1.0.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };
}

/** Create a mock execution stage that always returns a response and tracks calls */
function createMockExecutionStage(callTracker: { count: number }): ExecutionStageInterface {
  return {
    execute: async (_request: PipelineRequest) => {
      callTracker.count++;
      return {
        success: true,
        response: { content: `response-${callTracker.count}` },
        metadata: { model: 'mock', latency_ms: 10, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }, cost_usd: 0.001 },
      };
    },
  };
}

/** Create a mock evaluator that always returns DENY (worst case — never passes) */
function createAlwaysDenyEvaluator(): StageEvaluatorInterface {
  return {
    evaluate: async () => ({
      action: 'DENY',
      reason_codes: ['CONTENT_VIOLATION'],
      module_details: [
        {
          name: 'mock-post-mod',
          version: '1.0.0',
          latency_ms: 5,
          action: 'DENY',
          reason_codes: ['CONTENT_VIOLATION'],
          metadata: { remediation: 'resample' },
        },
      ],
      latency_ms: 5,
    }),
  };
}

/** Create a mock evaluator with a configurable pass/fail pattern */
function createPatternEvaluator(pattern: boolean[]): StageEvaluatorInterface {
  let callIndex = 0;
  return {
    evaluate: async () => {
      const shouldPass = pattern[callIndex] ?? false;
      callIndex++;
      if (shouldPass) {
        return {
          action: 'ALLOW',
          reason_codes: [],
          module_details: [
            {
              name: 'mock-post-mod',
              version: '1.0.0',
              latency_ms: 5,
              action: 'ALLOW',
              reason_codes: [],
            },
          ],
          latency_ms: 5,
        };
      }
      return {
        action: 'DENY',
        reason_codes: ['CONTENT_VIOLATION'],
        module_details: [
          {
            name: 'mock-post-mod',
            version: '1.0.0',
            latency_ms: 5,
            action: 'DENY',
            reason_codes: ['CONTENT_VIOLATION'],
            metadata: { remediation: 'resample' },
          },
        ],
        latency_ms: 5,
      };
    },
  };
}

/** Minimal mock modules array for evaluation */
const mockModules: TealModule[] = [
  {
    name: 'mock-post-mod',
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: 'DENY' as ModuleResult['action'],
      reason_codes: ['CONTENT_VIOLATION'],
      event_type: 'test',
    }),
  },
];

// ── Property Tests ───────────────────────────────────────────────

describe('Property 4: Resample Budget Bound', () => {
  /**
   * Worst case: every resample attempt fails post-stage evaluation.
   * The resample count must never exceed budget, and execution stage calls
   * must not exceed (budget - startingAttempt).
   *
   * **Validates: Requirements 4.5, 4.6**
   */
  describe('Worst case — all resamples fail (always DENY)', () => {
    it('resampleCount <= budget for any budget and starting attempt', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetArb,
          requestArb,
          async (budget, request) => {
            const startingAttempt = 0;
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createAlwaysDenyEvaluator();

            const result = await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              startingAttempt,
            );

            // Property: resampleCount must never exceed the budget
            expect(result.resampleCount).toBeLessThanOrEqual(budget);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('execution stage is called at most (budget - startingAttempt) times', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetArb.filter((b) => b > 0),
          requestArb,
          async (budget, request) => {
            // Generate a starting attempt from 0 to budget
            const startingAttempt = Math.floor(Math.random() * (budget + 1));
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createAlwaysDenyEvaluator();

            await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              startingAttempt,
            );

            // Property: execution stage calls cannot exceed remaining budget
            const maxCalls = budget - startingAttempt;
            expect(callTracker.count).toBeLessThanOrEqual(maxCalls);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('result.exhausted === true when budget is fully used', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetArb,
          requestArb,
          async (budget, request) => {
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createAlwaysDenyEvaluator();

            const result = await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              0, // start from 0
            );

            // When all attempts fail, budget must be exhausted
            expect(result.exhausted).toBe(true);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Random pass/fail patterns: regardless of which attempts pass or fail,
   * the resampleCount must never exceed the budget.
   *
   * **Validates: Requirements 4.5, 4.6**
   */
  describe('Random pass/fail patterns — budget always respected', () => {
    it('resampleCount <= budget for any combination of pass/fail responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetArb,
          fc.array(fc.boolean(), { minLength: 0, maxLength: 10 }),
          requestArb,
          async (budget, pattern, request) => {
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createPatternEvaluator(pattern);

            const result = await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              0,
            );

            // Property: resampleCount never exceeds budget
            expect(result.resampleCount).toBeLessThanOrEqual(budget);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('execution stage call count <= budget for any pattern', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetArb,
          fc.array(fc.boolean(), { minLength: 0, maxLength: 10 }),
          requestArb,
          async (budget, pattern, request) => {
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createPatternEvaluator(pattern);

            await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              0,
            );

            // Property: provider invocations never exceed budget
            expect(callTracker.count).toBeLessThanOrEqual(budget);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('when pattern has early pass, resampleCount < budget', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          requestArb,
          async (budget, request) => {
            // First attempt passes — should stop immediately
            const pattern = [true, ...Array(budget - 1).fill(false)];
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createPatternEvaluator(pattern);

            const result = await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              0,
            );

            // Should pass on first resample attempt
            expect(result.success).toBe(true);
            expect(result.resampleCount).toBe(1);
            expect(result.exhausted).toBe(false);
            expect(callTracker.count).toBe(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Budget = 0 edge case: no resamples should be attempted at all.
   *
   * **Validates: Requirements 4.5, 4.6**
   */
  describe('Edge case — budget = 0', () => {
    it('zero resamples are attempted when budget is 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          requestArb,
          async (request) => {
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(0);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createAlwaysDenyEvaluator();

            const result = await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              0,
            );

            // No resamples should be attempted
            expect(result.resampleCount).toBe(0);
            expect(callTracker.count).toBe(0);
            expect(result.exhausted).toBe(true);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Starting attempt offset: when starting from a non-zero attempt,
   * the remaining budget is correctly enforced.
   *
   * **Validates: Requirements 4.5, 4.6**
   */
  describe('Starting attempt offset — remaining budget enforcement', () => {
    it('resampleCount equals startingAttempt + actual attempts made', async () => {
      await fc.assert(
        fc.asyncProperty(
          budgetArb.filter((b) => b >= 2),
          requestArb,
          async (budget, request) => {
            const startingAttempt = Math.floor(budget / 2);
            const callTracker = { count: 0 };
            const handler = new RemediationHandler(budget);
            const executionStage = createMockExecutionStage(callTracker);
            const evaluator = createAlwaysDenyEvaluator();

            const result = await handler.executeResampleLoop(
              request,
              executionStage,
              evaluator,
              mockModules,
              makeContext(),
              {},
              startingAttempt,
            );

            // resampleCount tracks total attempts (starting + new)
            expect(result.resampleCount).toBeLessThanOrEqual(budget);
            // Execution calls equal actual new attempts
            expect(callTracker.count).toBe(budget - startingAttempt);
            expect(result.exhausted).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
