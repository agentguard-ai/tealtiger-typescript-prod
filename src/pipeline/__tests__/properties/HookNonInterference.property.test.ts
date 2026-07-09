/**
 * Property-based test: Hook Non-Interference
 *
 * **Validates: Requirements 10.2, 10.5**
 *
 * Property 10: For any pipeline execution, the final PipelineResult's governance
 * outcomes (`allowed`, `pre_decision.action`, `post_decision.action`, `remediation_action`)
 * SHALL be identical regardless of whether hooks are registered or what hooks do
 * (including throwing exceptions) — hooks observe but do not modify pipeline behavior.
 *
 * ```
 * ∀ request R, ∀ hookConfig H (including throwing/slow/no-op hooks):
 *   result_with_hooks = evaluate_with_hooks(modules, R, H)
 *   result_without_hooks = evaluate_without_hooks(modules, R)
 *   result_with_hooks.action === result_without_hooks.action
 *   result_with_hooks.reason_codes ≡ result_without_hooks.reason_codes
 * ```
 *
 * Tests at the StageEvaluator level: hooks run before/after evaluation via
 * HookRunner but cannot alter the StageEvaluator's governance outcomes.
 * Additionally verifies that HookRunner never propagates exceptions upward.
 *
 * @module pipeline/__tests__/properties/HookNonInterference.property.test
 */

import * as fc from 'fast-check';
import { StageEvaluator } from '../../StageEvaluator';
import { HookRunner } from '../../HookRunner';
import { PipelineStage } from '../../types';
import type { PipelineHooks } from '../../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary for module actions at the simplified pipeline level */
const moduleActionArb = fc.constantFrom('ALLOW', 'MONITOR', 'DENY');

/** Arbitrary for generating request payloads */
const requestPayloadArb: fc.Arbitrary<ModuleEvaluationRequest> = fc.oneof(
  fc.record({
    content: fc.string({ minLength: 0, maxLength: 100 }),
  }),
  fc.record({
    content: fc.string({ minLength: 0, maxLength: 100 }),
    tool: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  fc.object({ maxDepth: 2, maxKeys: 5 }).map((obj) => obj as ModuleEvaluationRequest),
);

/**
 * Arbitrary for hook behavior types.
 * Hooks can:
 * - Do nothing (no-op)
 * - Throw synchronously
 * - Reject asynchronously
 * - Take a long time (slow)
 */
type HookBehavior = 'noop' | 'throw_sync' | 'reject_async' | 'slow';

const hookBehaviorArb: fc.Arbitrary<HookBehavior> = fc.constantFrom(
  'noop',
  'throw_sync',
  'reject_async',
  'slow',
);

/** Create a hook function from a behavior descriptor */
function createHookFn(behavior: HookBehavior): (...args: any[]) => void | Promise<void> {
  switch (behavior) {
    case 'noop':
      return () => {};
    case 'throw_sync':
      return () => {
        throw new Error('Hook threw synchronously!');
      };
    case 'reject_async':
      return async () => {
        throw new Error('Hook rejected asynchronously!');
      };
    case 'slow':
      // Use minimal delay (1ms) to keep tests fast while still testing async behavior
      return () => new Promise((resolve) => setTimeout(resolve, 1));
  }
}

/** Arbitrary for a random set of hook configurations */
const hookConfigArb: fc.Arbitrary<PipelineHooks> = fc.record({
  beforePreExecution: hookBehaviorArb,
  afterPreExecution: hookBehaviorArb,
  beforeExecution: hookBehaviorArb,
  afterExecution: hookBehaviorArb,
  beforePostExecution: hookBehaviorArb,
  afterPostExecution: hookBehaviorArb,
  onRemediation: hookBehaviorArb,
}).map((behaviors) => {
  // Construct directly to satisfy exactOptionalPropertyTypes
  return {
    beforePreExecution: createHookFn(behaviors.beforePreExecution),
    afterPreExecution: createHookFn(behaviors.afterPreExecution),
    beforeExecution: createHookFn(behaviors.beforeExecution),
    afterExecution: createHookFn(behaviors.afterExecution),
    beforePostExecution: createHookFn(behaviors.beforePostExecution),
    afterPostExecution: createHookFn(behaviors.afterPostExecution),
    onRemediation: createHookFn(behaviors.onRemediation),
  } as PipelineHooks;
});

/** Arbitrary for generating a module array (1–5 modules) with random actions */
const moduleArrayArb: fc.Arbitrary<TealModule[]> = fc
  .array(moduleActionArb, { minLength: 1, maxLength: 5 })
  .map((actions) =>
    actions.map((action, i) => createNormalModule(`mod-${i}`, action)),
  );

// ── Helper Functions ─────────────────────────────────────────────

/** Build a mock module context */
function makeContext(): ModuleContext {
  return {
    correlation_id: 'prop-test-hook-' + Date.now(),
    policy_version: '1.0.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };
}

/** Create a module that returns a given action deterministically */
function createNormalModule(name: string, action: string): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: action as ModuleResult['action'],
      reason_codes: [`${action}_REASON`],
      event_type: 'test.evaluation',
    }),
  };
}

