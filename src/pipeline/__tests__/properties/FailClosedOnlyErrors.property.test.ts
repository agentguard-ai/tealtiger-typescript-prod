/**
 * Property-based test for Fail-Closed Applies Only to Errors.
 *
 * Uses fast-check to verify that if all registered modules at a stage produce
 * explicit ALLOW or MONITOR results (no exceptions, no timeouts), the stage
 * SHALL proceed regardless of the `fail_closed` setting — fail-closed governs
 * error handling, not explicit module decisions.
 *
 * **Validates: Requirements 12.6**
 *
 * Property 12: Fail-Closed Applies Only to Errors
 * ∀ modules M₁..Mₙ that all return explicit results (no throws, no timeouts):
 *   eval_fail_closed = StageEvaluator(stage, failClosed=true).evaluate(M₁..Mₙ)
 *   eval_fail_open = StageEvaluator(stage, failClosed=false).evaluate(M₁..Mₙ)
 *   eval_fail_closed.action === eval_fail_open.action
 *
 * @module pipeline/__tests__/properties/FailClosedOnlyErrors.property.test
 */

import * as fc from 'fast-check';
import { StageEvaluator } from '../../StageEvaluator';
import { PipelineStage } from '../../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

/** Build a mock TealModule that returns the specified action (no errors, no delays). */
function buildCleanModule(name: string, action: 'ALLOW' | 'MONITOR'): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: action as ModuleResult['action'],
      reason_codes: [`REASON_${action}`],
      event_type: `test.${action.toLowerCase()}`,
    }),
  };
}

/** Fixed context for evaluations. */
const CTX: ModuleContext = {
  correlation_id: 'pbt-fail-closed-only-errors',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
};

const REQUEST: ModuleEvaluationRequest = { content: 'property test payload' };
const POLICY = {};

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary action from the clean result set (ALLOW or MONITOR only). */
const cleanActionArb = fc.constantFrom('ALLOW', 'MONITOR') as fc.Arbitrary<'ALLOW' | 'MONITOR'>;

/** Arbitrary array of 1–5 clean actions representing module results. */
const cleanModuleActionsArb = fc.array(cleanActionArb, { minLength: 1, maxLength: 5 });

/** Arbitrary pipeline stage (PRE_EXECUTION or POST_EXECUTION). */
const stageArb = fc.constantFrom(PipelineStage.PRE_EXECUTION, PipelineStage.POST_EXECUTION);

// ── Property Tests ───────────────────────────────────────────────

