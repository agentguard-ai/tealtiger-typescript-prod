/**
 * TealEngine v1.2 — Unit Tests
 *
 * Tests for types, errors, ModuleRegistry, TEECRegistryLoader, and TEECValidator.
 */

import { DecisionAction, ReasonCode, PolicyMode } from '../../types';
import {
  DecisionActionV12,
  TEECRegistryLoader,
  TEECValidator,
  ModuleRegistry,
  TealError,
  TealConfigError,
  TealSchemaError,
  TealRuntimeError,
  TealAdapterError,
} from '../index';
import type { TealModule, Decision, TEECRegistry } from '../types';

// ── DecisionAction enum additions ────────────────────────────────

describe('DecisionAction v1.2 additions', () => {
  it('preserves all v1.1 values', () => {
    expect(DecisionAction.ALLOW).toBe('ALLOW');
    expect(DecisionAction.DENY).toBe('DENY');
    expect(DecisionAction.REDACT).toBe('REDACT');
    expect(DecisionAction.TRANSFORM).toBe('TRANSFORM');
    expect(DecisionAction.REQUIRE_APPROVAL).toBe('REQUIRE_APPROVAL');
    expect(DecisionAction.DEGRADE).toBe('DEGRADE');
  });

  it('adds v1.2 memory-governance actions', () => {
    expect(DecisionAction.ALLOW_WRITE).toBe('ALLOW_WRITE');
    expect(DecisionAction.DENY_WRITE).toBe('DENY_WRITE');
    expect(DecisionAction.REDACT_AND_WRITE).toBe('REDACT_AND_WRITE');
    expect(DecisionAction.STORE_SUMMARY_ONLY).toBe('STORE_SUMMARY_ONLY');
    expect(DecisionAction.DENY_READ).toBe('DENY_READ');
  });

  it('DecisionActionV12 enum has the 5 new values', () => {
    expect(Object.keys(DecisionActionV12)).toHaveLength(5);
  });
});

// ── ReasonCode enum additions ────────────────────────────────────

describe('ReasonCode v1.2 additions', () => {
  it('preserves all v1.1 codes', () => {
    expect(ReasonCode.POLICY_COMPLIANT).toBe('POLICY_COMPLIANT');
    expect(ReasonCode.PII_DETECTED).toBe('PII_DETECTED');
    expect(ReasonCode.COST_BUDGET_EXCEEDED).toBe('COST_BUDGET_EXCEEDED');
  });

  it('adds v1.2 secrets codes', () => {
    expect(ReasonCode.SECRET_DETECTED).toBe('SECRET_DETECTED');
    expect(ReasonCode.CREDENTIAL_LEAKAGE).toBe('CREDENTIAL_LEAKAGE');
    expect(ReasonCode.CREDENTIAL_TTL_EXCEEDED).toBe('CREDENTIAL_TTL_EXCEEDED');
    expect(ReasonCode.CREDENTIAL_ROTATION_REQUIRED).toBe('CREDENTIAL_ROTATION_REQUIRED');
    expect(ReasonCode.SECRET_SCAN_SKIPPED_PERF_BUDGET).toBe('SECRET_SCAN_SKIPPED_PERF_BUDGET');
  });

  it('adds v1.2 memory codes', () => {
    expect(ReasonCode.MEMORY_WRITE_DENIED_SECRET).toBe('MEMORY_WRITE_DENIED_SECRET');
    expect(ReasonCode.MEMORY_WRITE_DENIED_PII).toBe('MEMORY_WRITE_DENIED_PII');
    expect(ReasonCode.MEMORY_WRITE_REDACTED).toBe('MEMORY_WRITE_REDACTED');
    expect(ReasonCode.MEMORY_WRITE_SUMMARY_ONLY).toBe('MEMORY_WRITE_SUMMARY_ONLY');
    expect(ReasonCode.MEMORY_SCOPE_VIOLATION).toBe('MEMORY_SCOPE_VIOLATION');
    expect(ReasonCode.MEMORY_READ_DENIED_CLASSIFICATION).toBe('MEMORY_READ_DENIED_CLASSIFICATION');
  });

  it('adds v1.2 reliability codes', () => {
    expect(ReasonCode.RETRY_BUDGET_EXCEEDED).toBe('RETRY_BUDGET_EXCEEDED');
    expect(ReasonCode.FALLBACK_TRIGGERED).toBe('FALLBACK_TRIGGERED');
    expect(ReasonCode.DEGRADE_TRIGGERED).toBe('DEGRADE_TRIGGERED');
  });

  it('adds v1.2 registry codes', () => {
    expect(ReasonCode.MODEL_NOT_ALLOWLISTED).toBe('MODEL_NOT_ALLOWLISTED');
  });
});

// ── Error hierarchy ──────────────────────────────────────────────

