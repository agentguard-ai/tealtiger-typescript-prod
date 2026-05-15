/**
 * SHA256MerkleTree — Merkle Tree for Governance Receipts
 *
 * Implements a SHA-256 based Merkle tree that organizes governance decision
 * hashes into a tamper-evident structure. Supports:
 * - Appending leaves (decision hashes)
 * - Computing the Merkle root
 * - Generating inclusion proofs (sibling hashes)
 * - Verifying a leaf's inclusion against a given root
 *
 * Edge cases handled:
 * - Empty tree (root is hash of empty string)
 * - Single leaf (root is the leaf itself)
 * - Non-power-of-2 leaf counts (duplicates last node at each level)
 *
 * @module modules/tealproof/MerkleTree
 * @requirements 7.2, 7.4
 */

import { createHash } from 'crypto';
import type { MerkleTree } from '../../core/engine/v1.3/module-types';

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Computes SHA-256 hash of the input string, returning hex-encoded digest.
 */
function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Computes the parent hash from two child hashes by concatenating and hashing.
 */
function hashPair(left: string, right: string): string {
  return sha256(left + right);
}

// ── SHA256MerkleTree ─────────────────────────────────────────────

export class SHA256MerkleTree implements MerkleTree {
  private leaves: string[] = [];

  /**
   * Returns the current Merkle root hash.
   * - Empty tree: returns SHA-256 of empty string.
   * - Single leaf: returns the leaf hash itself.
   * - Multiple leaves: computes full tree root.
   */
  root(): string {
    if (this.leaves.length === 0) {
      return sha256('');
    }
    if (this.leaves.length === 1) {
      return this.leaves[0];
    }
    return this.computeRoot(this.leaves);
  }

  /**
   * Appends a leaf hash to the tree and returns its index.
   */
  append(leaf: string): number {
    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }

  /**
   * Returns the sibling hashes needed to verify the leaf at the given index.
   * The proof is ordered from leaf level to root level.
   *
   * @throws Error if leafIndex is out of bounds or tree is empty.
   */
  getProof(leafIndex: number): string[] {
    if (this.leaves.length === 0) {
      throw new Error('Cannot generate proof for empty tree');
    }
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds [0, ${this.leaves.length - 1}]`);
    }
    if (this.leaves.length === 1) {
      return [];
    }

    const proof: string[] = [];
    let currentLevel = [...this.leaves];
    let index = leafIndex;

    while (currentLevel.length > 1) {
      // If odd number of nodes, duplicate the last one
      if (currentLevel.length % 2 !== 0) {
        currentLevel.push(currentLevel[currentLevel.length - 1]);
      }

      // Determine sibling index
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      proof.push(currentLevel[siblingIndex]);

      // Move up to next level
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
      }
      currentLevel = nextLevel;
      index = Math.floor(index / 2);
    }

    return proof;
  }

  /**
   * Verifies that a leaf is included in a tree with the given root.
   * Recomputes the root from the leaf and proof, then compares.
   */
  verify(leaf: string, proof: string[], expectedRoot: string): boolean {
    if (proof.length === 0) {
      // Single-leaf tree: the leaf itself is the root
      return leaf === expectedRoot;
    }

    // We need to determine the leaf's position to know whether it's
    // left or right at each level. We do this by trying both orderings
    // and checking if either produces the expected root.
    // However, for a deterministic approach, we encode position in the proof.
    // Since our getProof doesn't encode direction, we use a reconstruction approach:
    // Try to find the correct path by checking the tree structure.

    // For verification without position info, we try to reconstruct.
    // The standard approach: we need the index to know left/right ordering.
    // Since we store leaves, we can find the index.
    const leafIndex = this.leaves.indexOf(leaf);
    if (leafIndex === -1) {
      // Leaf not in this tree — try positional verification anyway
      // This supports external verification where the verifier doesn't have the full tree
      return this.verifyWithIndex(leaf, proof, expectedRoot);
    }

    return this.verifyAtIndex(leaf, proof, expectedRoot, leafIndex);
  }

  /**
   * Returns the number of leaves currently in the tree.
   */
  get size(): number {
    return this.leaves.length;
  }

  // ── Private methods ────────────────────────────────────────────

  /**
   * Computes the Merkle root from a list of leaf hashes.
   */
  private computeRoot(leaves: string[]): string {
    let currentLevel = [...leaves];

    while (currentLevel.length > 1) {
      if (currentLevel.length % 2 !== 0) {
        currentLevel.push(currentLevel[currentLevel.length - 1]);
      }

      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  /**
   * Verifies a leaf at a known index against the expected root.
   */
  private verifyAtIndex(
    leaf: string,
    proof: string[],
    expectedRoot: string,
    leafIndex: number,
  ): boolean {
    let hash = leaf;
    let index = leafIndex;

    for (const sibling of proof) {
      if (index % 2 === 0) {
        hash = hashPair(hash, sibling);
      } else {
        hash = hashPair(sibling, hash);
      }
      index = Math.floor(index / 2);
    }

    return hash === expectedRoot;
  }

  /**
   * Attempts verification without knowing the exact index.
   * Tries all possible left/right combinations (brute force for small proofs).
   * For efficiency, tries the most common case first (sequential index derivation).
   */
  private verifyWithIndex(
    leaf: string,
    proof: string[],
    expectedRoot: string,
  ): boolean {
    // Try all possible positions (2^proof.length possibilities)
    const maxPositions = 1 << proof.length;
    for (let pos = 0; pos < maxPositions; pos++) {
      let hash = leaf;
      let index = pos;
      for (const sibling of proof) {
        if (index % 2 === 0) {
          hash = hashPair(hash, sibling);
        } else {
          hash = hashPair(sibling, hash);
        }
        index = Math.floor(index / 2);
      }
      if (hash === expectedRoot) {
        return true;
      }
    }
    return false;
  }
}
