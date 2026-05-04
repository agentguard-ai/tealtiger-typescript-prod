/**
 * TealMemory Module — Unit Tests
 *
 * Covers: write governance (secrets, PII, scope, TTL), read governance
 * (scope, classification), forget, adapter failure, and evidence redaction.
 */

import { TealMemory } from '../TealMemory';
import { LocalMemoryAdapter } from '../LocalMemoryAdapter';
import { DecisionAction, ReasonCode } from '../../core/engine/types';
import type { MemoryOperationContext, TealMemoryPolicy, MemoryRecord } from '../types';

const makeCtx = (overrides?: Partial<MemoryOperationContext>): MemoryOperationContext => ({
  correlation_id: 'test-corr-001',
  tenant_id: 'tenant-1',
  session_id: 'session-1',
  ...overrides,
});

const makePolicy = (overrides?: Partial<TealMemoryPolicy>): TealMemoryPolicy => ({
  enabled: true,
  write: {
    allowed_scopes: ['SESSION', 'USER', 'TENANT'],
    deny_if: { secrets: true, pii: true },
    on_detect: { secrets: 'DENY', pii: 'DENY' },
  },
  read: {
    allowed_scopes: ['SESSION', 'USER', 'TENANT'],
    enforce_classification: true,
  },
  retention: {
    ttl_required_for: ['CONFIDENTIAL', 'RESTRICTED'],
    max_ttl_ms: 86400000, // 24h
  },
  ...overrides,
});

const makeMemory = (adapter?: LocalMemoryAdapter) => {
  const a = adapter ?? new LocalMemoryAdapter();
  return {
    memory: new TealMemory({ adapter: a, evidence: { emit: true, redaction: 'HASH' } }),
    adapter: a,
  };
};

// ── Write Governance: Secrets ────────────────────────────────────

describe('TealMemory — Write Governance (Secrets)', () => {
  test('write with AWS key → DENY_WRITE + MEMORY_WRITE_DENIED_SECRET', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'my key is AKIAIOSFODNN7EXAMPLE here',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_DENIED_SECRET);
  });

  test('write with private key → DENY_WRITE', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_DENIED_SECRET);
  });

  test('write with secret + REDACT policy → REDACT_AND_WRITE', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy({
      write: {
        allowed_scopes: ['SESSION'],
        deny_if: { secrets: true, pii: false },
        on_detect: { secrets: 'REDACT' },
      },
    });
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'token = ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.REDACT_AND_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_REDACTED);
  });

  test('write with secret + SUMMARY_ONLY policy → STORE_SUMMARY_ONLY', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy({
      write: {
        allowed_scopes: ['SESSION'],
        deny_if: { secrets: true, pii: false },
        on_detect: { secrets: 'SUMMARY_ONLY' },
      },
    });
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'sk_live_FAKEKEYFORTESTINGONLY00',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.STORE_SUMMARY_ONLY);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_SUMMARY_ONLY);
  });
});

// ── Write Governance: PII ────────────────────────────────────────

describe('TealMemory — Write Governance (PII)', () => {
  test('write with email → DENY_WRITE + MEMORY_WRITE_DENIED_PII', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'Contact me at user@example.com for details',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_DENIED_PII);
  });

  test('write with SSN → DENY_WRITE + MEMORY_WRITE_DENIED_PII', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'SSN is 123-45-6789',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_DENIED_PII);
  });

  test('write with PII + REDACT policy → REDACT_AND_WRITE', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy({
      write: {
        allowed_scopes: ['SESSION'],
        deny_if: { secrets: false, pii: true },
        on_detect: { pii: 'REDACT' },
      },
    });
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'Email: user@example.com',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.REDACT_AND_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_REDACTED);
  });
});

// ── Write Governance: Clean Content ──────────────────────────────

describe('TealMemory — Write Governance (Clean)', () => {
  test('write with clean content → ALLOW_WRITE + MEMORY_WRITE_ALLOWED', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'The weather today is sunny and warm.',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.ALLOW_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_ALLOWED);
  });
});

// ── Write Governance: TTL ────────────────────────────────────────

describe('TealMemory — TTL Enforcement', () => {
  test('CONFIDENTIAL record without TTL → DENY + MEMORY_TTL_REQUIRED', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'CONFIDENTIAL',
      value: 'Some confidential data',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_TTL_REQUIRED);
  });

  test('record with TTL exceeding max → DENY + MEMORY_TTL_EXCEEDED', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'Some data',
      ttlMs: 172800000, // 48h, exceeds 24h max
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_TTL_EXCEEDED);
  });

  test('CONFIDENTIAL record with valid TTL → ALLOW_WRITE', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'CONFIDENTIAL',
      value: 'Some confidential data',
      ttlMs: 3600000, // 1h, within 24h max
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.ALLOW_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_ALLOWED);
  });
});

// ── Read Governance ──────────────────────────────────────────────

