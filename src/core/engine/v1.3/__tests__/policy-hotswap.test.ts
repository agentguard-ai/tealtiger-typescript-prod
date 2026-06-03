/**
 * Policy Hot-Swap, FREEZE Immutability, and Anti-Tamper Controls — Tests
 *
 * Covers tasks 3.1, 3.4, and 3.6:
 * - Policy bundle hot-swap with validation
 * - FREEZE rule immutability and persistence across hot-swaps
 * - Anti-tamper controls (forbidden config keys, registry endpoint, capability mismatch)
 *
 * @see Requirements 1.6, 1.7, 4.4, 4.8, 4.9, 15.1–15.16
 */

import { createHash } from 'crypto';
import { PolicyHotSwapManager, HotSwapEventType } from '../policy-hotswap';
import { AntiTamperGuard, AntiTamperEventType } from '../anti-tamper';
import type { PolicyBundle, FreezeRule } from '../types';
import type { GovernanceEvent } from '../TealEngineV13';

// ── Test Helpers ─────────────────────────────────────────────────




function createValidBundleWithHash(overrides?: Partial<PolicyBundle>): PolicyBundle {
  const basePolicies = overrides?.policies ?? [
    {
      id: 'policy-001',
      control_id: 'SEC.GUARD.BASIC',
      match: { action_class: 'CODE_CHANGE' },
      action: 'DENY',
    },
  ];

  const baseObj: Record<string, unknown> = {
    bundle_version: overrides?.bundle_version ?? '1.0.0',
    requires_sdk: overrides?.requires_sdk ?? '^1.3.0',
    requires_teec: overrides?.requires_teec ?? '^2.0.0',
    required_capabilities: overrides?.required_capabilities ?? ['freeze_rules', 'nhi_governance'],
    policies: basePolicies,
    fail_behavior: overrides?.fail_behavior ?? 'fail_closed',
  };

  // Only include optional fields if they are defined
  if (overrides?.cost_limits !== undefined) {
    baseObj.cost_limits = overrides.cost_limits;
  }
  if (overrides?.freeze_rules !== undefined) {
    baseObj.freeze_rules = overrides.freeze_rules;
  }
  if (overrides?.signature !== undefined) {
    baseObj.signature = overrides.signature;
  }

  const content = JSON.stringify({
    bundle_version: baseObj.bundle_version,
    requires_sdk: baseObj.requires_sdk,
    requires_teec: baseObj.requires_teec,
    required_capabilities: baseObj.required_capabilities,
    policies: baseObj.policies,
    fail_behavior: baseObj.fail_behavior,
    cost_limits: baseObj.cost_limits,
    freeze_rules: baseObj.freeze_rules,
  });
  const hash = createHash('sha256').update(content).digest('hex');

  return { ...baseObj, hash } as unknown as PolicyBundle;
}

// ── PolicyHotSwapManager Tests ───────────────────────────────────

