/**
 * CODE_CHANGE Action Class Governance
 *
 * Evaluates CODE_CHANGE actions against a CodeChangePolicy:
 * - Path allowlist enforcement
 * - Branch allowlist enforcement
 * - Diff hash requirement
 * - Two-person rule (approval_required)
 *
 * Produces evidence artifacts with diff_hash, policy_version, decision outcome,
 * and approval identities.
 *
 * @module core/engine/v1.3/code-change-governance
 * @requirements 3.1–3.6
 */

import type {
  GovernanceRequest,
  CodeChangeAttributes,
  CodeChangePolicy,
} from './types';

// ── Reason Codes ─────────────────────────────────────────────────

export const CodeChangeReasonCode = {
  CODE_CHANGE_MISSING_EVIDENCE: 'CODE_CHANGE_MISSING_EVIDENCE',
  CODE_CHANGE_PATH_VIOLATION: 'CODE_CHANGE_PATH_VIOLATION',
  CODE_CHANGE_BRANCH_VIOLATION: 'CODE_CHANGE_BRANCH_VIOLATION',
} as const;

// ── Result Interfaces ────────────────────────────────────────────

/**
 * Evidence produced by a CODE_CHANGE evaluation.
 */
export interface CodeChangeEvidence {
  /** SHA-256 hash of the diff content */
  diff_hash: string;
  /** Policy version used for evaluation */
  policy_version: string;
  /** Decision outcome (ALLOW, DENY, PENDING) */
  decision_outcome: string;
  /** Approval identities (if two-person rule is active) */
  approval_identities?: string[];
}

/**
 * Result of evaluating a CODE_CHANGE action against policy.
 */
export interface CodeChangeResult {
  /** Governance decision */
  decision: 'ALLOW' | 'DENY' | 'PENDING';
  /** Reason code when denied */
  reason_code?: string;
  /** Evidence artifact for audit trail */
  evidence: CodeChangeEvidence;
}

// ── Glob Matching ────────────────────────────────────────────────

/**
 * Simple glob matching for path allowlists.
 * Supports:
 * - `*` matches any sequence of characters within a single path segment (no `/`)
 * - `**` matches any sequence of characters including path separators
 * - Literal characters match exactly
 *
 * @param pattern - Glob pattern (e.g., 'src/**', '*.ts', 'docs/*')
 * @param path - File path to test against the pattern
 * @returns true if the path matches the pattern
 */
export function matchGlob(pattern: string, path: string): boolean {
  // Normalize separators to forward slash
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Exact match
  if (normalizedPattern === normalizedPath) return true;

  // Wildcard-only pattern matches everything
  if (normalizedPattern === '**' || normalizedPattern === '**/*') return true;

  // Convert glob pattern to regex
  const regexStr = globToRegex(normalizedPattern);
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalizedPath);
}

/**
 * Convert a glob pattern to a regex string.
 */
function globToRegex(pattern: string): string {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      // Check for **
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        // ** matches everything including path separators
        // Check if followed by /
        if (i + 2 < pattern.length && pattern[i + 2] === '/') {
          // **/ matches zero or more path segments
          result += '(?:.*/)?';
          i += 3;
        } else {
          // ** at end matches everything
          result += '.*';
          i += 2;
        }
      } else {
        // * matches anything except path separator
        result += '[^/]*';
        i += 1;
      }
    } else if (char === '?') {
      // ? matches any single character except path separator
      result += '[^/]';
      i += 1;
    } else if (char === '[') {
      // Character class — pass through
      const closeBracket = pattern.indexOf(']', i + 1);
      if (closeBracket === -1) {
        result += '\\[';
        i += 1;
      } else {
        result += pattern.slice(i, closeBracket + 1);
        i = closeBracket + 1;
      }
    } else {
      // Escape regex special characters
      result += escapeRegexChar(char);
      i += 1;
    }
  }

  return result;
}

/**
 * Escape a single character for use in a regex.
 */
function escapeRegexChar(char: string): string {
  if ('.+^${}()|[]\\'.includes(char)) {
    return `\\${char}`;
  }
  return char;
}

// ── CodeChangeGovernor Class ─────────────────────────────────────

/**
 * CodeChangeGovernor — evaluates CODE_CHANGE actions against a policy.
 *
 * Provides a class-based interface for code change governance evaluation.
 * Enforces path allowlists, branch allowlists, diff hash requirements,
 * and two-person approval rules.
 *
 * @example
 * ```typescript
 * const governor = new CodeChangeGovernor();
 * const result = governor.evaluate(attributes, policy);
 * if (!result.allowed) {
 *   console.log(`Denied: ${result.reason_code}`);
 * }
 * ```
 */
