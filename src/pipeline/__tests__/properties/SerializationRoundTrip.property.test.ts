/**
 * Property Test: Pipeline Result Serialization Round-Trip
 *
 * **Property 9: Pipeline Result Serialization Round-Trip**
 * **Validates: Requirements 5.4, 13.1, 13.5**
 *
 * For any PipelineResult, serializing to JSON via `toJSON()` and deserializing
 * back SHALL produce a structurally equivalent object — no information loss,
 * all timing metadata preserved, and TEEC v2.1 chain intact.
 *
 * ```
 * ∀ PipelineResult R:
 *   json = R.toJSON()
 *   parsed = JSON.parse(JSON.stringify(json))
 *   parsed is structurally equivalent to json
 * ```
 *
 * @module pipeline/__tests__/properties/SerializationRoundTrip.property.test
 */

import * as fc from 'fast-check';
import { DefensePipeline } from '../../DefensePipeline';
import type {
  PipelineConfig,
  PipelineRequest,
  StageDecision,
  PipelineTimingMetadata,
} from '../../types';
import type {
  TealModule,
  ModuleResult,
} from '../../../core/engine/v1.2/types';

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary for pre-execution module action */
const arbPreAction = fc.constantFrom('ALLOW', 'MONITOR', 'DENY');

/** Arbitrary for post-execution module action */
const arbPostAction = fc.constantFrom('ALLOW', 'DENY');

/** Arbitrary for request payloads (JSON-safe) */
const arbPayload: fc.Arbitrary<Record<string, unknown>> = fc.record({
  content: fc.string({ minLength: 1, maxLength: 100 }),
  model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro'),
});

/** Arbitrary for provider responses (JSON-safe) */
const arbResponse: fc.Arbitrary<Record<string, unknown>> = fc.record({
  content: fc.string({ minLength: 1, maxLength: 200 }),
  model: fc.constantFrom('gpt-4', 'claude-3', 'gemini-pro'),
  usage: fc.record({
    input_tokens: fc.nat({ max: 1000 }),
    output_tokens: fc.nat({ max: 1000 }),
    total_tokens: fc.nat({ max: 2000 }),
  }),
});

/** Arbitrary for seal_secret (present or absent) */
const arbSealSecret: fc.Arbitrary<string | undefined> = fc.option(
  fc.string({ minLength: 8, maxLength: 64 }),
  { nil: undefined },
);

// ── Helper Functions ─────────────────────────────────────────────

/**
 * Create a module that returns the given action deterministically.
 */
function createModule(name: string, action: string, reasonCodes: string[] = []): TealModule {
  return {
    name,
    version: '1.0.0',
    evaluate: async (): Promise<ModuleResult> => ({
      action: action as ModuleResult['action'],
      reason_codes: reasonCodes.length > 0 ? reasonCodes : [`${action}_REASON`],
      event_type: 'test.evaluation',
    }),
  };
}

/**
 * Create a mock provider client (ObserveProxy stand-in) that returns the given response.
 */
function createMockProvider(response: Record<string, unknown>) {
  return {
    execute: async () => ({
      success: true,
      response,
      metadata: {
        model: 'mock-model',
        latency_ms: 50,
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        cost_usd: 0.001,
      },
    }),
  };
}

/**
 * Build a DefensePipeline with the given configuration.
 */
function buildPipeline(opts: {
  preAction: string;
  postAction: string;
  sealSecret: string | undefined;
  response: Record<string, unknown>;
}): DefensePipeline {
  const preModules = [createModule('pre-mod', opts.preAction, opts.preAction === 'DENY' ? ['POLICY_VIOLATION'] : [])];
  const postModules = [createModule('post-mod', opts.postAction, opts.postAction === 'DENY' ? ['CONTENT_VIOLATION'] : [])];

  const config: PipelineConfig = {
    preExecutionModules: preModules,
    postExecutionModules: postModules,
    providerClient: createMockProvider(opts.response),
    resample_budget: 0, // No resampling to keep tests focused on serialization
    agent_id: 'test-agent',
  };

  // Only set seal_secret if defined (exactOptionalPropertyTypes)
  if (opts.sealSecret !== undefined) {
    config.seal_secret = opts.sealSecret;
  }

  return new DefensePipeline(config);
}

// ── Property Tests ───────────────────────────────────────────────

