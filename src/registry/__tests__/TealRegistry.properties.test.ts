/**
 * TealRegistry Module — Property-Based Tests
 *
 * Uses fast-check to verify universal properties for registry
 * allowlist enforcement, entry hashing, provenance, and supply chain scoring.
 */

import * as fc from 'fast-check';
import { TealRegistry } from '../TealRegistry';
import { DecisionAction, ReasonCode } from '../../core/engine/types';
import type { ModuleContext } from '../../core/engine/v1.2/types';
import type { CatalogType, RegistryEntry } from '../types';

// ── Generators ───────────────────────────────────────────────────

const arbCatalog = (): fc.Arbitrary<CatalogType> =>
  fc.constantFrom('models', 'tools', 'detectors', 'policies');

const arbEntry = (): fc.Arbitrary<RegistryEntry> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes(':')),
    catalog: arbCatalog(),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    hash: fc.string({ minLength: 1, maxLength: 64 }),
    metadata: fc.constant({} as Record<string, unknown>),
    created_at: fc.nat(),
    updated_at: fc.nat(),
  });

const arbCtx = (): fc.Arbitrary<ModuleContext> =>
  fc.record({
    correlation_id: fc.string({ minLength: 1, maxLength: 20 }),
    policy_version: fc.constant('1.0.0'),
    teec_version: fc.constant('0.1.0'),
    timestamp: fc.nat(),
  });

// ── Property 15: Registry allowlist enforcement ──────────────────

