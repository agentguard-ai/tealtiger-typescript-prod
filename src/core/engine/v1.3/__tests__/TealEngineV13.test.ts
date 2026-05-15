/**
 * TealEngine v1.3 — Pre-Evaluation Stage Tests
 *
 * Covers task 2.1: TealEngineV13 class with pre-evaluation stage
 * Tests the sequential short-circuit pre-evaluation pipeline:
 *   1. FREEZE rule check
 *   2. PLAN_ONLY mode check
 *   3. NHI status validation
 *   4. Agent attestation check
 *   5. ZSP grant check
 *   6. NHI scope/environment check
 */

import { DecisionAction } from '../../types';
import { TealEngineV13, V13ReasonCode } from '../TealEngineV13';
import type { TealModule, ModuleResult } from '../../v1.2/types';
import type {
  GovernanceRequest,
  GovernanceContext,
  FreezeRule,
  NHIInventory,
} from '../types';

// ── Helpers ──────────────────────────────────────────────────────

const ALLOW_RESULT: ModuleResult = {
  action: DecisionAction.ALLOW,
  reason_codes: ['POLICY_COMPLIANT'],
  event_type: 'policy.evaluation',
};

const mockModule = (name: string, result: ModuleResult): TealModule => ({
  name,
  version: '1.0.0',
  evaluate: jest.fn().mockResolvedValue(result),
  init: jest.fn().mockResolvedValue(undefined),
});

const CTX: Partial<GovernanceContext> & { correlation_id: string } = {
  correlation_id: 'test-v13-001',
};

const BASE_REQUEST: GovernanceRequest = {
  content: 'test payload',
};


// ── Backward Compatibility ───────────────────────────────────────

describe('TealEngineV13 — Backward Compatibility with v1.2', () => {
  it('produces identical behavior to v1.2 when no v1.3 features configured', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);

    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const decision = await engine.evaluate(BASE_REQUEST, CTX);

    expect(decision.action).toBe(DecisionAction.ALLOW);
    expect(decision.correlation_id).toBe('test-v13-001');
  });

  it('evaluateV12() still works directly', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);

    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const decision = await engine.evaluateV12(
      { content: 'test' },
      { correlation_id: 'v12-compat' },
    );

    expect(decision.action).toBe(DecisionAction.ALLOW);
    expect(decision.correlation_id).toBe('v12-compat');
  });

  it('returns ALLOW when no modules and no v1.3 features', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
    });

    const decision = await engine.evaluate(BASE_REQUEST, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });
});

// ── FREEZE Rule Check ────────────────────────────────────────────

describe('TealEngineV13 — FREEZE Rule Check', () => {
  const freezeRule: FreezeRule = {
    id: 'freeze-prod-deploy',
    match: { action_class: 'PRODUCTION_DEPLOY' },
    reason: 'Production deployments frozen during incident',
    created_at: Date.now(),
    created_by: 'security-team',
    immutable: true,
  };

  it('denies with FREEZE_BLOCK when action matches a FREEZE rule', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [freezeRule],
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'PRODUCTION_DEPLOY',
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.FREEZE_BLOCK);
    expect(decision.reason).toContain('freeze-prod-deploy');
  });

  it('allows through when action does not match any FREEZE rule', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      freeze_rules: [freezeRule],
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'READ',
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('FREEZE rules cannot be modified at runtime', () => {
    const events: any[] = [];
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [freezeRule],
    });

    engine.onEvent((e) => events.push(e));
    engine.modifyFreezeRules([]);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(V13ReasonCode.FREEZE_TAMPER_ATTEMPT);
  });

  it('FREEZE rules cannot be removed at runtime', () => {
    const events: any[] = [];
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [freezeRule],
    });

    engine.onEvent((e) => events.push(e));
    engine.removeFreezeRule('freeze-prod-deploy');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(V13ReasonCode.FREEZE_TAMPER_ATTEMPT);
  });

  it('FREEZE rules cannot be disabled at runtime', () => {
    const events: any[] = [];
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [freezeRule],
    });

    engine.onEvent((e) => events.push(e));
    engine.disableFreezeRule('freeze-prod-deploy');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(V13ReasonCode.FREEZE_TAMPER_ATTEMPT);
  });

  it('getFreezeRules() returns the configured rules', () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [freezeRule],
    });

    const rules = engine.getFreezeRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('freeze-prod-deploy');
  });

  it('FREEZE with wildcard match blocks all actions', async () => {
    const wildcardFreeze: FreezeRule = {
      id: 'freeze-all',
      match: { action_class: '*' },
      reason: 'Total freeze',
      created_at: Date.now(),
      created_by: 'admin',
      immutable: true,
    };

    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [wildcardFreeze],
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'ANYTHING',
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.FREEZE_BLOCK);
  });
});


