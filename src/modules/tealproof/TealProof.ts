/**
 * TealProof — Cryptographic Governance Receipt Module
 *
 * Produces tamper-evident proof chains for governance decisions using:
 * - SHA-256 decision hashing (decision + context + timestamp + policy_version + prev_hash)
 * - Merkle tree organization of decision hashes
 * - Compact verification proofs (sibling hashes)
 * - Chain integrity detection (tampering → PROOF_CHAIN_INTEGRITY_VIOLATION)
 *
 * Each governance decision is appended to the Merkle tree, forming a
 * hash chain where each receipt references the previous decision hash.
 * This creates a dual integrity guarantee:
 * 1. Merkle tree: any leaf modification invalidates the root
 * 2. Hash chain: any gap or reorder in the sequence is detectable
 *
 * @module modules/tealproof/TealProof
 * @requirements 7.1, 7.2, 7.4, 7.8
 */

import { createHash } from 'crypto';
import type { GovernanceReceipt, MerkleTree } from '../../core/engine/v1.3/module-types';
import { SHA256MerkleTree } from './MerkleTree';

// ── Constants ────────────────────────────────────────────────────

const INITIAL_PREVIOUS_HASH = '0'.repeat(64); // Genesis: 64 hex zeros
const EVENT_CHAIN_VIOLATION = 'PROOF_CHAIN_INTEGRITY_VIOLATION';

// ── Types ────────────────────────────────────────────────────────

export interface AppendDecisionParams {
  decision_action: string;
  context: string;
  timestamp: number;
  policy_version: string;
  correlation_id: string;
}

export interface TealProofEvent {
  event_type: string;
  timestamp: number;
  details: Record<string, unknown>;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Computes SHA-256 hash of the input string, returning hex-encoded digest.
 */
function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ── TealProofModule ──────────────────────────────────────────────

export class TealProofModule {
  private tree: MerkleTree;
  private previousHash: string = INITIAL_PREVIOUS_HASH;
  private events: TealProofEvent[] = [];

  constructor(tree?: MerkleTree) {
    this.tree = tree ?? new SHA256MerkleTree();
  }

  /**
   * Appends a governance decision to the proof chain.
   *
   * Computes: SHA-256(decision_action + context + timestamp + policy_version + previous_hash)
   * Appends the hash to the Merkle tree and returns a GovernanceReceipt.
   */
  appendDecision(params: AppendDecisionParams): GovernanceReceipt {
    const { decision_action, context, timestamp, policy_version, correlation_id } = params;

    // Compute decision hash: SHA-256(decision_action + context + timestamp + policy_version + prev_hash)
    const hashInput = decision_action + context + String(timestamp) + policy_version + this.previousHash;
    const decisionHash = sha256(hashInput);

    // Append to Merkle tree
    const leafIndex = this.tree.append(decisionHash);

    // Generate Merkle proof for this leaf
    const merkleProof = this.tree.getProof(leafIndex);

    // Build receipt
    const receipt: GovernanceReceipt = {
      leaf_index: leafIndex,
      decision_hash: decisionHash,
      previous_hash: this.previousHash,
      timestamp,
      policy_version,
      correlation_id,
      merkle_proof: merkleProof,
    };

    // Update chain: current hash becomes previous for next decision
    this.previousHash = decisionHash;

    return receipt;
  }

  /**
   * Returns the current Merkle root hash.
   */
  getRoot(): string {
    return this.tree.root();
  }

  /**
   * Verifies a receipt against the current Merkle tree.
   * Checks that the decision hash is included in the tree at the stated index.
   */
  verifyReceipt(receipt: GovernanceReceipt): boolean {
    return this.tree.verify(receipt.decision_hash, receipt.merkle_proof, this.getRoot());
  }

  /**
   * Detects tampering by checking chain integrity.
   * Verifies that the receipt's previous_hash matches the expected previous hash.
   *
   * If tampering is detected, emits a PROOF_CHAIN_INTEGRITY_VIOLATION event.
   *
   * @param receipt - The receipt to check
   * @param expectedPrevHash - The expected previous hash in the chain
   * @returns true if tampering is detected, false if chain is intact
   */
  detectTampering(receipt: GovernanceReceipt, expectedPrevHash: string): boolean {
    const tampered = receipt.previous_hash !== expectedPrevHash;

    if (tampered) {
      this.emitEvent({
        event_type: EVENT_CHAIN_VIOLATION,
        timestamp: Date.now(),
        details: {
          leaf_index: receipt.leaf_index,
          expected_previous_hash: expectedPrevHash,
          actual_previous_hash: receipt.previous_hash,
          decision_hash: receipt.decision_hash,
          correlation_id: receipt.correlation_id,
        },
      });
    }

    return tampered;
  }

  /**
   * Returns all emitted events (for testing and integration).
   */
  getEvents(): TealProofEvent[] {
    return [...this.events];
  }

  /**
   * Clears emitted events.
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Returns the current previous hash (the last decision hash in the chain).
   */
  getPreviousHash(): string {
    return this.previousHash;
  }

  // ── Private ────────────────────────────────────────────────────

  private emitEvent(event: TealProofEvent): void {
    this.events.push(event);
  }
}
