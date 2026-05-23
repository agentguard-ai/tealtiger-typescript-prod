/**
 * TealEngine v1.3 — Core Types
 *
 * Extends the v1.2 type surface with governance bundle types: automation levels,
 * NHI governance, FREEZE rules, PLAN_ONLY mode, Zero Standing Privilege,
 * agent attestation, policy bundles, and governance provider interfaces.
 *
 * All v1.2 types are preserved; nothing is removed or renamed.
 * When no v1.3-specific features are configured, behavior is identical to v1.2.
 *
 * @module core/engine/v1.3/types
 */

import {
  Decision,
  ModuleEvaluationRequest,
  ModuleContext,
  TealModule,
} from '../v1.2/types';
import { TealEngineV12Options } from '../v1.2/TealEngineV12';

// ── Re-exports for convenience ───────────────────────────────────

export type { Decision, ModuleEvaluationRequest, ModuleContext, TealModule };
export type { TealEngineV12Options };

// ── Automation Levels (Requirement 1) ────────────────────────────

/**
 * Automation level metadata field on policy rules.
 * Determines the degree of autonomy for an action category.
 */
export type AutomationLevel =
  | 'auto_deny'
  | 'auto_sanitize'
  | 'auto_allow'
  | 'approval_required';

/**
 * Policy matcher for rule conditions.
 * Matches against action class, tool name, agent identity, etc.
 */
export interface PolicyMatcher {
  /** Action class to match (e.g., 'CODE_CHANGE', 'TOOL_INVOKE') */
  action_class?: string;
  /** Tool name pattern (glob or exact) */
  tool?: string;
  /** Agent ID pattern */
  agent_id?: string;
  /** Environment pattern */
  environment?: string;
  /** Model pattern */
  model?: string;
  /** Risk score threshold (match if risk_score >= threshold) */
  risk_score_above?: number;
  /** Custom attribute matchers */
  attributes?: Record<string, unknown>;
}

/**
 * Rule mapping a policy matcher to an automation level.
 */
export interface AutomationLevelRule {
  /** Condition to match against the governance request */
  match: PolicyMatcher;
  /** Automation level to apply when matched */
  automation_level: AutomationLevel;
}

/**
 * Configuration for automation level rules.
 */
export interface AutomationLevelConfig {
  /** Default automation level when no rule matches */
  default_level?: AutomationLevel;
  /** Ordered list of automation level rules (first match wins) */
  rules: AutomationLevelRule[];
}

/**
 * Decision extension for approval_required automation level.
 * Returned when an action requires external approval before proceeding.
 * Uses Omit to override the action field type since 'PENDING' is new in v1.3.
 */
export interface PendingDecision extends Omit<Decision, 'action'> {
  /** PENDING action — blocks execution until external approval */
  action: 'PENDING';
  /** Indicates this decision requires external approval */
  requires_approval: true;
  /** Opaque token used to approve or reject the pending action */
  approval_token: string;
  /** Unix ms timestamp after which the approval expires */
  expires_at: number;
}

// ── NHI Governance (Requirement 2) ───────────────────────────────

/**
 * Non-Human Identity descriptor.
 * Represents an AI agent or automated system as a principal with
 * identity, ownership, scope, and revocation lifecycle.
 */
export interface NHIDescriptor {
  /** Unique agent identifier */
  agent_id: string;
  /** Owner of the agent (team, user, or org) */
  owner: string;
  /** Unix ms timestamp of agent creation */
  created_at: number;
  /** Scoped capabilities (e.g., ['read:memory', 'invoke:tool:search']) */
  capability_scope: string[];
  /** Environments the agent may operate in (e.g., ['production', 'staging']) */
  environment_constraints: string[];
  /** Current lifecycle status */
  status: 'active' | 'suspended' | 'revoked';
}

/**
 * NHI Inventory — registry of all agent identities.
 */
