/**
 * TEEC v2.0.0 — Typed Evidence & Evidence Contract
 *
 * Evolves the TEEC envelope from v0.1.0 → v2.0.0 (breaking: adds proof fields,
 * NHI identity, provenance, verification_level, cost evidence). Every envelope
 * carries `teec_version: "2.0.0"`.
 *
 * All v0.1.0 fields are preserved with identical semantics.
 *
 * @module core/engine/v1.3/teec-v2
 * @requirements 5.1, 5.6, 11.6, 17.14
 */

// ── Source Class (provenance trust tiers) ────────────────────────

/**
 * Source class for memory write provenance tagging.
 * Trust level is determined by the minimum across all sources in lineage.
 */
export type SourceClass =
  | 'direct_user'
  | 'model_inference'
  | 'tool_output_internal'
  | 'tool_output_external'
  | 'untrusted_document';

// ── Automation Level ─────────────────────────────────────────────

/**
 * Automation level metadata field on policy rules.
 * Determines the degree of autonomy for an action category.
 */
export type AutomationLevel =
  | 'auto_deny'
  | 'auto_sanitize'
  | 'auto_allow'
  | 'approval_required';

// ── Verification Level ───────────────────────────────────────────

/**
 * Three explicit verification levels for governance proof verification.
 *
 * - LEVEL_1_INTEGRITY: Receipt is cryptographically valid
 * - LEVEL_2_SUFFICIENCY: Receipt + trace + policy confirmed
 * - LEVEL_3_APPROPRIATENESS: Receipt + trace + policy + business context verified
 */
export type VerificationLevel =
  | 'LEVEL_1_INTEGRITY'
  | 'LEVEL_2_SUFFICIENCY'
  | 'LEVEL_3_APPROPRIATENESS';

// ── TEEC v2.0.0 Sub-Structures ──────────────────────────────────

/**
 * NHI identity information embedded in the TEEC envelope.
 * Identifies the non-human identity (AI agent) that triggered the governance decision.
 */
export interface TEECNHIIdentity {
  /** Unique agent identifier */
  agent_id: string;
  /** Owner of the agent identity */
  owner: string;
  /** Current NHI status at time of decision */
  status: string;
}

/**
 * Cryptographic proof reference embedded in the TEEC envelope.
 * Links the decision to the Merkle tree proof chain.
 */
export interface TEECProof {
  /** Position of this decision in the Merkle tree */
  leaf_index: number;
  /** SHA-256 hash of the decision (decision + context + timestamp + policy_version + prev_hash) */
  decision_hash: string;
  /** Current Merkle tree root at time of decision (if available) */
  merkle_root?: string;
  /** Reference to the RFC 3161 timestamp anchor (if anchored) */
  anchor_ref?: string;
}

/**
 * Provenance information tracking the trust lineage of the governed content.
 */
export interface TEECProvenance {
  /** Source class of the content being governed */
  source_class: SourceClass;
  /** Lineage chain showing trust propagation path */
  lineage: string[];
}

/**
 * Cost evidence for FinOps governance tracking.
 * Included when cost governance is active.
 */
export interface TEECCostEvidence {
  /** Estimated cost of the governed operation */
  estimated_cost: number;
  /** Configured budget limit for this scope */
  budget_limit: number;
  /** Remaining budget after this operation */
  remaining_budget: number;
  /** Reasoning tokens consumed (for models with extended thinking) */
  reasoning_tokens?: number;
}

/**
 * Workload identity binding for separation of duties.
 * Ties the governance decision to a specific application deployment context.
 */
export interface TEECWorkloadIdentity {
  /** Application identifier */
  app_id: string;
  /** Deployment environment (e.g., 'production', 'staging', 'development') */
  environment: string;
  /** Tenant identifier for multi-tenant deployments */
  tenant_id: string;
}

// ── TEEC v2.0.0 Evidence Envelope ────────────────────────────────

