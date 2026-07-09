/**
 * Property-based test for MostRestrictiveWins Merge Correctness.
 *
 * Uses fast-check to verify that for any set of module results at a stage,
 * the merged action SHALL be the most restrictive action present according
 * to the severity ordering defined in ACTION_SEVERITY.
 *
 * **Validates: Requirements 2.2, 4.2**
 *
 * Property 3: MostRestrictiveWins Merge Correctness
 * ∀ results R₁..Rₙ:
 *   merged = merge(R₁..Rₙ)
 *   IF any Rᵢ.action === DENY THEN merged.action === DENY
 *   ELSE IF any Rᵢ.action === MONITOR THEN merged.action === MONITOR
 *   ELSE merged.action === ALLOW
 *
 * @module pipeline/__tests__/properties/MostRestrictiveWins.property.test
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

// ── Constants ────────────────────────────────────────────────────

/**
 * All actions from the ACTION_SEVERITY map, grouped by effective pipeline category.
 */
const DENY_LEVEL_ACTIONS = Object.entries(ACTION_SEVERITY)
  .filter(([, severity]) => severity >= 70)
  .map(([action]) => action);

const MONITOR_LEVEL_ACTIONS = Object.entries(ACTION_SEVERITY)
  .filter(([, severity]) => severity >= 10 && severity < 70)
  .map(([action]) => action);

const ALLOW_LEVEL_ACTIONS = Object.entries(ACTION_SEVERITY)
  .filter(([, severity]) => severity === 0)
  .map(([action]) => action);

const ALL_ACTIONS = [...DENY_LEVEL_ACTIONS, ...MONITOR_LEVEL_ACTIONS, ...ALLOW_LEVEL_ACTIONS];

// ── Helpers ──────────────────────────────────────────────────────

/** Build a mock TealModule that returns the specified action. */
function buildMockModule(name: string, action: string): TealModule {
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
  correlation_id: 'pbt-merge-test',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
};

const REQUEST: ModuleEvaluationRequest = { content: 'property test payload' };
const POLICY = {};

/**
 * Determine the expected merged action given a set of actions.
 * Uses the ACTION_SEVERITY map to find the highest severity action.
 */
function expectedMergedAction(actions: string[]): string {
  let highestSeverity = 0;
  let mergedAction = 'ALLOW';

  for (const action of actions) {
    const severity = ACTION_SEVERITY[action] ?? 0;
    if (severity > highestSeverity) {
      highestSeverity = severity;
      mergedAction = action;
    }
  }

  return mergedAction;
}

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary action from the full ACTION_SEVERITY map. */
const actionArb = fc.constantFrom(...ALL_ACTIONS);

/** Arbitrary array of 1–10 actions representing module results. */
const moduleActionsArb = fc.array(actionArb, { minLength: 1, maxLength: 10 });

/** Arbitrary pipeline stage (PRE_EXECUTION or POST_EXECUTION). */
const stageArb = fc.constantFrom(PipelineStage.PRE_EXECUTION, PipelineStage.POST_EXECUTION);

// ── Property Tests ───────────────────────────────────────────────