describe('Property 12: Fail-Closed Applies Only to Errors', () => {
  /**
   * **Validates: Requirements 12.6**
   *
   * When all modules produce clean results (ALLOW or MONITOR), the merged
   * action is identical regardless of the fail_closed setting. This proves
   * that fail_closed only affects error handling behavior.
   */
  it('merged action is identical with failClosed=true and failClosed=false when all modules return clean results', async () => {
    await fc.assert(
      fc.asyncProperty(cleanModuleActionsArb, stageArb, async (actions, stage) => {
        // Build modules that always return clean results (no throws, no timeouts)
        const modulesForClosed = actions.map((action, i) =>
          buildCleanModule(`mod-closed-${i}`, action),
        );
        const modulesForOpen = actions.map((action, i) =>
          buildCleanModule(`mod-open-${i}`, action),
        );

        // Evaluate with fail_closed = true
        const evaluatorClosed = new StageEvaluator(stage, true);
        const resultClosed = await evaluatorClosed.evaluate(
          modulesForClosed,
          REQUEST,
          CTX,
          POLICY,
        );

        // Evaluate with fail_closed = false
        const evaluatorOpen = new StageEvaluator(stage, false);
        const resultOpen = await evaluatorOpen.evaluate(
          modulesForOpen,
          REQUEST,
          CTX,
          POLICY,
        );

        // The merged action must be identical
        expect(resultClosed.action).toBe(resultOpen.action);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * When all modules return ALLOW, the stage proceeds (action = ALLOW)
   * regardless of fail_closed setting.
   */
  it('all-ALLOW modules produce ALLOW regardless of fail_closed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constant('ALLOW' as const), { minLength: 1, maxLength: 5 }),
        stageArb,
        fc.boolean(),
        async (actions, stage, failClosed) => {
          const modules = actions.map((action, i) =>
            buildCleanModule(`mod-${i}`, action),
          );

          const evaluator = new StageEvaluator(stage, failClosed);
          const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

          expect(result.action).toBe('ALLOW');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * When any module returns MONITOR (and none error), the stage proceeds
   * with MONITOR regardless of fail_closed setting.
   */
  it('MONITOR result propagates regardless of fail_closed when no errors occur', async () => {
    await fc.assert(
      fc.asyncProperty(
        cleanModuleActionsArb.filter((actions) => actions.includes('MONITOR')),
        stageArb,
        fc.boolean(),
        async (actions, stage, failClosed) => {
          const modules = actions.map((action, i) =>
            buildCleanModule(`mod-${i}`, action),
          );

          const evaluator = new StageEvaluator(stage, failClosed);
          const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

          // With MONITOR present and no DENY-level actions, result should be MONITOR
          expect(result.action).toBe('MONITOR');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * The reason_codes collected are identical regardless of fail_closed
   * when all modules return clean results.
   */
  it('reason_codes are identical between fail_closed=true and fail_closed=false for clean modules', async () => {
    await fc.assert(
      fc.asyncProperty(cleanModuleActionsArb, stageArb, async (actions, stage) => {
        const modulesForClosed = actions.map((action, i) =>
          buildCleanModule(`mod-${i}`, action),
        );
        const modulesForOpen = actions.map((action, i) =>
          buildCleanModule(`mod-${i}`, action),
        );

        const evaluatorClosed = new StageEvaluator(stage, true);
        const resultClosed = await evaluatorClosed.evaluate(
          modulesForClosed,
          REQUEST,
          CTX,
          POLICY,
        );

        const evaluatorOpen = new StageEvaluator(stage, false);
        const resultOpen = await evaluatorOpen.evaluate(
          modulesForOpen,
          REQUEST,
          CTX,
          POLICY,
        );

        // Same reason codes in both cases
        expect(resultClosed.reason_codes.sort()).toEqual(resultOpen.reason_codes.sort());
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * The property holds for both PRE_EXECUTION and POST_EXECUTION stages
   * independently — fail_closed is stage-agnostic for clean results.
   */
  it('property holds for both PRE_EXECUTION and POST_EXECUTION stages', async () => {
    await fc.assert(
      fc.asyncProperty(cleanModuleActionsArb, async (actions) => {
        const modulesPre = actions.map((action, i) =>
          buildCleanModule(`pre-mod-${i}`, action),
        );
        const modulesPost = actions.map((action, i) =>
          buildCleanModule(`post-mod-${i}`, action),
        );

        // PRE_EXECUTION: fail_closed=true vs false
        const preClosedEvaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
        const preOpenEvaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, false);
        const preClosedResult = await preClosedEvaluator.evaluate(modulesPre, REQUEST, CTX, POLICY);
        const preOpenResult = await preOpenEvaluator.evaluate(
          actions.map((action, i) => buildCleanModule(`pre-mod-${i}`, action)),
          REQUEST,
          CTX,
          POLICY,
        );

        // POST_EXECUTION: fail_closed=true vs false
        const postClosedEvaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, true);
        const postOpenEvaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, false);
        const postClosedResult = await postClosedEvaluator.evaluate(modulesPost, REQUEST, CTX, POLICY);
        const postOpenResult = await postOpenEvaluator.evaluate(
          actions.map((action, i) => buildCleanModule(`post-mod-${i}`, action)),
          REQUEST,
          CTX,
          POLICY,
        );

        // Both stages: action is identical regardless of fail_closed
        expect(preClosedResult.action).toBe(preOpenResult.action);
        expect(postClosedResult.action).toBe(postOpenResult.action);
      }),
      { numRuns: 100 },
    );
  });
});
