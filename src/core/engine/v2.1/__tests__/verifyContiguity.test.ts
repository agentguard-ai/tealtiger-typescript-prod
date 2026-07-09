/**
 * Unit tests for verifyContiguity — TEEC v2.1 decision chain integrity verification.
 *
 * @module core/engine/v2.1/__tests__/verifyContiguity.test
 */

import { verifyContiguity } from '../verifyContiguity';
import { CryptoService } from '../CryptoService';
import { GENESIS_RECEIPT_REF } from '../types';

/**
 * Helper: build a valid chain of v2.1 decisions with correct seq, running_count,
 * and receipt_ref linkage. Mirrors GovernanceEngineV21's production logic.
 */
function buildValidChain(
  count: number,
  options?: { agent_id?: string; startSeq?: number; startRunningCount?: number },
): Record<string, unknown>[] {
  const agent_id = options?.agent_id ?? 'agent-001';
  const startSeq = options?.startSeq ?? 1;
  const startRunningCount = options?.startRunningCount ?? 1;
  const seal_secret = 'test-secret';
  const decisions: Record<string, unknown>[] = [];

  let prevReceiptRef = GENESIS_RECEIPT_REF;

  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const running_count = startRunningCount + i;
    const request = { action: `action-${i}`, model: 'gpt-4' };

    const serialized = CryptoService.deterministicSerialize(request);
    const intent_ref = CryptoService.sha256(serialized);
    const normalization_id = CryptoService.sha256(CryptoService.normalizePayload(request));

    // Build partial decision (without receipt_ref and governance_seal)
    const partialDecision: Record<string, unknown> = {
      action: 'ALLOW',
      reason_codes: ['POLICY_COMPLIANT'],
      risk_score: 0,
      mode: 'ENFORCE',
      policy_id: 'default',
      policy_version: '1.0.0',
      component_versions: { sdk: '1.4.0', engine: '2.1.0' },
      correlation_id: `corr-${i}`,
      reason: 'All policies passed',
      intent_ref,
      normalization_id,
      seq,
      running_count,
      teec_version: '2.1',
    };

    // Compute receipt_ref
    const payload = CryptoService.deterministicSerialize(partialDecision);
    const receipt_ref = CryptoService.sha256(payload + prevReceiptRef);

    // Build full decision for seal
    const fullDecisionForSeal: Record<string, unknown> = {
      ...partialDecision,
      receipt_ref,
    };

    // Compute seal
    const timestamp = 1700000000000 + i * 1000;
    const sealPayload = CryptoService.deterministicSerialize(fullDecisionForSeal);
    const hmacInput = sealPayload + String(timestamp) + agent_id;
    const hmac = CryptoService.hmacSha256(seal_secret, hmacInput);

    const decision: Record<string, unknown> = {
      ...fullDecisionForSeal,
      governance_seal: { hmac, timestamp, agent_id },
    };

    decisions.push(decision);
    prevReceiptRef = receipt_ref;
  }

  return decisions;
}

