/**
 * TealRegistry Module — Unit Tests
 *
 * Tests catalog lookups, provenance verification, supply chain scoring,
 * and evaluate() integration.
 */

import { TealRegistry } from '../TealRegistry';
import { DecisionAction, ReasonCode } from '../../core/engine/types';
import type { ModuleContext } from '../../core/engine/v1.2/types';
import type { RegistryEntry, TealRegistryConfig } from '../types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (overrides?: Partial<ModuleContext>): ModuleContext => ({
  correlation_id: 'test-corr-1',
  policy_version: '1.0.0',
  teec_version: '0.1.0',
  timestamp: Date.now(),
  ...overrides,
});

const makeEntry = (overrides?: Partial<RegistryEntry>): RegistryEntry => ({
  id: 'gpt-4',
  catalog: 'models',
  version: '1.0.0',
  hash: 'abc123',
  metadata: {},
  created_at: 1000,
  updated_at: 2000,
  ...overrides,
});

const makeConfig = (overrides?: Partial<TealRegistryConfig>): TealRegistryConfig => ({
  entries: [
    makeEntry({ id: 'gpt-4', catalog: 'models', environment: 'production' }),
    makeEntry({ id: 'web-search', catalog: 'tools' }),
    makeEntry({ id: 'pii-detector', catalog: 'detectors' }),
    makeEntry({ id: 'security-policy', catalog: 'policies' }),
  ],
  supply_chain: { block_below: false },
  ...overrides,
});

// ── Catalog Lookup Tests ─────────────────────────────────────────

describe('TealRegistry — Catalog Lookups', () => {
  it('lookupModel returns entry when model is present', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = reg.lookupModel('gpt-4', 'production');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('gpt-4');
  });

  it('lookupModel returns undefined when model is absent', () => {
    const reg = new TealRegistry(makeConfig());
    expect(reg.lookupModel('claude-3')).toBeUndefined();
  });

  it('lookupTool returns entry when tool is present', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = reg.lookupTool('web-search');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('web-search');
  });

  it('lookupTool returns undefined when tool is absent', () => {
    const reg = new TealRegistry(makeConfig());
    expect(reg.lookupTool('unknown-tool')).toBeUndefined();
  });

  it('lookupDetector returns entry when present', () => {
    const reg = new TealRegistry(makeConfig());
    expect(reg.lookupDetector('pii-detector')).toBeDefined();
  });

  it('lookupPolicy returns entry when present', () => {
    const reg = new TealRegistry(makeConfig());
    expect(reg.lookupPolicy('security-policy')).toBeDefined();
  });

  it('getAllEntries returns all entries', () => {
    const reg = new TealRegistry(makeConfig());
    expect(reg.getAllEntries()).toHaveLength(4);
  });

  it('getAllEntries filtered by catalog type', () => {
    const reg = new TealRegistry(makeConfig());
    expect(reg.getAllEntries('models')).toHaveLength(1);
    expect(reg.getAllEntries('tools')).toHaveLength(1);
    expect(reg.getAllEntries('detectors')).toHaveLength(1);
    expect(reg.getAllEntries('policies')).toHaveLength(1);
  });
});

// ── Hashing Tests ────────────────────────────────────────────────

