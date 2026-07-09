/**
 * Property-based test: Response Integrity Through Pipeline
 *
 * **Validates: Requirements 2.4, 4.3**
 *
 * Property 11: For any request that passes both stages (pre-ALLOW/MONITOR,
 * post-ALLOW without remediation), the `response` field in the PipelineResult
 * SHALL be referentially identical to the response returned by the LLM provider
 * via ObserveProxy — the pipeline does not modify passing responses.
 *
 * ```
 * ∀ request R where pre-stage allows and post-stage allows:
 *   result.response === providerResponse (referential equality)
 * ```
 *
 * Tests at the full DefensePipeline level: generates diverse response shapes,
 * pre-execution modules that return ALLOW or MONITOR, post-execution modules
 * that return ALLOW or MONITOR, and a mock ObserveProxy that returns the
 * generated response. Verifies `result.response === providerResponse` using
 * `toBe()` (referential equality, not structural).
 *
 * @module pipeline/__tests__/properties/ResponseIntegrity.property.test
 */

import * as fc from 'fast-check';
import { DefensePipeline } from '../../DefensePipeline';
import type { PipelineConfig, PipelineRequest } from '../../types';
import type {
  TealModule,
  ModuleResult,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/**
 * Arbitrary for pre/post module actions that ALLOW the request through.
 * Only ALLOW and MONITOR are used — never DENY, to ensure both stages pass.
 */
const passingActionArb = fc.constantFrom('ALLOW', 'MONITOR');

/**
 * Arbitrary for diverse provider response objects.
 * Generates strings, numbers, arrays, plain objects, and nested objects
 * to verify the pipeline never clones or modifies any shape.
 */
const providerResponseArb: fc.Arbitrary<any> = fc.oneof(
  // Simple string responses
  fc.string({ minLength: 0, maxLength: 200 }),
  // Number responses
  fc.double({ noNaN: true }),
  // Array responses
  fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
  // Plain object responses (simulating typical LLM output)
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    choices: fc.array(
      fc.record({
        message: fc.record({
          role: fc.constantFrom('assistant', 'system'),
          content: fc.string({ minLength: 0, maxLength: 100 }),
        }),
        finish_reason: fc.constantFrom('stop', 'length', 'tool_calls'),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro'),
    usage: fc.record({
      prompt_tokens: fc.nat({ max: 1000 }),
      completion_tokens: fc.nat({ max: 1000 }),
      total_tokens: fc.nat({ max: 2000 }),
    }),
  }),
  // Nested objects (stress test for deep structures)
  fc.object({ maxDepth: 3, maxKeys: 5 }),
  // Boolean responses (edge case)
  fc.boolean(),
  // Null response (edge case — pipeline should still pass it through)
  fc.constant(null),
);

/**
 * Arbitrary for generating request payloads.
 */
const requestPayloadArb: fc.Arbitrary<PipelineRequest> = fc.record({
  payload: fc.record({
    content: fc.string({ minLength: 1, maxLength: 100 }),
    model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro'),
  }),
  correlation_id: fc.uuid(),
});

/**
 * Arbitrary for generating 0–4 pre-execution modules that always return ALLOW or MONITOR.
 */
const preModulesArb: fc.Arbitrary<TealModule[]> = fc
  .array(passingActionArb, { minLength: 0, maxLength: 4 })
  .map((actions) =>
    actions.map((action, i) => createPassingModule(`pre-mod-${i}`, action)),
  );

/**
 * Arbitrary for generating 0–4 post-execution modules that always return ALLOW or MONITOR.
 */
const postModulesArb: fc.Arbitrary<TealModule[]> = fc
  .array(passingActionArb, { minLength: 0, maxLength: 4 })
  .map((actions) =>
    actions.map((action, i) => createPassingModule(`post-mod-${i}`, action)),
  );

// ── Helper Functions ─────────────────────────────────────────────

/**
 * Create a module that always returns the specified action (ALLOW or MONITOR).
 * These modules never trigger remediation.
 */
function createPassingModule(name: string, action: string): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: action as ModuleResult['action'],
      reason_codes: action === 'MONITOR' ? ['MONITORING'] : [],
      event_type: 'test.evaluation',
    }),
  };
}

/**
 * Create a mock ObserveProxy that returns the specified response object.
 * The mock implements the minimal interface needed by DefensePipeline:
 * - getCost() for cost tracking
 * - chat.completions.create() for the default provider call path
 *
 * The response reference is captured and returned directly — no cloning.
 */
function createMockObserveProxy(responseRef: any): any {
  return {
    getCost: () => ({
      totalCost: 0.001,
      requestCount: 1,
      hasPricingGaps: false,
      breakdown: { inputCost: 0.0005, outputCost: 0.0005, imageCost: 0, audioCost: 0 },
    }),
    getAgentCost: () => ({
      totalCost: 0.001,
      requestCount: 1,
      hasPricingGaps: false,
      breakdown: { inputCost: 0.0005, outputCost: 0.0005, imageCost: 0, audioCost: 0 },
    }),
    getBaseline: () => null,
    getAgentId: () => 'test-agent',
    getSessionId: () => 'test-session',
    getDecisions: () => [],
    chat: {
      completions: {
        create: async () => responseRef,
      },
    },
  };
}

