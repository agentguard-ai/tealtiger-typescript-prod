/**
 * Unit tests for CODE_CHANGE governance module.
 *
 * Tests the CodeChangeGovernor class and evaluateCodeChange function:
 * - Path allowlist enforcement (glob matching)
 * - Branch allowlist enforcement
 * - Diff hash requirement
 * - Two-person rule (approval_required)
 * - Evidence artifact production
 *
 * @requirements 3.1–3.6
 */

import {
  CodeChangeGovernor,
  evaluateCodeChange,
  matchGlob,
  CodeChangeReasonCode,
} from '../code-change-governance';
import type { GovernanceRequest, CodeChangeAttributes, CodeChangePolicy } from '../types';

// ── matchGlob ────────────────────────────────────────────────────

describe('matchGlob', () => {
  it('matches exact paths', () => {
    expect(matchGlob('src/main.ts', 'src/main.ts')).toBe(true);
  });

  it('does not match different paths', () => {
    expect(matchGlob('src/main.ts', 'src/other.ts')).toBe(false);
  });

  it('matches single wildcard within a segment', () => {
    expect(matchGlob('src/*.ts', 'src/main.ts')).toBe(true);
    expect(matchGlob('src/*.ts', 'src/utils.ts')).toBe(true);
  });

  it('single wildcard does not cross path separators', () => {
    expect(matchGlob('src/*.ts', 'src/sub/main.ts')).toBe(false);
  });

  it('matches double wildcard across path separators', () => {
    expect(matchGlob('src/**', 'src/sub/deep/file.ts')).toBe(true);
    expect(matchGlob('src/**', 'src/file.ts')).toBe(true);
  });

  it('matches **/ prefix for zero or more segments', () => {
    expect(matchGlob('**/test.ts', 'test.ts')).toBe(true);
    expect(matchGlob('**/test.ts', 'src/test.ts')).toBe(true);
    expect(matchGlob('**/test.ts', 'src/deep/test.ts')).toBe(true);
  });

  it('matches ** as everything', () => {
    expect(matchGlob('**', 'anything/at/all.ts')).toBe(true);
  });

  it('matches **/* as everything', () => {
    expect(matchGlob('**/*', 'anything/at/all.ts')).toBe(true);
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(matchGlob('src/**', 'src\\sub\\file.ts')).toBe(true);
  });
});

// ── CodeChangeGovernor ───────────────────────────────────────────

