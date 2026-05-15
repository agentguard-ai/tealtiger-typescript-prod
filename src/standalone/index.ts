/**
 * TealTiger Standalone Module Exports
 *
 * Re-exports each module for standalone use without TealEngine dependency.
 * Each module is importable and usable independently with its own public API.
 *
 * This enables organizations to adopt individual governance capabilities
 * without requiring the full TealEngine orchestration layer.
 *
 * @module standalone
 * @requirements 20.11–20.13
 *
 * @example
 * ```typescript
 * // Import individual modules without TealEngine
 * import { TealGuard } from 'tealtiger/standalone';
 * import { TealSecrets } from 'tealtiger/standalone';
 * import { TealMemory } from 'tealtiger/standalone';
 *
 * // Use standalone — no TealEngine required
 * const guard = new TealGuard({ ... });
 * const secrets = new TealSecrets({ ... });
 * ```
 */

// ── Core Guardrails ──────────────────────────────────────────────

/**
 * TealGuard — Input/output guardrails for content filtering,
 * PII detection, prompt injection detection, and content moderation.
 */
export {
  GuardrailEngine as TealGuard,
  Guardrail,
  PIIDetectionGuardrail,
  ContentModerationGuardrail,
  PromptInjectionGuardrail,
} from '../guardrails';

export type {
  GuardrailResult,
  GuardrailConfig,
  GuardrailMetadata,
  GuardrailEngineOptions,
} from '../guardrails';

// ── Secret Detection ─────────────────────────────────────────────

/**
 * TealSecrets — Secret detection with 500+ patterns,
 * confidence scoring, and credential TTL tracking.
 */
export {
  TealSecrets,
  ConfidenceScorer,
  DetectionCache,
  CredentialTTLChecker,
} from '../secrets';

export type {
  SecretCategory,
  Severity,
  SecretPattern,
  SecretFindingFull,
  TealSecretsPolicy,
} from '../secrets';

// ── Memory Governance ────────────────────────────────────────────

/**
 * TealMemory — Memory governance with 5 scopes, 4 classifications,
 * provenance tagging, and instruction injection detection.
 */
export {
  TealMemory,
  LocalMemoryAdapter,
} from '../memory';

export type {
  MemoryScope,
  Classification,
  MemoryRecord,
  MemoryQuery,
  MemoryAdapter,
  TealMemoryOptions,
  TealMemoryPolicy,
} from '../memory';

// ── Registry and Supply Chain ────────────────────────────────────

/**
 * TealRegistry — Model/tool registry with allowlisting,
 * provenance verification, MCP drift detection, and adapter composition.
 */
export { TealRegistry } from '../registry';

// ── Circuit Breaker ──────────────────────────────────────────────

/**
 * TealCircuit — Circuit breaker for preventing cascading failures
 * in AI agent workflows.
 */
export { TealCircuit } from '../core/circuit/TealCircuit';

// ── Audit Logging ────────────────────────────────────────────────

/**
 * TealAudit — Versioned audit logging with PII redaction,
 * SIEM-compatible structured output, and governance event tracking.
 */
export { TealAudit } from '../core/audit/TealAudit';

// ── Cryptographic Governance Receipts ────────────────────────────

/**
 * TealProof — Merkle-tree-based tamper-evident proof chains,
 * RFC 3161 timestamping, and governance passport generation.
 */
export { SHA256MerkleTree as MerkleTree } from '../modules/tealproof/MerkleTree';
export { TealProofModule as TealProof } from '../modules/tealproof/TealProof';

// ── Declarative Governance Workflows ─────────────────────────────

/**
 * TealFlow — YAML-based event-driven governance workflow engine
 * with job dependencies, conditionals, and org-level inheritance.
 */
export { TealFlowEngine } from '../modules/tealflow/TealFlowEngine';
export { TealFlowParser } from '../modules/tealflow/TealFlowParser';

// ── ML Classifier ────────────────────────────────────────────────

/**
 * TealClassifier — Optional lightweight ML classifier for prompt
 * injection detection using ONNX inference. Supports ensemble modes.
 */
export { TealClassifierModule as TealClassifier } from '../modules/tealclassifier/TealClassifier';

// ── Behavioral Drift Detection ───────────────────────────────────

/**
 * TealDrift — Statistical baseline tracking and behavioral drift
 * detection per agent/provider/model combination.
 */
export { TealDriftModule as TealDrift } from '../modules/tealdrift/TealDrift';

// ── Context and State Governance ─────────────────────────────────

/**
 * TealState — Context window size governance, provenance tracking,
 * and context mutation governance.
 */
export { TealStateModule as TealState } from '../modules/tealstate/TealState';

// ── Session and Time Governance ──────────────────────────────────

/**
 * TealTemporal — Session TTL enforcement, cooldown periods,
 * and time-of-day restrictions for agent actions.
 */
export { TealTemporalModule as TealTemporal } from '../modules/tealtemporal/TealTemporal';

// ── Governance Provider Interface ────────────────────────────────

/**
 * GovernanceProvider — Portable governance provider interface.
 * Allows alternative implementations behind the same API surface.
 */
export {
  TealTigerGovernanceProvider,
} from '../core/engine/v1.3/governance-provider';

export type {
  GovernanceProvider,
  EvaluationContext,
  CapabilityManifest,
} from '../core/engine/v1.3/governance-provider';

// ── Reasoning Trace Governance ───────────────────────────────────

/**
 * ReasoningTraceGovernor — PII and secret redaction for
 * chain-of-thought and extended-thinking traces.
 */
export {
  ReasoningTraceGovernor,
} from '../core/engine/v1.3/reasoning-trace-governance';

export type {
  ReasoningTraceRedactionConfig,
} from '../core/engine/v1.3/reasoning-trace-governance';

// ── Code Change Governance ───────────────────────────────────────

/**
 * CodeChangeGovernor — Evaluates CODE_CHANGE actions against policy
 * with path/branch allowlists, diff hash requirements, and two-person rule.
 */
export {
  CodeChangeGovernor,
  evaluateCodeChange,
  matchGlob,
} from '../core/engine/v1.3/code-change-governance';

// ── Backward Compatibility ───────────────────────────────────────

/**
 * BackwardCompatibilityLayer — Detects v1.2 configs and wraps them
 * with v1.3 defaults for seamless upgrade.
 */
export {
  BackwardCompatibilityLayer,
} from '../core/engine/v1.3/backward-compat';
