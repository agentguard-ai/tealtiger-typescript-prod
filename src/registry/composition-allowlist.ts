/**
 * Adapter Composition Allowlist
 *
 * Supports approved adapter-combination allowlists for TealRegistry v2.
 * Rejects unapproved adapter compositions with UNAPPROVED_ADAPTER_COMPOSITION.
 *
 * @module registry/composition-allowlist
 */

export interface CompositionCheckResult {
  /** Whether the adapter composition is allowed */
  allowed: boolean;
  /** Reason code when composition is rejected */
  reason_code?: string;
}

const REASON_CODE = 'UNAPPROVED_ADAPTER_COMPOSITION';

/**
 * Manages an allowlist of approved adapter combinations.
 *
 * The allowlist is an array of approved adapter sets. Each set is an array
 * of adapter names. A composition is allowed if it exactly matches one of
 * the approved sets (order-independent comparison).
 *
 * @example
 * ```ts
 * const allowlist = new CompositionAllowlist([
 *   ['adapter-bedrock', 'adapter-agentcore'],
 *   ['adapter-azure'],
 * ]);
 *
 * allowlist.check(['adapter-bedrock', 'adapter-agentcore']); // { allowed: true }
 * allowlist.check(['adapter-bedrock', 'adapter-azure']);      // { allowed: false, reason_code: '...' }
 * ```
 */
export class CompositionAllowlist {
  private readonly approvedSets: string[][];

  /**
   * @param approvedCombinations - Array of approved adapter sets.
   *   Each set is an array of adapter names that are approved to be used together.
   */
  constructor(approvedCombinations: string[][]) {
    // Normalize: sort each set for order-independent comparison
    this.approvedSets = approvedCombinations.map((set) =>
      [...set].sort(),
    );
  }

  /**
   * Check whether a given adapter composition is in the allowlist.
   *
   * @param adapters - Array of adapter names being composed
   * @returns Result indicating whether the composition is allowed
   */
  check(adapters: string[]): CompositionCheckResult {
    const sorted = [...adapters].sort();

    for (const approved of this.approvedSets) {
      if (
        approved.length === sorted.length &&
        approved.every((name, i) => name === sorted[i])
      ) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason_code: REASON_CODE,
    };
  }
}

/**
 * Standalone function to check adapter composition against an allowlist.
 *
 * @param adapters - Array of adapter names being composed
 * @param approvedCombinations - Array of approved adapter sets
 * @returns Result indicating whether the composition is allowed
 */
export function checkComposition(
  adapters: string[],
  approvedCombinations: string[][] = [],
): CompositionCheckResult {
  const allowlist = new CompositionAllowlist(approvedCombinations);
  return allowlist.check(adapters);
}