describe('Property 3: MostRestrictiveWins Merge Correctness', () => {
  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * The merged action equals the action with the highest severity
   * from the ACTION_SEVERITY map across all module results.
   */
  it('merged action is always the most restrictive (highest severity) action present', async () => {
    await fc.assert(
      fc.asyncProperty(moduleActionsArb, stageArb, async (actions, stage) => {
        // Build mock modules with the generated actions
        const modules = actions.map((action, i) => buildMockModule(`mod-${i}`, action));

        const evaluator = new StageEvaluator(stage, true);
        const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

        // The merged action should be the one with highest severity
        const expected = expectedMergedAction(actions);
        expect(result.action).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * If any module result has a DENY-level action (severity >= 70),
   * the merged result must also be DENY-level.
   */
  it('if any module returns DENY-level, merged is DENY-level', async () => {
    await fc.assert(
      fc.asyncProperty(moduleActionsArb, stageArb, async (actions, stage) => {
        const modules = actions.map((action, i) => buildMockModule(`mod-${i}`, action));

        const evaluator = new StageEvaluator(stage, true);
        const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

        const hasDenyLevel = actions.some((a) => (ACTION_SEVERITY[a] ?? 0) >= 70);

        if (hasDenyLevel) {
          expect(ACTION_SEVERITY[result.action] ?? 0).toBeGreaterThanOrEqual(70);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * If no module returns DENY-level but any returns MONITOR-level (severity 10–60),
   * the merged result must be MONITOR-level.
   */
  it('if no DENY-level but any MONITOR-level, merged is MONITOR-level', async () => {
    await fc.assert(
      fc.asyncProperty(moduleActionsArb, stageArb, async (actions, stage) => {
        const modules = actions.map((action, i) => buildMockModule(`mod-${i}`, action));

        const evaluator = new StageEvaluator(stage, true);
        const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

        const hasDenyLevel = actions.some((a) => (ACTION_SEVERITY[a] ?? 0) >= 70);
        const hasMonitorLevel = actions.some((a) => {
          const sev = ACTION_SEVERITY[a] ?? 0;
          return sev >= 10 && sev < 70;
        });

        if (!hasDenyLevel && hasMonitorLevel) {
          const mergedSeverity = ACTION_SEVERITY[result.action] ?? 0;
          expect(mergedSeverity).toBeGreaterThanOrEqual(10);
          expect(mergedSeverity).toBeLessThan(70);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * If all modules return ALLOW (severity 0), the merged result is ALLOW.
   */
  it('if all modules return ALLOW, merged is ALLOW', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...ALLOW_LEVEL_ACTIONS), { minLength: 1, maxLength: 10 }),
        stageArb,
        async (actions, stage) => {
          const modules = actions.map((action, i) => buildMockModule(`mod-${i}`, action));

          const evaluator = new StageEvaluator(stage, true);
          const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

          expect(result.action).toBe('ALLOW');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * The merged action's severity is always >= every individual module's action severity.
   * This confirms MostRestrictiveWins: the merged result is at least as restrictive as any module.
   */
  it('merged severity is >= every individual module action severity', async () => {
    await fc.assert(
      fc.asyncProperty(moduleActionsArb, stageArb, async (actions, stage) => {
        const modules = actions.map((action, i) => buildMockModule(`mod-${i}`, action));

        const evaluator = new StageEvaluator(stage, true);
        const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

        const mergedSeverity = ACTION_SEVERITY[result.action] ?? 0;

        for (const action of actions) {
          const individualSeverity = ACTION_SEVERITY[action] ?? 0;
          expect(mergedSeverity).toBeGreaterThanOrEqual(individualSeverity);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * The property holds identically for both PRE_EXECUTION and POST_EXECUTION stages.
   * The merge logic is stage-agnostic.
   */
  it('merge result is identical for PRE_EXECUTION and POST_EXECUTION given same inputs', async () => {
    await fc.assert(
      fc.asyncProperty(moduleActionsArb, async (actions) => {
        const modulesPre = actions.map((action, i) => buildMockModule(`pre-mod-${i}`, action));
        const modulesPost = actions.map((action, i) => buildMockModule(`post-mod-${i}`, action));

        const preEvaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
        const postEvaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, true);

        const preResult = await preEvaluator.evaluate(modulesPre, REQUEST, CTX, POLICY);
        const postResult = await postEvaluator.evaluate(modulesPost, REQUEST, CTX, POLICY);

        expect(preResult.action).toBe(postResult.action);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.2, 4.2**
   *
   * All reason codes from all modules are collected in the merged result,
   * regardless of which action won.
   */
  it('all module reason codes are collected in the merged result', async () => {
    await fc.assert(
      fc.asyncProperty(moduleActionsArb, stageArb, async (actions, stage) => {
        const modules = actions.map((action, i) => buildMockModule(`mod-${i}`, action));

        const evaluator = new StageEvaluator(stage, true);
        const result = await evaluator.evaluate(modules, REQUEST, CTX, POLICY);

        // Each module produces a reason code like REASON_{ACTION}
        for (const action of actions) {
          expect(result.reason_codes).toContain(`REASON_${action}`);
        }
      }),
      { numRuns: 100 },
    );
  });
});