/**
 * TEEC v2.0.0 Evidence Envelope
 *
 * The canonical evidence record produced by TealEngine v1.3 for every
 * governance decision. Extends the v0.1.0 envelope with NHI identity,
 * cryptographic proof, provenance, verification level, cost evidence,
 * automation level, OWASP mapping, and workload identity.
 *
 * ## Preserved from v0.1.0 (same semantics):
 * - teec_version: Schema version identifier
 * - correlation_id: Links to originating agent request trace
 * - timestamp: Unix millisecond timestamp of the decision
 * - event_type: TEEC-registered event type classification
 * - decision_action: The governance action taken (ALLOW, DENY, MODIFY, etc.)
 * - reason_codes: Array of reason codes explaining the decision
 * - policy_version: Version of the policy bundle that produced this decision
 * - risk_score: Numeric risk assessment (0–100)
 * - module: Name of the originating governance module
 *
 * ## New in v2.0.0:
 * - nhi_identity: Non-human identity context
 * - proof: Cryptographic proof chain reference
 * - provenance: Content trust lineage
 * - verification_level: Declared verification level
 * - cost_evidence: FinOps cost tracking
 * - automation_level: Policy automation classification
 * - control_id: Hierarchical control identifier (DIM.CATEGORY.SUBCATEGORY.CONTROL)
 * - owasp_category: OWASP category mapping (e.g., 'LLM06')
 * - governance_bundle_hash: SHA-256 hash of the active governance bundle
 * - workload_identity: Application deployment context binding
 */
export interface TEECEnvelopeV2 {
  // ── Preserved from v0.1.0 (same semantics) ──────────────────

  /** TEEC schema version — always '2.0.0' for this envelope */
  teec_version: '2.0.0';

  /** Correlation ID linking to the originating agent request trace */
  correlation_id: string;

  /** Unix millisecond timestamp of the governance decision */
  timestamp: number;

  /** TEEC-registered event type classification */
  event_type: string;

  /** The governance action taken (e.g., 'ALLOW', 'DENY', 'MODIFY') */
  decision_action: string;

  /** Array of reason codes explaining the decision */
  reason_codes: string[];

  /** Semantic version of the policy bundle that produced this decision */
  policy_version: string;

  /** Numeric risk assessment score (0–100 inclusive) */
  risk_score: number;

  /** Name of the originating governance module */
  module: string;

  // ── New in v2.0.0 ───────────────────────────────────────────

  /** NHI identity context — identifies the AI agent principal */
  nhi_identity?: TEECNHIIdentity;

  /** Cryptographic proof chain reference for tamper-evident audit */
  proof?: TEECProof;

  /** Content trust provenance and lineage */
  provenance?: TEECProvenance;

  /** Declared verification level for this decision's proof */
  verification_level?: VerificationLevel;

  /** FinOps cost evidence for budget governance */
  cost_evidence?: TEECCostEvidence;

  /** Automation level that determined the decision pathway */
  automation_level?: AutomationLevel;

  /** Hierarchical control identifier (DIM.CATEGORY.SUBCATEGORY.CONTROL) */
  control_id?: string;

  /** OWASP category identifier (e.g., 'LLM06', 'AGENTIC-01') */
  owasp_category?: string;

  /** SHA-256 hash of the active governance bundle at decision time */
  governance_bundle_hash?: string;

  /** Workload identity binding for separation of duties */
  workload_identity?: TEECWorkloadIdentity;
}

// ── Factory / Utility ────────────────────────────────────────────

/**
 * Creates a minimal valid TEEC v2.0.0 envelope with required fields.
 * Optional v2.0.0 fields default to undefined.
 */
export function createTEECEnvelopeV2(params: {
  correlation_id: string;
  timestamp: number;
  event_type: string;
  decision_action: string;
  reason_codes: string[];
  policy_version: string;
  risk_score: number;
  module: string;
}): TEECEnvelopeV2 {
  return {
    teec_version: '2.0.0',
    correlation_id: params.correlation_id,
    timestamp: params.timestamp,
    event_type: params.event_type,
    decision_action: params.decision_action,
    reason_codes: params.reason_codes,
    policy_version: params.policy_version,
    risk_score: params.risk_score,
    module: params.module,
  };
}

/**
 * Type guard to check if an object is a valid TEEC v2.0.0 envelope.
 * Validates presence and types of all required fields.
 */
export function isTEECEnvelopeV2(obj: unknown): obj is TEECEnvelopeV2 {
  if (typeof obj !== 'object' || obj === null) return false;

  const envelope = obj as Record<string, unknown>;

  return (
    envelope.teec_version === '2.0.0' &&
    typeof envelope.correlation_id === 'string' &&
    typeof envelope.timestamp === 'number' &&
    typeof envelope.event_type === 'string' &&
    typeof envelope.decision_action === 'string' &&
    Array.isArray(envelope.reason_codes) &&
    envelope.reason_codes.every((c: unknown) => typeof c === 'string') &&
    typeof envelope.policy_version === 'string' &&
    typeof envelope.risk_score === 'number' &&
    envelope.risk_score >= 0 &&
    envelope.risk_score <= 100 &&
    typeof envelope.module === 'string'
  );
}
