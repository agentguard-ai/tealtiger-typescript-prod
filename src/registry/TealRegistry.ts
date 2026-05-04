/**
 * TealRegistry Module
 *
 * Implements model/tool/detector/policy catalog lookups, provenance
 * verification, and supply chain scoring as a TealModule.
 *
 * @module registry/TealRegistry
 */

import { createHash } from 'crypto';
import { DecisionAction, ReasonCode } from '../core/engine/types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
} from '../core/engine/v1.2/types';
import type {
  CatalogType,
  RegistryEntry,
  ProvenanceResult,
  SupplyChainScore,
  TealRegistryConfig,
} from './types';

/**
 * Build a deterministic map key for a registry entry.
 * Models use `catalog:id:env`, everything else uses `catalog:id`.
 */
function entryKey(catalog: CatalogType, id: string, env?: string): string {
  if (catalog === 'models' && env) {
    return `${catalog}:${id}:${env}`;
  }
  return `${catalog}:${id}`;
}

export class TealRegistry implements TealModule {
  readonly name = 'TealRegistry';
  readonly version = '1.2.0';

  private readonly entries: Map<string, RegistryEntry> = new Map();
  private readonly allEntries: RegistryEntry[] = [];
  private readonly requireSignatures: boolean;
  private readonly trustedSigners: string[];
  private readonly minScore: number;
  private readonly blockBelow: boolean;

  constructor(config: TealRegistryConfig) {
    this.requireSignatures = config.provenance?.require_signatures ?? false;
    this.trustedSigners = config.provenance?.trusted_signers ?? [];
    this.minScore = config.supply_chain?.min_score ?? 50;
    this.blockBelow = config.supply_chain?.block_below ?? true;

    for (const entry of config.entries ?? []) {
      this.allEntries.push(entry);
      // For models, store both with and without env for flexible lookup
      const key = entryKey(entry.catalog, entry.id, entry.environment);
      this.entries.set(key, entry);
      // Also store without env so lookupModel(id) without env can find it
      if (entry.catalog === 'models' && entry.environment) {
        const baseKey = entryKey(entry.catalog, entry.id);
        if (!this.entries.has(baseKey)) {
          this.entries.set(baseKey, entry);
        }
      }
    }
  }

  // ── TealModule interface ─────────────────────────────────────

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult> {
    const reasonCodes: string[] = [];
    const registryRefs: Array<{ catalog: string; entry_id: string; version: string; hash: string }> = [];
    const policyObj = (policy ?? {}) as Record<string, unknown>;

    // Check model allowlist
    if (request.model) {
      const env = (request as Record<string, unknown>).environment as string | undefined;
      const entry = this.lookupModel(request.model, env);
      if (!entry) {
        return {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.MODEL_NOT_ALLOWLISTED],
          event_type: 'registry.model_denied',
          metadata: { model: request.model, registry_refs: registryRefs },
        };
      }
      registryRefs.push({
        catalog: entry.catalog,
        entry_id: entry.id,
        version: entry.version,
        hash: entry.hash,
      });

      // Provenance check for model entry
      const provDeny = this.checkProvenance(entry, policyObj);
      if (provDeny) return provDeny;

      // Supply chain check for model entry
      const scDeny = this.checkSupplyChain(entry, policyObj);
      if (scDeny) return scDeny;
    }

    // Check tool allowlist
    if (request.tool) {
      const entry = this.lookupTool(request.tool);
      if (!entry) {
        return {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWLISTED],
          event_type: 'registry.tool_denied',
          metadata: { tool: request.tool, registry_refs: registryRefs },
        };
      }
      registryRefs.push({
        catalog: entry.catalog,
        entry_id: entry.id,
        version: entry.version,
        hash: entry.hash,
      });

      // Provenance check for tool entry
      const provDeny = this.checkProvenance(entry, policyObj);
      if (provDeny) return provDeny;