describe('TealMemory — Read Governance', () => {
  test('read with allowed scope → records returned', async () => {
    const adapter = new LocalMemoryAdapter();
    const ctx = makeCtx();
    await adapter.put(
      { scope: 'SESSION', classification: 'PUBLIC', value: 'hello' },
      ctx,
    );
    const { memory } = makeMemory(adapter);
    const policy = makePolicy();

    const { decision, records } = await memory.read(
      { scope: 'SESSION' },
      ctx,
      policy,
    );
    expect(decision.action).toBe(DecisionAction.ALLOW);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_READ_ALLOWED);
    expect(records.length).toBe(1);
    expect(records[0].value).toBe('hello');
  });

  test('read with disallowed scope → DENY_READ + MEMORY_READ_DENIED_SCOPE', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const ctx = makeCtx();

    const { decision, records } = await memory.read(
      { scope: 'GLOBAL' },
      ctx,
      policy,
    );
    expect(decision.action).toBe(DecisionAction.DENY_READ);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_READ_DENIED_SCOPE);
    expect(records.length).toBe(0);
  });

  test('read with classification violation → DENY_READ + MEMORY_READ_DENIED_CLASSIFICATION', async () => {
    const adapter = new LocalMemoryAdapter();
    const ctx: MemoryOperationContext = {
      correlation_id: 'test-corr-001',
      session_id: 'sess-1',
    };
    // Store a RESTRICTED record
    await adapter.put(
      { scope: 'SESSION', classification: 'RESTRICTED', value: 'top secret' },
      ctx,
    );
    const { memory } = makeMemory(adapter);
    const policy = makePolicy();

    // Context with session_id only → INTERNAL clearance, RESTRICTED exceeds it
    const { decision, records } = await memory.read(
      { scope: 'SESSION' },
      ctx,
      policy,
    );
    expect(decision.action).toBe(DecisionAction.DENY_READ);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_READ_DENIED_CLASSIFICATION);
    expect(records.length).toBe(0);
  });
});

// ── Adapter Failure ──────────────────────────────────────────────

describe('TealMemory — Adapter Failure (Fail-Closed)', () => {
  test('adapter put throws → DENY_WRITE + MEMORY_ADAPTER_UNAVAILABLE', async () => {
    const failAdapter = new LocalMemoryAdapter();
    failAdapter.put = async () => { throw new Error('adapter down'); };
    const memory = new TealMemory({ adapter: failAdapter });
    const policy = makePolicy({
      write: { allowed_scopes: ['SESSION'], deny_if: {} },
    });
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'clean data',
    };
    const decision = await memory.write(record, makeCtx(), policy);
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_ADAPTER_UNAVAILABLE);
  });

  test('adapter get throws → DENY_READ + MEMORY_ADAPTER_UNAVAILABLE', async () => {
    const failAdapter = new LocalMemoryAdapter();
    failAdapter.get = async () => { throw new Error('adapter down'); };
    const memory = new TealMemory({ adapter: failAdapter });
    const policy = makePolicy();

    const { decision, records } = await memory.read(
      { scope: 'SESSION' },
      makeCtx(),
      policy,
    );
    expect(decision.action).toBe(DecisionAction.DENY_READ);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_ADAPTER_UNAVAILABLE);
    expect(records.length).toBe(0);
  });
});

// ── Evidence Redaction ───────────────────────────────────────────

describe('TealMemory — Evidence Redaction', () => {
  test('evidence never contains raw memory values (HASH mode)', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const secretValue = 'The weather today is sunny and warm.';
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: secretValue,
    };
    const decision = await memory.write(record, makeCtx(), policy);

    // The raw value should NOT appear in metadata
    const metaStr = JSON.stringify(decision.metadata);
    expect(metaStr).not.toContain(secretValue);
    // value_evidence should be a SHA-256 hash (64 hex chars)
    expect(decision.metadata?.value_evidence).toMatch(/^[a-f0-9]{64}$/);
  });

  test('evidence includes correlation_id, policy_version, teec_version', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const record: MemoryRecord = {
      scope: 'SESSION',
      classification: 'PUBLIC',
      value: 'clean data',
    };
    const ctx = makeCtx({ correlation_id: 'corr-123' });
    const decision = await memory.write(record, ctx, policy);

    expect(decision.correlation_id).toBe('corr-123');
    expect(decision.policy_version).toBe('1.2.0');
    expect((decision as any).teec_version).toBe('0.1.0');
  });
});

// ── Forget Operation ─────────────────────────────────────────────

describe('TealMemory — Forget', () => {
  test('forget deletes records from adapter', async () => {
    const adapter = new LocalMemoryAdapter();
    const ctx = makeCtx();
    const { id } = await adapter.put(
      { scope: 'SESSION', classification: 'PUBLIC', value: 'to-delete' },
      ctx,
    );
    const { memory } = makeMemory(adapter);
    const policy = makePolicy();

    const decision = await memory.forget(
      { scope: 'SESSION', selector: { id } },
      ctx,
      policy,
    );
    expect(decision.action).toBe(DecisionAction.ALLOW_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_WRITE_ALLOWED);

    // Verify record is gone
    const remaining = await adapter.get({ scope: 'SESSION' }, ctx);
    expect(remaining.length).toBe(0);
  });

  test('forget with disallowed scope → DENY', async () => {
    const { memory } = makeMemory();
    const policy = makePolicy();
    const decision = await memory.forget(
      { scope: 'GLOBAL' },
      makeCtx(),
      policy,
    );
    expect(decision.action).toBe(DecisionAction.DENY_WRITE);
    expect(decision.reason_codes).toContain(ReasonCode.MEMORY_SCOPE_VIOLATION);
  });
});
