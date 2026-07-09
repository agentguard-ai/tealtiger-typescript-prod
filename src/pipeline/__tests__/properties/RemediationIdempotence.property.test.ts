/**
 * Property-based test: Post-Execution Remediation Idempotence
 *
 * **Validates: Requirements 4.3**
 *
 * Property 8: For any response that passes the PostExecutionStage (merged
 * action = ALLOW), re-evaluating the same response through the same
 * PostExecutionStage configuration SHALL still produce ALLOW — passing
 * responses are stable under re-evaluation.
 *
 * ```
 * ∀ response R that passes post-stage:
 *   eval1 = postStage.evaluate(modules, R, ctx, policy)
 *   eval1.action NOT DENY-level
 *   eval2 = postStage.evaluate(modules, R, ctx, policy)
 *   eval2.action NOT DENY-level  (same result)
 * ```
 *
 * @module pipeline/__tests__/properties/RemediationIdempotence.property.test
 */

import * as fc from 'fast-check';
import { StageEvaluator } from '../../StageEvaluator';
import { PipelineStage, ACTION_SEVERITY } from '../../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/** Actions that are non-DENY (severity < 70) — modules that produce these pass the stage */
const NON_DENY_ACTIONS: Array<ModuleResult['action']> = ['ALLOW', 'MONITOR'] as Array<ModuleResult['action']>;

/** Arbitrary for non-DENY action selection */
const nonDenyActionArb = fc.constantFrom(...NON_DENY_ACTIONS);

/** Arbitrary for response content (simulates LLM response) */
const responseContentArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 200 }),
  fc.json(),
  fc.constant('Hello, how can I help you today?'),
);

/** Arbitrary for request payloads that include response context */
const evaluationRequestArb: fc.Arbitrary<ModuleEvaluationRequest> = fc.record({
  content: responseContentArb,
  model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro', 'mistral-large'),
  _response: fc.oneof(
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.record({
      content: fc.string({ minLength: 1, maxLength: 100 }),
      role: fc.constant('assistant'),
    }),
  ),
});



// ── Helper Functions ─────────────────────────────────────────────

/** Build a module context for evaluation */
function makeContext(): ModuleContext {
  return {
    correlation_id: 'pbt-idempotence-' + Date.now(),
    policy_version: '1.4.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };
}

/**
 * Create a deterministic module that always returns the specified action.
 * These modules are pure functions of their input — same input always produces
 * the same output, which is the prerequisite for idempotence.
 */
function createDeterministicModule(
  name: string,
  action: ModuleResult['action'],
): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (
      _request: ModuleEvaluationRequest,
      _ctx: ModuleContext,
      _policy: unknown,
    ): Promise<ModuleResult> => ({
      action,
      reason_codes: action === 'ALLOW' ? [] : [`${name.toUpperCase()}_FLAGGED`],
      event_type: 'pipeline.post_execution',
      metadata: { module: name, deterministic: true },
    }),
  };
}

/**
 * Create an array of deterministic modules that all return non-DENY actions.
 * This ensures the first evaluation passes, allowing us to test idempotence.
 */
function createPassingModules(
  actions: Array<ModuleResult['action']>,
): TealModule[] {
  return actions.map((action, i) =>
    createDeterministicModule(`post-mod-${i}`, action),
  );
}

/**
 * Check whether a merged action is at the DENY level (severity >= 70).
 */
function isDenyLevel(action: string): boolean {
  const severity = ACTION_SEVERITY[action] ?? 0;
  return severity >= 70;
}

// ── Property Tests ───────────────────────────────────────────────