export class CodeChangeGovernor {
  /**
   * Evaluate a CODE_CHANGE action against a CodeChangePolicy.
   *
   * @param attributes - The code change attributes (paths, branch, change type, diff hash)
   * @param policy - The code change policy to enforce
   * @returns Evaluation result with allowed status, reason code, and evidence
   */
  evaluate(
    attributes: CodeChangeAttributes,
    policy: CodeChangePolicy,
  ): {
    allowed: boolean;
    reason_code?: string;
    evidence?: Record<string, unknown>;
  } {
    const policyVersion = '1.3.0';

    // 1. Check require_diff_hash
    if (policy.require_diff_hash && !attributes.diff_hash) {
      return {
        allowed: false,
        reason_code: CodeChangeReasonCode.CODE_CHANGE_MISSING_EVIDENCE,
        evidence: {
          diff_hash: '',
          policy_version: policyVersion,
          decision: 'DENY',
        },
      };
    }

    // 2. Check path_allowlist (glob matching)
    if (policy.path_allowlist.length > 0 && attributes.target_paths.length > 0) {
      for (const targetPath of attributes.target_paths) {
        if (!isPathAllowed(targetPath, policy.path_allowlist)) {
          return {
            allowed: false,
            reason_code: CodeChangeReasonCode.CODE_CHANGE_PATH_VIOLATION,
            evidence: {
              diff_hash: attributes.diff_hash || '',
              policy_version: policyVersion,
              decision: 'DENY',
              violating_path: targetPath,
            },
          };
        }
      }
    }

    // 3. Check branch_allowlist
    if (policy.branch_allowlist.length > 0 && attributes.target_branch) {
      if (!policy.branch_allowlist.includes(attributes.target_branch)) {
        return {
          allowed: false,
          reason_code: CodeChangeReasonCode.CODE_CHANGE_BRANCH_VIOLATION,
          evidence: {
            diff_hash: attributes.diff_hash || '',
            policy_version: policyVersion,
            decision: 'DENY',
            violating_branch: attributes.target_branch,
          },
        };
      }
    }

    // 4. Check two_person_rule → returns approval_required
    if (policy.two_person_rule) {
      return {
        allowed: false,
        reason_code: 'approval_required',
        evidence: {
          diff_hash: attributes.diff_hash || '',
          policy_version: policyVersion,
          decision: 'PENDING',
          approval_identities: [],
        },
      };
    }

    // 5. All checks pass → ALLOW
    return {
      allowed: true,
      evidence: {
        diff_hash: attributes.diff_hash || '',
        policy_version: policyVersion,
        decision: 'ALLOW',
      },
    };
  }
}

// ── Core Evaluation ──────────────────────────────────────────────

/**
 * Evaluates a CODE_CHANGE action against a CodeChangePolicy.
 *
 * @param request - The governance request to evaluate
 * @param policy - The code change policy to enforce
 * @returns CodeChangeResult if action_class is CODE_CHANGE, null otherwise
 *
 * Evaluation order:
 * 1. If action_class !== 'CODE_CHANGE' → return null (not applicable)
 * 2. Extract CodeChangeAttributes from request.action_attributes
 * 3. Check require_diff_hash: if true and no diff_hash → DENY with CODE_CHANGE_MISSING_EVIDENCE
 * 4. Check path_allowlist: if any target_path not matching any glob → DENY with CODE_CHANGE_PATH_VIOLATION
 * 5. Check branch_allowlist: if target_branch not in allowlist → DENY with CODE_CHANGE_BRANCH_VIOLATION
 * 6. Check two_person_rule: if enabled → PENDING (approval_required)
 * 7. All checks pass → ALLOW
 */
export function evaluateCodeChange(
  request: GovernanceRequest,
  policy: CodeChangePolicy,
): CodeChangeResult | null {
  // Step 1: Only evaluate CODE_CHANGE actions
  if (request.action_class !== 'CODE_CHANGE') {
    return null;
  }

  // Step 2: Extract attributes
  const attributes = extractCodeChangeAttributes(request);
  const policyVersion = '1.3.0';

  // Step 3: Check require_diff_hash
  if (policy.require_diff_hash && !attributes.diff_hash) {
    return {
      decision: 'DENY',
      reason_code: CodeChangeReasonCode.CODE_CHANGE_MISSING_EVIDENCE,
      evidence: {
        diff_hash: '',
        policy_version: policyVersion,
        decision_outcome: 'DENY',
      },
    };
  }

  // Step 4: Check path_allowlist
  if (policy.path_allowlist.length > 0 && attributes.target_paths.length > 0) {
    for (const targetPath of attributes.target_paths) {
      if (!isPathAllowed(targetPath, policy.path_allowlist)) {
        return {
          decision: 'DENY',
          reason_code: CodeChangeReasonCode.CODE_CHANGE_PATH_VIOLATION,
          evidence: {
            diff_hash: attributes.diff_hash || '',
            policy_version: policyVersion,
            decision_outcome: 'DENY',
          },
        };
      }
    }
  }

  // Step 5: Check branch_allowlist
  if (policy.branch_allowlist.length > 0 && attributes.target_branch) {
    if (!policy.branch_allowlist.includes(attributes.target_branch)) {
      return {
        decision: 'DENY',
        reason_code: CodeChangeReasonCode.CODE_CHANGE_BRANCH_VIOLATION,
        evidence: {
          diff_hash: attributes.diff_hash || '',
          policy_version: policyVersion,
          decision_outcome: 'DENY',
        },
      };
    }
  }

  // Step 6: Check two_person_rule
  if (policy.two_person_rule) {
    return {
      decision: 'PENDING',
      evidence: {
        diff_hash: attributes.diff_hash || '',
        policy_version: policyVersion,
        decision_outcome: 'PENDING',
        approval_identities: [],
      },
    };
  }

  // Step 7: All checks pass → ALLOW
  return {
    decision: 'ALLOW',
    evidence: {
      diff_hash: attributes.diff_hash || '',
      policy_version: policyVersion,
      decision_outcome: 'ALLOW',
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Extract CodeChangeAttributes from a GovernanceRequest's action_attributes.
 */
function extractCodeChangeAttributes(request: GovernanceRequest): CodeChangeAttributes {
  const attrs = request.action_attributes ?? {};

  return {
    target_paths: Array.isArray(attrs.target_paths)
      ? (attrs.target_paths as string[])
      : [],
    target_branch: (attrs.target_branch as string) ?? '',
    change_type: (attrs.change_type as CodeChangeAttributes['change_type']) ?? 'modify',
    diff_hash: (attrs.diff_hash as string) ?? '',
  };
}

/**
 * Check if a path matches any pattern in the allowlist.
 */
function isPathAllowed(path: string, allowlist: string[]): boolean {
  return allowlist.some((pattern) => matchGlob(pattern, path));
}
