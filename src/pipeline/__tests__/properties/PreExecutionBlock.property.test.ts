/**
 * Property-based test: Pre-Execution Block Prevents Provider Call
 *
 * **Validates: Requirements 2.3, 5.5**
 *
 * Property 2: For any request that is denied at the PreExecutionStage, the LLM
 * provider SHALL NOT be invoked — no network call, no cost incurred.
 *
 * ```
 * ∀ request R, ∀ pipeline P:
 *   IF P.execute(R).blocked_stage === "PRE_EXECUTION"
 *   THEN provider.callCount === 0
 * ```
 *
 * Generate requests with pre-execution modules that always return DENY
 * (various DENY-level actions). Verify the ObserveProxy's method is never called.
 *
 * @module pipeline/__tests__/properties/PreExecutionBlock.property.test
 */

import * as fc from 'fast-check';
import { DefensePipeline } from '../../DefensePipeline';
import { PipelineStage } from '../../types';
import type { PipelineConfig, PipelineRequest } from '../../types';
import type {
  TealModule,
  ModuleResult,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/**
 * DENY-level actions that have severity >= 70 in the ACTION_SEVERITY map.
 * Any of these will cause the pre-execution stage to block the request.
 */
const denyLevelActionArb = fc.constantFrom(
  'DENY',
  'DENY_WRITE',
  'DENY_READ',
  'REDACT',
  'REQUIRE_APPROVAL',
);

/** Arbitrary for random request payloads */
const requestPayloadArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  fc.record({
    content: fc.string({ minLength: 1, maxLength: 200 }),
    model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro', 'mistral-large'),
  }),
  fc.record({
    content: fc.string({ minLength: 1, maxLength: 100 }),
    tool: fc.string({ minLength: 1, maxLength: 30 }),
    args: fc.object({ maxDepth: 2, maxKeys: 4 }),
  }),
  fc.object({ maxDepth: 2, maxKeys: 5 }).map((obj) => ({
    ...obj,
    content: 'auto-content',
  })),
);

/** Arbitrary for generating PipelineRequest objects */
const pipelineRequestArb: fc.Arbitrary<PipelineRequest> = requestPayloadArb.map(
  (payload) => ({
    payload,
    correlation_id: `pbt-pre-block-${Date.now()}-${Math.random()}`,
  }),
);

/**
 * Arbitrary for generating 1–5 pre-execution modules where ALL modules
 * return a DENY-level action (ensuring the stage always blocks).
 */
const allDenyModulesArb: fc.Arbitrary<TealModule[]> = fc
  .array(denyLevelActionArb, { minLength: 1, maxLength: 5 })
  .map((actions) =>
    actions.map((action, i) => createDenyModule(`deny-mod-${i}`, action)),
  );

/**
 * Arbitrary for generating 1–5 pre-execution modules where at least ONE
 * returns a DENY-level action (mixed with ALLOW/MONITOR).
 * MostRestrictiveWins ensures the stage still blocks.
 */
const mixedModulesWithDenyArb: fc.Arbitrary<TealModule[]> = fc
  .tuple(
    denyLevelActionArb,
    fc.array(fc.constantFrom('ALLOW', 'MONITOR'), { minLength: 0, maxLength: 4 }),
  )
  .chain(([denyAction, otherActions]) => {
    // Shuffle the deny module into a random position among the others
    return fc.integer({ min: 0, max: otherActions.length }).map((insertPos) => {
      const modules: TealModule[] = [];
      let normalIdx = 0;

      for (let i = 0; i <= otherActions.length; i++) {
        if (i === insertPos) {
          modules.push(createDenyModule('deny-mod', denyAction));
        } else {
          const action = otherActions[normalIdx] ?? 'ALLOW';
          modules.push(createNormalModule(`normal-mod-${normalIdx}`, action));
          normalIdx++;
        }
      }

      return modules;
    });
  });

// ── Helper Functions ─────────────────────────────────────────────

/** Create a module that returns a DENY-level action */
function createDenyModule(name: string, action: string): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: action as ModuleResult['action'],
      reason_codes: [`${action}_REASON`],
      event_type: 'governance.pre_execution',
    }),
  };
}

/** Create a module that returns a given non-DENY action */
function createNormalModule(name: string, action: string): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: action as ModuleResult['action'],
      reason_codes: [`${action}_REASON`],
      event_type: 'governance.pre_execution',
    }),
  };
}

/**
 * Create a mock ObserveProxy that tracks calls to the provider.
 * The `chat.completions.create` method is mocked with a Jest spy
 * so we can assert it was never called when the request is blocked.
 */
