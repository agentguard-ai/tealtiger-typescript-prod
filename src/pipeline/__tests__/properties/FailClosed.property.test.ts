/**
 * Property-based test: Fail-Closed Invariant
 *
 * **Validates: Requirements 2.6, 2.7, 4.8, 12.1, 12.2**
 *
 * Property 1: For any request and any pipeline configuration with `fail_closed: true`,
 * if any pre-execution or post-execution module throws an exception or times out,
 * the pipeline SHALL block the request — the merged action SHALL be DENY.
 *
 * ```
 * ∀ request R, ∀ pipeline P where P.fail_closed === true:
 *   IF any pre_module throws or times out during evaluate(R)
 *   THEN P.execute(R).allowed === false ∧ P.execute(R).response === null
 * ```
 *
 * @module pipeline/__tests__/properties/FailClosed.property.test
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

/** Arbitrary for non-failing module actions */
const moduleActionArb = fc.constantFrom('ALLOW', 'MONITOR', 'DENY');

/** Arbitrary for error types that modules can throw */
const errorArb: fc.Arbitrary<Error> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).map((msg) => new Error(msg)),
  fc.string({ minLength: 1, maxLength: 50 }).map((msg) => new TypeError(msg)),
  fc.string({ minLength: 1, maxLength: 50 }).map((msg) => new RangeError(msg)),
  fc.string({ minLength: 1, maxLength: 50 }).map(
    (msg) => {
      const err = new Error(msg);
      err.name = 'CustomModuleError';
      return err;
    },
  ),
);

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

// ── Helper Functions ─────────────────────────────────────────────

/** Build a mock module context */
function makeContext(): ModuleContext {
  return {
    correlation_id: 'prop-test-' + Date.now(),
    policy_version: '1.0.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };
}

/** Create a module that returns a given action */
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

/** Create a module that throws a given error */
function createThrowingModule(name: string, error: Error): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => {
      throw error;
    },
  };
}

/** Create a module that never resolves (simulates timeout) */
function createHangingModule(name: string): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: (): Promise<ModuleResult> => new Promise(() => {}),
  };
}

/**
 * Arbitrary for generating a module array (1-5 modules) where at least one
 * module is configured to throw an exception.
 */
const moduleArrayWithThrowArb: fc.Arbitrary<{ modules: TealModule[]; failIndex: number }> =
  fc.tuple(
    fc.integer({ min: 1, max: 5 }),
    errorArb,
    fc.array(moduleActionArb, { minLength: 0, maxLength: 4 }),
  ).map(([totalCount, error, otherActions]) => {
    const count = Math.min(totalCount, otherActions.length + 1);
    const failIndex = Math.floor(Math.random() * count);
    const modules: TealModule[] = [];
    let normalIdx = 0;

    for (let i = 0; i < count; i++) {
      if (i === failIndex) {
        modules.push(createThrowingModule(`throw-mod-${i}`, error));
      } else {
        const action = otherActions[normalIdx] ?? 'ALLOW';
        modules.push(createNormalModule(`normal-mod-${i}`, action));
        normalIdx++;
      }
    }

    return { modules, failIndex };
  });

/**
 * Arbitrary for generating a module array (1-5 modules) where at least one
 * module is configured to hang (timeout).
 */
const moduleArrayWithTimeoutArb: fc.Arbitrary<{ modules: TealModule[]; failIndex: number }> =
  fc.tuple(
    fc.integer({ min: 1, max: 5 }),
    fc.array(moduleActionArb, { minLength: 0, maxLength: 4 }),
  ).map(([totalCount, otherActions]) => {
    const count = Math.min(totalCount, otherActions.length + 1);
    const failIndex = Math.floor(Math.random() * count);
    const modules: TealModule[] = [];
    let normalIdx = 0;

    for (let i = 0; i < count; i++) {
      if (i === failIndex) {
        modules.push(createHangingModule(`timeout-mod-${i}`));
      } else {
        const action = otherActions[normalIdx] ?? 'ALLOW';
        modules.push(createNormalModule(`normal-mod-${i}`, action));
        normalIdx++;
      }
    }

    return { modules, failIndex };
  });

// ── Property Tests ───────────────────────────────────────────────

