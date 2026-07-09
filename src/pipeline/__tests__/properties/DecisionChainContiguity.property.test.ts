/**
 * Property Test: Decision Chain Contiguity
 *
 * **Property 5: Decision Chain Contiguity**
 * **Validates: Requirements 5.3, 9.6**
 *
 * For any pipeline execution with TEEC v2.1 enabled (seal_secret configured),
 * the `decisions` array in the PipelineResult SHALL pass `verify_contiguity()` —
 * `seq` values are monotonically increasing and each `receipt_ref` correctly
 * chains to the previous decision.
 *
 * ∀ request R, ∀ pipeline P with seal_secret configured:
 *   result = P.execute(R)
 *   verify_contiguity(result.decisions).valid === true
 *
 * @module pipeline/__tests__/properties/DecisionChainContiguity.property.test
 */

import * as fc from 'fast-check';
import { StageDecisionBuilder } from '../../StageDecisionBuilder';
import { PipelineStage } from '../../types';
import type { StageDecision, ModuleEvalDetail } from '../../types';

describe('Property 5: Decision Chain Contiguity', () => {
  /**
   * Arbitrary for generating a random PipelineStage value.
   */
  const arbStage = fc.constantFrom(
    PipelineStage.PRE_EXECUTION,
    PipelineStage.EXECUTION,
    PipelineStage.POST_EXECUTION,
  );

  /**
   * Arbitrary for generating a random governance action string.
   */
  const arbAction = fc.constantFrom('ALLOW', 'DENY', 'MONITOR', 'REDACT', 'TRANSFORM');

  /**
   * Arbitrary for generating random reason codes.
   */
  const arbReasonCodes: fc.Arbitrary<string[]> = fc.array(
    fc.constantFrom('PII_DETECTED', 'POLICY_VIOLATION', 'BUDGET_EXCEEDED', 'TOOL_NOT_ALLOWED', 'INPUT_INVALID'),
    { minLength: 0, maxLength: 3 },
  );

  /**
   * Arbitrary for generating a random ModuleEvalDetail.
   */
  const arbModuleDetail: fc.Arbitrary<ModuleEvalDetail> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    latency_ms: fc.nat({ max: 5000 }),
    action: arbAction,
    reason_codes: arbReasonCodes,
  });

  /**
   * Arbitrary for generating a JSON-compatible payload object.
   * Uses fc.object() constrained to JSON-safe values.
   */
  const arbPayload: fc.Arbitrary<Record<string, unknown>> = fc.object({
    maxDepth: 2,
    maxKeys: 5,
    withBigInt: false,
    withBoxedValues: false,
    withDate: false,
    withMap: false,
    withNullPrototype: false,
    withObjectString: false,
    withSet: false,
    withTypedArray: false,
    withSparseArray: false,
    withUnicodeString: false,
  });

  it('verifyContiguity() returns valid for any honestly-produced chain of 1-10 decisions', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }),   // seal_secret
        fc.string({ minLength: 1, maxLength: 30 }),   // agent_id
        fc.integer({ min: 1, max: 10 }),              // number of decisions
        fc.array(arbStage, { minLength: 10, maxLength: 10 }),    // stages for each decision
        fc.array(arbAction, { minLength: 10, maxLength: 10 }),   // actions for each decision
        fc.array(arbPayload, { minLength: 10, maxLength: 10 }), // payloads for each decision
        fc.array(fc.array(arbModuleDetail, { minLength: 0, maxLength: 3 }), { minLength: 10, maxLength: 10 }),
        (sealSecret, agentId, numDecisions, stages, actions, payloads, moduleDetailSets) => {
          // Build the chain using a single StageDecisionBuilder instance
          const builder = new StageDecisionBuilder(sealSecret, agentId);
          const decisions: StageDecision[] = [];

          for (let i = 0; i < numDecisions; i++) {
            const decision = builder.build({
              action: actions[i],
              reason_codes: [],
              stage: stages[i],
              latency_ms: i * 10,
              module_details: moduleDetailSets[i],
              payload: payloads[i],
            });
            decisions.push(decision);
          }

          // Verify contiguity passes for the honestly-produced chain
          const result = builder.verifyContiguity(decisions);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('seq values are monotonically increasing across any honestly-produced chain', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }),   // seal_secret
        fc.string({ minLength: 1, maxLength: 30 }),   // agent_id
        fc.integer({ min: 2, max: 10 }),              // number of decisions (at least 2 to check ordering)
        fc.array(arbPayload, { minLength: 10, maxLength: 10 }), // payloads
        (sealSecret, agentId, numDecisions, payloads) => {
          const builder = new StageDecisionBuilder(sealSecret, agentId);
          const decisions: StageDecision[] = [];

          for (let i = 0; i < numDecisions; i++) {
            const decision = builder.build({
              action: 'ALLOW',
              reason_codes: [],
              stage: i % 2 === 0 ? PipelineStage.PRE_EXECUTION : PipelineStage.POST_EXECUTION,
              latency_ms: i,
              module_details: [],
              payload: payloads[i],
            });
            decisions.push(decision);
          }

          // Verify seq is strictly monotonically increasing
          for (let i = 1; i < decisions.length; i++) {
            expect(decisions[i].seq).toBeGreaterThan(decisions[i - 1].seq!);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('contiguity verification detects any tampered receipt_ref in the chain', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }),   // seal_secret
        fc.string({ minLength: 1, maxLength: 30 }),   // agent_id
        fc.integer({ min: 2, max: 10 }),              // number of decisions
        fc.array(arbPayload, { minLength: 10, maxLength: 10 }),
        fc.string({ minLength: 64, maxLength: 64 }).map(s => s.replace(/[^0-9a-f]/gi, 'a').padEnd(64, '0').slice(0, 64)), // tampered receipt_ref
        (sealSecret, agentId, numDecisions, payloads, tamperedReceipt: string) => {
          const builder = new StageDecisionBuilder(sealSecret, agentId);
          const decisions: StageDecision[] = [];

          for (let i = 0; i < numDecisions; i++) {
            const decision = builder.build({
              action: 'ALLOW',
              reason_codes: [],
              stage: PipelineStage.PRE_EXECUTION,
              latency_ms: i,
              module_details: [],
              payload: payloads[i],
            });
            decisions.push(decision);
          }

          // Tamper with a random decision's receipt_ref (not necessarily the original value)
          const tamperIndex = numDecisions - 1; // last decision
          const original = decisions[tamperIndex].receipt_ref!;

          // Only test if the tampered value is different from the original
          if (tamperedReceipt !== original) {
            decisions[tamperIndex] = { ...decisions[tamperIndex], receipt_ref: tamperedReceipt };
            const result = builder.verifyContiguity(decisions);
            expect(result.valid).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