export interface NHIInventory {
  /** Map of agent_id → NHIDescriptor */
  agents: Map<string, NHIDescriptor>;
  /** Look up an agent by ID */
  lookup(agent_id: string): NHIDescriptor | undefined;
  /** Update the status of an agent */
  updateStatus(agent_id: string, status: NHIDescriptor['status']): void;
}

/**
 * Serializable NHI Inventory schema (for persistence/transport).
 */
export interface NHIInventorySchema {
  version: '1.0.0';
  agents: Array<{
    agent_id: string;
    owner: string;
    created_at: string; // ISO 8601
    capability_scope: string[];
    environment_constraints: string[];
    status: 'active' | 'suspended' | 'revoked';
    attestation_signers?: string[];
    metadata?: Record<string, unknown>;
  }>;
}

// ── FREEZE Rules and PLAN_ONLY Mode (Requirement 4) ─────────────

/**
 * Immutable governance control that blocks specified actions
 * regardless of agent output or policy evaluation.
 */
export interface FreezeRule {
  /** Unique identifier for this FREEZE rule */
  id: string;
  /** Condition to match (action class, tool name, etc.) */
  match: PolicyMatcher;
  /** Human-readable reason for the freeze */
  reason: string;
  /** Unix ms timestamp of rule creation */
  created_at: number;
  /** Identity that created the rule */
  created_by: string;
  /** FREEZE rules are always immutable at runtime */
  immutable: true;
}

/**
 * Configuration for PLAN_ONLY mode.
 * When enabled, all side-effecting actions are denied.
 */
export interface PlanOnlyConfig {
  /** Whether PLAN_ONLY mode is active */
  enabled: boolean;
  /** Action classes treated as side-effecting (denied in PLAN_ONLY) */
  side_effecting_actions: string[];
  /** Action classes treated as read-only/reasoning (allowed in PLAN_ONLY) */
  allowed_actions: string[];
}

// ── Secure Change Governance (Requirement 3) ─────────────────────

/**
 * Attributes for a CODE_CHANGE action.
 */
export interface CodeChangeAttributes {
  /** Target file paths being changed */
  target_paths: string[];
  /** Target branch for the change */
  target_branch: string;
  /** Type of change */
  change_type: 'create' | 'modify' | 'delete';
  /** SHA-256 hash of the diff content */
  diff_hash: string;
}

/**
 * Policy configuration for CODE_CHANGE governance.
 */
export interface CodeChangePolicy {
  /** Glob patterns for allowed file paths */
  path_allowlist: string[];
  /** Allowed target branches */
  branch_allowlist: string[];
  /** Whether two-person approval is required */
  two_person_rule: boolean;
  /** Whether a diff hash must be provided */
  require_diff_hash: boolean;
}

// ── Zero Standing Privilege (Requirement 19) ─────────────────────

/**
 * Configuration for Zero Standing Privilege mode.
 * When enabled, every tool/resource access requires a valid JIT grant.
 */
export interface ZSPConfig {
  /** Whether ZSP is enabled */
  enabled: boolean;
  /** Maximum duration for a JIT grant in milliseconds */
  max_grant_ttl_ms: number;
}

/**
 * Just-In-Time grant for temporary access.
 */
export interface JITGrant {
  /** Unique grant identifier */
  grant_id: string;
  /** Agent receiving the grant */
  agent_id: string;
  /** Tools/resources granted (e.g., ['tool:database', 'resource:secrets']) */
  scope: string[];
  /** Unix ms timestamp when grant was issued */
  issued_at: number;
  /** Unix ms timestamp when grant expires */
  expires_at: number;
  /** Identity that issued the grant */
  issued_by: string;
}

// ── Agent Attestation ────────────────────────────────────────────

/**
 * Configuration for agent attestation verification.
 */
export interface AttestationConfig {
  /** Whether attestation is required */
  required: boolean;
  /** Trusted signers (public keys or key IDs) */
  trusted_signers: string[];
  /** Maximum age of attestation in milliseconds */
  max_attestation_age_ms?: number;
}

/**
 * Agent attestation payload submitted with governance requests.
 */