describe('Property 9: Pipeline Result Serialization Round-Trip', () => {
  /**
   * For any pipeline execution resulting in a pre-execution DENY,
   * toJSON() round-trips without information loss.
   *
   * **Validates: Requirements 5.4, 13.1, 13.5**
   */
  describe('Pre-execution DENY results serialize losslessly', () => {
    it('toJSON() round-trip preserves all fields for blocked results', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPayload,
          arbSealSecret,
          arbResponse,
          async (payload, sealSecret, response) => {
            const pipeline = buildPipeline({
              preAction: 'DENY',
              postAction: 'ALLOW',
              sealSecret,
              response,
            });

            const request: PipelineRequest = { payload, correlation_id: 'test-' + Date.now() };
            const result = await pipeline.execute(request);

            // Serialize via toJSON() then round-trip through JSON
            const json = result.toJSON();
            const roundTripped = JSON.parse(JSON.stringify(json));

            // Structural equivalence
            expect(roundTripped).toEqual(json);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * For any pipeline execution resulting in a post-execution ALLOW,
   * toJSON() round-trips without information loss.
   *
   * **Validates: Requirements 5.4, 13.1, 13.5**
   */
  describe('Post-execution ALLOW results serialize losslessly', () => {
    it('toJSON() round-trip preserves all fields for allowed results', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPayload,
          arbSealSecret,
          arbResponse,
          async (payload, sealSecret, response) => {
            const pipeline = buildPipeline({
              preAction: 'ALLOW',
              postAction: 'ALLOW',
              sealSecret,
              response,
            });

            const request: PipelineRequest = { payload, correlation_id: 'test-' + Date.now() };
            const result = await pipeline.execute(request);

            const json = result.toJSON();
            const roundTripped = JSON.parse(JSON.stringify(json));

            expect(roundTripped).toEqual(json);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * For any pipeline execution resulting in a post-execution DENY
   * (remediation exhausted since budget=0), toJSON() round-trips losslessly.
   *
   * **Validates: Requirements 5.4, 13.1, 13.5**
   */
  describe('Post-execution DENY results serialize losslessly', () => {
    it('toJSON() round-trip preserves all fields for denied results', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPayload,
          arbSealSecret,
          arbResponse,
          async (payload, sealSecret, response) => {
            const pipeline = buildPipeline({
              preAction: 'ALLOW',
              postAction: 'DENY',
              sealSecret,
              response,
            });

            const request: PipelineRequest = { payload, correlation_id: 'test-' + Date.now() };
            const result = await pipeline.execute(request);

            const json = result.toJSON();
            const roundTripped = JSON.parse(JSON.stringify(json));

            expect(roundTripped).toEqual(json);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * Timing metadata is fully preserved through the round-trip —
   * all timestamp fields (pipeline_entry, stage starts/ends, hook_time_ms)
   * survive JSON serialization.
   *
   * **Validates: Requirements 5.4, 13.1**
   */
  describe('Timing metadata preservation', () => {
    it('all timing fields are preserved through JSON round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPayload,
          arbSealSecret,
          arbResponse,
          arbPreAction,
          async (payload, sealSecret, response, preAction) => {
            const pipeline = buildPipeline({
              preAction,
              postAction: 'ALLOW',
              sealSecret,
              response,
            });

            const request: PipelineRequest = { payload, correlation_id: 'test-' + Date.now() };
            const result = await pipeline.execute(request);

            const json = result.toJSON();
            const roundTripped = JSON.parse(JSON.stringify(json));

            // Timing object must be fully preserved
            const originalTiming = json.timing as PipelineTimingMetadata;
            const parsedTiming = roundTripped.timing as PipelineTimingMetadata;

            expect(parsedTiming.pipeline_entry).toBe(originalTiming.pipeline_entry);
            expect(parsedTiming.pre_execution_start).toBe(originalTiming.pre_execution_start);
            expect(parsedTiming.pre_execution_end).toBe(originalTiming.pre_execution_end);
            expect(parsedTiming.execution_start).toBe(originalTiming.execution_start);
            expect(parsedTiming.execution_end).toBe(originalTiming.execution_end);
            expect(parsedTiming.post_execution_start).toBe(originalTiming.post_execution_start);
            expect(parsedTiming.post_execution_end).toBe(originalTiming.post_execution_end);
            expect(parsedTiming.hook_time_ms).toBe(originalTiming.hook_time_ms);
            expect(parsedTiming.remediation_attempts).toEqual(originalTiming.remediation_attempts);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * TEEC v2.1 fields (when present via seal_secret) survive serialization —
   * intent_ref, receipt_ref, seq, running_count, normalization_id,
   * and governance_seal are all preserved in the round-trip.
   *
   * **Validates: Requirements 13.5, 5.4**
   */
  describe('TEEC v2.1 chain preservation', () => {
    it('all TEEC v2.1 fields survive the round-trip when seal_secret is configured', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPayload,
          fc.string({ minLength: 8, maxLength: 64 }), // always provide seal_secret
          arbResponse,
          async (payload, sealSecret, response) => {
            const pipeline = buildPipeline({
              preAction: 'ALLOW',
              postAction: 'ALLOW',
              sealSecret,
              response,
            });

            const request: PipelineRequest = { payload, correlation_id: 'test-' + Date.now() };
            const result = await pipeline.execute(request);

            const json = result.toJSON();
            const roundTripped = JSON.parse(JSON.stringify(json));

            // Verify decisions array is preserved
            const originalDecisions = json.decisions as StageDecision[];
            const parsedDecisions = roundTripped.decisions as StageDecision[];

            expect(parsedDecisions.length).toBe(originalDecisions.length);

            for (let i = 0; i < originalDecisions.length; i++) {
              const orig = originalDecisions[i];
              const parsed = parsedDecisions[i];

              // Core fields
              expect(parsed.action).toBe(orig.action);
              expect(parsed.stage).toBe(orig.stage);
              expect(parsed.reason_codes).toEqual(orig.reason_codes);
              expect(parsed.latency_ms).toBe(orig.latency_ms);
              expect(parsed.module_details).toEqual(orig.module_details);

              // TEEC v2.1 fields (should be present when seal_secret is configured)
              expect(parsed.intent_ref).toBe(orig.intent_ref);
              expect(parsed.receipt_ref).toBe(orig.receipt_ref);
              expect(parsed.seq).toBe(orig.seq);
              expect(parsed.running_count).toBe(orig.running_count);
              expect(parsed.normalization_id).toBe(orig.normalization_id);

              // Governance seal
              if (orig.governance_seal) {
                expect(parsed.governance_seal).toEqual(orig.governance_seal);
                expect(parsed.governance_seal!.hmac).toBe(orig.governance_seal.hmac);
                expect(parsed.governance_seal!.timestamp).toBe(orig.governance_seal.timestamp);
                expect(parsed.governance_seal!.agent_id).toBe(orig.governance_seal.agent_id);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });

  /**
   * All top-level decision fields (allowed, blocked_stage, resample_count,
   * remediation_action, redacted, remediation_exhausted, provider_error)
   * are preserved through the round-trip for any pipeline outcome.
   *
   * **Validates: Requirements 5.4, 13.1**
   */
  describe('All decision fields preserved', () => {
    it('top-level result fields survive JSON round-trip for any pipeline configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPayload,
          arbSealSecret,
          arbResponse,
          arbPreAction,
          arbPostAction,
          async (payload, sealSecret, response, preAction, postAction) => {
            const pipeline = buildPipeline({
              preAction,
              postAction,
              sealSecret,
              response,
            });

            const request: PipelineRequest = { payload, correlation_id: 'test-' + Date.now() };
            const result = await pipeline.execute(request);

            const json = result.toJSON();
            const roundTripped = JSON.parse(JSON.stringify(json));

            // All top-level fields must match
            expect(roundTripped.allowed).toBe(json.allowed);
            expect(roundTripped.response).toEqual(json.response);
            expect(roundTripped.blocked_stage).toBe(json.blocked_stage);
            expect(roundTripped.total_latency_ms).toBe(json.total_latency_ms);
            expect(roundTripped.resample_count).toBe(json.resample_count);
            expect(roundTripped.remediation_action).toBe(json.remediation_action);
            expect(roundTripped.redacted).toBe(json.redacted);
            expect(roundTripped.remediation_exhausted).toBe(json.remediation_exhausted);
            expect(roundTripped.provider_error).toBe(json.provider_error);
            expect(roundTripped.pre_decision).toEqual(json.pre_decision);
            expect(roundTripped.post_decision).toEqual(json.post_decision);
          },
        ),
        { numRuns: 100 },
      );
    }, 30000);
  });
});