// ── PLAN_ONLY Mode Check ─────────────────────────────────────────

describe('TealEngineV13 — PLAN_ONLY Mode Check', () => {
  it('denies side-effecting actions with PLAN_ONLY_BLOCK', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      plan_only_mode: true,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'CODE_CHANGE',
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.PLAN_ONLY_BLOCK);
  });

  it('allows read-only actions in PLAN_ONLY mode', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      plan_only_mode: true,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'READ',
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('allows reasoning actions in PLAN_ONLY mode', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      plan_only_mode: true,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'REASONING',
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('uses custom plan_only_config for action classification', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      plan_only_config: {
        enabled: true,
        side_effecting_actions: ['CUSTOM_WRITE'],
        allowed_actions: ['CUSTOM_READ'],
      },
    });

    // Custom side-effecting action → denied
    const writeRequest: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'CUSTOM_WRITE',
    };
    const writeDec = await engine.evaluate(writeRequest, CTX);
    expect(writeDec.action).toBe(DecisionAction.DENY);
    expect(writeDec.reason_codes).toContain(V13ReasonCode.PLAN_ONLY_BLOCK);

    // Custom allowed action → allowed
    const readRequest: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'CUSTOM_READ',
    };
    const readDec = await engine.evaluate(readRequest, CTX);
    expect(readDec.action).toBe(DecisionAction.ALLOW);
  });

  it('does not block when PLAN_ONLY mode is disabled', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      plan_only_mode: false,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'CODE_CHANGE',
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('allows requests with no action_class in PLAN_ONLY mode', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      plan_only_mode: true,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      // No action_class set
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });
});

// ── NHI Status Validation ────────────────────────────────────────

describe('TealEngineV13 — NHI Status Validation', () => {
  it('denies with NHI_REVOKED when NHI status is revoked', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      nhi_identity: {
        agent_id: 'agent-001',
        owner: 'team-alpha',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'revoked',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.NHI_REVOKED);
  });

  it('denies with NHI_SUSPENDED when NHI status is suspended', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      nhi_identity: {
        agent_id: 'agent-002',
        owner: 'team-beta',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['staging'],
        status: 'suspended',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.NHI_SUSPENDED);
  });

  it('allows active NHI identities through', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      nhi_identity: {
        agent_id: 'agent-003',
        owner: 'team-gamma',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'active',
      },
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('uses NHI inventory status over request status', async () => {
    const inventory: NHIInventory = {
      agents: new Map([
        ['agent-004', {
          agent_id: 'agent-004',
          owner: 'team-delta',
          created_at: Date.now(),
          capability_scope: ['*'],
          environment_constraints: ['production'],
          status: 'revoked', // Inventory says revoked
        }],
      ]),
      lookup(id: string) { return this.agents.get(id); },
      updateStatus(id: string, status: any) {
        const entry = this.agents.get(id);
        if (entry) entry.status = status;
      },
    };

    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      nhi_inventory: inventory,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      nhi_identity: {
        agent_id: 'agent-004',
        owner: 'team-delta',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'active', // Request says active, but inventory says revoked
      },
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.NHI_REVOKED);
  });
});


// ── Agent Attestation Check ──────────────────────────────────────