describe('CodeChangeGovernor', () => {
  let governor: CodeChangeGovernor;

  beforeEach(() => {
    governor = new CodeChangeGovernor();
  });

  describe('path allowlist enforcement', () => {
    const policy: CodeChangePolicy = {
      path_allowlist: ['src/**', 'docs/*'],
      branch_allowlist: ['main', 'develop'],
      two_person_rule: false,
      require_diff_hash: false,
    };

    it('allows changes to paths within the allowlist', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/utils/helper.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(true);
    });

    it('denies changes to paths outside the allowlist', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['config/secrets.yaml'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_PATH_VIOLATION);
    });

    it('denies if any path is outside the allowlist', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/valid.ts', 'forbidden/secret.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_PATH_VIOLATION);
    });

    it('includes violating path in evidence', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['forbidden/file.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.evidence?.violating_path).toBe('forbidden/file.ts');
    });
  });

  describe('branch allowlist enforcement', () => {
    const policy: CodeChangePolicy = {
      path_allowlist: ['src/**'],
      branch_allowlist: ['main', 'develop', 'feature/*'],
      two_person_rule: false,
      require_diff_hash: false,
    };

    it('allows changes to branches in the allowlist', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(true);
    });

    it('denies changes to branches not in the allowlist', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'production',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_BRANCH_VIOLATION);
    });

    it('includes violating branch in evidence', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'release/v2',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.evidence?.violating_branch).toBe('release/v2');
    });
  });

  describe('diff hash requirement', () => {
    const policy: CodeChangePolicy = {
      path_allowlist: ['src/**'],
      branch_allowlist: ['main'],
      two_person_rule: false,
      require_diff_hash: true,
    };

    it('allows changes with a valid diff hash', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'sha256:abcdef1234567890',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(true);
    });

    it('denies changes without a diff hash when required', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: '',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_MISSING_EVIDENCE);
    });

    it('diff hash check is evaluated before path/branch checks', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['forbidden/file.ts'],
        target_branch: 'forbidden-branch',
        change_type: 'modify',
        diff_hash: '',
      };

      const result = governor.evaluate(attributes, policy);
      // Diff hash is checked first
      expect(result.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_MISSING_EVIDENCE);
    });
  });

  describe('two-person rule', () => {
    const policy: CodeChangePolicy = {
      path_allowlist: ['src/**'],
      branch_allowlist: ['main'],
      two_person_rule: true,
      require_diff_hash: false,
    };

    it('returns approval_required when two-person rule is enabled', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('approval_required');
    });

    it('includes empty approval_identities in evidence', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc123',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.evidence?.approval_identities).toEqual([]);
      expect(result.evidence?.decision).toBe('PENDING');
    });
  });

  describe('evidence artifact production', () => {
    const policy: CodeChangePolicy = {
      path_allowlist: ['src/**'],
      branch_allowlist: ['main'],
      two_person_rule: false,
      require_diff_hash: false,
    };

    it('produces evidence with diff_hash on ALLOW', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'sha256:deadbeef',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.evidence).toBeDefined();
      expect(result.evidence?.diff_hash).toBe('sha256:deadbeef');
      expect(result.evidence?.policy_version).toBe('1.3.0');
      expect(result.evidence?.decision).toBe('ALLOW');
    });

    it('produces evidence with policy_version on DENY', () => {
      const attributes: CodeChangeAttributes = {
        target_paths: ['forbidden/file.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'abc',
      };

      const result = governor.evaluate(attributes, policy);
      expect(result.evidence?.policy_version).toBe('1.3.0');
      expect(result.evidence?.decision).toBe('DENY');
    });
  });
});

// ── evaluateCodeChange (function-based API) ──────────────────────

describe('evaluateCodeChange', () => {
  const policy: CodeChangePolicy = {
    path_allowlist: ['src/**'],
    branch_allowlist: ['main', 'develop'],
    two_person_rule: false,
    require_diff_hash: true,
  };

  it('returns null for non-CODE_CHANGE actions', () => {
    const request: GovernanceRequest = {
      action_class: 'TOOL_INVOKE',
      action_attributes: {},
    };

    const result = evaluateCodeChange(request, policy);
    expect(result).toBeNull();
  });

  it('evaluates CODE_CHANGE actions', () => {
    const request: GovernanceRequest = {
      action_class: 'CODE_CHANGE',
      action_attributes: {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'sha256:abc',
      },
    };

    const result = evaluateCodeChange(request, policy);
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('ALLOW');
  });

  it('denies CODE_CHANGE without diff hash', () => {
    const request: GovernanceRequest = {
      action_class: 'CODE_CHANGE',
      action_attributes: {
        target_paths: ['src/main.ts'],
        target_branch: 'main',
        change_type: 'modify',
      },
    };

    const result = evaluateCodeChange(request, policy);
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('DENY');
    expect(result!.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_MISSING_EVIDENCE);
  });

  it('denies CODE_CHANGE with path violation', () => {
    const request: GovernanceRequest = {
      action_class: 'CODE_CHANGE',
      action_attributes: {
        target_paths: ['config/database.yml'],
        target_branch: 'main',
        change_type: 'modify',
        diff_hash: 'sha256:abc',
      },
    };

    const result = evaluateCodeChange(request, policy);
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('DENY');
    expect(result!.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_PATH_VIOLATION);
  });

  it('denies CODE_CHANGE with branch violation', () => {
    const request: GovernanceRequest = {
      action_class: 'CODE_CHANGE',
      action_attributes: {
        target_paths: ['src/main.ts'],
        target_branch: 'production',
        change_type: 'modify',
        diff_hash: 'sha256:abc',
      },
    };

    const result = evaluateCodeChange(request, policy);
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('DENY');
    expect(result!.reason_code).toBe(CodeChangeReasonCode.CODE_CHANGE_BRANCH_VIOLATION);
  });
});
