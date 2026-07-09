/**
 * TealEngine v2.1 — verifyContiguity
 *
 * Pure verification function for TEEC v2.1 decision chain integrity.
 * Verifies sequence monotonicity, running_count ordering, and receipt_ref
 * hash-chain linkage across a sequence of governance decisions.
 *
 * @module core/engine/v2.1/verifyContiguity
 */

import { CryptoService } from './CryptoService';
import type { ContiguityResult } from './types';

/**
 * Verify the contiguity and integrity of a sequence of TEEC v2.1 governance decisions.
 *
 * Performs four checks in order:
 * 1. **Version compatibility** — ensures all decisions have required v2.1 fields (seq, receipt_ref)
 * 2. **Sequence monotonicity** — each decision's `seq` equals the previous `seq + 1`
 * 3. **Running count ordering** — each decision's `running_count` is strictly greater than the previous
 * 4. **Receipt chain integrity** — recomputes receipt_ref for each decision using the prior decision's
 *    receipt_ref and verifies it matches the stored value
 *
 * Returns `ContiguitySuccess` when all checks pass, or `ContiguityFailure` with the index of
 * the first failing decision, the specific check that failed, and a human-readable message.
 *
 * @param decisions - Array of decision objects to verify (accepts Record<string, unknown>[] for schema checking)
 * @param options - Optional filter parameters
 * @param options.agent_id - When provided, only decisions matching this agent_id are verified
 * @returns A discriminated union indicating success or the specific failure
 *
 * @example
 * ```typescript
 * const result = verifyContiguity(decisions);
 * if (result.valid) {
 *   console.log(`Chain verified: ${result.count} decisions`);
 * } else {
 *   console.error(`Chain break at index ${result.index}: ${result.check} — ${result.message}`);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Verify only decisions for a specific agent
 * const result = verifyContiguity(decisions, { agent_id: 'agent-001' });
 * ```
 */
export function verifyContiguity(
  decisions: Record<string, unknown>[],
  options?: { agent_id?: string },
): ContiguityResult {
  // ── Filter by agent_id if provided ──────────────────────────────

  const filtered = options?.agent_id
    ? decisions.filter((d) => {
        const seal = d.governance_seal as Record<string, unknown> | undefined;
        return seal && seal.agent_id === options.agent_id;
      })
    : decisions;

  // ── Trivially contiguous ────────────────────────────────────────

  if (filtered.length <= 1) {
    return { valid: true, count: filtered.length };
  }

  // ── Check version compatibility ────────────────────────────────

  for (let i = 0; i < filtered.length; i++) {
    const d = filtered[i];
    if (d.seq === undefined || d.seq === null || d.receipt_ref === undefined || d.receipt_ref === null) {
      return {
        valid: false,
        index: i,
        check: 'version_incompatible',
        message: `Decision at index ${i} lacks TEEC v2.1 fields (seq or receipt_ref missing)`,
      };
    }
  }

  // ── Sequential verification ─────────────────────────────────────

  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];

    const prevSeq = prev.seq as number;
    const currSeq = curr.seq as number;
    const prevRunningCount = prev.running_count as number;
    const currRunningCount = curr.running_count as number;

    // Check seq gap
    if (currSeq !== prevSeq + 1) {
      return {
        valid: false,
        index: i,
        check: 'seq_gap',
        message: `Expected seq ${prevSeq + 1}, got ${currSeq}`,
      };
    }

    // Check running_count monotonicity
    if (currRunningCount <= prevRunningCount) {
      return {
        valid: false,
        index: i,
        check: 'count_regression',
        message: `running_count must be strictly increasing — previous: ${prevRunningCount}, current: ${currRunningCount}`,
      };
    }

    // Check receipt chain
    // Recompute receipt_ref for the current decision using prev's receipt_ref
    const prevReceiptRef = prev.receipt_ref as string;
    const currWithoutReceiptAndSeal: Record<string, unknown> = {};
    for (const key of Object.keys(curr)) {
      if (key !== 'receipt_ref' && key !== 'governance_seal') {
        currWithoutReceiptAndSeal[key] = curr[key];
      }
    }

    const payload = CryptoService.deterministicSerialize(currWithoutReceiptAndSeal);
    const input = payload + prevReceiptRef;
    const expectedReceiptRef = CryptoService.sha256(input);

    if (expectedReceiptRef !== curr.receipt_ref) {
      return {
        valid: false,
        index: i,
        check: 'chain_break',
        message: `receipt_ref chain verification failed at index ${i}`,
      };
    }
  }

  // ── All checks passed ───────────────────────────────────────────

  return { valid: true, count: filtered.length };
}