describe('PolicyHotSwapManager — Successful Bundle Load', () => {
  it('loads a valid bundle successfully', () => {
    const manager = new PolicyHotSwapManager();
    const bundle = createValidBundleWithHash();

    const result = manager.loadPolicy(bundle);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('sets the active bundle after successful load', () => {
    const manager = new PolicyHotSwapManager();
    const bundle = createValidBundleWithHash();

    manager.loadPolicy(bundle);

    expect(manager.getActiveBundle()).toBe(bundle);
  });

  it('emits POLICY_BUNDLE_LOADED event on success', () => {
    const manager = new PolicyHotSwapManager();
    const events: GovernanceEvent[] = [];
    manager.onEvent((e) => events.push(e));

    const bundle = createValidBundleWithHash();
    manager.loadPolicy(bundle);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(HotSwapEventType.POLICY_BUNDLE_LOADED);
    expect(events[0].details.bundle_version).toBe('1.0.0');
  });

  it('replaces previous bundle on successful load', () => {
    const manager = new PolicyHotSwapManager();

    const bundle1 = createValidBundleWithHash({ bundle_version: '1.0.0' });
    const bundle2 = createValidBundleWithHash({ bundle_version: '2.0.0' });

    manager.loadPolicy(bundle1);
    expect(manager.getActiveBundle()?.bundle_version).toBe('1.0.0');

    manager.loadPolicy(bundle2);
    expect(manager.getActiveBundle()?.bundle_version).toBe('2.0.0');
  });
});

describe('PolicyHotSwapManager — Failed Validation Retains Previous Bundle', () => {
  it('retains previous bundle when new bundle has invalid hash', () => {
    const manager = new PolicyHotSwapManager();

    const validBundle = createValidBundleWithHash({ bundle_version: '1.0.0' });
    manager.loadPolicy(validBundle);

    const invalidBundle: PolicyBundle = {
      ...createValidBundleWithHash({ bundle_version: '2.0.0' }),
      hash: 'invalid-hash-value',
    };

    const result = manager.loadPolicy(invalidBundle);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Integrity hash mismatch');
    expect(manager.getActiveBundle()?.bundle_version).toBe('1.0.0');
  });

  it('emits POLICY_BUNDLE_SWAP_FAILED event on validation failure', () => {
    const manager = new PolicyHotSwapManager();
    const events: GovernanceEvent[] = [];
    manager.onEvent((e) => events.push(e));

    const invalidBundle: PolicyBundle = {
      ...createValidBundleWithHash(),
      hash: 'bad-hash',
    };

    manager.loadPolicy(invalidBundle);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(HotSwapEventType.POLICY_BUNDLE_SWAP_FAILED);
  });

  it('retains previous bundle when new bundle has unsupported capabilities', () => {
    const manager = new PolicyHotSwapManager(['freeze_rules']);

    const validBundle = createValidBundleWithHash({
      bundle_version: '1.0.0',
      required_capabilities: ['freeze_rules'],
    });
    manager.loadPolicy(validBundle);

    const incompatibleBundle = createValidBundleWithHash({
      bundle_version: '2.0.0',
      required_capabilities: ['quantum_governance'],
    });

    const result = manager.loadPolicy(incompatibleBundle);

    expect(result.success).toBe(false);
    expect(result.error).toContain('unsupported capabilities');
    expect(manager.getActiveBundle()?.bundle_version).toBe('1.0.0');
  });

  it('retains previous bundle when new bundle has missing schema fields', () => {
    const manager = new PolicyHotSwapManager();

    const validBundle = createValidBundleWithHash();
    manager.loadPolicy(validBundle);

    const invalidBundle = {
      bundle_version: '',
      requires_sdk: '^1.3.0',
      requires_teec: '^2.0.0',
      required_capabilities: [],
      hash: 'some-hash',
      policies: [],
      fail_behavior: 'fail_closed',
    } as unknown as PolicyBundle;

    const result = manager.loadPolicy(invalidBundle);

    expect(result.success).toBe(false);
    expect(manager.getActiveBundle()?.bundle_version).toBe('1.0.0');
  });
});


describe('PolicyHotSwapManager — FREEZE Rules Persist Across Hot-Swap', () => {
  it('accumulates FREEZE rules from successive bundles', () => {
    const manager = new PolicyHotSwapManager();

    const freezeRule1: FreezeRule = {
      id: 'freeze-prod-deploy',
      match: { action_class: 'PRODUCTION_DEPLOY' },
      reason: 'No production deploys during incident',
      created_at: Date.now(),
      created_by: 'security-team',
      immutable: true,
    };

    const freezeRule2: FreezeRule = {
      id: 'freeze-db-write',
      match: { action_class: 'DATABASE_WRITE' },
      reason: 'Database writes frozen',
      created_at: Date.now(),
      created_by: 'dba-team',
      immutable: true,
    };

    const bundle1 = createValidBundleWithHash({
      bundle_version: '1.0.0',
      freeze_rules: [freezeRule1],
    });
    manager.loadPolicy(bundle1);

    expect(manager.getAccumulatedFreezeRules()).toHaveLength(1);
    expect(manager.getAccumulatedFreezeRules()[0].id).toBe('freeze-prod-deploy');

    const bundle2 = createValidBundleWithHash({
      bundle_version: '2.0.0',
      freeze_rules: [freezeRule2],
    });
    manager.loadPolicy(bundle2);

    expect(manager.getAccumulatedFreezeRules()).toHaveLength(2);
    expect(manager.getAccumulatedFreezeRules().map((r) => r.id)).toContain('freeze-prod-deploy');
    expect(manager.getAccumulatedFreezeRules().map((r) => r.id)).toContain('freeze-db-write');
  });

  it('does not duplicate FREEZE rules with same ID', () => {
    const manager = new PolicyHotSwapManager();

    const freezeRule: FreezeRule = {
      id: 'freeze-prod-deploy',
      match: { action_class: 'PRODUCTION_DEPLOY' },
      reason: 'Frozen',
      created_at: Date.now(),
      created_by: 'admin',
      immutable: true,
    };

    const bundle1 = createValidBundleWithHash({
      bundle_version: '1.0.0',
      freeze_rules: [freezeRule],
    });
    manager.loadPolicy(bundle1);

    const bundle2 = createValidBundleWithHash({
      bundle_version: '2.0.0',
      freeze_rules: [freezeRule],
    });
    manager.loadPolicy(bundle2);

    expect(manager.getAccumulatedFreezeRules()).toHaveLength(1);
  });

  it('FREEZE rules from failed bundle loads are NOT added', () => {
    const manager = new PolicyHotSwapManager();

    const freezeRule: FreezeRule = {
      id: 'freeze-should-not-persist',
      match: { action_class: 'ANYTHING' },
      reason: 'Should not be added',
      created_at: Date.now(),
      created_by: 'attacker',
      immutable: true,
    };

    const invalidBundle: PolicyBundle = {
      bundle_version: '1.0.0',
      requires_sdk: '^1.3.0',
      requires_teec: '^2.0.0',
      required_capabilities: [],
      hash: 'invalid-hash',
      policies: [],
      fail_behavior: 'fail_closed',
      freeze_rules: [freezeRule],
    };

    manager.loadPolicy(invalidBundle);

    expect(manager.getAccumulatedFreezeRules()).toHaveLength(0);
  });

  it('new bundle without FREEZE rules does not remove existing ones', () => {
    const manager = new PolicyHotSwapManager();

    const freezeRule: FreezeRule = {
      id: 'freeze-persist',
      match: { action_class: 'PRODUCTION_DEPLOY' },
      reason: 'Must persist',
      created_at: Date.now(),
      created_by: 'admin',
      immutable: true,
    };

    const bundle1 = createValidBundleWithHash({
      bundle_version: '1.0.0',
      freeze_rules: [freezeRule],
    });
    manager.loadPolicy(bundle1);

    // Load a new bundle WITHOUT freeze_rules
    const bundle2 = createValidBundleWithHash({
      bundle_version: '2.0.0',
    });
    manager.loadPolicy(bundle2);

    // FREEZE rule should still be there
    expect(manager.getAccumulatedFreezeRules()).toHaveLength(1);
    expect(manager.getAccumulatedFreezeRules()[0].id).toBe('freeze-persist');
  });
});

describe('PolicyHotSwapManager — Bundle Integrity Hash Verification', () => {
  it('accepts bundle with correct SHA-256 hash', () => {
    const manager = new PolicyHotSwapManager();
    const bundle = createValidBundleWithHash();

    const validation = manager.validateBundle(bundle);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('rejects bundle with tampered hash', () => {
    const manager = new PolicyHotSwapManager();
    const bundle = createValidBundleWithHash();
    bundle.hash = 'tampered-hash-value';

    const validation = manager.validateBundle(bundle);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Integrity hash mismatch'))).toBe(true);
  });

  it('rejects empty policy bundle with actionable message', () => {
    const manager = new PolicyHotSwapManager();
    const bundle = createValidBundleWithHash({ policies: [] });

    const validation = manager.validateBundle(bundle);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      'TealTiger: Policy bundle is empty. At least one policy rule is required.'
    );
  });

  it('rejects bundle with invalid signature (too short)', () => {
    const manager = new PolicyHotSwapManager();
    const bundle = createValidBundleWithHash({ signature: 'short' });

    const validation = manager.validateBundle(bundle);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Invalid signature'))).toBe(true);
  });

  it('accepts bundle with valid-length signature', () => {
    const manager = new PolicyHotSwapManager();
    const validSig = 'a'.repeat(64);
    const bundle = createValidBundleWithHash({ signature: validSig });

    const validation = manager.validateBundle(bundle);

    expect(validation.valid).toBe(true);
  });
});


// ── AntiTamperGuard Tests ────────────────────────────────────────

describe('AntiTamperGuard — Forbidden Config Keys Detected and Ignored', () => {
  it('detects disable_enforcement as forbidden', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({ disable_enforcement: true, valid_key: 'ok' });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toContain('disable_enforcement');
  });

  it('detects bypass as forbidden', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({ bypass: true });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toContain('bypass');
  });

  it('detects allow_all as forbidden', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({ allow_all: true });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toContain('allow_all');
  });

  it('detects permissive_mode as forbidden', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({ permissive_mode: true });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toContain('permissive_mode');
  });

  it('detects skip_governance as forbidden', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({ skip_governance: true });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toContain('skip_governance');
  });

  it('detects no_enforce as forbidden', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({ no_enforce: true });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toContain('no_enforce');
  });

  it('detects multiple forbidden keys at once', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({
      disable_enforcement: true,
      bypass: true,
      allow_all: true,
      valid_setting: 'value',
    });

    expect(result.tampered).toBe(true);
    expect(result.forbidden_keys).toHaveLength(3);
    expect(result.forbidden_keys).toContain('disable_enforcement');
    expect(result.forbidden_keys).toContain('bypass');
    expect(result.forbidden_keys).toContain('allow_all');
  });

  it('emits TAMPER_ATTEMPT event when forbidden key detected', () => {
    const guard = new AntiTamperGuard();
    const events: GovernanceEvent[] = [];
    guard.onEvent((e) => events.push(e));

    guard.checkConfig({ bypass: true });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AntiTamperEventType.TAMPER_ATTEMPT);
    expect(events[0].details.forbidden_keys).toContain('bypass');
  });

  it('does not emit event for valid config', () => {
    const guard = new AntiTamperGuard();
    const events: GovernanceEvent[] = [];
    guard.onEvent((e) => events.push(e));

    guard.checkConfig({ policy_mode: 'enforce', log_level: 'info' });

    expect(events).toHaveLength(0);
  });

  it('returns tampered=false for config with no forbidden keys', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({
      policy_mode: 'enforce',
      log_level: 'info',
      modules: ['tealguard', 'tealsecrets'],
    });

    expect(result.tampered).toBe(false);
    expect(result.forbidden_keys).toHaveLength(0);
  });

  it('returns tampered=false for empty config', () => {
    const guard = new AntiTamperGuard();

    const result = guard.checkConfig({});

    expect(result.tampered).toBe(false);
    expect(result.forbidden_keys).toHaveLength(0);
  });
});