describe('Property 1: Fail-Closed Invariant', () => {
  /**
   * PRE_EXECUTION stage: when any module throws an exception and fail_closed=true,
   * the merged action must have severity >= 70 (DENY-level).
   *
   * **Validates: Requirements 2.6, 2.7, 4.8, 12.1, 12.2**
   */
  describe('PRE_EXECUTION — module exceptions', () => {
    it('merged action is DENY when any module throws (fail_closed=true)', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithThrowArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true, // fail_closed
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            // The merged action must have severity >= 70 (DENY-level)
            const severity = ACTION_SEVERITY[result.action] ?? 0;
            expect(severity).toBeGreaterThanOrEqual(70);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('module_details contain error information for the failing module', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithThrowArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true,
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            // At least one module_detail must have an error field set
            const hasError = result.module_details.some(
              (detail) => detail.error !== undefined,
            );
            expect(hasError).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('reason_codes include PIPELINE_FAIL_CLOSED', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithThrowArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true,
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            expect(result.reason_codes).toContain('PIPELINE_FAIL_CLOSED');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * PRE_EXECUTION stage: when any module times out and fail_closed=true,
   * the merged action must have severity >= 70 (DENY-level).
   *
   * Uses a short 50ms timeout to keep tests fast.
   */
  describe('PRE_EXECUTION — module timeouts', () => {
    it('merged action is DENY when any module times out (fail_closed=true)', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithTimeoutArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true, // fail_closed
              50,   // 50ms timeout for fast tests
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            // The merged action must have severity >= 70 (DENY-level)
            const severity = ACTION_SEVERITY[result.action] ?? 0;
            expect(severity).toBeGreaterThanOrEqual(70);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('module_details contain timeout error for the hanging module', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithTimeoutArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true,
              50,
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            // At least one module_detail must have a timeout error
            const hasTimeoutError = result.module_details.some(
              (detail) =>
                detail.error !== undefined &&
                detail.error.includes('exceeded evaluation timeout'),
            );
            expect(hasTimeoutError).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('reason_codes include PIPELINE_FAIL_CLOSED for timeout', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithTimeoutArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true,
              50,
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            expect(result.reason_codes).toContain('PIPELINE_FAIL_CLOSED');
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * POST_EXECUTION stage: when any module throws and fail_closed=true,
   * the merged action must have severity >= 70 (DENY-level).
   * Per Req 12.2, post-execution errors with fail_closed=true also result in DENY.
   */
  describe('POST_EXECUTION — module exceptions (Req 12.2)', () => {
    it('merged action is DENY when any module throws (fail_closed=true)', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithThrowArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true, // fail_closed
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            // The merged action must have severity >= 70 (DENY-level)
            const severity = ACTION_SEVERITY[result.action] ?? 0;
            expect(severity).toBeGreaterThanOrEqual(70);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('reason_codes include PIPELINE_FAIL_CLOSED for post-execution errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithThrowArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            expect(result.reason_codes).toContain('PIPELINE_FAIL_CLOSED');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * POST_EXECUTION stage: when any module times out and fail_closed=true,
   * the merged action must have severity >= 70 (DENY-level).
   */
  describe('POST_EXECUTION — module timeouts (Req 12.2)', () => {
    it('merged action is DENY when any module times out (fail_closed=true)', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithTimeoutArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true, // fail_closed
              50,   // 50ms timeout for fast tests
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            // The merged action must have severity >= 70 (DENY-level)
            const severity = ACTION_SEVERITY[result.action] ?? 0;
            expect(severity).toBeGreaterThanOrEqual(70);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('reason_codes include PIPELINE_FAIL_CLOSED for post-execution timeout', async () => {
      await fc.assert(
        fc.asyncProperty(
          moduleArrayWithTimeoutArb,
          requestPayloadArb,
          async ({ modules }, request) => {
            const evaluator = new StageEvaluator(
              PipelineStage.POST_EXECUTION,
              true,
              50,
            );

            const result = await evaluator.evaluate(
              modules,
              request,
              makeContext(),
              {},
            );

            expect(result.reason_codes).toContain('PIPELINE_FAIL_CLOSED');
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
