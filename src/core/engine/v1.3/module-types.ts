/**
 * TealTiger v1.3 — Module-Specific Interfaces
 *
 * Defines interfaces for all new governance modules introduced in v1.3:
 * - TealDrift: Behavioral drift detection
 * - TealState: Context and state governance
 * - TealTemporal: Session and time governance
 * - TealMonitor v2: Enhanced cost governance
 * - TealClassifier: Lightweight ML detection
 * - TealProof: Cryptographic governance receipts
 * - TealFlow: Declarative governance workflows
 *
 * @module core/engine/v1.3/module-types
 */

// ══════════════════════════════════════════════════════════════════
// TealDrift — Behavioral Drift Detection
// ══════════════════════════════════════════════════════════════════

/**
 * Rolling statistics for a single metric, used for baseline tracking.
 */
export interface RollingStats {
  mean: number;
  variance: number;
  count: number;
}

/**
 * Statistical baseline for an agent/provider/model combination.
 * Used to detect behavioral drift over time.
 */
export interface DriftBaseline {
  agent_id: string;
  provider: string;
  model: string;
  metrics: {
    refusal_rate: RollingStats;
    response_length: RollingStats;
    topic_distribution: Map<string, number>;
  };
  sample_count: number;
  last_updated: number;
}

/**
 * Configuration for the TealDrift module.
 */
export interface DriftConfig {
  /** Number of requests used to establish the baseline window. */
  baseline_window: number;
  /** Standard deviations beyond which drift is flagged. Default: 3. */
  threshold_sigma: number;
  /** Minimum samples required before alerting. */
  min_samples: number;
}

/**
 * A single observation submitted to the drift detection module.
 */
export interface DriftObservation {
  agent_id: string;
  provider: string;
  model: string;
  refusal: boolean;
  response_length: number;
  topics: string[];
}

// ══════════════════════════════════════════════════════════════════
// TealState — Context and State Governance
// ══════════════════════════════════════════════════════════════════

/**
 * Trust tier classification for context entries.
 * Determines the level of trust assigned to content based on its origin.
 */
export type TrustTier =
  | 'direct_user'
  | 'model_inference'
  | 'tool_output_internal'
  | 'tool_output_external'
  | 'untrusted_document';

/**
 * Configuration for the TealState module.
 */
export interface StateConfig {
  /** Maximum context size (tokens/bytes) per agent. */
  max_context_size: number;
  /** Action to take when context size is exceeded. */
  on_exceed: 'truncate' | 'deny' | 'alert';
  /** Whether to track provenance metadata for context entries. */
  track_provenance: boolean;
  /** Whether to log/block unauthorized state changes. */
  mutation_governance: boolean;
}

/**
 * A single entry in the agent's context window.
 */
export interface ContextEntry {
  content: string;
  source: string;
  timestamp: number;
  trust_tier: TrustTier;
}

// ══════════════════════════════════════════════════════════════════
// TealTemporal — Session and Time Governance
// ══════════════════════════════════════════════════════════════════

/**
 * Configuration for the TealTemporal module.
 */
export interface TemporalConfig {
  /** Session time-to-live in milliseconds. */
  session_ttl_ms: number;
  /** Cooldown rules between high-impact actions. */
  cooldown_rules: CooldownRule[];
  /** Time-of-day restrictions for action classes. */
  time_restrictions: TimeRestriction[];
  /** Percentage of TTL at which to emit SESSION_AGE_WARNING (0-100). */
  age_warning_threshold: number;
}

/**
 * Defines a minimum interval between executions of a given action class.
 */
export interface CooldownRule {
  action_class: string;
  min_interval_ms: number;
}

/**
 * Restricts an action class to specific hours and days.
 */
export interface TimeRestriction {
  action_class: string;
  allowed_hours: { start: number; end: number };
  timezone: string;
  allowed_days: number[];
}

// ══════════════════════════════════════════════════════════════════
// TealMonitor v2 — Enhanced Cost Governance
// ══════════════════════════════════════════════════════════════════

/**
 * Configuration for TealMonitor v2 cost governance.
 * Governance limits take precedence over application-level limits.
 */
export interface CostGovernanceConfig {
  /** Governance-owned cost limits (from bundle, overrides app config). */
  governance_limits?: {
    per_request_max: number;
    per_session_max: number;
    per_daily_max: number;
    per_agent_max: number;
    reasoning_token_budget?: number;
  };
  /** Anomaly detection configuration. */
  anomaly: {
    baseline_window: number;
    spike_multiplier: number;
    growth_rate_threshold: number;
  };
  /** Cost attribution configuration. */
  attribution: {
    emit_format: 'json';
    include_agent_id: boolean;
    include_workflow_id: boolean;
  };
}

// ══════════════════════════════════════════════════════════════════
// TealClassifier — Lightweight ML Detection
// ══════════════════════════════════════════════════════════════════