describe('TealRegistry — Hashing', () => {
  it('entry hash is deterministic (same entry = same hash)', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = makeEntry();
    expect(reg.getEntryHash(entry)).toBe(reg.getEntryHash(entry));
  });

  it('entry hash is valid SHA-256 hex string', () => {
    const reg = new TealRegistry(makeConfig());
    const hash = reg.getEntryHash(makeEntry());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── evaluate() Tests ─────────────────────────────────────────────

describe('TealRegistry — evaluate()', () => {
  it('returns DENY + MODEL_NOT_ALLOWLISTED for absent model', async () => {
    const reg = new TealRegistry(makeConfig());
    const result = await reg.evaluate({ model: 'unknown-model' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.DENY);
    expect(result.reason_codes).toContain(ReasonCode.MODEL_NOT_ALLOWLISTED);
  });

  it('returns DENY + TOOL_NOT_ALLOWLISTED for absent tool', async () => {
    const reg = new TealRegistry(makeConfig());
    const result = await reg.evaluate({ tool: 'unknown-tool' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.DENY);
    expect(result.reason_codes).toContain(ReasonCode.TOOL_NOT_ALLOWLISTED);
  });

  it('returns ALLOW for present model', async () => {
    const reg = new TealRegistry(makeConfig());
    const result = await reg.evaluate({ model: 'gpt-4' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.ALLOW);
  });

  it('returns ALLOW for present tool', async () => {
    const reg = new TealRegistry(makeConfig());
    const result = await reg.evaluate({ tool: 'web-search' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.ALLOW);
  });
});

// ── Provenance Tests ─────────────────────────────────────────────

describe('TealRegistry — Provenance Verification', () => {
  it('valid signer returns valid: true', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = makeEntry({
      provenance: {
        signature: 'sig123',
        signer: 'trusted-org',
        algorithm: 'ed25519',
        signed_at: Date.now(),
      },
    });
    const result = reg.verifyProvenance(entry, ['trusted-org']);
    expect(result.valid).toBe(true);
    expect(result.signer).toBe('trusted-org');
  });

  it('missing provenance returns valid: false with PROVENANCE_SIGNATURE_MISSING', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = makeEntry();
    const result = reg.verifyProvenance(entry, ['trusted-org']);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PROVENANCE_SIGNATURE_MISSING');
  });

  it('untrusted signer returns valid: false with PROVENANCE_VERIFICATION_FAILED', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = makeEntry({
      provenance: {
        signature: 'sig123',
        signer: 'untrusted-org',
        algorithm: 'ed25519',
        signed_at: Date.now(),
      },
    });
    const result = reg.verifyProvenance(entry, ['trusted-org']);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PROVENANCE_VERIFICATION_FAILED');
  });

  it('evaluate() denies when provenance required and signature missing', async () => {
    const entry = makeEntry({ id: 'gpt-4', catalog: 'models' });
    const reg = new TealRegistry({
      entries: [entry],
      provenance: { require_signatures: true, trusted_signers: ['org-a'] },
    });
    const result = await reg.evaluate({ model: 'gpt-4' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.DENY);
    expect(result.reason_codes).toContain(ReasonCode.PROVENANCE_SIGNATURE_MISSING);
  });

  it('evaluate() denies when provenance required and signer untrusted', async () => {
    const entry = makeEntry({
      id: 'gpt-4',
      catalog: 'models',
      provenance: {
        signature: 'sig',
        signer: 'bad-org',
        algorithm: 'ed25519',
        signed_at: Date.now(),
      },
    });
    const reg = new TealRegistry({
      entries: [entry],
      provenance: { require_signatures: true, trusted_signers: ['good-org'] },
    });
    const result = await reg.evaluate({ model: 'gpt-4' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.DENY);
    expect(result.reason_codes).toContain(ReasonCode.PROVENANCE_VERIFICATION_FAILED);
  });
});

// ── Supply Chain Scoring Tests ───────────────────────────────────

describe('TealRegistry — Supply Chain Scoring', () => {
  it('score computed deterministically from metadata', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = makeEntry({
      metadata: {
        maintainer_activity: 80,
        known_vulnerabilities: 90,
        update_frequency: 70,
        signature_present: true,
      },
    });
    const s1 = reg.scoreSupplyChain(entry);
    const s2 = reg.scoreSupplyChain(entry);
    expect(s1.overall).toBe(s2.overall);
    expect(s1.signals).toEqual(s2.signals);
  });

  it('same metadata twice produces same score', () => {
    const reg = new TealRegistry(makeConfig());
    const entry1 = makeEntry({
      metadata: {
        maintainer_activity: 60,
        known_vulnerabilities: 70,
        update_frequency: 50,
        signature_present: false,
      },
    });
    const entry2 = makeEntry({
      metadata: {
        maintainer_activity: 60,
        known_vulnerabilities: 70,
        update_frequency: 50,
        signature_present: false,
      },
    });
    expect(reg.scoreSupplyChain(entry1).overall).toBe(reg.scoreSupplyChain(entry2).overall);
  });

  it('returns pre-computed score when present', () => {
    const reg = new TealRegistry(makeConfig());
    const precomputed = {
      overall: 85,
      signals: {
        maintainer_activity: 90,
        known_vulnerabilities: 80,
        update_frequency: 70,
        signature_present: true,
      },
      computed_at: 1000,
    };
    const entry = makeEntry({ supply_chain_score: precomputed });
    expect(reg.scoreSupplyChain(entry)).toBe(precomputed);
  });

  it('entry with no scoring data returns score of 0', () => {
    const reg = new TealRegistry(makeConfig());
    const entry = makeEntry({ metadata: {} });
    const score = reg.scoreSupplyChain(entry);
    expect(score.overall).toBe(0);
  });

  it('evaluate() denies with SUPPLY_CHAIN_SCORE_LOW when score below threshold', async () => {
    const entry = makeEntry({
      id: 'gpt-4',
      catalog: 'models',
      metadata: {
        maintainer_activity: 10,
        known_vulnerabilities: 10,
        update_frequency: 10,
        signature_present: false,
      },
    });
    const reg = new TealRegistry({
      entries: [entry],
      supply_chain: { min_score: 50, block_below: true },
    });
    const result = await reg.evaluate({ model: 'gpt-4' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.DENY);
    expect(result.reason_codes).toContain(ReasonCode.SUPPLY_CHAIN_SCORE_LOW);
  });

  it('evaluate() denies with SUPPLY_CHAIN_UNMAINTAINED when score is 0', async () => {
    const entry = makeEntry({
      id: 'gpt-4',
      catalog: 'models',
      metadata: {},
    });
    const reg = new TealRegistry({
      entries: [entry],
      supply_chain: { min_score: 50, block_below: true },
    });
    const result = await reg.evaluate({ model: 'gpt-4' }, makeCtx(), {});
    expect(result.action).toBe(DecisionAction.DENY);
    expect(result.reason_codes).toContain(ReasonCode.SUPPLY_CHAIN_UNMAINTAINED);
  });
});
