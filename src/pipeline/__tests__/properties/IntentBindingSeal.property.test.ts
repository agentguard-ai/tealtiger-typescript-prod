/**
 * Property-based tests for Stage Decision Intent Binding and Seal Validation.
 *
 * Uses fast-check to verify that for any StageDecision produced by the
 * StageDecisionBuilder with TEEC v2.1 enabled:
 * 1. intent_ref === SHA256(deterministicSerialize(payload))
 * 2. The governance_seal HMAC is recomputable from the decision fields
 * 3. The seal binds action, stage, seq, intent_ref, receipt_ref to agent_id and timestamp
 *
 * **Validates: Requirements 9.3, 9.4, 9.7**
 *
 * @module pipeline/__tests__/properties/IntentBindingSeal.property.test
 */

import * as fc from 'fast-check';
import { StageDecisionBuilder } from '../../StageDecisionBuilder';
import { CryptoService } from '../../../core/engine/v2.1/CryptoService';
import { PipelineStage } from '../../types';

// ── Arbitraries ──────────────────────────────────────────────────

/** Arbitrary for non-empty seal secrets */
const sealSecretArb = fc.string({ minLength: 1, maxLength: 64 });

/** Arbitrary for agent IDs */
const agentIdArb = fc.string({ minLength: 1, maxLength: 32 });

/** Arbitrary for pipeline stages (only PRE_EXECUTION and POST_EXECUTION produce decisions) */
const stageArb = fc.constantFrom(PipelineStage.PRE_EXECUTION, PipelineStage.POST_EXECUTION);

/** Arbitrary for actions */
const actionArb = fc.constantFrom('ALLOW', 'DENY', 'MONITOR');

/** Arbitrary for reason codes */
const reasonCodesArb = fc.array(
  fc.constantFrom(
    'POLICY_VIOLATION',
    'PII_DETECTED',
    'BUDGET_EXCEEDED',
    'INPUT_INVALID',
    'TOOL_NOT_ALLOWED',
    'CONTENT_VIOLATION',
  ),
  { minLength: 0, maxLength: 3 },
);

/**
 * Arbitrary for JSON-serializable payloads.
 * Uses simple key-value dictionaries with string keys and JSON-compatible values.
 */
const payloadArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer({ min: -1000000, max: 1000000 }),
    fc.boolean(),
    fc.constant(null),
    fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  ),
  { minKeys: 1, maxKeys: 8 },
);

// ── Property 6: Stage Decision Intent Binding and Seal Validation ──

/**
 * **Validates: Requirements 9.3, 9.4, 9.7**
 *
 * Property 6: Stage Decision Intent Binding and Seal Validation —
 * For any StageDecision produced by the pipeline with TEEC v2.1 enabled,
 * validate_governance_decision() SHALL succeed when given the correct input
 * payload and seal_secret. The intent_ref SHALL equal
 * SHA256(deterministicSerialize(payload)).
 */