export interface AgentAttestation {
  /** Agent identifier */
  agent_id: string;
  /** Attestation signature (Ed25519 or similar) */
  signature: string;
  /** Signer identity (public key or key ID) */
  signer: string;
  /** Unix ms timestamp of attestation */
  attested_at: number;
  /** SHA-256 hash of agent code/config for integrity verification */
  integrity_hash: string;
}

// ── Governance Request and Context ───────────────────────────────

/**
 * v1.3 Governance request — extends ModuleEvaluationRequest with
 * action classification, NHI identity, attestation, and JIT grants.
 */
export interface GovernanceRequest extends ModuleEvaluationRequest {
  /** Action class (e.g., 'CODE_CHANGE', 'TOOL_INVOKE', 'MEMORY_WRITE') */
  action_class?: string;
  /** Action-specific attributes */
  action_attributes?: Record<string, unknown>;
  /** NHI identity of the requesting agent */
  nhi_identity?: NHIDescriptor;
  /** Agent attestation for integrity verification */
  attestation?: AgentAttestation;
  /** JIT grant for ZSP access */
  jit_grant?: JITGrant;
}

/**
 * v1.3 Governance context — extends ModuleContext with
 * automation level, NHI identity, environment, and workflow tracking.
 */
export interface GovernanceContext extends ModuleContext {
  /** Resolved automation level for this evaluation */
  automation_level?: AutomationLevel;
  /** NHI identity from the request */
  nhi_identity?: NHIDescriptor;
  /** Current environment (e.g., 'production', 'staging', 'development') */
  environment?: string;
  /** Workflow ID if triggered by TealFlow */
  workflow_id?: string;
}

// ── v1.3 Decision (extends v1.2 Decision) ────────────────────────

/**
 * v1.3 Decision — extends v1.2 Decision with governance bundle fields.
 * All new fields are optional; absence preserves v1.2 behavior.
 */
export interface DecisionV13 extends Decision {
  /** Automation level that produced this decision */
  automation_level?: AutomationLevel;
  /** Pending approval details (when automation_level = 'approval_required') */
  pending?: {
    approval_token: string;
    expires_at: number;
  };
  /** Cryptographic governance receipt */
  proof_receipt?: GovernanceReceipt;
  /** Cost evidence for this decision */
  cost_evidence?: CostEvidence;
  /** NHI context used in evaluation */
  nhi_context?: {
    agent_id: string;
    scope_used: string[];
  };
  /** Control ID in DIM.CATEGORY.SUBCATEGORY.CONTROL format */
  control_id?: string;
  /** OWASP category identifier (e.g., 'LLM06') */
  owasp_category?: string;
}

/**
 * Cost evidence attached to a decision.
 */
export interface CostEvidence {
  /** Estimated cost for this request */
  estimated_cost: number;
  /** Budget limit that applies */
  budget_limit: number;
  /** Remaining budget after this request */
  remaining_budget: number;
  /** Reasoning tokens used (if applicable) */
  reasoning_tokens?: number;
}

/**
 * Governance receipt — cryptographic proof of a policy decision.
 */
export interface GovernanceReceipt {
  /** Position in the Merkle tree */
  leaf_index: number;
  /** SHA-256 hash of decision + context + timestamp + policy_version + prev_hash */
  decision_hash: string;
  /** Hash of the previous decision in the chain */
  previous_hash: string;
  /** Unix ms timestamp of the decision */
  timestamp: number;
  /** Policy version used for evaluation */
  policy_version: string;
  /** Correlation ID linking to the originating request */
  correlation_id: string;
  /** Sibling hashes for Merkle proof verification */
  merkle_proof: string[];
}

// ── Policy Bundle ────────────────────────────────────────────────

/**
 * A complete policy bundle that can be loaded and hot-swapped at runtime.
 */
