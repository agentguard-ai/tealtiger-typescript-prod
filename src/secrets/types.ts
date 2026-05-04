/**
 * TealSecrets Module — Types
 *
 * All TealSecrets-specific types for secret detection, confidence scoring,
 * caching, credential TTL, and policy enforcement.
 *
 * @module secrets/types
 */

// ── Secret Categories ────────────────────────────────────────────

export type SecretCategory =
  | 'cloud'
  | 'vcs'
  | 'ai_provider'
  | 'database'
  | 'payments'
  | 'saas'
  | 'infrastructure'
  | 'generic_key'
  | 'custom';

// ── Severity ─────────────────────────────────────────────────────

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

// ── Detector Pattern ─────────────────────────────────────────────

export interface SecretPattern {
  id: string;
  regex: RegExp;
  category: SecretCategory;
  severity: Severity;
  description: string;
}

// ── Content Location ─────────────────────────────────────────────

export interface ContentLocation {
  offset: number;
  length: number;
  line: number;
  column: number;
}

// ── Confidence Signals ───────────────────────────────────────────

export interface ConfidenceSignals {
  entropy_score: number;
  structural_match: number;
  context_proximity: number;
  fp_risk: number;
}

// ── Secret Finding (extended from core) ──────────────────────────

export interface SecretFindingFull {
  finding_id: string;
  type: string;
  category: SecretCategory;
  confidence: number;
  severity: Severity;
  fingerprint: string;
  evidence_signals: ConfidenceSignals;
  location: ContentLocation;
}

// ── Cache Options ────────────────────────────────────────────────

export interface CacheOptions {
  enabled: boolean;
  maxEntries: number;
  ttlMs: number;
}

// ── Credential TTL ───────────────────────────────────────────────

export interface CredentialMetadata {
  type: string;
  issued_at?: number;
  expires_at?: number;
  age_ms?: number;
  policy_max_ttl_ms: number;
}

// ── TealSecrets Policy ──────────────────────────────────────────

export interface TealSecretsPolicy {
  enabled: boolean;
  action: 'DENY' | 'REDACT' | 'MONITOR' | 'REQUIRE_APPROVAL';
  confidence_threshold: number;
  perfBudgetMs?: number;
  cache?: CacheOptions;
  credential_ttl?: {
    max_ttl_ms: number;
    warning_threshold?: number; // 0..1, default 0.8
  };
}