describe('Property 6: Stage Decision Intent Binding and Seal Validation', () => {
  it('intent_ref always equals SHA256(deterministicSerialize(payload)) for any generated payload', () => {
    fc.assert(
      fc.property(
        sealSecretArb,
        agentIdArb,
        stageArb,
        actionArb,
        reasonCodesArb,
        payloadArb,
        (sealSecret, agentId, stage, action, reasonCodes, payload) => {
          const builder = new StageDecisionBuilder(sealSecret, agentId);
          const decision = builder.build({
            action,
            reason_codes: reasonCodes,
            stage,
            latency_ms: 10,
            module_details: [],
            payload,
          });

          // intent_ref must equal SHA256 of deterministically serialized payload
          const expectedIntentRef = CryptoService.sha256(
            CryptoService.deterministicSerialize(payload),
          );
          expect(decision.intent_ref).toBe(expectedIntentRef);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('governance_seal HMAC is verifiable by recomputing from decision fields', () => {
    fc.assert(
      fc.property(
        sealSecretArb,
        agentIdArb,
        stageArb,
        actionArb,
        reasonCodesArb,
        payloadArb,
        (sealSecret, agentId, stage, action, reasonCodes, payload) => {
          const builder = new StageDecisionBuilder(sealSecret, agentId);
          const decision = builder.build({
            action,
            reason_codes: reasonCodes,
            stage,
            latency_ms: 10,
            module_details: [],
            payload,
          });

          // Governance seal must be present
          expect(decision.governance_seal).toBeDefined();
          const seal = decision.governance_seal!;

          // Recompute the HMAC using the same sealSecret and decision fields
          const sealData = CryptoService.deterministicSerialize({
            action: decision.action,
            stage: decision.stage,
            seq: decision.seq,
            intent_ref: decision.intent_ref,
            receipt_ref: decision.receipt_ref,
            running_count: decision.running_count,
            normalization_id: decision.normalization_id,
            timestamp: seal.timestamp,
            agent_id: seal.agent_id,
          });
          const expectedHmac = CryptoService.hmacSha256(sealSecret, sealData);

          expect(seal.hmac).toBe(expectedHmac);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('seal binds action, stage, seq, intent_ref, receipt_ref to agent_id and timestamp', () => {
    fc.assert(
      fc.property(
        sealSecretArb,
        agentIdArb,
        stageArb,
        actionArb,
        payloadArb,
        (sealSecret, agentId, stage, action, payload) => {
          const builder = new StageDecisionBuilder(sealSecret, agentId);
          const decision = builder.build({
            action,
            reason_codes: [],
            stage,
            latency_ms: 10,
            module_details: [],
            payload,
          });

          const seal = decision.governance_seal!;

          // Verify seal contains agent_id
          expect(seal.agent_id).toBe(agentId);

          // Verify seal timestamp is a positive number
          expect(seal.timestamp).toBeGreaterThan(0);

          // Verify that changing any bound field would invalidate the HMAC
          // (tamper detection) — alter the action and recompute
          const tamperedSealData = CryptoService.deterministicSerialize({
            action: action === 'ALLOW' ? 'DENY' : 'ALLOW', // tampered
            stage: decision.stage,
            seq: decision.seq,
            intent_ref: decision.intent_ref,
            receipt_ref: decision.receipt_ref,
            running_count: decision.running_count,
            normalization_id: decision.normalization_id,
            timestamp: seal.timestamp,
            agent_id: seal.agent_id,
          });
          const tamperedHmac = CryptoService.hmacSha256(sealSecret, tamperedSealData);

          // Tampered HMAC should differ from the original seal
          expect(tamperedHmac).not.toBe(seal.hmac);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('intent_ref is deterministic: same payload always produces the same intent_ref', () => {
    fc.assert(
      fc.property(
        sealSecretArb,
        agentIdArb,
        payloadArb,
        (sealSecret, agentId, payload) => {
          // Build two decisions from two separate builders with the same payload
          const builder1 = new StageDecisionBuilder(sealSecret, agentId);
          const decision1 = builder1.build({
            action: 'ALLOW',
            reason_codes: [],
            stage: PipelineStage.PRE_EXECUTION,
            latency_ms: 10,
            module_details: [],
            payload,
          });

          const builder2 = new StageDecisionBuilder(sealSecret, agentId);
          const decision2 = builder2.build({
            action: 'DENY',
            reason_codes: ['TEST'],
            stage: PipelineStage.POST_EXECUTION,
            latency_ms: 20,
            module_details: [],
            payload,
          });

          // Same payload → same intent_ref regardless of other decision fields
          expect(decision1.intent_ref).toBe(decision2.intent_ref);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different payloads produce different intent_refs (collision resistance)', () => {
    fc.assert(
      fc.property(
        sealSecretArb,
        agentIdArb,
        payloadArb,
        payloadArb,
        (sealSecret, agentId, payload1, payload2) => {
          // Only test when payloads are actually different
          const serialized1 = CryptoService.deterministicSerialize(payload1);
          const serialized2 = CryptoService.deterministicSerialize(payload2);
          fc.pre(serialized1 !== serialized2);

          const builder1 = new StageDecisionBuilder(sealSecret, agentId);
          const decision1 = builder1.build({
            action: 'ALLOW',
            reason_codes: [],
            stage: PipelineStage.PRE_EXECUTION,
            latency_ms: 10,
            module_details: [],
            payload: payload1,
          });

          const builder2 = new StageDecisionBuilder(sealSecret, agentId);
          const decision2 = builder2.build({
            action: 'ALLOW',
            reason_codes: [],
            stage: PipelineStage.PRE_EXECUTION,
            latency_ms: 10,
            module_details: [],
            payload: payload2,
          });

          expect(decision1.intent_ref).not.toBe(decision2.intent_ref);
        },
      ),
      { numRuns: 100 },
    );
  });
});