describe('AntiTamperGuard — Registry Endpoint Validation', () => {
  it('allows endpoint in allowlist', () => {
    const guard = new AntiTamperGuard();

    const result = guard.validateRegistryEndpoint(
      'https://registry.tealtiger.ai/bundles',
      ['https://registry.tealtiger.ai'],
    );

    expect(result.allowed).toBe(true);
    expect(result.reason_code).toBeUndefined();
  });

  it('allows exact match endpoint', () => {
    const guard = new AntiTamperGuard();

    const result = guard.validateRegistryEndpoint(
      'https://registry.tealtiger.ai',
      ['https://registry.tealtiger.ai'],
    );

    expect(result.allowed).toBe(true);
  });

  it('rejects endpoint not in allowlist', () => {
    const guard = new AntiTamperGuard();

    const result = guard.validateRegistryEndpoint(
      'https://evil-registry.example.com/bundles',
      ['https://registry.tealtiger.ai'],
    );

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe('REGISTRY_ENDPOINT_VIOLATION');
  });

  it('emits REGISTRY_ENDPOINT_VIOLATION event for disallowed endpoint', () => {
    const guard = new AntiTamperGuard();
    const events: GovernanceEvent[] = [];
    guard.onEvent((e) => events.push(e));

    guard.validateRegistryEndpoint(
      'https://malicious.example.com',
      ['https://registry.tealtiger.ai'],
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AntiTamperEventType.REGISTRY_ENDPOINT_VIOLATION);
  });

  it('does not emit event for allowed endpoint', () => {
    const guard = new AntiTamperGuard();
    const events: GovernanceEvent[] = [];
    guard.onEvent((e) => events.push(e));

    guard.validateRegistryEndpoint(
      'https://registry.tealtiger.ai/v1/bundles',
      ['https://registry.tealtiger.ai'],
    );

    expect(events).toHaveLength(0);
  });

  it('handles case-insensitive comparison', () => {
    const guard = new AntiTamperGuard();

    const result = guard.validateRegistryEndpoint(
      'https://Registry.TealTiger.AI/bundles',
      ['https://registry.tealtiger.ai'],
    );

    expect(result.allowed).toBe(true);
  });

  it('handles trailing slashes in normalization', () => {
    const guard = new AntiTamperGuard();

    const result = guard.validateRegistryEndpoint(
      'https://registry.tealtiger.ai/',
      ['https://registry.tealtiger.ai/'],
    );

    expect(result.allowed).toBe(true);
  });
});

