/**
 * Property-based tests for validateGovernanceDecision — TEEC v2.1 validation.
 *
 * Uses fast-check to verify universal correctness properties across arbitrary inputs.
 *
 * Properties tested:
 * - Property 9: Tamper Detection — single-field mutations always cause validation failure
 * - Property 11: Backward Compatibility Preservation — v1.2 decisions still pass TEECValidator
 *
 * @module core/engine/v2.1/__tests__/properties/validation.property.test
 */

import * as fc from 'fast-check';
import { GovernanceEngineV21 } from '../../GovernanceEngineV21';
import { validateGovernanceDecision } from '../../validateGovernanceDecision';
import { TEECValidator } from '../../../v1.2/TEECValidator';
import { TEECRegistryLoader } from '../../../v1.2/TEECRegistryLoader';
import type { Decision } from '../../../v1.2/types';
import { DecisionAction, PolicyMode, ReasonCode } from '../../../types';

// ── Helpers ────────────────────────────────────────────────────────

/** Minimal engine config for property tests */
function createEngine(sealSecret = 'tamper-test-secret', agentId = 'tamper-agent') {
  return new GovernanceEngineV21({
    policy: {},
    seal_secret: sealSecret,
    agent_id: agentId,
  });
}

/** Arbitrary for generating request payloads with string/number values */
const requestPayloadArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer({ min: -1000000, max: 1000000 }),
  ),
  { minKeys: 1, maxKeys: 8 },
);

/**
 * Fields on a DecisionV21 that can be tampered with (excluding governance_seal).
 * These are fields the engine produces that affect the HMAC or intent verification.
 */
const TAMPERABLE_FIELDS = [
  'action',
  'reason_codes',
  'risk_score',
  'seq',
  'running_count',
  'receipt_ref',
  'intent_ref',
  'normalization_id',
  'correlation_id',
  'reason',
] as const;

type TamperableField = typeof TAMPERABLE_FIELDS[number];

/**
 * Produce a tampered value for a given field that differs from the original.
 */
function tamperField(decision: Record<string, unknown>, field: TamperableField): Record<string, unknown> {
  const tampered = { ...decision };

  switch (field) {
    case 'action':
      tampered.action = decision.action === 'ALLOW' ? 'DENY' : 'ALLOW';
      break;
    case 'reason_codes':
      tampered.reason_codes = ['TAMPERED_CODE'];
      break;
    case 'risk_score':
      tampered.risk_score = ((decision.risk_score as number) + 50) % 101;
      break;
    case 'seq':
      tampered.seq = (decision.seq as number) + 999;
      break;
    case 'running_count':
      tampered.running_count = (decision.running_count as number) + 999;
      break;
    case 'receipt_ref':
      // Flip a character in the hex string
      tampered.receipt_ref = 'f'.repeat(64);
      break;
    case 'intent_ref':
      // Flip a character in the hex string
      tampered.intent_ref = 'a'.repeat(64);
      break;
    case 'normalization_id':
      tampered.normalization_id = 'b'.repeat(64);
      break;
    case 'correlation_id':
      tampered.correlation_id = 'tampered-correlation-id';
      break;
    case 'reason':
      tampered.reason = 'tampered reason value';
      break;
  }

  return tampered;
}

// ── Property 9: Tamper Detection ───────────────────────────────────

/**
 * **Validates: Requirements 6.2, 6.8**
 *
 * Property 9: Tamper Detection — for any valid Decision, modifying any field
 * (other than governance_seal) and then calling validateGovernanceDecision()
 * SHALL return valid === false with error_type 'seal_mismatch' or 'intent_mismatch'.
 */