export interface PolicyBundle {
  /** Bundle version (semver) */
  bundle_version: string;
  /** Required SDK version (semver range, e.g., '^1.3.0') */
  requires_sdk: string;
  /** Required TEEC version (semver range, e.g., '^2.0.0') */
  requires_teec: string;
  /** Capabilities required by this bundle */
  required_capabilities: string[];
  /** SHA-256 hash of bundle contents for integrity verification */
  hash: string;
  /** Optional Ed25519 signature for bundle authentication */
  signature?: string;
  /** Policy rules in this bundle */
  policies: PolicyRule[];
  /** Governance-owned cost limits */
  cost_limits?: GovernanceCostLimits;
  /** FREEZE rules (persist across hot-swaps) */
  freeze_rules?: FreezeRule[];
  /** Behavior when a module fails during evaluation */
  fail_behavior: 'fail_closed' | 'fail_open';
}

/**
 * Governance-owned cost limits (from bundle, overrides app config).
 */
export interface GovernanceCostLimits {
  per_request_max: number;
  per_session_max: number;
  per_daily_max: number;
  per_agent_max: number;
  reasoning_token_budget?: number;
}

/**
 * A single policy rule within a bundle.
 * Control IDs follow the format: DIM.CATEGORY.SUBCATEGORY.CONTROL
 */
export interface PolicyRule {
  /** Unique rule identifier */
  id: string;
  /**
   * Control ID in hierarchical format: DIM.CATEGORY.SUBCATEGORY.CONTROL
   * Examples: 'AUTH.NHI.SCOPE', 'SEC.GUARD.UNICODE_NORM', 'COMP.POLICY.FREEZE'
   */
  control_id: string;
  /** Condition to match against the governance request */
  match: PolicyMatcher;
  /** Action to take when matched (e.g., 'DENY', 'ALLOW', 'MODIFY') */
  action: string;
  /** Automation level for this rule */
  automation_level?: AutomationLevel;
  /** Additional rule metadata */
  metadata?: Record<string, unknown>;
}

// ── TealEngine v1.3 Options ──────────────────────────────────────

/**
 * Configuration for response hooks (SOC/IR pipeline).
 */
export interface ResponseHookConfig {
  /** Unique hook identifier */
  id: string;
  /** Event that triggers this hook */
  trigger: 'policy_violation' | 'high_risk' | 'freeze_tamper';
  /** Webhook endpoint URL */
  endpoint: string;
  /** Retry policy for failed invocations */
  retry_policy: RetryPolicy;
  /** Deduplication window in milliseconds */
  dedup_window_ms: number;
  /** Rate limiting configuration */
  rate_limit: { max_per_minute: number };
}

/**
 * Retry policy for response hooks.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  max_retries: number;
  /** Initial backoff delay in milliseconds */
  initial_delay_ms: number;
  /** Backoff multiplier */
  backoff_multiplier: number;
  /** Maximum delay between retries in milliseconds */
  max_delay_ms: number;
}

/**
 * OpenTelemetry configuration for governance spans.
 */
export interface OTelConfig {
  /** Whether OTel span emission is enabled */
  enabled: boolean;
  /** Service name for OTel resource */
  service_name?: string;
  /** Custom attributes to include on all spans */
  custom_attributes?: Record<string, string>;
}

/**
 * Configuration for TealProof module.
 */
export interface ProofConfig {
  /** Whether proof chain is enabled */
  enabled: boolean;
  /** Anchor schedule: number of decisions between anchors */
  anchor_interval_decisions?: number;
  /** Anchor schedule: maximum time between anchors in milliseconds */
  anchor_interval_ms?: number;
  /** RFC 3161 TSA endpoint URL */
  tsa_endpoint?: string;
}

/**
 * Configuration for TealFlow module.
 */
export interface FlowConfig {
  /** Whether TealFlow is enabled */
  enabled: boolean;
  /** Paths to workflow YAML files */
  workflow_paths?: string[];
  /** Org-level workflow for floor enforcement */
  org_workflow_path?: string;
}

/**
 * TealEngine v1.3 options — extends v1.2 with governance bundle features.
 * All new fields are optional; defaults preserve v1.2 behavior.
 */
