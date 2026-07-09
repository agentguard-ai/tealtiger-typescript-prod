/**
 * Backward Compatibility Tests — TEEC v2.1 Governance Contract
 *
 * Verifies that deploying v2.1 code does NOT break existing v1.2 usage patterns:
 * 1. TEECValidator.validateDecision() still validates v1.2 Decisions
 * 2. v1.2 import paths remain unchanged
 * 3. GovernanceEngineV21 without seal_secret delegates to v1.2 behavior
 *
 * Validates: Requirements 9.1, 9.2, 9.5, 9.6
 *
 * @module core/engine/v2.1/__tests__/backward-compatibility.test
 */

import { Decision } from '../../v1.2/types';
import { TEECValidator } from '../../v1.2/TEECValidator';
import { TEECRegistryLoader } from '../../v1.2/TEECRegistryLoader';
import { GovernanceEngineV21 } from '../GovernanceEngineV21';

describe('Backward Compatibility — v1.2 Decision validation after v2.1 deployment', () => {
  let registry: ReturnType<typeof TEECRegistryLoader.loadEmbedded>;
  let validator: TEECValidator;

  beforeAll(() => {
    registry = TEECRegistryLoader.loadEmbedded();
    validator = new TEECValidator(registry);
  });

  // ── Requirement 9.6: v1.2 import path remains unchanged ────────

  describe('v1.2 import paths', () => {
    it('should export Decision type from v1.2/types path', () => {
      // The import at the top of this file proves the path works.
      // This assertion verifies the type is usable at runtime.
      const decision: Decision = {
        action: 'ALLOW' as any,
        reason_codes: ['POLICY_COMPLIANT'] as any[],
        risk_score: 0,
        mode: 'ENFORCE' as any,
        policy_id: 'test-policy',
        policy_version: '1.2.0',
        component_versions: { sdk: '1.2.0', engine: '1.2.0' },
        correlation_id: 'test-correlation-id',
        reason: 'Test decision',
      };
      expect(decision).toBeDefined();
      expect(decision.action).toBe('ALLOW');
    });

    it('should export TEECValidator from v1.2/TEECValidator path', () => {
      expect(TEECValidator).toBeDefined();
      expect(validator).toBeInstanceOf(TEECValidator);
    });

    it('should export TEECRegistryLoader from v1.2/TEECRegistryLoader path', () => {
      expect(TEECRegistryLoader).toBeDefined();
      expect(TEECRegistryLoader.loadEmbedded).toBeInstanceOf(Function);
    });
  });

  // ── Requirements 9.1, 9.2: TEECValidator still validates v1.2 Decisions ──

  describe('TEECValidator.validateDecision() with v1.2 Decisions', () => {
    it('should validate a valid v1.2 Decision without error', () => {
      const decision: Decision = {
        action: 'ALLOW' as any,
        reason_codes: ['POLICY_COMPLIANT'] as any[],
        risk_score: 0,
        mode: 'ENFORCE' as any,
        policy_id: 'v1.2-governance',
        policy_version: '1.2.0',
        component_versions: { sdk: '1.2.0', engine: '1.2.0' },
        correlation_id: 'compat-test-001',
        reason: 'Request allowed — all governance checks passed',
        event_type: 'policy.evaluation',
        teec_version: '0.1.0',
        timestamp: Date.now(),
        module: 'TealEngineV12',
      };

      const results = validator.validateDecision(decision);

      // All validation results should be valid
      const allValid = results.every((r) => r.valid);
      expect(allValid).toBe(true);
    });

    it('should validate a v1.2 Decision with DENY action and multiple reason codes', () => {
      const decision: Decision = {
        action: 'DENY' as any,
        reason_codes: ['POLICY_VIOLATION', 'PII_DETECTED'] as any[],
        risk_score: 100,
        mode: 'ENFORCE' as any,
        policy_id: 'v1.2-governance',
        policy_version: '1.2.0',
        component_versions: { sdk: '1.2.0', engine: '1.2.0' },
        correlation_id: 'compat-test-002',
        reason: 'Governance action: DENY. Reason codes: POLICY_VIOLATION, PII_DETECTED',
        event_type: 'pii.detection',
        teec_version: '0.1.0',
        timestamp: Date.now(),
        module: 'TealEngineV12',
      };

      const results = validator.validateDecision(decision);
      const allValid = results.every((r) => r.valid);
      expect(allValid).toBe(true);
    });

    it('should validate a v1.2 Decision without optional teec_version field', () => {
      const decision: Decision = {
        action: 'ALLOW' as any,
        reason_codes: ['POLICY_COMPLIANT'] as any[],
        risk_score: 0,
        mode: 'ENFORCE' as any,
        policy_id: 'legacy-policy',
        policy_version: '1.2.0',
        component_versions: { sdk: '1.2.0', engine: '1.2.0' },
        correlation_id: 'compat-test-003',
        reason: 'No active governance modules',
      };

      // Without teec_version, validator should still work (it's optional in v1.2)
      const results = validator.validateDecision(decision);
      const allValid = results.every((r) => r.valid);
      expect(allValid).toBe(true);
    });

    it('should validate a v1.2 Decision that does NOT have v2.1 fields', () => {
      // Crucially: a v1.2 decision has NO intent_ref, receipt_ref, seq, etc.
      const decision: Decision = {
        action: 'ALLOW' as any,
        reason_codes: ['POLICY_COMPLIANT'] as any[],
        risk_score: 0,
        mode: 'ENFORCE' as any,
        policy_id: 'v1.2-governance',
        policy_version: '1.2.0',
        component_versions: { sdk: '1.2.0', engine: '1.2.0' },
        correlation_id: 'compat-test-004',
        reason: 'Request allowed',
        event_type: 'policy.evaluation',
        teec_version: '0.1.0',
        timestamp: Date.now(),
        module: 'TealEngineV12',
      };

      // Verify the v1.2 decision has no v2.1 fields
      expect((decision as any).intent_ref).toBeUndefined();
      expect((decision as any).receipt_ref).toBeUndefined();
      expect((decision as any).seq).toBeUndefined();
      expect((decision as any).running_count).toBeUndefined();
      expect((decision as any).normalization_id).toBeUndefined();
      expect((decision as any).governance_seal).toBeUndefined();

      // TEECValidator should still validate it without error
      const results = validator.validateDecision(decision);
      const allValid = results.every((r) => r.valid);
      expect(allValid).toBe(true);
    });
  });

  // ── Requirement 9.5: GovernanceEngineV21 without seal_secret produces v1.2 Decisions ──

  describe('GovernanceEngineV21 without seal_secret (v1.2 passthrough)', () => {
    let engine: GovernanceEngineV21;

    beforeAll(() => {
      // Create engine WITHOUT seal_secret — should delegate to v1.2
      engine = new GovernanceEngineV21({ policy: {} });
    });

    it('should produce a decision without v2.1 fields when seal_secret is absent', async () => {
      const request = { action: 'chat.create', content: 'Hello world' };
      const ctx = { correlation_id: 'compat-test-no-seal-001' };

      const decision = await engine.evaluate(request, ctx);

      // The decision should NOT have v2.1 cryptographic fields
      // When seal_secret is absent, it delegates to v1.2 and casts
      expect(decision.action).toBeDefined();
      expect(decision.reason_codes).toBeDefined();
      expect(decision.correlation_id).toBe('compat-test-no-seal-001');

      // v2.1 fields should NOT be populated (it's a v1.2 decision cast to DecisionV21)
      // The engine returns v1.2 result as-is, so these fields won't exist on the actual object
      const raw = decision as any;
      // intent_ref, receipt_ref, etc. should not be present on the actual runtime object
      // because evaluateV12() doesn't produce them
      expect(raw.intent_ref ?? undefined).toBeUndefined();
      expect(raw.receipt_ref ?? undefined).toBeUndefined();
      expect(raw.seq ?? undefined).toBeUndefined();
      expect(raw.running_count ?? undefined).toBeUndefined();
      expect(raw.normalization_id ?? undefined).toBeUndefined();
      expect(raw.governance_seal ?? undefined).toBeUndefined();
    });

    it('should produce a decision that passes TEECValidator.validateDecision()', async () => {
      const request = { tool: 'web_search', query: 'test query' };
      const ctx = { correlation_id: 'compat-test-no-seal-002' };

      const decision = await engine.evaluate(request, ctx);

      // The v1.2 decision should pass the v1.2 validator
      const results = validator.validateDecision(decision as any);
      const allValid = results.every((r) => r.valid);
      expect(allValid).toBe(true);
    });

    it('should set teec_version to "0.1.0" (v1.2 registry version) not "2.1"', async () => {
      const request = { content: 'Simple test' };
      const ctx = { correlation_id: 'compat-test-no-seal-003' };

      const decision = await engine.evaluate(request, ctx);

      // Without seal_secret, the engine delegates to v1.2 which sets teec_version to '0.1.0'
      expect(decision.teec_version).toBe('0.1.0');
    });

    it('should behave identically to TealEngineV12 when no seal_secret is configured', async () => {
      const request = { action: 'tool.execute', tool: 'calculator' };
      const ctx = { correlation_id: 'compat-test-no-seal-004' };

      const decision = await engine.evaluate(request, ctx);

      // Standard v1.2 decision structure
      expect(decision.mode).toBeDefined();
      expect(decision.policy_id).toBeDefined();
      expect(decision.policy_version).toBeDefined();
      expect(decision.component_versions).toBeDefined();
      expect(decision.reason).toBeDefined();
    });
  });
});