describe('verifyContiguity', () => {
  describe('trivially contiguous (empty/single)', () => {
    it('should return success for an empty array', () => {
      const result = verifyContiguity([]);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(0);
      }
    });

    it('should return success for a single decision', () => {
      const chain = buildValidChain(1);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(1);
      }
    });
  });

  describe('valid chains', () => {
    it('should return success for a 2-decision chain', () => {
      const chain = buildValidChain(2);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(2);
      }
    });

    it('should return success for a 5-decision chain', () => {
      const chain = buildValidChain(5);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(5);
      }
    });

    it('should return success for a 10-decision chain', () => {
      const chain = buildValidChain(10);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(10);
      }
    });
  });

  describe('agent_id filtering', () => {
    it('should filter decisions by agent_id', () => {
      const chainA = buildValidChain(3, { agent_id: 'agent-A' });
      const chainB = buildValidChain(3, { agent_id: 'agent-B', startRunningCount: 4 });

      // Interleave decisions from both agents
      const mixed = [chainA[0], chainB[0], chainA[1], chainB[1], chainA[2], chainB[2]];

      // Verify only agent-A decisions
      const result = verifyContiguity(mixed, { agent_id: 'agent-A' });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(3);
      }
    });

    it('should return success for agent_id with no matching decisions', () => {
      const chain = buildValidChain(3, { agent_id: 'agent-A' });
      const result = verifyContiguity(chain, { agent_id: 'agent-X' });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(0);
      }
    });

    it('should return success for agent_id with one matching decision', () => {
      const chain = buildValidChain(3, { agent_id: 'agent-A' });
      const result = verifyContiguity([chain[0]], { agent_id: 'agent-A' });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(1);
      }
    });
  });

  describe('version_incompatible', () => {
    it('should fail for decisions missing seq field', () => {
      const chain = buildValidChain(3);
      delete chain[1].seq;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('version_incompatible');
        expect(result.index).toBe(1);
        expect(result.message).toContain('index 1');
        expect(result.message).toContain('v2.1');
      }
    });

    it('should fail for decisions missing receipt_ref field', () => {
      const chain = buildValidChain(3);
      delete chain[0].receipt_ref;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('version_incompatible');
        expect(result.index).toBe(0);
      }
    });

    it('should fail for v1.2 decisions (no v2.1 fields)', () => {
      const v12Decisions: Record<string, unknown>[] = [
        { action: 'ALLOW', reason_codes: [], risk_score: 0, mode: 'ENFORCE', policy_id: 'x', correlation_id: 'c1' },
        { action: 'ALLOW', reason_codes: [], risk_score: 0, mode: 'ENFORCE', policy_id: 'x', correlation_id: 'c2' },
      ];
      const result = verifyContiguity(v12Decisions);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('version_incompatible');
        expect(result.index).toBe(0);
      }
    });
  });

  describe('seq_gap', () => {
    it('should detect a gap in sequence numbers', () => {
      const chain = buildValidChain(3);
      // Tamper: set seq of second decision to 3 instead of 2
      chain[1].seq = 3;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('seq_gap');
        expect(result.index).toBe(1);
        expect(result.message).toContain('Expected seq 2');
        expect(result.message).toContain('got 3');
      }
    });

    it('should detect a backwards sequence', () => {
      const chain = buildValidChain(3);
      // Tamper: set seq to go backwards
      chain[2].seq = 1;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('seq_gap');
        expect(result.index).toBe(2);
        expect(result.message).toContain('Expected seq 3');
        expect(result.message).toContain('got 1');
      }
    });

    it('should detect duplicate sequence numbers', () => {
      const chain = buildValidChain(3);
      // Tamper: second decision has same seq as first
      chain[1].seq = 1;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('seq_gap');
        expect(result.index).toBe(1);
      }
    });
  });

  describe('count_regression', () => {
    it('should detect running_count regression', () => {
      const chain = buildValidChain(3);
      // Tamper: third decision has running_count less than second
      chain[2].running_count = 1;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('count_regression');
        expect(result.index).toBe(2);
        expect(result.message).toContain('strictly increasing');
      }
    });

    it('should detect running_count equality (not strictly increasing)', () => {
      const chain = buildValidChain(3);
      // Tamper: make running_count of second equal to first
      chain[1].running_count = chain[0].running_count;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('count_regression');
        expect(result.index).toBe(1);
      }
    });
  });

  describe('chain_break', () => {
    it('should detect tampered receipt_ref', () => {
      const chain = buildValidChain(3);
      // Tamper: change receipt_ref of second decision
      chain[1].receipt_ref = 'a'.repeat(64);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // seq_gap check passes (seq is still correct), but chain_break fires
        // Actually, since we tampered receipt_ref but not seq, seq check passes first,
        // then chain_break is detected
        expect(result.check).toBe('chain_break');
        expect(result.index).toBe(1);
        expect(result.message).toContain('receipt_ref chain verification failed');
        expect(result.message).toContain('index 1');
      }
    });

    it('should detect chain break caused by modified decision content', () => {
      const chain = buildValidChain(3);
      // Tamper: modify a field in the second decision (receipt_ref stays original)
      // This changes the receipt_ref computation for the third decision
      chain[1].risk_score = 99;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // The receipt_ref of decision[1] won't match recomputation from decision[0]
        expect(result.check).toBe('chain_break');
        expect(result.index).toBe(1);
      }
    });

    it('should detect chain break at last decision', () => {
      const chain = buildValidChain(4);
      // Tamper the last decision's intent_ref (changes the expected receipt_ref)
      chain[3].intent_ref = 'f'.repeat(64);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('chain_break');
        expect(result.index).toBe(3);
      }
    });
  });

  describe('check ordering', () => {
    it('should check version_incompatible before seq_gap', () => {
      const chain = buildValidChain(3);
      // Remove seq from second (version_incompatible) — but also mess up the sequence
      delete chain[1].seq;
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('version_incompatible');
      }
    });

    it('should check seq_gap before count_regression', () => {
      const chain = buildValidChain(3);
      // Both seq_gap and count_regression at index 1
      chain[1].seq = 5; // seq_gap
      chain[1].running_count = 0; // count_regression
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('seq_gap');
        expect(result.index).toBe(1);
      }
    });

    it('should check count_regression before chain_break', () => {
      const chain = buildValidChain(3);
      // Fix seq but break running_count — also receipt_ref will be wrong
      chain[1].running_count = 0; // count_regression (prev was 1)
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.check).toBe('count_regression');
        expect(result.index).toBe(1);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle decisions with no options parameter', () => {
      const chain = buildValidChain(3);
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(true);
    });

    it('should handle decisions with empty options object', () => {
      const chain = buildValidChain(3);
      const result = verifyContiguity(chain, {});
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(3);
      }
    });

    it('should handle chains starting at non-1 seq (if filtered correctly)', () => {
      // A valid chain starting at seq=5 (could happen with agent_id filtering)
      const chain = buildValidChain(3, { startSeq: 5, startRunningCount: 10 });
      const result = verifyContiguity(chain);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.count).toBe(3);
      }
    });
  });
});