describe('Error hierarchy', () => {
  it('TealError carries code and optional fields', () => {
    const err = new TealError('boom', 'E001', { module: 'secrets', correlation_id: 'abc' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TealError');
    expect(err.code).toBe('E001');
    expect(err.module).toBe('secrets');
    expect(err.correlation_id).toBe('abc');
    expect(err.message).toBe('boom');
  });

  it('TealConfigError extends TealError with config fields', () => {
    const err = new TealConfigError('bad config', 'CFG001', {
      config_key: 'policy.mode',
      expected: 'ENFORCE',
      received: 'INVALID',
    });
    expect(err).toBeInstanceOf(TealError);
    expect(err.name).toBe('TealConfigError');
    expect(err.config_key).toBe('policy.mode');
    expect(err.expected).toBe('ENFORCE');
    expect(err.received).toBe('INVALID');
  });

  it('TealSchemaError extends TealConfigError with validation errors', () => {
    const err = new TealSchemaError('schema fail', 'SCH001', {
      schema_path: '/policy/tools',
      validation_errors: [{ path: '/tools/0', message: 'missing name' }],
    });
    expect(err).toBeInstanceOf(TealConfigError);
    expect(err.name).toBe('TealSchemaError');
    expect(err.schema_path).toBe('/policy/tools');
    expect(err.validation_errors).toHaveLength(1);
  });

  it('TealRuntimeError has recoverable flag', () => {
    const err = new TealRuntimeError('timeout', 'RT001', { recoverable: true });
    expect(err).toBeInstanceOf(TealError);
    expect(err.name).toBe('TealRuntimeError');
    expect(err.recoverable).toBe(true);
  });

  it('TealAdapterError extends TealRuntimeError', () => {
    const err = new TealAdapterError('write failed', 'ADP001', {
      adapter: 'redis',
      operation: 'SET',
      recoverable: false,
    });
    expect(err).toBeInstanceOf(TealRuntimeError);
    expect(err.name).toBe('TealAdapterError');
    expect(err.adapter).toBe('redis');
    expect(err.operation).toBe('SET');
  });
});

// ── TEECRegistryLoader ───────────────────────────────────────────

describe('TEECRegistryLoader', () => {
  let registry: TEECRegistry;

  beforeAll(() => {
    registry = TEECRegistryLoader.loadEmbedded();
  });

  it('loads version 0.1.0', () => {
    expect(registry.version).toBe('0.1.0');
  });

  it('loads 32+ reason codes', () => {
    expect(registry.reason_codes.size).toBeGreaterThanOrEqual(32);
  });

  it('loads 18 event types', () => {
    expect(registry.event_types.size).toBe(18);
  });

  it('loads at least 11 decision actions', () => {
    expect(registry.decision_actions.size).toBeGreaterThanOrEqual(11);
  });

  it('reason code entries have required fields', () => {
    const entry = registry.reason_codes.get('SECRET_DETECTED');
    expect(entry).toBeDefined();
    expect(entry!.code).toBe('SECRET_DETECTED');
    expect(entry!.title).toBeTruthy();
    expect(entry!.category).toBe('secrets');
    expect(entry!.severity).toBe('critical');
    expect(entry!.default_action).toBe('DENY');
    expect(Array.isArray(entry!.tags)).toBe(true);
  });

  it('event type entries have required fields', () => {
    const entry = registry.event_types.get('secret.detection');
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('secret.detection');
    expect(entry!.description).toBeTruthy();
    expect(entry!.module).toBe('secrets');
  });

  it('decision action entries have required fields', () => {
    const entry = registry.decision_actions.get('DENY');
    expect(entry).toBeDefined();
    expect(entry!.action).toBe('DENY');
    expect(entry!.description).toBeTruthy();
    expect(Array.isArray(entry!.applicable_dimensions)).toBe(true);
  });

  describe('loadFromObject', () => {
    it('parses a minimal object', () => {
      const reg = TEECRegistryLoader.loadFromObject({
        version: '0.1.0',
        reason_codes: [{ code: 'TEST', title: 'Test', category: 'test', severity: 'low', default_action: 'ALLOW', tags: ['test'] }],
        event_types: [{ type: 'test.event', description: 'Test event', module: 'test' }],
        decision_actions: [{ action: 'ALLOW', description: 'Allow', applicable_dimensions: ['all'] }],
      });
      expect(reg.version).toBe('0.1.0');
      expect(reg.reason_codes.size).toBe(1);
      expect(reg.event_types.size).toBe(1);
      expect(reg.decision_actions.size).toBe(1);
    });

    it('handles missing arrays gracefully', () => {
      const reg = TEECRegistryLoader.loadFromObject({ version: '0.1.0' });
      expect(reg.reason_codes.size).toBe(0);
      expect(reg.event_types.size).toBe(0);
      expect(reg.decision_actions.size).toBe(0);
    });
  });
});

// ── TEECValidator ────────────────────────────────────────────────

describe('TEECValidator', () => {
  let validator: TEECValidator;

  beforeAll(() => {
    const registry = TEECRegistryLoader.loadEmbedded();
    validator = new TEECValidator(registry);
  });

  it('validates a known reason code', () => {
    const result = validator.validateReasonCode('SECRET_DETECTED');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects an unknown reason code', () => {
    const result = validator.validateReasonCode('DOES_NOT_EXIST');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown reason code');
  });

  it('validates a known event type', () => {
    const result = validator.validateEventType('secret.detection');
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown event type', () => {
    const result = validator.validateEventType('bogus.event');
    expect(result.valid).toBe(false);
  });

  it('validates a known decision action', () => {
    const result = validator.validateDecisionAction('DENY');
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown decision action', () => {
    const result = validator.validateDecisionAction('EXPLODE');
    expect(result.valid).toBe(false);
  });

  it('validates a complete Decision object', () => {
    const decision: Decision = {
      action: DecisionAction.DENY,
      reason_codes: [ReasonCode.SECRET_DETECTED],
      risk_score: 90,
      mode: PolicyMode.ENFORCE,
      policy_id: 'pol-1',
      policy_version: '1.0.0',
      component_versions: { sdk: '1.2.0', engine: '1.2.0' },
      correlation_id: 'corr-1',
      reason: 'Secret detected in payload',
      event_type: 'secret.detection',
      teec_version: '0.1.0',
    };

    const results = validator.validateDecision(decision);
    const invalid = results.filter(r => !r.valid);
    expect(invalid).toHaveLength(0);
  });

  it('reports invalid fields in a Decision', () => {
    const decision: Decision = {
      action: 'BOGUS' as any,
      reason_codes: ['FAKE_CODE' as any],
      risk_score: 50,
      mode: PolicyMode.ENFORCE,
      policy_id: 'pol-1',
      policy_version: '1.0.0',
      component_versions: { sdk: '1.2.0', engine: '1.2.0' },
      correlation_id: 'corr-1',
      reason: 'test',
      event_type: 'bogus.event',
      teec_version: '9.9.9',
    };

    const results = validator.validateDecision(decision);
    const invalid = results.filter(r => !r.valid);
    expect(invalid.length).toBeGreaterThanOrEqual(3); // action, reason_code, event_type, teec_version
  });
});

// ── ModuleRegistry ───────────────────────────────────────────────

describe('ModuleRegistry', () => {
  const createMockModule = (name: string): TealModule => ({
    name,
    version: '1.0.0',
    evaluate: jest.fn().mockResolvedValue({
      action: 'ALLOW',
      reason_codes: ['POLICY_COMPLIANT'],
      event_type: 'policy.evaluation',
    }),
    init: jest.fn().mockResolvedValue(undefined),
  });

  it('registers and retrieves a module', () => {
    const reg = new ModuleRegistry();
    const mod = createMockModule('tealsecrets');
    reg.register(mod);

    expect(reg.isRegistered('tealsecrets')).toBe(true);
    expect(reg.get('tealsecrets')).toBe(mod);
  });

  it('returns undefined for unregistered module', () => {
    const reg = new ModuleRegistry();
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.isRegistered('nope')).toBe(false);
  });

  it('lazy-initializes a module', async () => {
    const reg = new ModuleRegistry();
    const mod = createMockModule('tealsecrets');
    reg.register(mod);

    expect(reg.isInitialized('tealsecrets')).toBe(false);
    await reg.initModule('tealsecrets', { key: 'val' });
    expect(reg.isInitialized('tealsecrets')).toBe(true);
    expect(mod.init).toHaveBeenCalledWith({ key: 'val' });
  });

  it('does not re-initialize an already-initialized module', async () => {
    const reg = new ModuleRegistry();
    const mod = createMockModule('tealsecrets');
    reg.register(mod);

    await reg.initModule('tealsecrets', {});
    await reg.initModule('tealsecrets', {});
    expect(mod.init).toHaveBeenCalledTimes(1);
  });

  it('throws TealConfigError when initializing unregistered module', async () => {
    const reg = new ModuleRegistry();
    await expect(reg.initModule('ghost', {})).rejects.toThrow(TealConfigError);
  });

  it('returns status map', () => {
    const reg = new ModuleRegistry();
    reg.register(createMockModule('tealsecrets'));
    reg.register(createMockModule('tealmemory'));

    const status = reg.getStatus();
    expect(status['tealsecrets']).toEqual({
      registered: true,
      initialized: false,
      version: '1.0.0',
    });
    expect(status['tealmemory']).toEqual({
      registered: true,
      initialized: false,
      version: '1.0.0',
    });
  });

  it('detects required modules from policy keys', () => {
    const reg = new ModuleRegistry();
    reg.register(createMockModule('tealsecrets'));

    const required = reg.getRequiredModules({ secrets: { enabled: true }, memory: { maxSize: 100 } });
    expect(required).toContain('tealsecrets');
    expect(required).toContain('tealmemory');
  });

  it('returns empty array for null/undefined policy', () => {
    const reg = new ModuleRegistry();
    expect(reg.getRequiredModules(null as any)).toEqual([]);
    expect(reg.getRequiredModules(undefined as any)).toEqual([]);
  });
});
