/**
 * Unit tests for automation-levels module.
 *
 * Tests the three public functions:
 * - resolveAutomationLevel
 * - applyAutomationLevel
 * - approveDecision
 */

import {
  resolveAutomationLevel,
  applyAutomationLevel,
  approveDecision,
  AutomationPendingDecision,
} from '../automation-levels';
import type {
  AutomationLevelConfig,
  GovernanceRequest,
  PendingDecision,
} from '../types';

// ── resolveAutomationLevel ───────────────────────────────────────

describe('resolveAutomationLevel', () => {
  const config: AutomationLevelConfig = {
    rules: [
      {
        match: { action_class: 'CODE_CHANGE' },
        automation_level: 'approval_required',
      },
      {
        match: { action_class: 'TOOL_INVOKE', tool: 'search' },
        automation_level: 'auto_allow',
      },
      {
        match: { risk_score_above: 80 },
        automation_level: 'auto_deny',
      },
      {
        match: { model: 'gpt-4' },
        automation_level: 'auto_sanitize',
      },
    ],
  };

  it('returns the automation level of the first matching rule', () => {
    const request: GovernanceRequest = { action_class: 'CODE_CHANGE' };
    expect(resolveAutomationLevel(request, config)).toBe('approval_required');
  });

  it('matches on multiple fields (AND logic)', () => {
    const request: GovernanceRequest = {
      action_class: 'TOOL_INVOKE',
      tool: 'search',
    };
    expect(resolveAutomationLevel(request, config)).toBe('auto_allow');
  });

  it('does not match when only some fields match', () => {
    const request: GovernanceRequest = {
      action_class: 'TOOL_INVOKE',
      tool: 'database',
    };
    // Doesn't match rule 2 (tool mismatch), no other rule matches
    expect(resolveAutomationLevel(request, config)).toBeUndefined();
  });

  it('matches risk_score_above threshold', () => {
    const request: GovernanceRequest = {
      action_class: 'MEMORY_WRITE',
      action_attributes: { risk_score: 90 },
    };
    expect(resolveAutomationLevel(request, config)).toBe('auto_deny');
  });

  it('does not match when risk_score is below threshold', () => {
    const request: GovernanceRequest = {
      action_class: 'MEMORY_WRITE',
      action_attributes: { risk_score: 50 },
    };
    expect(resolveAutomationLevel(request, config)).toBeUndefined();
  });

  it('matches on model field', () => {
    const request: GovernanceRequest = { model: 'gpt-4' };
    expect(resolveAutomationLevel(request, config)).toBe('auto_sanitize');
  });

  it('returns undefined when no rule matches and no default', () => {
    const request: GovernanceRequest = { action_class: 'UNKNOWN' };
    expect(resolveAutomationLevel(request, config)).toBeUndefined();
  });

  it('returns default_level when no rule matches', () => {
    const configWithDefault: AutomationLevelConfig = {
      default_level: 'auto_allow',
      rules: [
        { match: { action_class: 'DANGEROUS' }, automation_level: 'auto_deny' },
      ],
    };
    const request: GovernanceRequest = { action_class: 'SAFE' };
    expect(resolveAutomationLevel(request, configWithDefault)).toBe('auto_allow');
  });

  it('first match wins when multiple rules could match', () => {
    const request: GovernanceRequest = {
      action_class: 'CODE_CHANGE',
      model: 'gpt-4',
    };
    // CODE_CHANGE rule is first, so approval_required wins over auto_sanitize
    expect(resolveAutomationLevel(request, config)).toBe('approval_required');
  });

  it('matches agent_id via nhi_identity', () => {
    const agentConfig: AutomationLevelConfig = {
      rules: [
        {
          match: { agent_id: 'agent-007' },
          automation_level: 'auto_deny',
        },
      ],
    };
    const request: GovernanceRequest = {
      nhi_identity: {
        agent_id: 'agent-007',
        owner: 'test',
        created_at: Date.now(),
        capability_scope: [],
        environment_constraints: [],
        status: 'active',
      },
    };
    expect(resolveAutomationLevel(request, agentConfig)).toBe('auto_deny');
  });

  it('matches custom attributes', () => {
    const attrConfig: AutomationLevelConfig = {
      rules: [
        {
          match: { attributes: { priority: 'high' } },
          automation_level: 'approval_required',
        },
      ],
    };
    const request: GovernanceRequest = {
      action_attributes: { priority: 'high' },
    };
    expect(resolveAutomationLevel(request, attrConfig)).toBe('approval_required');
  });
});

// ── applyAutomationLevel ─────────────────────────────────────────