// ── Property Tests ───────────────────────────────────────────────

describe('Property 11: Response Integrity Through Pipeline', () => {
  /**
   * Core property: When both pre-execution and post-execution stages produce
   * ALLOW or MONITOR (no DENY, no remediation), the pipeline result's response
   * field is referentially identical (===) to the provider's returned response.
   *
   * **Validates: Requirements 2.4, 4.3**
   */
  describe('Passing responses are returned by reference (not cloned)', () => {
    it('result.response === providerResponse for diverse response shapes', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerResponseArb,
          preModulesArb,
          postModulesArb,
          requestPayloadArb,
          async (providerResponse, preModules, postModules, request) => {
            // Create a mock ObserveProxy that returns the exact response reference
            const mockProxy = createMockObserveProxy(providerResponse);

            const config: PipelineConfig = {
              preExecutionModules: preModules,
              postExecutionModules: postModules,
              observeProxy: mockProxy,
              fail_closed: true,
            };

            const pipeline = new DefensePipeline(config);
            const result = await pipeline.execute(request);

            // The pipeline should allow the response through
            expect(result.allowed).toBe(true);
            expect(result.blocked_stage).toBeNull();
            expect(result.remediation_action).toBeNull();
            expect(result.redacted).toBe(false);
            expect(result.remediation_exhausted).toBe(false);
            expect(result.provider_error).toBe(false);

            // CRITICAL: Referential equality — the pipeline did NOT clone/copy/modify
            expect(result.response).toBe(providerResponse);
          },
        ),
        { numRuns: 200 },
      );
    }, 60000);
  });

  /**
   * Same property with MONITOR actions at both stages: pipeline still passes
   * the response reference through without modification.
   *
   * **Validates: Requirements 2.4, 4.3**
   */
  describe('MONITOR at both stages — response still passes by reference', () => {
    it('result.response === providerResponse when all modules return MONITOR', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerResponseArb,
          requestPayloadArb,
          async (providerResponse, request) => {
            const mockProxy = createMockObserveProxy(providerResponse);

            // All modules return MONITOR — the most restrictive non-blocking action
            const config: PipelineConfig = {
              preExecutionModules: [
                createPassingModule('monitor-pre-1', 'MONITOR'),
                createPassingModule('monitor-pre-2', 'MONITOR'),
              ],
              postExecutionModules: [
                createPassingModule('monitor-post-1', 'MONITOR'),
                createPassingModule('monitor-post-2', 'MONITOR'),
              ],
              observeProxy: mockProxy,
              fail_closed: true,
            };

            const pipeline = new DefensePipeline(config);
            const result = await pipeline.execute(request);

            expect(result.allowed).toBe(true);
            // Referential equality: same object, not a copy
            expect(result.response).toBe(providerResponse);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * Zero modules at both stages (pass-through): response reference is preserved.
   *
   * **Validates: Requirements 2.4, 4.3**
   */
  describe('Empty stages (pass-through) — response reference preserved', () => {
    it('result.response === providerResponse with no modules registered', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerResponseArb,
          requestPayloadArb,
          async (providerResponse, request) => {
            const mockProxy = createMockObserveProxy(providerResponse);

            const config: PipelineConfig = {
              preExecutionModules: [],
              postExecutionModules: [],
              observeProxy: mockProxy,
              fail_closed: true,
            };

            const pipeline = new DefensePipeline(config);
            const result = await pipeline.execute(request);

            expect(result.allowed).toBe(true);
            expect(result.response).toBe(providerResponse);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * Mixed ALLOW and MONITOR actions: as long as none are DENY, the
   * response reference must pass through unmodified.
   *
   * **Validates: Requirements 2.4, 4.3**
   */
  describe('Mixed ALLOW/MONITOR actions — response integrity maintained', () => {
    it('result.response === providerResponse for all non-DENY action combos', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerResponseArb,
          fc.array(passingActionArb, { minLength: 1, maxLength: 5 }),
          fc.array(passingActionArb, { minLength: 1, maxLength: 5 }),
          requestPayloadArb,
          async (providerResponse, preActions, postActions, request) => {
            const mockProxy = createMockObserveProxy(providerResponse);

            const preModules = preActions.map((action, i) =>
              createPassingModule(`mixed-pre-${i}`, action),
            );
            const postModules = postActions.map((action, i) =>
              createPassingModule(`mixed-post-${i}`, action),
            );

            const config: PipelineConfig = {
              preExecutionModules: preModules,
              postExecutionModules: postModules,
              observeProxy: mockProxy,
              fail_closed: true,
            };

            const pipeline = new DefensePipeline(config);
            const result = await pipeline.execute(request);

            expect(result.allowed).toBe(true);
            expect(result.blocked_stage).toBeNull();
            // Referential equality: toBe() checks ===
            expect(result.response).toBe(providerResponse);
          },
        ),
        { numRuns: 150 },
      );
    }, 30000);
  });
});