describe('TealEngineV13 — Agent Attestation Check', () => {
  it('denies with AGENT_ATTESTATION_MISSING when attestation required but not provided', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      attestation_config: {
        required: true,
        trusted_signers: ['signer-key-001'],
      },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      // No attestation provided
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.AGENT_ATTESTATION_MISSING);
  });

  it('denies with AGENT_INTEGRITY_FAILED when signer is not trusted', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      attestation_config: {
        required: true,
        trusted_signers: ['signer-key-001'],
      },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      attestation: {
        agent_id: 'agent-005',
        signature: 'valid-sig-format',
        signer: 'untrusted-signer', // Not in trusted_signers
        attested_at: Date.now(),
        integrity_hash: 'sha256-abc123',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.AGENT_INTEGRITY_FAILED);
  });

  it('denies with AGENT_INTEGRITY_FAILED when attestation is expired', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      attestation_config: {
        required: true,
        trusted_signers: ['signer-key-001'],
        max_attestation_age_ms: 60_000, // 1 minute
      },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      attestation: {
        agent_id: 'agent-006',
        signature: 'valid-sig',
        signer: 'signer-key-001',
        attested_at: Date.now() - 120_000, // 2 minutes ago (expired)
        integrity_hash: 'sha256-def456',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.AGENT_INTEGRITY_FAILED);
  });

  it('allows through with valid attestation', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      attestation_config: {
        required: true,
        trusted_signers: ['signer-key-001'],
        max_attestation_age_ms: 60_000,
      },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      attestation: {
        agent_id: 'agent-007',
        signature: 'valid-sig',
        signer: 'signer-key-001',
        attested_at: Date.now() - 10_000, // 10 seconds ago (fresh)
        integrity_hash: 'sha256-ghi789',
      },
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('skips attestation check when not required', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      attestation_config: {
        required: false,
        trusted_signers: [],
      },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      // No attestation, but not required
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });
});

// ── ZSP Grant Check ──────────────────────────────────────────────

describe('TealEngineV13 — Zero Standing Privilege Check', () => {
  it('denies with ACCESS_STANDING_PRIVILEGE_DENIED when ZSP enabled and no grant', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      zsp_config: { enabled: true, max_grant_ttl_ms: 300_000 },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      // No jit_grant provided
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.ACCESS_STANDING_PRIVILEGE_DENIED);
  });

  it('denies with ACCESS_GRANT_EXPIRED when grant has expired', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      zsp_config: { enabled: true, max_grant_ttl_ms: 300_000 },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      jit_grant: {
        grant_id: 'grant-001',
        agent_id: 'agent-008',
        scope: ['tool:database'],
        issued_at: Date.now() - 600_000, // 10 minutes ago
        expires_at: Date.now() - 300_000, // Expired 5 minutes ago
        issued_by: 'admin',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.ACCESS_GRANT_EXPIRED);
  });

  it('allows through with valid non-expired grant', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      zsp_config: { enabled: true, max_grant_ttl_ms: 300_000 },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      jit_grant: {
        grant_id: 'grant-002',
        agent_id: 'agent-009',
        scope: ['tool:database'],
        issued_at: Date.now() - 60_000,
        expires_at: Date.now() + 240_000, // Expires in 4 minutes
        issued_by: 'admin',
      },
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('skips ZSP check when not enabled', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
      zsp_config: { enabled: false, max_grant_ttl_ms: 300_000 },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      // No grant, but ZSP is disabled
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });
});

// ── NHI Scope and Environment Check ──────────────────────────────

describe('TealEngineV13 — NHI Scope and Environment Check', () => {
  it('denies with NHI_SCOPE_VIOLATION when action is outside capability scope', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'DATABASE_WRITE',
      nhi_identity: {
        agent_id: 'agent-010',
        owner: 'team-epsilon',
        created_at: Date.now(),
        capability_scope: ['read:memory', 'invoke:tool:search'],
        environment_constraints: ['production'],
        status: 'active',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.NHI_SCOPE_VIOLATION);
  });

  it('denies with NHI_ENVIRONMENT_VIOLATION when environment not allowed', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'READ',
      nhi_identity: {
        agent_id: 'agent-011',
        owner: 'team-zeta',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['staging', 'development'],
        status: 'active',
      },
    };

    const ctx: Partial<GovernanceContext> & { correlation_id: string } = {
      correlation_id: 'test-env-001',
      environment: 'production', // Not in allowed environments
    };

    const decision = await engine.evaluate(request, ctx);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.reason_codes).toContain(V13ReasonCode.NHI_ENVIRONMENT_VIOLATION);
  });

  it('allows when action is within scope', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'READ',
      nhi_identity: {
        agent_id: 'agent-012',
        owner: 'team-eta',
        created_at: Date.now(),
        capability_scope: ['read:memory', 'read:data'],
        environment_constraints: ['production'],
        status: 'active',
      },
    };

    const ctx: Partial<GovernanceContext> & { correlation_id: string } = {
      correlation_id: 'test-scope-ok',
      environment: 'production',
    };

    const decision = await engine.evaluate(request, ctx);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('allows when NHI has wildcard scope', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'DATABASE_WRITE',
      nhi_identity: {
        agent_id: 'agent-013',
        owner: 'team-theta',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'active',
      },
    };

    const ctx: Partial<GovernanceContext> & { correlation_id: string } = {
      correlation_id: 'test-wildcard',
      environment: 'production',
    };

    const decision = await engine.evaluate(request, ctx);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });

  it('skips scope check when no action_class provided', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      // No action_class
      nhi_identity: {
        agent_id: 'agent-014',
        owner: 'team-iota',
        created_at: Date.now(),
        capability_scope: ['read:memory'],
        environment_constraints: [],
        status: 'active',
      },
    };

    const decision = await engine.evaluate(request, CTX);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });
});

