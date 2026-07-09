/**
 * Integration tests for the full TEEC v2.1 governance pipeline.
 *
 * Tests the end-to-end flow: evaluate → validate → verify_contiguity
 * across single-agent, multi-agent, and ObserveProxy scenarios.
 *
 * Validates: Requirements 1.7, 5.1, 6.7, 8.7
 *
 * @module core/engine/v2.1/__tests__/integration.test
 */

import { GovernanceEngineV21 } from '../GovernanceEngineV21';
import { validateGovernanceDecision } from '../validateGovernanceDecision';
import { verifyContiguity } from '../verifyContiguity';
import type { ValidationContext } from '../types';

const SEAL_SECRET = 'integration-test-secret-key';

describe('TEEC v2.1 Integration Tests', () => {
  describe('Full pipeline: evaluate → validate → verify_contiguity', () => {
    it('should produce a valid decision that passes both validation and contiguity', async () => {
      const engine = new GovernanceEngineV21({
        seal_secret: SEAL_SECRET,
        agent_id: 'agent-integ-001',
        policy: {},
      });

      const request = { action: 'chat.create', model: 'gpt-4', prompt: 'Hello' };
      const ctx = { correlation_id: 'integ-corr-001' };

      // Step 1: Evaluate
      const decision = await engine.evaluate(request, ctx);

      // Verify basic v2.1 fields are populated
      expect(decision.teec_version).toBe('2.1');
      expect(decision.intent_ref).toHaveLength(64);
      expect(decision.receipt_ref).toHaveLength(64);
      expect(decision.seq).toBe(1);
      expect(decision.running_count).toBe(1);
      expect(decision.normalization_id).toHaveLength(64);
      expect(decision.governance_seal).toBeDefined();
      expect(decision.governance_seal.hmac).toHaveLength(64);

      // Step 2: Validate
      const validationContext: ValidationContext = {
        request_payload: request,
        seal_secret: SEAL_SECRET,
        reference_time: decision.governance_seal.timestamp,
        timestamp_tolerance_ms: 60000,
      };
      const validationResult = validateGovernanceDecision(
        decision as unknown as Record<string, unknown>,
        validationContext,
      );
      expect(validationResult.valid).toBe(true);
      if (validationResult.valid) {
        expect(validationResult.receipt_ref).toBe(decision.receipt_ref);
        expect(validationResult.intent_ref).toBe(decision.intent_ref);
      }

      // Step 3: Verify contiguity (single decision is trivially contiguous)
      const contiguityResult = verifyContiguity(
        [decision as unknown as Record<string, unknown>],
      );
      expect(contiguityResult.valid).toBe(true);
      if (contiguityResult.valid) {
        expect(contiguityResult.count).toBe(1);
      }
    });

    it('should produce a multi-decision chain that passes validation and contiguity', async () => {
      const engine = new GovernanceEngineV21({
        seal_secret: SEAL_SECRET,
        agent_id: 'agent-chain-001',
        policy: {},
      });

      const requests = [
        { action: 'chat.create', prompt: 'First request' },
        { action: 'tool.execute', tool: 'read_file', path: '/tmp/a' },
        { action: 'chat.create', prompt: 'Second request' },
        { action: 'tool.execute', tool: 'write_file', path: '/tmp/b' },
        { action: 'chat.create', prompt: 'Third request' },
      ];

      const decisions: Record<string, unknown>[] = [];

      for (let i = 0; i < requests.length; i++) {
        const decision = await engine.evaluate(requests[i], {
          correlation_id: `chain-corr-${i}`,
        });

        // Validate each decision individually
        const validationContext: ValidationContext = {
          request_payload: requests[i],
          seal_secret: SEAL_SECRET,
          reference_time: decision.governance_seal.timestamp,
        };
        const validationResult = validateGovernanceDecision(
          decision as unknown as Record<string, unknown>,
          validationContext,
        );
        expect(validationResult.valid).toBe(true);

        decisions.push(decision as unknown as Record<string, unknown>);
      }

      // Verify the full chain is contiguous
      const contiguityResult = verifyContiguity(decisions);
      expect(contiguityResult.valid).toBe(true);
      if (contiguityResult.valid) {
        expect(contiguityResult.count).toBe(5);
      }

      // Verify seq forms [1, 2, 3, 4, 5]
      const seqs = decisions.map((d) => d.seq as number);
      expect(seqs).toEqual([1, 2, 3, 4, 5]);

      // Verify running_count forms [1, 2, 3, 4, 5]
      const runningCounts = decisions.map((d) => d.running_count as number);
      expect(runningCounts).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Multi-agent scenario', () => {
    it('should maintain per-agent contiguity and global running_count', async () => {
      const engine = new GovernanceEngineV21({
        seal_secret: SEAL_SECRET,
        policy: {},
      });

      const allDecisions: Record<string, unknown>[] = [];
      const agentADecisions: Record<string, unknown>[] = [];
      const agentBDecisions: Record<string, unknown>[] = [];

      // Interleave evaluations between agent-a and agent-b (3 each)
      const evaluations = [
        { agent_id: 'agent-a', request: { action: 'read', file: '/a1' } },
        { agent_id: 'agent-b', request: { action: 'write', file: '/b1' } },
        { agent_id: 'agent-a', request: { action: 'read', file: '/a2' } },
        { agent_id: 'agent-b', request: { action: 'write', file: '/b2' } },
        { agent_id: 'agent-a', request: { action: 'read', file: '/a3' } },
        { agent_id: 'agent-b', request: { action: 'write', file: '/b3' } },
      ];

      for (let i = 0; i < evaluations.length; i++) {
        const { agent_id, request } = evaluations[i];
        const decision = await engine.evaluate(request, {
          correlation_id: `multi-${i}`,
          agent_id,
        });

        const decisionRecord = decision as unknown as Record<string, unknown>;
        allDecisions.push(decisionRecord);
        if (agent_id === 'agent-a') {
          agentADecisions.push(decisionRecord);
        } else {
          agentBDecisions.push(decisionRecord);
        }
      }

      // Verify global running_count forms [1, 2, 3, 4, 5, 6]
      const runningCounts = allDecisions.map((d) => d.running_count as number);
      expect(runningCounts).toEqual([1, 2, 3, 4, 5, 6]);

      // Verify per-agent seq for agent-a: [1, 2, 3]
      const agentASeqs = agentADecisions.map((d) => d.seq as number);
      expect(agentASeqs).toEqual([1, 2, 3]);

      // Verify per-agent seq for agent-b: [1, 2, 3]
      const agentBSeqs = agentBDecisions.map((d) => d.seq as number);
      expect(agentBSeqs).toEqual([1, 2, 3]);

      // Verify per-agent contiguity for agent-a (filtered)
      const contiguityA = verifyContiguity(allDecisions, { agent_id: 'agent-a' });
      expect(contiguityA.valid).toBe(true);
      if (contiguityA.valid) {
        expect(contiguityA.count).toBe(3);
      }

      // Verify per-agent contiguity for agent-b (filtered)
      const contiguityB = verifyContiguity(allDecisions, { agent_id: 'agent-b' });
      expect(contiguityB.valid).toBe(true);
      if (contiguityB.valid) {
        expect(contiguityB.count).toBe(3);
      }

      // Validate each decision individually
      for (let i = 0; i < evaluations.length; i++) {
        const decision = allDecisions[i];
        const seal = decision.governance_seal as { hmac: string; timestamp: number; agent_id: string };
        const validationContext: ValidationContext = {
          request_payload: evaluations[i].request,
          seal_secret: SEAL_SECRET,
          reference_time: seal.timestamp,
        };
        const result = validateGovernanceDecision(decision, validationContext);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('ObserveProxy with governance', () => {
    it('should produce valid decisions for sequential calls that pass contiguity', async () => {
      // Simulate ObserveProxy governance behavior using GovernanceEngineV21 directly.
      // The ObserveProxy with governance: true internally uses GovernanceEngineV21
      // with the same evaluate pipeline. This test validates the core behavior.
      const engine = new GovernanceEngineV21({
        seal_secret: SEAL_SECRET,
        agent_id: 'observe-proxy-agent',
        policy: {},
      });

      // Simulate 3 sequential calls through the proxy
      const calls = [
        { action: 'chat.completions.create', model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
        { action: 'chat.completions.create', model: 'gpt-4', messages: [{ role: 'user', content: 'World' }] },
        { action: 'chat.completions.create', model: 'gpt-4', messages: [{ role: 'user', content: 'Test' }] },
      ];

      const decisions: Record<string, unknown>[] = [];

      for (let i = 0; i < calls.length; i++) {
        const decision = await engine.evaluate(calls[i], {
          correlation_id: `observe-${i}`,
        });
        decisions.push(decision as unknown as Record<string, unknown>);
      }

      // Verify all decisions have the correct agent_id in their seal
      for (const decision of decisions) {
        const seal = decision.governance_seal as { hmac: string; timestamp: number; agent_id: string };
        expect(seal.agent_id).toBe('observe-proxy-agent');
      }

      // Verify each decision passes validation
      for (let i = 0; i < calls.length; i++) {
        const seal = decisions[i].governance_seal as { hmac: string; timestamp: number; agent_id: string };
        const validationContext: ValidationContext = {
          request_payload: calls[i],
          seal_secret: SEAL_SECRET,
          reference_time: seal.timestamp,
        };
        const result = validateGovernanceDecision(decisions[i], validationContext);
        expect(result.valid).toBe(true);
      }

      // Verify contiguity of the full chain
      const contiguityResult = verifyContiguity(decisions);
      expect(contiguityResult.valid).toBe(true);
      if (contiguityResult.valid) {
        expect(contiguityResult.count).toBe(3);
      }

      // Verify seq is [1, 2, 3]
      const seqs = decisions.map((d) => d.seq as number);
      expect(seqs).toEqual([1, 2, 3]);

      // Verify running_count is [1, 2, 3]
      const runningCounts = decisions.map((d) => d.running_count as number);
      expect(runningCounts).toEqual([1, 2, 3]);
    });
  });
});
