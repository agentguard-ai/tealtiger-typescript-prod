/**
 * Property-based test: Module Composability Preservation
 *
 * **Validates: Requirements 8.1, 8.2**
 *
 * Property 7: For any v1.2 TealModule `M` registered at a pipeline stage, the
 * module SHALL receive the same `ModuleEvaluationRequest` and `ModuleContext`
 * types it would receive when evaluated directly by TealEngineV12 — the pipeline
 * does not alter the module's interface contract.
 *
 * ```
 * ∀ TealModule M, ∀ request R:
 *   pipeline_call_args = args_captured_when_pipeline_evaluates(M, R)
 *   engine_call_args = args_captured_when_engine_evaluates(M, R)
 *   pipeline_call_args ≡ engine_call_args  (structural equality)
 * ```
 *
 * Tests at the StageEvaluator level: a spy module registered in a DefensePipeline
 * at PRE_EXECUTION stage receives a ModuleEvaluationRequest containing the
 * request content and a ModuleContext with the standard fields (correlation_id,
 * policy_version, teec_version, timestamp). The assignStage adapter also preserves
 * the interface contract.
 *
 * @module pipeline/__tests__/properties/ModuleComposability.property.test
 */

import * as fc from 'fast-check';
import { StageEvaluator } from '../../StageEvaluator';
import { DefensePipeline } from '../../DefensePipeline';
import { assignStage } from '../../stageAdapter';
import { PipelineStage } from '../../types';
import type { PipelineRequest } from '../../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary for generating request payloads with various shapes */
const payloadArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  // Simple string content
  fc.record({
    content: fc.string({ minLength: 1, maxLength: 200 }),
  }),
  // Content with model
  fc.record({
    content: fc.string({ minLength: 1, maxLength: 100 }),
    model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro', 'mistral-7b'),
  }),
  // Content with tool call
  fc.record({
    content: fc.string({ minLength: 1, maxLength: 100 }),
    tool: fc.string({ minLength: 1, maxLength: 30 }),
    toolParams: fc.object({ maxDepth: 2, maxKeys: 4 }),
  }),
  // Generic object payload (no explicit content field)
  fc.record({
    messages: fc.array(
      fc.record({
        role: fc.constantFrom('user', 'assistant', 'system'),
        content: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  }),
);

/** Arbitrary for PipelineRequest */
const pipelineRequestArb: fc.Arbitrary<PipelineRequest> = fc.record({
  payload: payloadArb,
  correlation_id: fc.uuid(),
});

// ── Spy Module ───────────────────────────────────────────────────

/**
 * A spy module that captures the arguments passed to evaluate().
 * This allows us to inspect exactly what the pipeline passes to modules.
 */
interface CapturedArgs {
  request: ModuleEvaluationRequest;
  ctx: ModuleContext;
  policy: unknown;
}

function createSpyModule(name: string): {
  module: TealModule;
  getCapturedArgs: () => CapturedArgs[];
} {
  const capturedArgs: CapturedArgs[] = [];

  const module: TealModule = {
    name,
    version: '1.2.0',
    evaluate: async (
      request: ModuleEvaluationRequest,
      ctx: ModuleContext,
      policy: unknown,
    ): Promise<ModuleResult> => {
      capturedArgs.push({ request, ctx, policy });
      return {
        action: 'ALLOW' as ModuleResult['action'],
        reason_codes: ['COMPOSABILITY_TEST'],
        event_type: 'test.composability',
      };
    },
  };

  return { module, getCapturedArgs: () => capturedArgs };
}

// ── Helper Functions ─────────────────────────────────────────────

/** Create a mock provider that always returns a response */
function createMockProvider() {
  return {
    create: async () => ({ content: 'mock-response', model: 'mock' }),
  };
}

// ── Property Tests ───────────────────────────────────────────────

describe('Property 7: Module Composability Preservation', () => {
  /**
   * When a spy module is evaluated via the StageEvaluator (the same path
   * used by DefensePipeline), it receives a ModuleEvaluationRequest that
   * contains the request content, and a ModuleContext with all standard fields.
   *
   * **Validates: Requirements 8.1, 8.2**
   */
  describe('StageEvaluator preserves ModuleEvaluationRequest and ModuleContext types', () => {
    it('module receives ModuleEvaluationRequest with content from payload', async () => {
      await fc.assert(
        fc.asyncProperty(
          payloadArb,
          fc.uuid(),
          async (payload, correlationId) => {
            const { module: spyModule, getCapturedArgs } = createSpyModule('spy-pre');

            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true,
              5000,
            );

            // Build the same ModuleEvaluationRequest that DefensePipeline builds
            const evaluationRequest: ModuleEvaluationRequest = {
              content: typeof payload.content === 'string'
                ? payload.content
                : JSON.stringify(payload),
              ...payload,
            };

            const ctx: ModuleContext = {
              correlation_id: correlationId,
              policy_version: '1.4.0',
              teec_version: '2.1',
              timestamp: Date.now(),
            };

            await evaluator.evaluate([spyModule], evaluationRequest, ctx, null);

            const captured = getCapturedArgs();
            expect(captured).toHaveLength(1);

            // Verify ModuleEvaluationRequest structure
            const receivedRequest = captured[0].request;
            expect(receivedRequest).toBeDefined();
            expect(typeof receivedRequest).toBe('object');

            // The request must contain a content field (string)
            expect(typeof receivedRequest.content).toBe('string');
            expect(receivedRequest.content!.length).toBeGreaterThan(0);

            // All payload fields must be present in the evaluation request
            for (const key of Object.keys(payload)) {
              expect(receivedRequest).toHaveProperty(key);
            }

            // Verify ModuleContext has all required fields
            const receivedCtx = captured[0].ctx;
            expect(typeof receivedCtx.correlation_id).toBe('string');
            expect(receivedCtx.correlation_id.length).toBeGreaterThan(0);
            expect(typeof receivedCtx.policy_version).toBe('string');
            expect(receivedCtx.policy_version.length).toBeGreaterThan(0);
            expect(typeof receivedCtx.teec_version).toBe('string');
            expect(receivedCtx.teec_version.length).toBeGreaterThan(0);
            expect(typeof receivedCtx.timestamp).toBe('number');
            expect(receivedCtx.timestamp).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * When the same spy module is evaluated through a DefensePipeline at the
   * PRE_EXECUTION stage, it receives structurally identical argument types
   * (ModuleEvaluationRequest with content, ModuleContext with standard fields).
   *
   * **Validates: Requirements 8.1, 8.2**
   */
  describe('DefensePipeline preserves module interface contract end-to-end', () => {
    it('module receives correct ModuleEvaluationRequest and ModuleContext from pipeline', async () => {
      await fc.assert(
        fc.asyncProperty(
          pipelineRequestArb,
          async (request) => {
            const { module: spyModule, getCapturedArgs } = createSpyModule('spy-pipeline');

            const pipeline = new DefensePipeline({
              preExecutionModules: [spyModule],
              postExecutionModules: [],
              providerClient: createMockProvider(),
              fail_closed: true,
            });

            await pipeline.execute(request);

            const captured = getCapturedArgs();
            expect(captured).toHaveLength(1);

            // Verify ModuleEvaluationRequest
            const receivedRequest = captured[0].request;
            expect(typeof receivedRequest).toBe('object');
            expect(receivedRequest).not.toBeNull();

            // Must have content field (string)
            expect(typeof receivedRequest.content).toBe('string');

            // Content should derive from payload
            if (typeof request.payload.content === 'string') {
              expect(receivedRequest.content).toBe(request.payload.content);
            } else {
              // When no string content, it should be JSON.stringify of the payload
              expect(receivedRequest.content).toBe(JSON.stringify(request.payload));
            }

            // All payload fields should be spread into the request
            for (const key of Object.keys(request.payload)) {
              expect(receivedRequest).toHaveProperty(key);
            }

            // Verify ModuleContext has all required TealEngineV12-compatible fields
            const receivedCtx = captured[0].ctx;
            expect(typeof receivedCtx.correlation_id).toBe('string');
            expect(receivedCtx.correlation_id.length).toBeGreaterThan(0);
            expect(typeof receivedCtx.policy_version).toBe('string');
            expect(receivedCtx.policy_version.length).toBeGreaterThan(0);
            expect(typeof receivedCtx.teec_version).toBe('string');
            expect(receivedCtx.teec_version.length).toBeGreaterThan(0);
            expect(typeof receivedCtx.timestamp).toBe('number');
            expect(receivedCtx.timestamp).toBeGreaterThan(0);

            // Correlation ID should match what was passed or be auto-generated
            if (request.correlation_id) {
              expect(receivedCtx.correlation_id).toBe(request.correlation_id);
            }
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * The assignStage() adapter wraps a v1.2 module without altering its
   * evaluate() interface — the wrapped module receives identical arguments
   * to the unwrapped module.
   *
   * **Validates: Requirements 8.1, 8.2**
   */
  describe('assignStage adapter preserves module interface contract', () => {
    it('wrapped module receives identical arguments as unwrapped module', async () => {
      await fc.assert(
        fc.asyncProperty(
          payloadArb,
          fc.uuid(),
          fc.constantFrom(
            PipelineStage.PRE_EXECUTION,
            PipelineStage.POST_EXECUTION,
          ),
          async (payload, correlationId, stage) => {
            const { module: unwrappedModule, getCapturedArgs: getUnwrappedArgs } =
              createSpyModule('unwrapped');
            const { module: wrappedSource, getCapturedArgs: getWrappedArgs } =
              createSpyModule('wrapped');

            // Wrap the module with assignStage
            const wrappedModule = assignStage(wrappedSource, stage);

            const evaluator = new StageEvaluator(stage, true, 5000);

            const evaluationRequest: ModuleEvaluationRequest = {
              content: typeof payload.content === 'string'
                ? payload.content
                : JSON.stringify(payload),
              ...payload,
            };

            const ctx: ModuleContext = {
              correlation_id: correlationId,
              policy_version: '1.4.0',
              teec_version: '2.1',
              timestamp: Date.now(),
            };

            // Evaluate both modules through the same StageEvaluator
            await evaluator.evaluate([unwrappedModule], evaluationRequest, ctx, null);
            await evaluator.evaluate([wrappedModule], evaluationRequest, ctx, null);

            const unwrappedCaptured = getUnwrappedArgs();
            const wrappedCaptured = getWrappedArgs();

            expect(unwrappedCaptured).toHaveLength(1);
            expect(wrappedCaptured).toHaveLength(1);

            // ModuleEvaluationRequest must be structurally identical
            expect(wrappedCaptured[0].request).toEqual(unwrappedCaptured[0].request);

            // ModuleContext must be structurally identical
            expect(wrappedCaptured[0].ctx).toEqual(unwrappedCaptured[0].ctx);

            // Policy must be identical
            expect(wrappedCaptured[0].policy).toEqual(unwrappedCaptured[0].policy);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);

    it('wrapped module has stage property but evaluate interface unchanged', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            PipelineStage.PRE_EXECUTION,
            PipelineStage.POST_EXECUTION,
          ),
          async (stage) => {
            const { module: original } = createSpyModule('original');
            const wrapped = assignStage(original, stage);

            // Wrapped module has stage property
            expect((wrapped as any).stage).toBe(stage);

            // But still has the TealModule interface
            expect(typeof wrapped.name).toBe('string');
            expect(typeof wrapped.version).toBe('string');
            expect(typeof wrapped.evaluate).toBe('function');

            // Name and version preserved
            expect(wrapped.name).toBe(original.name);
            expect(wrapped.version).toBe(original.version);
          },
        ),
        { numRuns: 50 },
      );
    }, 10000);
  });

  /**
   * Pipeline and direct StageEvaluator evaluation produce identical
   * arguments to the module — proving the pipeline does not transform
   * or alter what modules receive.
   *
   * **Validates: Requirements 8.1, 8.2**
   */
  describe('Pipeline vs direct evaluation — structural equality', () => {
    it('pipeline passes same ModuleEvaluationRequest structure as direct StageEvaluator', async () => {
      await fc.assert(
        fc.asyncProperty(
          pipelineRequestArb,
          async (request) => {
            // Spy module for pipeline path
            const { module: pipelineSpy, getCapturedArgs: getPipelineArgs } =
              createSpyModule('pipeline-spy');

            // Spy module for direct evaluation path
            const { module: directSpy, getCapturedArgs: getDirectArgs } =
              createSpyModule('direct-spy');

            // Execute through pipeline
            const pipeline = new DefensePipeline({
              preExecutionModules: [pipelineSpy],
              postExecutionModules: [],
              providerClient: createMockProvider(),
              fail_closed: true,
            });
            await pipeline.execute(request);

            // Execute through direct StageEvaluator (same construction as pipeline)
            const evaluator = new StageEvaluator(
              PipelineStage.PRE_EXECUTION,
              true,
              5000,
            );

            // Build the same request and context that DefensePipeline would build
            const correlationId = request.correlation_id ?? crypto.randomUUID();
            const evaluationRequest: ModuleEvaluationRequest = {
              content: typeof request.payload.content === 'string'
                ? request.payload.content
                : JSON.stringify(request.payload),
              ...request.payload,
            };
            const ctx: ModuleContext = {
              correlation_id: correlationId,
              policy_version: '1.4.0',
              teec_version: '2.1',
              timestamp: Date.now(),
            };

            await evaluator.evaluate([directSpy], evaluationRequest, ctx, null);

            const pipelineArgs = getPipelineArgs();
            const directArgs = getDirectArgs();

            expect(pipelineArgs).toHaveLength(1);
            expect(directArgs).toHaveLength(1);

            // ModuleEvaluationRequest: same structure (same keys, same content derivation)
            const pReq = pipelineArgs[0].request;
            const dReq = directArgs[0].request;

            // Both must have content field
            expect(typeof pReq.content).toBe('string');
            expect(typeof dReq.content).toBe('string');
            expect(pReq.content).toBe(dReq.content);

            // All payload keys present in both
            for (const key of Object.keys(request.payload)) {
              expect(pReq).toHaveProperty(key);
              expect(dReq).toHaveProperty(key);
            }

            // ModuleContext: same required fields present with correct types
            const pCtx = pipelineArgs[0].ctx;
            const dCtx = directArgs[0].ctx;

            // Both have correlation_id (string, non-empty)
            expect(typeof pCtx.correlation_id).toBe('string');
            expect(typeof dCtx.correlation_id).toBe('string');
            expect(pCtx.correlation_id.length).toBeGreaterThan(0);
            expect(dCtx.correlation_id.length).toBeGreaterThan(0);

            // Both have policy_version
            expect(pCtx.policy_version).toBe(dCtx.policy_version);

            // Both have teec_version
            expect(pCtx.teec_version).toBe(dCtx.teec_version);

            // Both have timestamp (number > 0)
            expect(typeof pCtx.timestamp).toBe('number');
            expect(typeof dCtx.timestamp).toBe('number');
            expect(pCtx.timestamp).toBeGreaterThan(0);
            expect(dCtx.timestamp).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });
});