function createMockObserveProxy(): {
  proxy: any;
  callTracker: { count: number };
} {
  const callTracker = { count: 0 };

  const createFn = jest.fn(async (_payload: any) => {
    callTracker.count++;
    return {
      id: 'mock-response-id',
      model: 'mock-model',
      choices: [{ message: { content: 'mock response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
  });

  const proxy = {
    chat: {
      completions: {
        create: createFn,
      },
    },
    getCost: () => ({
      totalCost: 0,
      requestCount: 0,
      hasPricingGaps: false,
      breakdown: { inputCost: 0, outputCost: 0, imageCost: 0, audioCost: 0 },
    }),
    getAgentCost: () => ({
      totalCost: 0,
      requestCount: 0,
      hasPricingGaps: false,
      breakdown: { inputCost: 0, outputCost: 0, imageCost: 0, audioCost: 0 },
    }),
    getBaseline: () => null,
    getAgentId: () => 'mock-agent',
    getSessionId: () => 'mock-session',
    getDecisions: () => [],
  };

  return { proxy, callTracker };
}

/**
 * Build a PipelineConfig with the given pre-execution modules and a
 * tracked mock ObserveProxy.
 */
function buildConfig(
  preExecutionModules: TealModule[],
  proxy: any,
): PipelineConfig {
  return {
    preExecutionModules,
    postExecutionModules: [],
    observeProxy: proxy,
  };
}

// ── Property Tests ───────────────────────────────────────────────

describe('Property 2: Pre-Execution Block Prevents Provider Call', () => {
  /**
   * When ALL pre-execution modules return DENY-level actions, the provider
   * must never be called.
   *
   * **Validates: Requirements 2.3, 5.5**
   */
  describe('All modules DENY — provider never invoked', () => {
    it('provider callCount === 0 when all pre-execution modules deny', async () => {
      await fc.assert(
        fc.asyncProperty(
          allDenyModulesArb,
          pipelineRequestArb,
          async (modules, request) => {
            const { proxy, callTracker } = createMockObserveProxy();
            const config = buildConfig(modules, proxy);
            const pipeline = new DefensePipeline(config);

            const result = await pipeline.execute(request);

            // Property: provider was NEVER called
            expect(callTracker.count).toBe(0);
            expect(proxy.chat.completions.create).not.toHaveBeenCalled();

            // Verify blocked_stage is PRE_EXECUTION
            expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);

            // Verify result signals
            expect(result.allowed).toBe(false);
            expect(result.response).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('result.post_decision is null when blocked at pre-execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          allDenyModulesArb,
          pipelineRequestArb,
          async (modules, request) => {
            const { proxy } = createMockObserveProxy();
            const config = buildConfig(modules, proxy);
            const pipeline = new DefensePipeline(config);

            const result = await pipeline.execute(request);

            // Post-execution was never reached
            expect(result.post_decision).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * When a MIXED set of modules includes at least one DENY-level action,
   * MostRestrictiveWins ensures the stage blocks — provider is still never called.
   *
   * **Validates: Requirements 2.3, 5.5**
   */
  describe('Mixed modules with at least one DENY — provider never invoked', () => {
    it('provider callCount === 0 when any pre-execution module denies', async () => {
      await fc.assert(
        fc.asyncProperty(
          mixedModulesWithDenyArb,
          pipelineRequestArb,
          async (modules, request) => {
            const { proxy, callTracker } = createMockObserveProxy();
            const config = buildConfig(modules, proxy);
            const pipeline = new DefensePipeline(config);

            const result = await pipeline.execute(request);

            // Property: provider was NEVER called
            expect(callTracker.count).toBe(0);
            expect(proxy.chat.completions.create).not.toHaveBeenCalled();

            // Verify blocked
            expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);
            expect(result.allowed).toBe(false);
            expect(result.response).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Various DENY-level actions (DENY, DENY_WRITE, DENY_READ, REDACT,
   * REQUIRE_APPROVAL) all prevent the provider call.
   *
   * **Validates: Requirements 2.3, 5.5**
   */
  describe('All DENY-level action variants block provider call', () => {
    it('each DENY-level action prevents provider invocation', async () => {
      await fc.assert(
        fc.asyncProperty(
          denyLevelActionArb,
          pipelineRequestArb,
          async (denyAction, request) => {
            const { proxy, callTracker } = createMockObserveProxy();
            const modules: TealModule[] = [createDenyModule('single-deny', denyAction)];
            const config = buildConfig(modules, proxy);
            const pipeline = new DefensePipeline(config);

            const result = await pipeline.execute(request);

            // Property: regardless of which DENY-level action, provider is never called
            expect(callTracker.count).toBe(0);
            expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);
            expect(result.allowed).toBe(false);
            expect(result.response).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Timing metadata confirms execution stage was never entered.
   *
   * **Validates: Requirements 2.3, 5.5**
   */
  describe('Timing metadata confirms no execution stage', () => {
    it('execution_start and execution_end are null when blocked pre-execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          allDenyModulesArb,
          pipelineRequestArb,
          async (modules, request) => {
            const { proxy } = createMockObserveProxy();
            const config = buildConfig(modules, proxy);
            const pipeline = new DefensePipeline(config);

            const result = await pipeline.execute(request);

            // Timing confirms execution stage was never entered
            expect(result.timing.execution_start).toBeNull();
            expect(result.timing.execution_end).toBeNull();
            expect(result.timing.post_execution_start).toBeNull();
            expect(result.timing.post_execution_end).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