describe('Property 15: Registry allowlist enforcement', () => {
  /**
   * **Validates: Requirements FR-6.1, FR-6.2**
   *
   * For any model/tool ID present in catalog → ALLOW.
   * For any absent ID → DENY with MODEL_NOT_ALLOWLISTED or TOOL_NOT_ALLOWLISTED.
   */
  it('present model → ALLOW, absent model → DENY + MODEL_NOT_ALLOWLISTED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEntry().filter((e) => e.catalog === 'models'),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(':')),
        arbCtx(),
        async (entry, absentId, ctx) => {
          fc.pre(absentId !== entry.id);

          const reg = new TealRegistry({
            entries: [entry],
            supply_chain: { block_below: false },
          });

          const allowResult = await reg.evaluate({ model: entry.id }, ctx, {});
          expect(allowResult.action).toBe(DecisionAction.ALLOW);

          const denyResult = await reg.evaluate({ model: absentId }, ctx, {});
          expect(denyResult.action).toBe(DecisionAction.DENY);
          expect(denyResult.reason_codes).toContain(ReasonCode.MODEL_NOT_ALLOWLISTED);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('present tool → ALLOW, absent tool → DENY + TOOL_NOT_ALLOWLISTED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEntry().filter((e) => e.catalog === 'tools'),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(':')),
        arbCtx(),
        async (entry, absentId, ctx) => {
          fc.pre(absentId !== entry.id);

          const reg = new TealRegistry({
            entries: [entry],
            supply_chain: { block_below: false },
          });

          const allowResult = await reg.evaluate({ tool: entry.id }, ctx, {});
          expect(allowResult.action).toBe(DecisionAction.ALLOW);

          const denyResult = await reg.evaluate({ tool: absentId }, ctx, {});
          expect(denyResult.action).toBe(DecisionAction.DENY);
          expect(denyResult.reason_codes).toContain(ReasonCode.TOOL_NOT_ALLOWLISTED);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Property 16: Registry entry versioning and hashing ───────────

describe('Property 16: Registry entry versioning and hashing', () => {
  /**
   * **Validates: Requirements FR-6.5**
   *
   * For any RegistryEntry, version is non-empty, hash is valid SHA-256 hex.
   * Same content hashed twice = same hash.
   */
  it('version is non-empty and hash is valid SHA-256 hex', () => {
    fc.assert(
      fc.property(arbEntry(), (entry) => {
        expect(entry.version.length).toBeGreaterThan(0);

        const reg = new TealRegistry({ entries: [] });
        const hash = reg.getEntryHash(entry);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 100 },
    );
  });

  it('same content hashed twice = same hash', () => {
    fc.assert(
      fc.property(arbEntry(), (entry) => {
        const reg = new TealRegistry({ entries: [] });
        expect(reg.getEntryHash(entry)).toBe(reg.getEntryHash(entry));
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 22: Provenance verification enforcement ─────────────

describe('Property 22: Provenance verification enforcement', () => {
  /**
   * **Validates: Requirements FR-10.1, FR-10.3**
   *
   * For any entry where provenance is required and signature is missing/invalid
   * or signer not trusted → DENY with PROVENANCE_VERIFICATION_FAILED or
   * PROVENANCE_SIGNATURE_MISSING.
   */
  it('missing provenance + required signatures → DENY + PROVENANCE_SIGNATURE_MISSING', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEntry().filter((e) => e.catalog === 'models'),
        fc.string({ minLength: 1, maxLength: 20 }),
        arbCtx(),
        async (entry, trustedSigner, ctx) => {
          const noProvEntry = { ...entry };
          delete (noProvEntry as Partial<RegistryEntry>).provenance;

          const reg = new TealRegistry({
            entries: [noProvEntry],
            provenance: { require_signatures: true, trusted_signers: [trustedSigner] },
            supply_chain: { block_below: false },
          });

          const result = await reg.evaluate({ model: noProvEntry.id }, ctx, {});
          expect(result.action).toBe(DecisionAction.DENY);
          expect(result.reason_codes).toContain(ReasonCode.PROVENANCE_SIGNATURE_MISSING);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('untrusted signer + required signatures → DENY + PROVENANCE_VERIFICATION_FAILED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEntry().filter((e) => e.catalog === 'tools'),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        arbCtx(),
        async (entry, signer, trustedSigner, ctx) => {
          fc.pre(signer !== trustedSigner);

          const withProv = {
            ...entry,
            provenance: {
              signature: 'sig',
              signer,
              algorithm: 'ed25519' as const,
              signed_at: Date.now(),
            },
          };

          const reg = new TealRegistry({
            entries: [withProv],
            provenance: { require_signatures: true, trusted_signers: [trustedSigner] },
            supply_chain: { block_below: false },
          });

          const result = await reg.evaluate({ tool: withProv.id }, ctx, {});
          expect(result.action).toBe(DecisionAction.DENY);
          expect(result.reason_codes).toContain(ReasonCode.PROVENANCE_VERIFICATION_FAILED);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Property 23: Supply chain scoring determinism and threshold ──

describe('Property 23: Supply chain scoring determinism and threshold', () => {
  /**
   * **Validates: Requirements FR-11.1, FR-11.2, FR-11.3**
   *
   * Score computed twice on same metadata = identical results.
   * Score below min_score → DENY with SUPPLY_CHAIN_SCORE_LOW or SUPPLY_CHAIN_UNMAINTAINED.
   */
  it('same metadata → identical score', () => {
    const arbSignals = fc.record({
      maintainer_activity: fc.integer({ min: 0, max: 100 }),
      known_vulnerabilities: fc.integer({ min: 0, max: 100 }),
      update_frequency: fc.integer({ min: 0, max: 100 }),
      signature_present: fc.boolean(),
    });

    fc.assert(
      fc.property(arbEntry(), arbSignals, (entry, signals) => {
        const withMeta = { ...entry, metadata: { ...signals } };
        const reg = new TealRegistry({ entries: [] });
        const s1 = reg.scoreSupplyChain(withMeta);
        const s2 = reg.scoreSupplyChain(withMeta);
        expect(s1.overall).toBe(s2.overall);
        expect(s1.signals).toEqual(s2.signals);
      }),
      { numRuns: 100 },
    );
  });

  it('score below min_score → DENY', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEntry().filter((e) => e.catalog === 'models'),
        arbCtx(),
        async (entry, ctx) => {
          const noScoreEntry = { ...entry, metadata: {} };
          delete (noScoreEntry as Partial<RegistryEntry>).supply_chain_score;

          const reg = new TealRegistry({
            entries: [noScoreEntry],
            supply_chain: { min_score: 50, block_below: true },
          });

          const result = await reg.evaluate({ model: noScoreEntry.id }, ctx, {});
          expect(result.action).toBe(DecisionAction.DENY);
          expect(
            result.reason_codes.includes(ReasonCode.SUPPLY_CHAIN_SCORE_LOW) ||
            result.reason_codes.includes(ReasonCode.SUPPLY_CHAIN_UNMAINTAINED),
          ).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