export interface TealEngineV13Options extends TealEngineV12Options {
  /** Immutable FREEZE rules (evaluated first, cannot be removed) */
  freeze_rules?: FreezeRule[];
  /** Enable PLAN_ONLY mode (blocks all side-effecting actions) */
  plan_only_mode?: boolean;
  /** PLAN_ONLY configuration with action classification */
  plan_only_config?: PlanOnlyConfig;
  /** NHI inventory for agent identity governance */
  nhi_inventory?: NHIInventory;
  /** Automation level configuration */
  automation_levels?: AutomationLevelConfig;
  /** Zero Standing Privilege configuration */
  zsp_config?: ZSPConfig;
  /** Agent attestation configuration */
  attestation_config?: AttestationConfig;
  /** TealProof configuration */
  proof_config?: ProofConfig;
  /** TealFlow configuration */
  flow_config?: FlowConfig;
  /** Response hooks for SOC/IR pipeline */
  response_hooks?: ResponseHookConfig[];
  /** OpenTelemetry configuration */
  otel_config?: OTelConfig;
  /** Code change governance policy */
  code_change_policy?: CodeChangePolicy;
  /** Policy packs to load (e.g., ['owasp-agentic-top10']) */
  policy_packs?: string[];
}

// ── v1.3 Reason Codes (used by evaluators and engine) ─────────────

export const V13ReasonCode = {
  FREEZE_BLOCK: 'FREEZE_BLOCK',
  FREEZE_TAMPER_ATTEMPT: 'FREEZE_TAMPER_ATTEMPT',
  PLAN_ONLY_BLOCK: 'PLAN_ONLY_BLOCK',
  NHI_REVOKED: 'NHI_REVOKED',
  NHI_SUSPENDED: 'NHI_SUSPENDED',
  NHI_SCOPE_VIOLATION: 'NHI_SCOPE_VIOLATION',
  NHI_ENVIRONMENT_VIOLATION: 'NHI_ENVIRONMENT_VIOLATION',
  AGENT_ATTESTATION_MISSING: 'AGENT_ATTESTATION_MISSING',
  AGENT_INTEGRITY_FAILED: 'AGENT_INTEGRITY_FAILED',
  ACCESS_STANDING_PRIVILEGE_DENIED: 'ACCESS_STANDING_PRIVILEGE_DENIED',
  ACCESS_GRANT_EXPIRED: 'ACCESS_GRANT_EXPIRED',
} as const;

// ── Governance Provider Interface (Requirement 20) ───────────────

/**
 * Evaluation context for the GovernanceProvider interface.
 * Published as open JSON Schema, versioned independently.
 */
export interface EvaluationContext {
  /** Correlation ID for request tracing */
  correlation_id: string;
  /** Agent identifier */
  agent_id?: string;
  /** Action being evaluated */
  action: string;
  /** Action-specific attributes */
  action_attributes: Record<string, unknown>;
  /** Content being evaluated */
  content?: string;
  /** Model being used */
  model?: string;
  /** Tool being invoked */
  tool?: string;
  /** Current environment */
  environment?: string;
  /** NHI identity of the requesting agent */
  nhi_identity?: NHIDescriptor;
  /** Extensible — additional context fields */
  [key: string]: unknown;
}

/**
 * Capability manifest describing what a governance provider supports.
 */
export interface CapabilityManifest {
  /** SDK version */
  sdk_version: string;
  /** List of supported module names */
  supported_modules: string[];
  /** List of supported feature identifiers */
  supported_features: string[];
  /** TEEC schema version */
  teec_version: string;
}

/**
 * Portable governance provider interface.
 * Allows alternative implementations to provide governance decisions
 * using the same evaluation context and policy bundle format.
 */
export interface GovernanceProvider {
  /** Evaluate a governance request and return a decision */
  evaluate(context: EvaluationContext): Promise<Decision>;
  /** Load a policy bundle into the provider */
  loadPolicies(bundle: PolicyBundle): Promise<void>;
  /** Get the provider's capability manifest */
  getCapabilities(): CapabilityManifest;
}