describe('AntiTamperGuard — Capability Mismatch Detection', () => {
  it('returns compatible when all capabilities are supported', () => {
    const guard = new AntiTamperGuard();

    const bundle = createValidBundleWithHash({
      required_capabilities: ['freeze_rules', 'nhi_governance'],
    });

    const result = guard.checkCapabilityMismatch(bundle, [
      'freeze_rules',
      'nhi_governance',
      'zsp',
    ]);

    expect(result.compatible).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('returns incompatible with missing capabilities listed', () => {
    const guard = new AntiTamperGuard();

    const bundle = createValidBundleWithHash({
      required_capabilities: ['freeze_rules', 'quantum_governance', 'time_travel'],
    });

    const result = guard.checkCapabilityMismatch(bundle, ['freeze_rules', 'nhi_governance']);

    expect(result.compatible).toBe(false);
    expect(result.missing).toContain('quantum_governance');
    expect(result.missing).toContain('time_travel');
    expect(result.missing).not.toContain('freeze_rules');
  });

  it('emits CAPABILITY_MISMATCH event when capabilities missing', () => {
    const guard = new AntiTamperGuard();
    const events: GovernanceEvent[] = [];
    guard.onEvent((e) => events.push(e));

    const bundle = createValidBundleWithHash({
      required_capabilities: ['unsupported_feature'],
    });

    guard.checkCapabilityMismatch(bundle, ['freeze_rules']);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AntiTamperEventType.CAPABILITY_MISMATCH);
    expect(events[0].details.missing_capabilities).toContain('unsupported_feature');
  });

  it('does not emit event when all capabilities supported', () => {
    const guard = new AntiTamperGuard();
    const events: GovernanceEvent[] = [];
    guard.onEvent((e) => events.push(e));

    const bundle = createValidBundleWithHash({
      required_capabilities: ['freeze_rules'],
    });

    guard.checkCapabilityMismatch(bundle, ['freeze_rules', 'nhi_governance']);

    expect(events).toHaveLength(0);
  });

  it('handles empty required_capabilities', () => {
    const guard = new AntiTamperGuard();

    const bundle = createValidBundleWithHash({
      required_capabilities: [],
    });

    const result = guard.checkCapabilityMismatch(bundle, ['freeze_rules']);

    expect(result.compatible).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});

describe('PolicyHotSwapManager — getActiveBundle', () => {
  it('returns null when no bundle has been loaded', () => {
    const manager = new PolicyHotSwapManager();

    expect(manager.getActiveBundle()).toBeNull();
  });

  it('returns the most recently loaded valid bundle', () => {
    const manager = new PolicyHotSwapManager();

    const bundle = createValidBundleWithHash({ bundle_version: '3.0.0' });
    manager.loadPolicy(bundle);

    expect(manager.getActiveBundle()?.bundle_version).toBe('3.0.0');
  });
});