// ── Pre-evaluation Order (Short-Circuit Priority) ────────────────

describe('TealEngineV13 — Pre-evaluation Order', () => {
  it('FREEZE takes precedence over PLAN_ONLY', async () => {
    const freezeRule: FreezeRule = {
      id: 'freeze-all-writes',
      match: { action_class: 'CODE_CHANGE' },
      reason: 'Frozen',
      created_at: Date.now(),
      created_by: 'admin',
      immutable: true,
    };

    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      freeze_rules: [freezeRule],
      plan_only_mode: true,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'CODE_CHANGE',
    };

    const decision = await engine.evaluate(request, CTX);

    // Should be FREEZE_BLOCK, not PLAN_ONLY_BLOCK
    expect(decision.reason_codes).toContain(V13ReasonCode.FREEZE_BLOCK);
    expect(decision.reason_codes).not.toContain(V13ReasonCode.PLAN_ONLY_BLOCK);
  });

  it('PLAN_ONLY takes precedence over NHI checks for side-effecting actions', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      plan_only_mode: true,
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'DATABASE_WRITE',
      nhi_identity: {
        agent_id: 'agent-015',
        owner: 'team-kappa',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'revoked', // Would trigger NHI_REVOKED, but PLAN_ONLY comes first
      },
    };

    const decision = await engine.evaluate(request, CTX);

    // PLAN_ONLY check comes before NHI status check
    expect(decision.reason_codes).toContain(V13ReasonCode.PLAN_ONLY_BLOCK);
  });

  it('NHI status check takes precedence over attestation check', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      attestation_config: {
        required: true,
        trusted_signers: ['signer-001'],
      },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      action_class: 'READ',
      nhi_identity: {
        agent_id: 'agent-016',
        owner: 'team-lambda',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'revoked',
      },
      // No attestation — but NHI revoked check comes first
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.reason_codes).toContain(V13ReasonCode.NHI_REVOKED);
    expect(decision.reason_codes).not.toContain(V13ReasonCode.AGENT_ATTESTATION_MISSING);
  });
});

// ── Decision Metadata ────────────────────────────────────────────

describe('TealEngineV13 — Decision Metadata', () => {
  it('includes nhi_context in decision when NHI identity is present', async () => {
    const mod = mockModule('tealsecrets', ALLOW_RESULT);
    const engine = new TealEngineV13({
      modules: [mod],
      policy: { secrets: { enabled: true } },
    });

    const request: GovernanceRequest = {
      ...BASE_REQUEST,
      nhi_identity: {
        agent_id: 'agent-017',
        owner: 'team-mu',
        created_at: Date.now(),
        capability_scope: ['*'],
        environment_constraints: ['production'],
        status: 'active',
      },
    };

    const decision = await engine.evaluate(request, CTX);

    expect(decision.nhi_context).toBeDefined();
    expect(decision.nhi_context!.agent_id).toBe('agent-017');
  });

  it('pre-evaluation deny decisions have risk_score 100', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      zsp_config: { enabled: true, max_grant_ttl_ms: 300_000 },
    });

    const decision = await engine.evaluate(BASE_REQUEST, CTX);

    expect(decision.action).toBe(DecisionAction.DENY);
    expect(decision.risk_score).toBe(100);
  });

  it('pre-evaluation deny decisions include policy_version 1.3.0', async () => {
    const engine = new TealEngineV13({
      modules: [],
      policy: {},
      zsp_config: { enabled: true, max_grant_ttl_ms: 300_000 },
    });

    const decision = await engine.evaluate(BASE_REQUEST, CTX);

    expect(decision.policy_version).toBe('1.3.0');
  });
});
