/**
 * Unit tests for StageDecisionBuilder — decision construction + TEEC v2.1 fields.
 *
 * @module pipeline/__tests__/StageDecisionBuilder.test
 */

import { StageDecisionBuilder } from '../StageDecisionBuilder';
import { CryptoService } from '../../core/engine/v2.1/CryptoService';
import { GENESIS_RECEIPT_REF } from '../../core/engine/v2.1/types';
import { PipelineStage, RemediationAction } from '../types';
import type { StageDecision, ModuleEvalDetail } from '../types';

describe('StageDecisionBuilder', () => {
  const sampleModuleDetails: ModuleEvalDetail[] = [
    {
      name: 'TestModule',
      version: '1.0.0',
      latency_ms: 12,
      action: 'ALLOW',
      reason_codes: [],
    },
  ];

  const samplePayload: Record<string, unknown> = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello' }],
  };

  describe('build() without sealSecret', () => {
    it('should produce a StageDecision with basic fields', () => {
      const builder = new StageDecisionBuilder();
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 25,
        module_details: sampleModuleDetails,
        payload: samplePayload,
      });

      expect(decision.action).toBe('ALLOW');
      expect(decision.reason_codes).toEqual([]);
      expect(decision.stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(decision.latency_ms).toBe(25);
      expect(decision.module_details).toEqual(sampleModuleDetails);
    });

    it('should NOT include TEEC v2.1 fields when sealSecret is not configured', () => {
      const builder = new StageDecisionBuilder();
      const decision = builder.build({
        action: 'DENY',
        reason_codes: ['PII_DETECTED'],
        stage: PipelineStage.POST_EXECUTION,
        latency_ms: 50,
        module_details: sampleModuleDetails,
        payload: samplePayload,
      });

      expect(decision.intent_ref).toBeUndefined();
      expect(decision.receipt_ref).toBeUndefined();
      expect(decision.seq).toBeUndefined();
      expect(decision.running_count).toBeUndefined();
      expect(decision.normalization_id).toBeUndefined();
      expect(decision.governance_seal).toBeUndefined();
    });

    it('should include remediation details when provided', () => {
      const builder = new StageDecisionBuilder();
      const remediation = {
        action: RemediationAction.RESAMPLE,
        triggered_by: 'ContentModerationModule',
        attempt: 1,
      };
      const decision = builder.build({
        action: 'DENY',
        reason_codes: ['CONTENT_VIOLATION'],
        stage: PipelineStage.POST_EXECUTION,
        latency_ms: 30,
        module_details: sampleModuleDetails,
        payload: samplePayload,
        remediation,
      });

      expect(decision.remediation).toEqual(remediation);
    });

    it('should NOT include remediation field when not provided', () => {
      const builder = new StageDecisionBuilder();
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 10,
        module_details: [],
        payload: {},
      });

      expect(decision.remediation).toBeUndefined();
    });
  });

  describe('build() with sealSecret (TEEC v2.1)', () => {
    const sealSecret = 'test-seal-secret-key';
    const agentId = 'agent-007';

    it('should include all six TEEC v2.1 fields', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 20,
        module_details: sampleModuleDetails,
        payload: samplePayload,
      });

      expect(decision.intent_ref).toBeDefined();
      expect(decision.receipt_ref).toBeDefined();
      expect(decision.seq).toBeDefined();
      expect(decision.running_count).toBeDefined();
      expect(decision.normalization_id).toBeDefined();
      expect(decision.governance_seal).toBeDefined();
    });

    it('should compute intent_ref as SHA-256 of deterministically serialized payload', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 20,
        module_details: sampleModuleDetails,
        payload: samplePayload,
      });

      const expectedIntentRef = CryptoService.sha256(
        CryptoService.deterministicSerialize(samplePayload),
      );
      expect(decision.intent_ref).toBe(expectedIntentRef);
    });

    it('should produce same intent_ref for same payload with different key order', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const payload1 = { model: 'gpt-4', temperature: 0.7 };
      const payload2 = { temperature: 0.7, model: 'gpt-4' };

      const decision1 = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 10,
        module_details: [],
        payload: payload1,
      });

      // Reset builder for isolated comparison
      const builder2 = new StageDecisionBuilder(sealSecret, agentId);
      const decision2 = builder2.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 10,
        module_details: [],
        payload: payload2,
      });

      expect(decision1.intent_ref).toBe(decision2.intent_ref);
    });

    it('should compute normalization_id as SHA-256 of normalized payload', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 20,
        module_details: sampleModuleDetails,
        payload: samplePayload,
      });

      const expectedNormId = CryptoService.sha256(
        CryptoService.normalizePayload(samplePayload),
      );
      expect(decision.normalization_id).toBe(expectedNormId);
    });

    it('should produce monotonically increasing seq values', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const params = {
        action: 'ALLOW',
        reason_codes: [] as string[],
        stage: PipelineStage.PRE_EXECUTION as PipelineStage,
        latency_ms: 10,
        module_details: [] as ModuleEvalDetail[],
        payload: samplePayload,
      };

      const d1 = builder.build(params);
      const d2 = builder.build({ ...params, stage: PipelineStage.POST_EXECUTION });
      const d3 = builder.build(params);

      expect(d1.seq).toBe(1);
      expect(d2.seq).toBe(2);
      expect(d3.seq).toBe(3);
    });

    it('should produce monotonically increasing running_count values', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const params = {
        action: 'ALLOW',
        reason_codes: [] as string[],
        stage: PipelineStage.PRE_EXECUTION as PipelineStage,
        latency_ms: 10,
        module_details: [] as ModuleEvalDetail[],
        payload: samplePayload,
      };

      const d1 = builder.build(params);
      const d2 = builder.build(params);

      expect(d1.running_count).toBe(1);
      expect(d2.running_count).toBe(2);
    });

    it('should chain receipt_ref from the previous decision', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const params = {
        action: 'ALLOW',
        reason_codes: [] as string[],
        stage: PipelineStage.PRE_EXECUTION as PipelineStage,
        latency_ms: 10,
        module_details: [] as ModuleEvalDetail[],
        payload: samplePayload,
      };

      const d1 = builder.build(params);
      const d2 = builder.build({ ...params, stage: PipelineStage.POST_EXECUTION });

      // First decision chains from GENESIS_RECEIPT_REF
      const expectedFirstReceipt = CryptoService.sha256(
        `${d1.intent_ref}:${GENESIS_RECEIPT_REF}:${d1.seq}`,
      );
      expect(d1.receipt_ref).toBe(expectedFirstReceipt);

      // Second decision chains from first decision's receipt_ref
      const expectedSecondReceipt = CryptoService.sha256(
        `${d2.intent_ref}:${d1.receipt_ref}:${d2.seq}`,
      );
      expect(d2.receipt_ref).toBe(expectedSecondReceipt);
    });

    it('should produce a governance_seal with hmac, timestamp, and agent_id', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decision = builder.build({
        action: 'DENY',
        reason_codes: ['POLICY_VIOLATION'],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 15,
        module_details: sampleModuleDetails,
        payload: samplePayload,
      });

      expect(decision.governance_seal).toBeDefined();
      expect(decision.governance_seal!.hmac).toMatch(/^[0-9a-f]{64}$/);
      expect(decision.governance_seal!.timestamp).toBeGreaterThan(0);
      expect(decision.governance_seal!.agent_id).toBe(agentId);
    });

    it('should use "default" as agentId when not explicitly provided', () => {
      const builder = new StageDecisionBuilder(sealSecret);
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 10,
        module_details: [],
        payload: samplePayload,
      });

      expect(decision.governance_seal!.agent_id).toBe('default');
    });

    it('should produce valid receipt_ref as 64-char hex string', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decision = builder.build({
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 10,
        module_details: [],
        payload: samplePayload,
      });

      expect(decision.receipt_ref).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verifyContiguity()', () => {
    const sealSecret = 'contiguity-test-secret';
    const agentId = 'agent-contiguity';

    function buildDecisionChain(count: number): StageDecision[] {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decisions: StageDecision[] = [];
      for (let i = 0; i < count; i++) {
        decisions.push(
          builder.build({
            action: 'ALLOW',
            reason_codes: [],
            stage: i % 2 === 0 ? PipelineStage.PRE_EXECUTION : PipelineStage.POST_EXECUTION,
            latency_ms: 10 + i,
            module_details: [],
            payload: { request: `request-${i}` },
          }),
        );
      }
      return decisions;
    }

    it('should return valid for an empty decision array', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const result = builder.verifyContiguity([]);
      expect(result.valid).toBe(true);
    });

    it('should return valid for a single honestly-produced decision', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decisions = buildDecisionChain(1);
      const result = builder.verifyContiguity(decisions);
      expect(result.valid).toBe(true);
    });

    it('should return valid for a multi-decision chain produced by the same builder', () => {
      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const decisions = buildDecisionChain(5);
      const result = builder.verifyContiguity(decisions);
      expect(result.valid).toBe(true);
    });

    it('should detect non-monotonic seq values', () => {
      const decisions = buildDecisionChain(3);
      // Tamper: swap seq values
      decisions[1] = { ...decisions[1], seq: 0 };

      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const result = builder.verifyContiguity(decisions);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not monotonically increasing');
    });

    it('should detect receipt_ref chain breaks', () => {
      const decisions = buildDecisionChain(3);
      // Tamper: change receipt_ref of second decision
      decisions[1] = { ...decisions[1], receipt_ref: 'a'.repeat(64) };

      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const result = builder.verifyContiguity(decisions);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('chain break');
    });

    it('should detect missing TEEC v2.1 fields', () => {
      const builder = new StageDecisionBuilder();
      const decision: StageDecision = {
        action: 'ALLOW',
        reason_codes: [],
        stage: PipelineStage.PRE_EXECUTION,
        latency_ms: 10,
        module_details: [],
      };

      const result = builder.verifyContiguity([decision]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing TEEC v2.1 fields');
    });

    it('should detect equal seq values (not strictly increasing)', () => {
      const decisions = buildDecisionChain(3);
      // Tamper: duplicate seq value
      decisions[2] = { ...decisions[2], seq: decisions[1].seq! };

      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const result = builder.verifyContiguity(decisions);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not monotonically increasing');
    });

    it('should detect first decision with wrong receipt_ref (not chaining from genesis)', () => {
      const decisions = buildDecisionChain(2);
      // Tamper: change first decision's receipt_ref
      decisions[0] = { ...decisions[0], receipt_ref: 'b'.repeat(64) };

      const builder = new StageDecisionBuilder(sealSecret, agentId);
      const result = builder.verifyContiguity(decisions);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('chain break at index 0');
    });
  });
});
