/**
 * TealRegistry Module — Types
 *
 * All TealRegistry-specific types for catalog entries, provenance
 * verification, and supply chain scoring.
 *
 * @module registry/types
 */

// ── Catalog Types ────────────────────────────────────────────────

export type CatalogType = 'models' | 'tools' | 'detectors' | 'policies';

// ── Provenance ───────────────────────────────────────────────────

export interface ProvenanceMetadata {
  signature: string;
  signer: string;
  algorithm: 'ed25519' | 'ecdsa-p256';
  signed_at: number;
  attestation_uri?: string;
}

export interface ProvenanceResult {
  valid: boolean;
  signer?: string;
  reason?: string;
}

// ── Supply Chain ─────────────────────────────────────────────────

export interface SupplyChainScore {
  overall: number;
  signals: {
    maintainer_activity: number;
    known_vulnerabilities: number;
    update_frequency: number;
    signature_present: boolean;
  };
  computed_at: number;
}

// ── Registry Entry ───────────────────────────────────────────────

export interface RegistryEntry {
  id: string;
  catalog: CatalogType;
  version: string;
  hash: string;
  environment?: string;
  metadata: Record<string, unknown>;
  provenance?: ProvenanceMetadata;
  supply_chain_score?: SupplyChainScore;
  created_at: number;
  updated_at: number;
}

// ── Config ───────────────────────────────────────────────────────

export interface TealRegistryConfig {
  entries?: RegistryEntry[];
  provenance?: {
    require_signatures?: boolean;
    trusted_signers?: string[];
  };
  supply_chain?: {
    min_score?: number;
    block_below?: boolean;
  };
}