describe('applyAutomationLevel', () => {
  const request: GovernanceRequest = { action_class: 'TEST' };

  it('returns ALLOW decision for auto_allow', () => {
    const decision = applyAutomationLevel('auto_allow', request);
    expect(decision).not.toBeNull();
    expect(decision!.action).toBe('ALLOW');
    expect(decision!.reason_codes).toContain('AUTOMATION_LEVEL_AUTO_ALLOW');
    expect(decision!.risk_score).toBe(0);
    expect(decision!.automation_level).toBe('auto_allow');
  });

  it('returns DENY decision for auto_deny', () => {
    const decision = applyAutomationLevel('auto_deny', request);
    expect(decision).not.toBeNull();
    expect(decision!.action).toBe('DENY');
    expect(decision!.reason_codes).toContain('AUTOMATION_LEVEL_AUTO_DENY');
    expect(decision!.risk_score).toBe(100);
    expect(decision!.automation_level).toBe('auto_deny');
  });

  it('returns MODIFY decision for auto_sanitize', () => {
    const decision = applyAutomationLevel('auto_sanitize', request);
    expect(decision).not.toBeNull();
    expect(decision!.action).toBe('MODIFY');
    expect(decision!.reason_codes).toContain('AUTOMATION_LEVEL_AUTO_SANITIZE');
    expect((decision as any).sanitized_content).toBe('[CONTENT_SANITIZED]');
    expect(decision!.automation_level).toBe('auto_sanitize');
  });

  it('returns PendingDecision for approval_required', () => {
    const decision = applyAutomationLevel('approval_required', request);
    expect(decision).not.toBeNull();
    const pending = decision as AutomationPendingDecision;
    expect(pending.action).toBe('PENDING');
    expect(pending.requires_approval).toBe(true);
    expect(pending.approval_token).toBeDefined();
    expect(pending.approval_token.length).toBeGreaterThan(0);
    expect(pending.expires_at).toBeGreaterThan(Date.now());
    expect(pending.reason_codes).toContain('AUTOMATION_LEVEL_APPROVAL_REQUIRED');
    expect(pending.automation_level).toBe('approval_required');
  });

  it('uses default 5-minute TTL for approval_required', () => {
    const before = Date.now();
    const decision = applyAutomationLevel('approval_required', request) as AutomationPendingDecision;
    const after = Date.now();

    const fiveMinutes = 5 * 60 * 1000;
    expect(decision.expires_at).toBeGreaterThanOrEqual(before + fiveMinutes);
    expect(decision.expires_at).toBeLessThanOrEqual(after + fiveMinutes);
  });

  it('uses custom TTL when provided', () => {
    const customTtl = 10 * 60 * 1000; // 10 minutes
    const before = Date.now();
    const decision = applyAutomationLevel('approval_required', request, {
      approval_ttl_ms: customTtl,
    }) as AutomationPendingDecision;

    expect(decision.expires_at).toBeGreaterThanOrEqual(before + customTtl);
  });

  it('generates unique approval tokens', () => {
    const d1 = applyAutomationLevel('approval_required', request) as AutomationPendingDecision;
    const d2 = applyAutomationLevel('approval_required', request) as AutomationPendingDecision;
    expect(d1.approval_token).not.toBe(d2.approval_token);
  });
});

// ── approveDecision ──────────────────────────────────────────────

/** Helper to create a minimal PendingDecision for tests */
function makePending(token: string, expiresAt: number): PendingDecision {
  return {
    action: 'PENDING',
    requires_approval: true,
    approval_token: token,
    expires_at: expiresAt,
    reason_codes: ['AUTOMATION_LEVEL_APPROVAL_REQUIRED'],
    risk_score: 75,
  } as unknown as PendingDecision;
}

describe('approveDecision', () => {
  it('returns ALLOW decision for valid non-expired token', () => {
    const pendingDecisions = new Map<string, PendingDecision>();
    const token = 'test-token-123';
    pendingDecisions.set(token, makePending(token, Date.now() + 300_000));

    const result = approveDecision(token, pendingDecisions);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('ALLOW');
    expect(result!.reason_codes).toContain('APPROVAL_GRANTED');
    expect(result!.automation_level).toBe('approval_required');
  });

  it('removes the token from pending decisions after approval', () => {
    const pendingDecisions = new Map<string, PendingDecision>();
    const token = 'test-token-456';
    pendingDecisions.set(token, makePending(token, Date.now() + 300_000));

    approveDecision(token, pendingDecisions);
    expect(pendingDecisions.has(token)).toBe(false);
  });

  it('returns null for unknown token', () => {
    const pendingDecisions = new Map<string, PendingDecision>();
    const result = approveDecision('nonexistent-token', pendingDecisions);
    expect(result).toBeNull();
  });

  it('returns null for expired token', () => {
    const pendingDecisions = new Map<string, PendingDecision>();
    const token = 'expired-token';
    pendingDecisions.set(token, makePending(token, Date.now() - 1000));

    const result = approveDecision(token, pendingDecisions);
    expect(result).toBeNull();
  });

  it('removes expired token from pending decisions', () => {
    const pendingDecisions = new Map<string, PendingDecision>();
    const token = 'expired-token-cleanup';
    pendingDecisions.set(token, makePending(token, Date.now() - 5000));

    approveDecision(token, pendingDecisions);
    expect(pendingDecisions.has(token)).toBe(false);
  });
});