/**
 * Ensemble mode determining how regex and ML classifier signals are combined.
 */
export type EnsembleMode =
  | 'regex_only'
  | 'ml_only'
  | 'ensemble_union'
  | 'ensemble_intersection';

/**
 * Configuration for the TealClassifier module.
 */
export interface ClassifierConfig {
  /** Path to the ONNX model artifact. */
  model_path: string;
  /** How regex and ML signals are combined. Default: 'regex_only'. */
  ensemble_mode: EnsembleMode;
  /** Confidence threshold for detection. Default: 0.5. */
  confidence_threshold: number;
  /** Maximum input tokens for inference. Default: 512. */
  max_tokens: number;
}

/**
 * Result of a classification operation.
 */
export interface ClassifierResult {
  detected: boolean;
  confidence: number;
  source: 'regex' | 'ml' | 'ensemble';
}

// ══════════════════════════════════════════════════════════════════
// TealProof — Cryptographic Governance Receipts
// ══════════════════════════════════════════════════════════════════

/**
 * A cryptographic receipt for a single governance decision.
 * Forms a leaf in the Merkle tree proof chain.
 */
export interface GovernanceReceipt {
  leaf_index: number;
  /** SHA-256(decision + context + timestamp + policy_version + prev_hash) */
  decision_hash: string;
  previous_hash: string;
  timestamp: number;
  policy_version: string;
  correlation_id: string;
  /** Sibling hashes for Merkle proof verification. */
  merkle_proof: string[];
}

/**
 * Merkle tree interface for organizing governance decision hashes.
 */
export interface MerkleTree {
  /** Returns the current Merkle root hash. */
  root(): string;
  /** Appends a leaf hash and returns its index. */
  append(leaf: string): number;
  /** Returns the sibling hashes needed to verify a leaf at the given index. */
  getProof(leafIndex: number): string[];
  /** Verifies that a leaf is included in a tree with the given root. */
  verify(leaf: string, proof: string[], root: string): boolean;
}

/**
 * An RFC 3161 timestamp anchor for a Merkle root.
 */
export interface RFC3161Anchor {
  merkle_root: string;
  /** RFC 3161 TSA response token. */
  timestamp_token: Uint8Array;
  anchored_at: number;
}

/**
 * A compact cryptographic summary of an agent's governance history.
 */
export interface GovernancePassport {
  agent_id: string;
  period: { start: number; end: number };
  decision_count: number;
  merkle_root: string;
  anchor_refs: RFC3161Anchor[];
  compliance_summary: { allow: number; deny: number; modify: number };
}

/**
 * Verification levels for governance proof validation.
 */
export type VerificationLevel =
  | 'LEVEL_1_INTEGRITY'
  | 'LEVEL_2_SUFFICIENCY'
  | 'LEVEL_3_APPROPRIATENESS';

/**
 * Verification status codes returned by the Verification SDK.
 */
export type VerificationStatus =
  | 'VERIFIED'
  | 'PROOF_POLICY_MISMATCH'
  | 'PROOF_ATTRIBUTE_INTEGRITY_FAILED'
  | 'PROOF_COVERAGE_INCOMPLETE'
  | 'POLICY_STALENESS_WARNING'
  | 'INTEGRITY_VERIFIED_CONTEXT_UNRESOLVABLE';

/**
 * Result of a governance proof verification operation.
 */
export interface VerificationResult {
  level: VerificationLevel;
  status: VerificationStatus;
  details: string;
}

// ══════════════════════════════════════════════════════════════════
// TealFlow — Declarative Governance Workflows
// ══════════════════════════════════════════════════════════════════

/**
 * Trigger configuration for a TealFlow workflow.
 */
export interface TriggerConfig {
  agent_action?: {
    types: string[];
    risk_score_above?: number;
  };
  schedule?: {
    cron: string;
  };
  workflow_dispatch?: Record<string, never>;
  policy_violation?: {
    reason_codes?: string[];
    severity?: string[];
  };
}

/**
 * A single step within a TealFlow job.
 */
export interface Step {
  name: string;
  uses?: string;
  with?: Record<string, unknown>;
  if?: string;
  env?: Record<string, string>;
  run?: string;
}

/**
 * A job within a TealFlow workflow, containing ordered steps.
 */
export interface Job {
  needs?: string[];
  if?: string;
  steps: Step[];
  env?: Record<string, string>;
}

/**
 * A complete TealFlow workflow definition.
 */
export interface TealFlowWorkflow {
  name: string;
  on: TriggerConfig;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
}

/**
 * Context available during TealFlow workflow execution.
 */
export interface FlowContext {
  event: Record<string, unknown>;
  env: Record<string, string>;
  secrets: Record<string, string>;
}

/**
 * Result of a TealFlow workflow execution.
 */
export interface FlowResult {
  success: boolean;
  jobs_completed: string[];
  jobs_failed: string[];
  outputs: Record<string, unknown>;
}