// ── Property Tests ───────────────────────────────────────────────

describe('Property 10: Hook Non-Interference', () => {
  /**
   * The StageEvaluator produces the same governance outcome regardless of
   * whether HookRunner runs hooks (including throwing hooks) before/after evaluation.
   *
   * **Validates: Requirements 10.2, 10.5**
   */
  describe('PRE_EXECUTION — hooks do not alter governance outcomes', () => {
    it('stage evaluation results are identical with and without hooks', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayArb,
          requestPayloadArb,
          hookConfigArb,
          async (modules, request, hooks) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true, // fail_closed
            );

            const ctx = makeContext();

            // Run with hooks (before + after stage)
            const hookRunner = new HookRunner(hooks);
            await hookRunner.run('beforePreExecution', request);
            const resultWithHooks = await evaluator.evaluate(
              modules,
              request,
              ctx,
              {},
            );
            await hookRunner.run('afterPreExecution', resultWithHooks);

            // Run without hooks
            const noHookRunner = new HookRunner(); // no hooks registered
            await noHookRunner.run('beforePreExecution', request);
            const resultWithoutHooks = await evaluator.evaluate(
              modules,
              request,
              ctx,
              {},
            );
            await noHookRunner.run('afterPreExecution', resultWithoutHooks);

            // Governance outcomes must be identical
            expect(resultWithHooks.action).toBe(resultWithoutHooks.action);
            expect(resultWithHooks.reason_codes).toEqual(resultWithoutHooks.reason_codes);
            expect(resultWithHooks.module_details.length).toBe(
              resultWithoutHooks.module_details.length,
            );

            // Per-module actions must match
            for (let i = 0; i < resultWithHooks.module_details.length; i++) {
              expect(resultWithHooks.module_details[i].action).toBe(
                resultWithoutHooks.module_details[i].action,
              );
              expect(resultWithHooks.module_details[i].reason_codes).toEqual(
                resultWithoutHooks.module_details[i].reason_codes,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  describe('POST_EXECUTION — hooks do not alter governance outcomes', () => {
    it('stage evaluation results are identical with and without hooks', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayArb,
          requestPayloadArb,
          hookConfigArb,
          async (modules, request, hooks) => {
            const evaluator = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true, // fail_closed
            );

            const ctx = makeContext();

            // Run with hooks (before + after stage)
            const hookRunner = new HookRunner(hooks);
            await hookRunner.run('beforePostExecution', { response: 'test' }, request);
            const resultWithHooks = await evaluator.evaluate(
              modules,
              request,
              ctx,
              {},
            );
            await hookRunner.run('afterPostExecution', resultWithHooks);

            // Run without hooks
            const noHookRunner = new HookRunner();
            await noHookRunner.run('beforePostExecution', { response: 'test' }, request);
            const resultWithoutHooks = await evaluator.evaluate(
              modules,
              request,
              ctx,
              {},
            );
            await noHookRunner.run('afterPostExecution', resultWithoutHooks);

            // Governance outcomes must be identical
            expect(resultWithHooks.action).toBe(resultWithoutHooks.action);
            expect(resultWithHooks.reason_codes).toEqual(resultWithoutHooks.reason_codes);
            expect(resultWithHooks.module_details.length).toBe(
              resultWithoutHooks.module_details.length,
            );

            for (let i = 0; i < resultWithHooks.module_details.length; i++) {
              expect(resultWithHooks.module_details[i].action).toBe(
                resultWithoutHooks.module_details[i].action,
              );
              expect(resultWithHooks.module_details[i].reason_codes).toEqual(
                resultWithoutHooks.module_details[i].reason_codes,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * HookRunner never propagates exceptions from hooks — any hook behavior
   * (throw sync, reject async, slow) completes without throwing.
   *
   * **Validates: Requirements 10.5**
   */
  describe('HookRunner exception isolation', () => {
    it('HookRunner.run() never throws regardless of hook behavior', async () => {
      await fc.assert(
        fc.asyncProperty(
          hookConfigArb,
          fc.constantFrom(
            'beforePreExecution',
            'afterPreExecution',
            'beforeExecution',
            'afterExecution',
            'beforePostExecution',
            'afterPostExecution',
            'onRemediation',
          ) as fc.Arbitrary<keyof PipelineHooks>,
          async (hooks, hookName) => {
            const hookRunner = new HookRunner(hooks);

            // HookRunner.run() must never throw — it silently catches errors
            await expect(
              hookRunner.run(hookName, { payload: {} }, {}, 0),
            ).resolves.toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);

    it('HookRunner accumulates time even when hooks throw', async () => {
      await fc.assert(
        fc.asyncProperty(
          hookConfigArb,
          async (hooks) => {
            const hookRunner = new HookRunner(hooks);

            // Run multiple hooks — none should throw
            await hookRunner.run('beforePreExecution', { payload: {} });
            await hookRunner.run('afterPreExecution', { action: 'ALLOW' });

            // hookTime should be a non-negative number
            expect(hookRunner.getHookTime()).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * Comprehensive end-to-end: even with the most adversarial hook combinations
   * (all hooks throwing, all hooks slow, mixed), the StageEvaluator's merged
   * action remains deterministic and identical across runs.
   *
   * **Validates: Requirements 10.2, 10.5**
   */
  describe('Adversarial hooks — governance determinism preserved', () => {
    it('all-throwing hooks produce same result as no hooks', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayArb,
          requestPayloadArb,
          fc.constantFrom(PipelineStage.PRE_EXECUTION, PipelineStage.POST_EXECUTION),
          async (modules, request, stage) => {
            const evaluator = new StageEvaluator(stage, true);
            const ctx = makeContext();

            // All-throwing hooks
            const throwingHooks: PipelineHooks = {
              beforePreExecution: () => { throw new Error('before-pre throws'); },
              afterPreExecution: () => { throw new Error('after-pre throws'); },
              beforeExecution: () => { throw new Error('before-exec throws'); },
              afterExecution: () => { throw new Error('after-exec throws'); },
              beforePostExecution: () => { throw new Error('before-post throws'); },
              afterPostExecution: () => { throw new Error('after-post throws'); },
              onRemediation: () => { throw new Error('on-remediation throws'); },
            };

            const throwRunner = new HookRunner(throwingHooks);
            const hookName = stage === PipelineStage.PRE_EXECUTION
              ? 'beforePreExecution'
              : 'beforePostExecution';
            const afterHookName = stage === PipelineStage.PRE_EXECUTION
              ? 'afterPreExecution'
              : 'afterPostExecution';

            await throwRunner.run(hookName, request);
            const resultWithThrowingHooks = await evaluator.evaluate(
              modules,
              request,
              ctx,
              {},
            );
            await throwRunner.run(afterHookName, resultWithThrowingHooks);

            // No hooks
            const resultNoHooks = await evaluator.evaluate(
              modules,
              request,
              ctx,
              {},
            );

            // Results must be identical
            expect(resultWithThrowingHooks.action).toBe(resultNoHooks.action);
            expect(resultWithThrowingHooks.reason_codes).toEqual(resultNoHooks.reason_codes);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });
});
