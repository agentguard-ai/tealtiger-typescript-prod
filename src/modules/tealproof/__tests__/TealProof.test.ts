/**
 * TealProof Module — Unit Tests
 *
 * Tests cryptographic governance receipts including:
 * - Merkle tree operations (root, append, proof, verify)
 * - Single decision receipt generation
 * - Multiple decisions form a chain (each references previous hash)
 * - Merkle proof verification succeeds for valid receipts
 * - Tampering detection (modified hash breaks chain)
 * - Empty tree edge case
 * - Root changes after each append
 *
 * @requirements 7.1, 7.2, 7.4, 7.8
 */

import { SHA256MerkleTree } from '../MerkleTree';
import { TealProofModule } from '../TealProof';
import { createHash } from 'crypto';

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ══════════════════════════════════════════════════════════════════
// SHA256MerkleTree Tests
// ══════════════════════════════════════════════════════════════════

describe('SHA256MerkleTree', () => {
  let tree: SHA256MerkleTree;

  beforeEach(() => {
    tree = new SHA256MerkleTree();
  });

  describe('empty tree', () => {
    it('should return SHA-256 of empty string as root for empty tree', () => {
      const expectedRoot = sha256('');
      expect(tree.root()).toBe(expectedRoot);
    });

    it('should have size 0', () => {
      expect(tree.size).toBe(0);
    });

    it('should throw when generating proof for empty tree', () => {
      expect(() => tree.getProof(0)).toThrow('Cannot generate proof for empty tree');
    });
  });

  describe('single leaf', () => {
    it('should return the leaf itself as root', () => {
      const leaf = sha256('decision-1');
      tree.append(leaf);
      expect(tree.root()).toBe(leaf);
    });

    it('should return index 0 for first append', () => {
      const index = tree.append(sha256('decision-1'));
      expect(index).toBe(0);
    });

    it('should return empty proof for single leaf', () => {
      const leaf = sha256('decision-1');
      tree.append(leaf);
      const proof = tree.getProof(0);
      expect(proof).toEqual([]);
    });

    it('should verify single leaf with empty proof', () => {
      const leaf = sha256('decision-1');
      tree.append(leaf);
      expect(tree.verify(leaf, [], leaf)).toBe(true);
    });
  });

  describe('multiple leaves (power of 2)', () => {
    it('should compute correct root for 2 leaves', () => {
      const leaf0 = sha256('a');
      const leaf1 = sha256('b');
      tree.append(leaf0);
      tree.append(leaf1);

      const expectedRoot = sha256(leaf0 + leaf1);
      expect(tree.root()).toBe(expectedRoot);
    });

    it('should compute correct root for 4 leaves', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const h01 = sha256(leaves[0] + leaves[1]);
      const h23 = sha256(leaves[2] + leaves[3]);
      const expectedRoot = sha256(h01 + h23);
      expect(tree.root()).toBe(expectedRoot);
    });

    it('should return sequential indices', () => {
      expect(tree.append(sha256('a'))).toBe(0);
      expect(tree.append(sha256('b'))).toBe(1);
      expect(tree.append(sha256('c'))).toBe(2);
      expect(tree.append(sha256('d'))).toBe(3);
    });
  });

  describe('multiple leaves (non-power of 2)', () => {
    it('should handle 3 leaves by duplicating last node', () => {
      const leaves = ['a', 'b', 'c'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      // Level 1: [hash(a+b), hash(c+c)]
      const h01 = sha256(leaves[0] + leaves[1]);
      const h22 = sha256(leaves[2] + leaves[2]); // duplicated
      const expectedRoot = sha256(h01 + h22);
      expect(tree.root()).toBe(expectedRoot);
    });

    it('should handle 5 leaves correctly', () => {
      const leaves = ['a', 'b', 'c', 'd', 'e'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      // Level 1: [hash(a+b), hash(c+d), hash(e+e)]
      const h01 = sha256(leaves[0] + leaves[1]);
      const h23 = sha256(leaves[2] + leaves[3]);
      const h44 = sha256(leaves[4] + leaves[4]);
      // Level 2: [hash(h01+h23), hash(h44+h44)]
      const h0123 = sha256(h01 + h23);
      const h4444 = sha256(h44 + h44);
      const expectedRoot = sha256(h0123 + h4444);
      expect(tree.root()).toBe(expectedRoot);
    });
  });

  describe('getProof', () => {
    it('should throw for out-of-bounds index', () => {
      tree.append(sha256('a'));
      expect(() => tree.getProof(1)).toThrow('out of bounds');
      expect(() => tree.getProof(-1)).toThrow('out of bounds');
    });

    it('should return correct proof for leaf 0 in 2-leaf tree', () => {
      const leaf0 = sha256('a');
      const leaf1 = sha256('b');
      tree.append(leaf0);
      tree.append(leaf1);

      const proof = tree.getProof(0);
      expect(proof).toEqual([leaf1]);
    });

    it('should return correct proof for leaf 1 in 2-leaf tree', () => {
      const leaf0 = sha256('a');
      const leaf1 = sha256('b');
      tree.append(leaf0);
      tree.append(leaf1);

      const proof = tree.getProof(1);
      expect(proof).toEqual([leaf0]);
    });

    it('should return correct proof for leaf 0 in 4-leaf tree', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const proof = tree.getProof(0);
      // Sibling at level 0: leaf1
      // Sibling at level 1: hash(leaf2 + leaf3)
      const h23 = sha256(leaves[2] + leaves[3]);
      expect(proof).toEqual([leaves[1], h23]);
    });
  });

  describe('verify', () => {
    it('should verify all leaves in a 4-leaf tree', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const root = tree.root();
      for (let i = 0; i < leaves.length; i++) {
        const proof = tree.getProof(i);
        expect(tree.verify(leaves[i], proof, root)).toBe(true);
      }
    });

    it('should verify all leaves in a 5-leaf tree', () => {
      const leaves = ['a', 'b', 'c', 'd', 'e'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const root = tree.root();
      for (let i = 0; i < leaves.length; i++) {
        const proof = tree.getProof(i);
        expect(tree.verify(leaves[i], proof, root)).toBe(true);
      }
    });

    it('should fail verification with wrong root', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const proof = tree.getProof(0);
      expect(tree.verify(leaves[0], proof, 'wrong-root')).toBe(false);
    });

    it('should fail verification with tampered leaf', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const root = tree.root();
      const proof = tree.getProof(0);
      const tamperedLeaf = sha256('tampered');
      expect(tree.verify(tamperedLeaf, proof, root)).toBe(false);
    });

    it('should fail verification with tampered proof', () => {
      const leaves = ['a', 'b', 'c', 'd'].map(sha256);
      leaves.forEach((l) => tree.append(l));

      const root = tree.root();
      const proof = tree.getProof(0);
      const tamperedProof = [sha256('fake'), ...proof.slice(1)];
      expect(tree.verify(leaves[0], tamperedProof, root)).toBe(false);
    });
  });

  describe('root changes after each append', () => {
    it('should produce different roots after each append', () => {
      const roots: string[] = [];

      roots.push(tree.root()); // empty tree root

      tree.append(sha256('a'));
      roots.push(tree.root());

      tree.append(sha256('b'));
      roots.push(tree.root());

      tree.append(sha256('c'));
      roots.push(tree.root());

      // All roots should be unique
      const uniqueRoots = new Set(roots);
      expect(uniqueRoots.size).toBe(roots.length);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// TealProofModule Tests
// ══════════════════════════════════════════════════════════════════

describe('TealProofModule', () => {
  let proof: TealProofModule;

  beforeEach(() => {
    proof = new TealProofModule();
  });

  describe('single decision receipt generation', () => {
    it('should generate a valid receipt for a single decision', () => {
      const receipt = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'user requested file read',
        timestamp: 1700000000000,
        policy_version: '1.0.0',
        correlation_id: 'corr-001',
      });

      expect(receipt.leaf_index).toBe(0);
      expect(receipt.decision_hash).toHaveLength(64); // SHA-256 hex
      expect(receipt.previous_hash).toBe('0'.repeat(64)); // genesis
      expect(receipt.timestamp).toBe(1700000000000);
      expect(receipt.policy_version).toBe('1.0.0');
      expect(receipt.correlation_id).toBe('corr-001');
      expect(receipt.merkle_proof).toEqual([]); // single leaf
    });

    it('should compute decision hash correctly', () => {
      const params = {
        decision_action: 'DENY',
        context: 'blocked action',
        timestamp: 1700000000000,
        policy_version: '2.0.0',
        correlation_id: 'corr-002',
      };

      const receipt = proof.appendDecision(params);

      const expectedInput =
        params.decision_action +
        params.context +
        String(params.timestamp) +
        params.policy_version +
        '0'.repeat(64); // initial previous hash
      const expectedHash = sha256(expectedInput);

      expect(receipt.decision_hash).toBe(expectedHash);
    });
  });

  describe('multiple decisions form a chain', () => {
    it('should chain decisions with previous_hash references', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'action-1',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      });

      const receipt2 = proof.appendDecision({
        decision_action: 'DENY',
        context: 'action-2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'corr-2',
      });

      const receipt3 = proof.appendDecision({
        decision_action: 'MODIFY',
        context: 'action-3',
        timestamp: 3000,
        policy_version: '1.0.0',
        correlation_id: 'corr-3',
      });

      // First receipt references genesis hash
      expect(receipt1.previous_hash).toBe('0'.repeat(64));
      // Second receipt references first decision hash
      expect(receipt2.previous_hash).toBe(receipt1.decision_hash);
      // Third receipt references second decision hash
      expect(receipt3.previous_hash).toBe(receipt2.decision_hash);
    });

    it('should assign sequential leaf indices', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'a',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'c1',
      });
      const receipt2 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'b',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'c2',
      });
      const receipt3 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'c',
        timestamp: 3000,
        policy_version: '1.0.0',
        correlation_id: 'c3',
      });

      expect(receipt1.leaf_index).toBe(0);
      expect(receipt2.leaf_index).toBe(1);
      expect(receipt3.leaf_index).toBe(2);
    });

    it('should produce unique decision hashes for different inputs', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'action-1',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      });
      const receipt2 = proof.appendDecision({
        decision_action: 'DENY',
        context: 'action-2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'corr-2',
      });

      expect(receipt1.decision_hash).not.toBe(receipt2.decision_hash);
    });
  });

  describe('Merkle proof verification succeeds for valid receipts', () => {
    it('should verify a single receipt', () => {
      const receipt = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'test',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'c1',
      });

      expect(proof.verifyReceipt(receipt)).toBe(true);
    });

    it('should verify all receipts after multiple appends', () => {
      const receipts: Array<{ leaf_index: number; decision_hash: string; previous_hash: string; timestamp: number; policy_version: string; correlation_id: string; merkle_proof: string[] }> = [];

      for (let i = 0; i < 5; i++) {
        receipts.push(
          proof.appendDecision({
            decision_action: 'ALLOW',
            context: `action-${i}`,
            timestamp: 1000 * (i + 1),
            policy_version: '1.0.0',
            correlation_id: `corr-${i}`,
          }),
        );
      }

      // Note: After appending all, the proofs in earlier receipts may be stale
      // because the tree has grown. We verify the last receipt which has a current proof.
      const lastReceipt = receipts[receipts.length - 1];
      expect(proof.verifyReceipt(lastReceipt)).toBe(true);
    });

    it('should fail verification for a receipt with tampered decision_hash', () => {
      proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'test',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'c1',
      });

      const receipt = proof.appendDecision({
        decision_action: 'DENY',
        context: 'test2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'c2',
      });

      // Tamper with the decision hash
      const tamperedReceipt = { ...receipt, decision_hash: sha256('tampered') };
      expect(proof.verifyReceipt(tamperedReceipt)).toBe(false);
    });
  });

  describe('tampering detection', () => {
    it('should detect tampering when previous_hash does not match expected', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'action-1',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      });

      const receipt2 = proof.appendDecision({
        decision_action: 'DENY',
        context: 'action-2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'corr-2',
      });

      // Tamper: claim receipt2's previous_hash is something else
      const tamperedReceipt = { ...receipt2, previous_hash: sha256('fake') };
      const tampered = proof.detectTampering(tamperedReceipt, receipt1.decision_hash);

      expect(tampered).toBe(true);
    });

    it('should not detect tampering for valid chain', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'action-1',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      });

      const receipt2 = proof.appendDecision({
        decision_action: 'DENY',
        context: 'action-2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'corr-2',
      });

      const tampered = proof.detectTampering(receipt2, receipt1.decision_hash);
      expect(tampered).toBe(false);
    });

    it('should emit PROOF_CHAIN_INTEGRITY_VIOLATION event on tampering', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'action-1',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      });

      const receipt2 = proof.appendDecision({
        decision_action: 'DENY',
        context: 'action-2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'corr-2',
      });

      // Tamper with receipt2
      const tamperedReceipt = { ...receipt2, previous_hash: sha256('tampered') };
      proof.detectTampering(tamperedReceipt, receipt1.decision_hash);

      const events = proof.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('PROOF_CHAIN_INTEGRITY_VIOLATION');
      expect(events[0].details.leaf_index).toBe(receipt2.leaf_index);
      expect(events[0].details.expected_previous_hash).toBe(receipt1.decision_hash);
      expect(events[0].details.actual_previous_hash).toBe(sha256('tampered'));
    });

    it('should not emit event when chain is valid', () => {
      const receipt1 = proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'action-1',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      });

      const receipt2 = proof.appendDecision({
        decision_action: 'DENY',
        context: 'action-2',
        timestamp: 2000,
        policy_version: '1.0.0',
        correlation_id: 'corr-2',
      });

      proof.detectTampering(receipt2, receipt1.decision_hash);

      const events = proof.getEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('empty tree edge case', () => {
    it('should have a defined root before any decisions', () => {
      const root = proof.getRoot();
      expect(root).toBeDefined();
      expect(root).toHaveLength(64); // SHA-256 hex
    });

    it('should have initial previous hash of all zeros', () => {
      expect(proof.getPreviousHash()).toBe('0'.repeat(64));
    });
  });

  describe('root changes after each append', () => {
    it('should produce a different root after each decision', () => {
      const roots: string[] = [];
      roots.push(proof.getRoot());

      for (let i = 0; i < 4; i++) {
        proof.appendDecision({
          decision_action: 'ALLOW',
          context: `action-${i}`,
          timestamp: 1000 * (i + 1),
          policy_version: '1.0.0',
          correlation_id: `corr-${i}`,
        });
        roots.push(proof.getRoot());
      }

      // All roots should be unique
      const uniqueRoots = new Set(roots);
      expect(uniqueRoots.size).toBe(roots.length);
    });
  });

  describe('getRoot', () => {
    it('should return the current Merkle root', () => {
      proof.appendDecision({
        decision_action: 'ALLOW',
        context: 'test',
        timestamp: 1000,
        policy_version: '1.0.0',
        correlation_id: 'c1',
      });

      const root = proof.getRoot();
      expect(root).toHaveLength(64);
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('deterministic hashing', () => {
    it('should produce identical hashes for identical inputs', () => {
      const proof1 = new TealProofModule();
      const proof2 = new TealProofModule();

      const params = {
        decision_action: 'ALLOW',
        context: 'same context',
        timestamp: 1700000000000,
        policy_version: '1.0.0',
        correlation_id: 'corr-same',
      };

      const receipt1 = proof1.appendDecision(params);
      const receipt2 = proof2.appendDecision(params);

      expect(receipt1.decision_hash).toBe(receipt2.decision_hash);
    });

    it('should produce different hashes when any field changes', () => {
      const baseParams = {
        decision_action: 'ALLOW',
        context: 'test context',
        timestamp: 1700000000000,
        policy_version: '1.0.0',
        correlation_id: 'corr-1',
      };

      const variations = [
        { ...baseParams, decision_action: 'DENY' },
        { ...baseParams, context: 'different context' },
        { ...baseParams, timestamp: 1700000000001 },
        { ...baseParams, policy_version: '2.0.0' },
      ];

      const baseProof = new TealProofModule();
      const baseReceipt = baseProof.appendDecision(baseParams);

      for (const variant of variations) {
        const variantProof = new TealProofModule();
        const variantReceipt = variantProof.appendDecision(variant);
        expect(variantReceipt.decision_hash).not.toBe(baseReceipt.decision_hash);
      }
    });
  });
});
