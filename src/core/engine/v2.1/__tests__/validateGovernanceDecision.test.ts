/**
 * Unit tests for validateGovernanceDecision — TEEC v2.1 decision validation.
 *
 * @module core/engine/v2.1/__tests__/validateGovernanceDecision.test
 */

import { validateGovernanceDecision } from '../validateGovernanceDecision';
import { CryptoService } from '../CryptoService';
import type { ValidationContext } from '../types';

/**
 * Helper: build a valid v2.1 decision and matching validation context.
 * Uses deterministic values so tests are reproducible.
 */
function buildValidDecisionAndContext(overrides?: {
  request_payload?: Record<string, unknown>;
  seal_secret?: string;
  agent_id?: string;
  timestamp?: number;
}) {
  const request_payload = overrides?.request_payload ?? { action: 'chat.create', model: 'gpt-4' };
  const seal_secret = overrides?.seal_secret ?? 'test-seal-secret';
  const agent_id = overrides?.agent_id ?? 'agent-001';
  const timestamp = overrides?.timestamp ?? 1700000000000;

  // Build a plausible decision with all required v2.1 fields
  const serialized = CryptoService.deterministicSerialize(request_payload);
  const intent_ref = CryptoService.sha256(serialized);
  const normalization_id = CryptoService.sha256(CryptoService.normalizePayload(request_payload));

  const basePart: Record<string, unknown> = {
    action: 'ALLOW',
    reason_codes: ['POLICY_COMPLIANT'],
    risk_score: 0,
    mode: 'ENFORCE',
    policy_id: 'default',
    policy_version: '1.0.0',
    component_versions: { sdk: '1.4.0', engine: '2.1.0' },
    correlation_id: 'corr-123',
    reason: 'All policies passed',
    intent_ref,
    receipt_ref: '0'.repeat(64),
    seq: 1,
    running_count: 1,
    normalization_id,
    teec_version: '2.1',
  };

  // Compute seal
  const sealPayload = CryptoService.deterministicSerialize(basePart);
  const hmacInput = sealPayload + String(timestamp) + agent_id;
  const hmac = CryptoService.hmacSha256(seal_secret, hmacInput);

  const decision: Record<string, unknown> = {
    ...basePart,
    governance_seal: { hmac, timestamp, agent_id },
  };

  const context: ValidationContext = {
    request_payload,
    seal_secret,
    reference_time: timestamp,
    timestamp_tolerance_ms: 60000,
  };

  return { decision, context };
}