describe('Property 8: Post-Execution Remediation Idempotence', () => {
  /**
   * Core idempotence property: evaluating the same response twice through
   * the same StageEvaluator with the same deterministic modules produces
   * the same non-DENY result both times.
   *
   * **Validates: Requirements 4.3**
   */
  describe('Deterministic modules — same response always produces same result', () => {
    it('re-evaluation of a passing response still produces non-DENY action', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonDenyActionArb, { minLength: 1, maxLength: 5 }),
          evaluationRequestArb,
          async (actions, request) => {
            const modules = createPassingModules(actions);
            const ctx = makeContext();
            const policy = null;

            // POST_EXECUTION stage, fail-closed, default timeout
            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              5000,
            );

            // First evaluation
            const eval1 = await postStage.evaluate(modules, request, ctx, policy);

            // Verify first evaluation passes (not DENY-level)
            expect(isDenyLevel(eval1.action)).toBe(false);

            // Second evaluation — same modules, same request, same context
            const eval2 = await postStage.evaluate(modules, request, ctx, policy);

            // Property: second evaluation must also not be DENY-level
            expect(isDenyLevel(eval2.action)).toBe(false);

            // Stronger: both evaluations produce identical actions
            expect(eval2.action).toBe(eval1.action);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('merged action is identical across multiple re-evaluations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonDenyActionArb, { minLength: 1, maxLength: 5 }),
          evaluationRequestArb,
          fc.integer({ min: 2, max: 5 }),
          async (actions, request, evalCount) => {
            const modules = createPassingModules(actions);
            const ctx = makeContext();
            const policy = null;

            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              5000,
            );

            // Evaluate N times
            const results = [];
            for (let i = 0; i < evalCount; i++) {
              const evalResult = await postStage.evaluate(
                modules,
                request,
                ctx,
                policy,
              );
              results.push(evalResult);
            }

            // Property: all evaluations produce identical actions
            const firstAction = results[0].action;
            for (const result of results) {
              expect(result.action).toBe(firstAction);
              expect(isDenyLevel(result.action)).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Reason codes stability: re-evaluation produces the same set of reason codes.
   *
   * **Validates: Requirements 4.3**
   */
  describe('Reason codes are stable across re-evaluations', () => {
    it('reason codes from both evaluations are identical', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonDenyActionArb, { minLength: 1, maxLength: 5 }),
          evaluationRequestArb,
          async (actions, request) => {
            const modules = createPassingModules(actions);
            const ctx = makeContext();
            const policy = null;

            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              5000,
            );

            const eval1 = await postStage.evaluate(modules, request, ctx, policy);
            const eval2 = await postStage.evaluate(modules, request, ctx, policy);

            // Property: reason codes are identical
            expect(eval2.reason_codes).toEqual(eval1.reason_codes);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Module details stability: re-evaluation produces the same per-module
   * action decisions.
   *
   * **Validates: Requirements 4.3**
   */
  describe('Per-module details are stable across re-evaluations', () => {
    it('each module produces the same action on re-evaluation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonDenyActionArb, { minLength: 1, maxLength: 5 }),
          evaluationRequestArb,
          async (actions, request) => {
            const modules = createPassingModules(actions);
            const ctx = makeContext();
            const policy = null;

            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              5000,
            );

            const eval1 = await postStage.evaluate(modules, request, ctx, policy);
            const eval2 = await postStage.evaluate(modules, request, ctx, policy);

            // Property: same number of module details
            expect(eval2.module_details.length).toBe(eval1.module_details.length);

            // Property: each module produces the same action
            for (let i = 0; i < eval1.module_details.length; i++) {
              expect(eval2.module_details[i].action).toBe(
                eval1.module_details[i].action,
              );
              expect(eval2.module_details[i].name).toBe(
                eval1.module_details[i].name,
              );
              expect(eval2.module_details[i].reason_codes).toEqual(
                eval1.module_details[i].reason_codes,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Mixed ALLOW + MONITOR modules: even when the merged action is MONITOR
   * (severity 10), re-evaluation still produces the same non-DENY result.
   *
   * **Validates: Requirements 4.3**
   */
  describe('Mixed ALLOW/MONITOR modules — idempotence holds', () => {
    it('MONITOR-merged result is stable under re-evaluation', async () => {
      await fc.assert(
        fc.asyncProperty(
          evaluationRequestArb,
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 1, max: 3 }),
          async (request, allowCount, monitorCount) => {
            // Create a mix of ALLOW and MONITOR modules
            const allowModules = Array.from({ length: allowCount }, (_, i) =>
              createDeterministicModule(`allow-mod-${i}`, 'ALLOW' as ModuleResult['action']),
            );
            const monitorModules = Array.from({ length: monitorCount }, (_, i) =>
              createDeterministicModule(`monitor-mod-${i}`, 'MONITOR' as ModuleResult['action']),
            );
            const modules = [...allowModules, ...monitorModules];

            const ctx = makeContext();
            const policy = null;

            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              5000,
            );

            const eval1 = await postStage.evaluate(modules, request, ctx, policy);
            const eval2 = await postStage.evaluate(modules, request, ctx, policy);

            // MostRestrictiveWins: MONITOR > ALLOW, so merged should be MONITOR
            expect(eval1.action).toBe('MONITOR');
            expect(eval2.action).toBe('MONITOR');

            // Property: both evaluations produce MONITOR (not DENY)
            expect(isDenyLevel(eval1.action)).toBe(false);
            expect(isDenyLevel(eval2.action)).toBe(false);
            expect(eval2.action).toBe(eval1.action);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * All-ALLOW modules: the simplest passing case is also idempotent.
   *
   * **Validates: Requirements 4.3**
   */
  describe('All-ALLOW modules — idempotence holds', () => {
    it('ALLOW result is stable under re-evaluation', async () => {
      await fc.assert(
        fc.asyncProperty(
          evaluationRequestArb,
          fc.integer({ min: 1, max: 5 }),
          async (request, count) => {
            const modules = Array.from({ length: count }, (_, i) =>
              createDeterministicModule(`allow-mod-${i}`, 'ALLOW' as ModuleResult['action']),
            );

            const ctx = makeContext();
            const policy = null;

            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              5000,
            );

            const eval1 = await postStage.evaluate(modules, request, ctx, policy);
            const eval2 = await postStage.evaluate(modules, request, ctx, policy);

            // Property: both evaluations produce ALLOW
            expect(eval1.action).toBe('ALLOW');
            expect(eval2.action).toBe('ALLOW');
            expect(isDenyLevel(eval1.action)).toBe(false);
            expect(isDenyLevel(eval2.action)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Fail-closed=false variant: idempotence holds regardless of fail policy
   * when modules are deterministic and non-DENY.
   *
   * **Validates: Requirements 4.3**
   */
  describe('Fail-closed=false — idempotence still holds for passing modules', () => {
    it('result is stable under re-evaluation with fail_closed=false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonDenyActionArb, { minLength: 1, maxLength: 5 }),
          evaluationRequestArb,
          async (actions, request) => {
            const modules = createPassingModules(actions);
            const ctx = makeContext();
            const policy = null;

            // fail_closed=false
            const postStage = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              false,
              5000,
            );

            const eval1 = await postStage.evaluate(modules, request, ctx, policy);
            const eval2 = await postStage.evaluate(modules, request, ctx, policy);

            // Property: identical non-DENY results
            expect(isDenyLevel(eval1.action)).toBe(false);
            expect(isDenyLevel(eval2.action)).toBe(false);
            expect(eval2.action).toBe(eval1.action);
            expect(eval2.reason_codes).toEqual(eval1.reason_codes);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