describe('Property 9: Tamper Detection', () => {
  it('single-field mutations always cause validation failure', async () => {
    const sealSecret = 'tamper-detect-secret';
    const agentId = 'tamper-detect-agent';

    await fc.assert(
      fc.asyncProperty(
        requestPayloadArb,
        fc.constantFrom(...TAMPERABLE_FIELDS),
        async (request, fieldToTamper) => {
          const engine = createEngine(sealSecret, agentId);

          // Produce a valid decision
          const decision = await engine.evaluate(request, {
            correlation_id: 'tamper-test',
          });

          // Tamper a single field (not governance_seal)
          const tamperedDecision = tamperField(
            decision as unknown as Record<string, unknown>,
            fieldToTamper,
          );

          // Validate the tampered decision with the original request and secret
          const result = validateGovernanceDecision(tamperedDecision, {
            request_payload: request,
            seal_secret: sealSecret,
            reference_time: (decision.governance_seal).timestamp,
            timestamp_tolerance_ms: 60000,
          });

          // Must fail validation
          expect(result.valid).toBe(false);

          if (!result.valid) {
            // Should be either seal_mismatch or intent_mismatch depending on the field
            expect(['seal_mismatch', 'intent_mismatch']).toContain(result.error_type);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('tampering intent_ref specifically produces intent_mismatch or seal_mismatch', async () => {
    const sealSecret = 'intent-tamper-secret';
    const agentId = 'intent-tamper-agent';

    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine(sealSecret, agentId);

        const decision = await engine.evaluate(request, {
          correlation_id: 'intent-tamper-test',
        });

        // Tamper only intent_ref
        const tamperedDecision = tamperField(
          decision as unknown as Record<string, unknown>,
          'intent_ref',
        );

        const result = validateGovernanceDecision(tamperedDecision, {
          request_payload: request,
          seal_secret: sealSecret,
          reference_time: (decision.governance_seal).timestamp,
          timestamp_tolerance_ms: 60000,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          // intent_ref is checked before seal, so tampering it causes intent_mismatch
          expect(result.error_type).toBe('intent_mismatch');
        }
      }),
      { numRuns: 30 },
    );
  });

  it('tampering non-intent fields produces seal_mismatch', async () => {
    const sealSecret = 'seal-tamper-secret';
    const agentId = 'seal-tamper-agent';

    // These fields don't affect intent_ref verification but do affect the seal
    const nonIntentFields: TamperableField[] = [
      'action',
      'reason_codes',
      'risk_score',
      'seq',
      'running_count',
      'receipt_ref',
      'normalization_id',
      'correlation_id',
      'reason',
    ];

    await fc.assert(
      fc.asyncProperty(
        requestPayloadArb,
        fc.constantFrom(...nonIntentFields),
        async (request, fieldToTamper) => {
          const engine = createEngine(sealSecret, agentId);

          const decision = await engine.evaluate(request, {
            correlation_id: 'seal-tamper-test',
          });

          const tamperedDecision = tamperField(
            decision as unknown as Record<string, unknown>,
            fieldToTamper,
          );

          const result = validateGovernanceDecision(tamperedDecision, {
            request_payload: request,
            seal_secret: sealSecret,
            reference_time: (decision.governance_seal).timestamp,
            timestamp_tolerance_ms: 60000,
          });

          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error_type).toBe('seal_mismatch');
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ── Property 11: Backward Compatibility Preservation ───────────────

/**
 * **Validates: Requirements 9.1, 9.2**
 *
 * Property 11: Backward Compatibility Preservation — for any valid v1.2 Decision
 * that passes TEECValidator.validateDecision(), that same Decision SHALL continue
 * to pass after the v2.1 extension is deployed. No false rejections of legacy decisions.
 */
describe('Property 11: Backward Compatibility Preservation', () => {
  const registry = TEECRegistryLoader.loadEmbedded();
  const validator = new TEECValidator(registry);

  /** Arbitrary for valid v1.2 decision actions from the registry */
  const validActionArb = fc.constantFrom(
    'ALLOW' as DecisionAction,
    'DENY' as DecisionAction,
    'REDACT' as DecisionAction,
    'DEGRADE' as DecisionAction,
  );

  /** Arbitrary for valid reason codes from the registry */
  const validReasonCodeArb = fc.constantFrom(
    'POLICY_COMPLIANT' as ReasonCode,
    'POLICY_VIOLATION' as ReasonCode,
    'PII_DETECTED' as ReasonCode,
    'COST_BUDGET_EXCEEDED' as ReasonCode,
    'TOOL_NOT_ALLOWED' as ReasonCode,
    'SECRET_DETECTED' as ReasonCode,
  );

  /** Arbitrary for valid policy modes */
  const validModeArb = fc.constantFrom(
    'ENFORCE' as PolicyMode,
    'MONITOR' as PolicyMode,
    'REPORT_ONLY' as PolicyMode,
  );

  /** Arbitrary for generating valid v1.2 Decision objects */
  const v12DecisionArb = fc.record({
    action: validActionArb,
    reason_codes: fc.array(validReasonCodeArb, { minLength: 1, maxLength: 4 }),
    risk_score: fc.integer({ min: 0, max: 100 }),
    mode: validModeArb,
    policy_id: fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_'.split('')) }),
    policy_version: fc.constantFrom('1.0.0', '1.1.0', '1.2.0', '2.0.0'),
    component_versions: fc.constant({ sdk: '1.2.0', engine: '1.2.0' }),
    correlation_id: fc.uuid(),
    reason: fc.string({ minLength: 1, maxLength: 50 }),
  }) as fc.Arbitrary<Decision>;

  it('v1.2 decisions pass TEECValidator.validateDecision() without error after v2.1 deployment', () => {
    fc.assert(
      fc.property(v12DecisionArb, (decision) => {
        // Validate using the v1.2 TEECValidator
        const results = validator.validateDecision(decision);

        // All validation results should be valid (no false rejections)
        const allValid = results.every((r) => r.valid);
        expect(allValid).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it('v1.2 decisions with event_type pass TEECValidator validation', () => {
    const v12WithEventTypeArb = fc.record({
      action: validActionArb,
      reason_codes: fc.array(validReasonCodeArb, { minLength: 1, maxLength: 3 }),
      risk_score: fc.integer({ min: 0, max: 100 }),
      mode: validModeArb,
      policy_id: fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_'.split('')) }),
      policy_version: fc.constantFrom('1.0.0', '1.2.0'),
      component_versions: fc.constant({ sdk: '1.2.0', engine: '1.2.0' }),
      correlation_id: fc.uuid(),
      reason: fc.string({ minLength: 1, maxLength: 50 }),
      event_type: fc.constantFrom(
        'policy.evaluation',
        'secret.detection',
        'memory.write',
        'cost.budget',
      ),
    }) as fc.Arbitrary<Decision>;

    fc.assert(
      fc.property(v12WithEventTypeArb, (decision) => {
        const results = validator.validateDecision(decision);
        const allValid = results.every((r) => r.valid);
        expect(allValid).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it('v1.2 decisions without v2.1 fields do NOT have v2.1-specific structure', () => {
    fc.assert(
      fc.property(v12DecisionArb, (decision) => {
        // Verify the decision is a valid v1.2 decision (has v1.2 fields)
        expect(decision.action).toBeDefined();
        expect(decision.reason_codes).toBeDefined();
        expect(decision.risk_score).toBeDefined();
        expect(decision.mode).toBeDefined();
        expect(decision.policy_id).toBeDefined();
        expect(decision.correlation_id).toBeDefined();

        // Verify it does NOT have v2.1-specific fields
        const d = decision as unknown as Record<string, unknown>;
        expect(d.intent_ref).toBeUndefined();
        expect(d.receipt_ref).toBeUndefined();
        expect(d.seq).toBeUndefined();
        expect(d.running_count).toBeUndefined();
        expect(d.normalization_id).toBeUndefined();
        expect(d.governance_seal).toBeUndefined();
      }),
      { numRuns: 30 },
    );
  });
});