describe('validateGovernanceDecision', () => {
  describe('successful validation', () => {
    it('should return valid:true for a correctly formed v2.1 decision', () => {
      const { decision, context } = buildValidDecisionAndContext();
      const result = validateGovernanceDecision(decision, context);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.receipt_ref).toBe(decision.receipt_ref);
        expect(result.intent_ref).toBe(decision.intent_ref);
      }
    });

    it('should accept decisions within default timestamp tolerance (60s)', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000000000 });
      // reference_time 30 seconds ahead — within default 60s tolerance
      context.reference_time = 1700000030000;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(true);
    });

    it('should accept decisions at exact tolerance boundary', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000000000 });
      // Exactly 60000ms drift
      context.reference_time = 1700000060000;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(true);
    });

    it('should work with custom timestamp_tolerance_ms', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000000000 });
      context.reference_time = 1700000100000; // 100s drift
      context.timestamp_tolerance_ms = 120000; // 120s tolerance
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(true);
    });
  });

  describe('schema_violation', () => {
    it('should return schema_violation for a v1.2 decision (missing v2.1 fields)', () => {
      const v12Decision: Record<string, unknown> = {
        action: 'ALLOW',
        reason_codes: ['POLICY_COMPLIANT'],
        risk_score: 0,
        mode: 'ENFORCE',
        policy_id: 'default',
        policy_version: '1.0.0',
        component_versions: { sdk: '1.1.0', engine: '1.2.0' },
        correlation_id: 'corr-456',
        reason: 'All policies passed',
      };

      const context: ValidationContext = {
        request_payload: { action: 'chat.create' },
        seal_secret: 'secret',
        reference_time: Date.now(),
      };

      const result = validateGovernanceDecision(v12Decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
        expect(result.message).toContain('TEEC v1.2');
        expect(result.message).toContain('TEECValidator.validateDecision()');
      }
    });

    it('should return schema_violation for an empty object', () => {
      const context: ValidationContext = {
        request_payload: {},
        seal_secret: 'secret',
        reference_time: Date.now(),
      };

      const result = validateGovernanceDecision({}, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
        expect(result.message).toContain('missing required TEEC v2.1 fields');
      }
    });

    it('should return schema_violation when intent_ref is not a string', () => {
      const { decision, context } = buildValidDecisionAndContext();
      decision.intent_ref = 123;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
        expect(result.message).toContain('intent_ref');
      }
    });

    it('should return schema_violation when seq is not a number', () => {
      const { decision, context } = buildValidDecisionAndContext();
      decision.seq = 'one';
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
        expect(result.message).toContain('seq');
      }
    });

    it('should return schema_violation when governance_seal has wrong shape', () => {
      const { decision, context } = buildValidDecisionAndContext();
      decision.governance_seal = { hmac: 'abc', timestamp: 'not-a-number', agent_id: 'x' };
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
        expect(result.message).toContain('governance_seal');
      }
    });

    it('should return schema_violation when governance_seal is null', () => {
      const { decision, context } = buildValidDecisionAndContext();
      decision.governance_seal = null;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
        expect(result.message).toContain('governance_seal');
      }
    });
  });

  describe('timestamp_drift', () => {
    it('should return timestamp_drift when seal is too old', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000000000 });
      // reference_time 2 minutes ahead — exceeds default 60s tolerance
      context.reference_time = 1700000120000;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('timestamp_drift');
        expect(result.message).toContain('120000');
        expect(result.message).toContain('60000');
      }
    });

    it('should return timestamp_drift when seal is in the future beyond tolerance', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000120000 });
      context.reference_time = 1700000000000;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('timestamp_drift');
      }
    });

    it('should use default tolerance of 60000ms when not specified', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000000000 });
      context.reference_time = 1700000060001; // 1ms over default tolerance
      delete context.timestamp_tolerance_ms;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('timestamp_drift');
      }
    });
  });

  describe('intent_mismatch', () => {
    it('should return intent_mismatch when request_payload differs', () => {
      const { decision, context } = buildValidDecisionAndContext({
        request_payload: { action: 'chat.create', model: 'gpt-4' },
      });
      // Change the payload in context (simulating wrong payload)
      context.request_payload = { action: 'chat.create', model: 'gpt-3.5' };
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('intent_mismatch');
        expect(result.message).toContain('TOCTOU');
      }
    });

    it('should return intent_mismatch for empty vs non-empty payload', () => {
      const { decision, context } = buildValidDecisionAndContext({
        request_payload: { action: 'run' },
      });
      context.request_payload = {};
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('intent_mismatch');
      }
    });
  });

  describe('seal_mismatch', () => {
    it('should return seal_mismatch when seal_secret is wrong', () => {
      const { decision, context } = buildValidDecisionAndContext({ seal_secret: 'correct-secret' });
      context.seal_secret = 'wrong-secret';
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('seal_mismatch');
        expect(result.message).toContain('tampering');
      }
    });

    it('should return seal_mismatch when decision payload is modified', () => {
      const { decision, context } = buildValidDecisionAndContext();
      // Tamper with a field after seal was computed
      decision.risk_score = 99;
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('seal_mismatch');
      }
    });

    it('should return seal_mismatch when receipt_ref is tampered', () => {
      const { decision, context } = buildValidDecisionAndContext();
      decision.receipt_ref = 'a'.repeat(64); // Tampered
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('seal_mismatch');
      }
    });
  });

  describe('validation order', () => {
    it('should check schema before timestamp', () => {
      // A decision with both schema and timestamp issues — schema wins
      const context: ValidationContext = {
        request_payload: {},
        seal_secret: 'secret',
        reference_time: 0, // Would cause drift if schema passed
      };
      const result = validateGovernanceDecision({}, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('schema_violation');
      }
    });

    it('should check timestamp before intent_ref', () => {
      const { decision, context } = buildValidDecisionAndContext({ timestamp: 1700000000000 });
      context.reference_time = 1700000200000; // 200s drift — exceeds tolerance
      context.request_payload = { wrong: 'payload' }; // Would also cause intent_mismatch
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('timestamp_drift');
      }
    });

    it('should check intent_ref before seal', () => {
      const { decision, context } = buildValidDecisionAndContext();
      // Wrong payload causes intent_mismatch, wrong secret would cause seal_mismatch
      context.request_payload = { tampered: true };
      context.seal_secret = 'also-wrong';
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error_type).toBe('intent_mismatch');
      }
    });
  });

  describe('edge cases', () => {
    it('should validate decisions with empty request payload', () => {
      const { decision, context } = buildValidDecisionAndContext({ request_payload: {} });
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(true);
    });

    it('should validate decisions with complex nested payload', () => {
      const payload = {
        action: 'tool.execute',
        params: { nested: { deep: true }, array: [1, 2, 3] },
        meta: 'test',
      };
      const { decision, context } = buildValidDecisionAndContext({ request_payload: payload });
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(true);
    });

    it('should use Date.now() as default reference_time', () => {
      const now = Date.now();
      const { decision, context } = buildValidDecisionAndContext({ timestamp: now });
      delete context.reference_time;
      // The seal timestamp is "now" so drift should be minimal
      const result = validateGovernanceDecision(decision, context);
      expect(result.valid).toBe(true);
    });
  });
});