      // Supply chain check for tool entry
      const scDeny = this.checkSupplyChain(entry, policyObj);
      if (scDeny) return scDeny;
    }

    if (reasonCodes.length === 0) {
      reasonCodes.push(ReasonCode.POLICY_COMPLIANT);
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: reasonCodes,
      event_type: 'registry.evaluate',
      metadata: { registry_refs: registryRefs },
    };
  }

  // ── Catalog Lookups ──────────────────────────────────────────

  lookupModel(modelId: string, env?: string): RegistryEntry | undefined {
    if (env) {
      const entry = this.entries.get(entryKey('models', modelId, env));
      if (entry) return entry;
    }
    return this.entries.get(entryKey('models', modelId));
  }

  lookupTool(toolId: string): RegistryEntry | undefined {
    return this.entries.get(entryKey('tools', toolId));
  }

  lookupDetector(detectorId: string): RegistryEntry | undefined {
    return this.entries.get(entryKey('detectors', detectorId));
  }

  lookupPolicy(policyId: string): RegistryEntry | undefined {
    return this.entries.get(entryKey('policies', policyId));
  }

  getAllEntries(catalog?: CatalogType): RegistryEntry[] {
    if (!catalog) return [...this.allEntries];
    return this.allEntries.filter((e) => e.catalog === catalog);
  }

  // ── Hashing ──────────────────────────────────────────────────

  getEntryHash(entry: RegistryEntry): string {
    const content = JSON.stringify({
      id: entry.id,
      catalog: entry.catalog,
      version: entry.version,
      environment: entry.environment,
      metadata: entry.metadata,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    });
    return createHash('sha256').update(content).digest('hex');
  }

  // ── Provenance Verification ──────────────────────────────────

  verifyProvenance(entry: RegistryEntry, trustedSigners: string[]): ProvenanceResult {
    if (!entry.provenance) {
      return { valid: false, reason: 'PROVENANCE_SIGNATURE_MISSING' };
    }
    if (!trustedSigners.includes(entry.provenance.signer)) {
      return { valid: false, reason: 'PROVENANCE_VERIFICATION_FAILED' };
    }
    return { valid: true, signer: entry.provenance.signer };
  }

  // ── Supply Chain Scoring ─────────────────────────────────────

  scoreSupplyChain(entry: RegistryEntry): SupplyChainScore {
    // Return pre-computed score if present
    if (entry.supply_chain_score) {
      return entry.supply_chain_score;
    }

    const meta = entry.metadata as Record<string, unknown>;
    const maintainer = typeof meta.maintainer_activity === 'number' ? meta.maintainer_activity as number : 0;
    const vulns = typeof meta.known_vulnerabilities === 'number' ? meta.known_vulnerabilities as number : 0;
    const freq = typeof meta.update_frequency === 'number' ? meta.update_frequency as number : 0;
    const sigPresent = typeof meta.signature_present === 'boolean' ? meta.signature_present as boolean : false;

    const hasAnySignal =
      typeof meta.maintainer_activity === 'number' ||
      typeof meta.known_vulnerabilities === 'number' ||
      typeof meta.update_frequency === 'number' ||
      typeof meta.signature_present === 'boolean';

    if (!hasAnySignal) {
      return {
        overall: 0,
        signals: {
          maintainer_activity: 0,
          known_vulnerabilities: 0,
          update_frequency: 0,
          signature_present: false,
        },
        computed_at: Date.now(),
      };
    }

    const overall =
      maintainer * 0.3 +
      vulns * 0.3 +
      freq * 0.2 +
      (sigPresent ? 20 : 0);

    return {
      overall: Math.round(overall * 100) / 100,
      signals: {
        maintainer_activity: maintainer,
        known_vulnerabilities: vulns,
        update_frequency: freq,
        signature_present: sigPresent,
      },
      computed_at: Date.now(),
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private checkProvenance(
    entry: RegistryEntry,
    policyObj: Record<string, unknown>,
  ): ModuleResult | undefined {
    const requireSigs = (policyObj.require_signatures as boolean | undefined) ?? this.requireSignatures;
    if (!requireSigs) return undefined;

    const signers = (policyObj.trusted_signers as string[] | undefined) ?? this.trustedSigners;
    const result = this.verifyProvenance(entry, signers);
    if (!result.valid) {
      const reasonCode = result.reason === 'PROVENANCE_SIGNATURE_MISSING'
        ? ReasonCode.PROVENANCE_SIGNATURE_MISSING
        : ReasonCode.PROVENANCE_VERIFICATION_FAILED;
      return {
        action: DecisionAction.DENY,
        reason_codes: [reasonCode],
        event_type: 'registry.provenance_denied',
        metadata: { entry_id: entry.id, provenance_reason: result.reason },
      };
    }
    return undefined;
  }

  private checkSupplyChain(
    entry: RegistryEntry,
    _policyObj: Record<string, unknown>,
  ): ModuleResult | undefined {
    if (!this.blockBelow) return undefined;

    const score = this.scoreSupplyChain(entry);
    if (score.overall < this.minScore) {
      const reasonCode = score.overall === 0
        ? ReasonCode.SUPPLY_CHAIN_UNMAINTAINED
        : ReasonCode.SUPPLY_CHAIN_SCORE_LOW;
      return {
        action: DecisionAction.DENY,
        reason_codes: [reasonCode],
        event_type: 'registry.supply_chain_denied',
        metadata: { entry_id: entry.id, score: score.overall, min_score: this.minScore },
      };
    }
    return undefined;
  }
}
