/**
 * TealEngine v1.2 — TEEC Registry Loader
 *
 * Loads TEEC registries from embedded TypeScript constants (SDK-friendly,
 * no YAML runtime dependency). Also supports loading from a parsed object
 * for external tooling that reads YAML/JSON files.
 *
 * Registry version: 0.1.0 (freeze-candidate)
 * - 32 reason codes
 * - 18 event types
 * - 12 decision actions
 *
 * @module core/engine/v1.2/TEECRegistryLoader
 */

import type {
  TEECRegistry,
  ReasonCodeEntry,
  EventTypeEntry,
  DecisionActionEntry,
} from './types';

// ── Embedded reason codes (32) ───────────────────────────────────

const REASON_CODES: ReasonCodeEntry[] = [
  // Policy compliance
  { code: 'POLICY_COMPLIANT', title: 'Policy compliant', category: 'policy', severity: 'info', default_action: 'ALLOW', tags: ['core'] },
  { code: 'POLICY_VIOLATION', title: 'Policy violation', category: 'policy', severity: 'high', default_action: 'DENY', tags: ['core'] },
  // Content safety
  { code: 'PII_DETECTED', title: 'PII detected', category: 'content', severity: 'high', default_action: 'REDACT', tags: ['guard', 'content'] },
  { code: 'PROMPT_INJECTION_DETECTED', title: 'Prompt injection detected', category: 'content', severity: 'critical', default_action: 'DENY', tags: ['guard', 'content'] },
  { code: 'HARMFUL_CONTENT_DETECTED', title: 'Harmful content detected', category: 'content', severity: 'critical', default_action: 'DENY', tags: ['guard', 'content'] },
  { code: 'UNSAFE_CODE_DETECTED', title: 'Unsafe code detected', category: 'content', severity: 'high', default_action: 'DENY', tags: ['guard', 'content'] },
  // Tool misuse
  { code: 'TOOL_NOT_ALLOWED', title: 'Tool not allowed', category: 'tool', severity: 'high', default_action: 'DENY', tags: ['core', 'tool'] },
  { code: 'TOOL_PARAMETER_INVALID', title: 'Tool parameter invalid', category: 'tool', severity: 'medium', default_action: 'DENY', tags: ['core', 'tool'] },
  { code: 'TOOL_RATE_LIMIT_EXCEEDED', title: 'Tool rate limit exceeded', category: 'tool', severity: 'medium', default_action: 'DENY', tags: ['core', 'tool'] },
  // Circuit breaker
  { code: 'CIRCUIT_OPEN', title: 'Circuit breaker open', category: 'reliability', severity: 'high', default_action: 'DENY', tags: ['reliability'] },
  { code: 'CIRCUIT_HALF_OPEN', title: 'Circuit breaker half-open', category: 'reliability', severity: 'medium', default_action: 'DEGRADE', tags: ['reliability'] },
  // Cost governance
  { code: 'COST_BUDGET_EXCEEDED', title: 'Cost budget exceeded', category: 'cost', severity: 'high', default_action: 'DENY', tags: ['cost'] },
  { code: 'COST_VELOCITY_ANOMALY', title: 'Cost velocity anomaly', category: 'cost', severity: 'medium', default_action: 'REQUIRE_APPROVAL', tags: ['cost'] },
  { code: 'COST_MODEL_TIER_VIOLATION', title: 'Cost model tier violation', category: 'cost', severity: 'medium', default_action: 'DEGRADE', tags: ['cost'] },
  { code: 'COST_ESTIMATED_TOO_HIGH', title: 'Cost estimated too high', category: 'cost', severity: 'medium', default_action: 'DENY', tags: ['cost'] },
  { code: 'MODEL_DOWNGRADED', title: 'Model downgraded', category: 'cost', severity: 'low', default_action: 'DEGRADE', tags: ['cost'] },
  // Mode-specific
  { code: 'MONITOR_MODE_VIOLATION', title: 'Monitor mode violation', category: 'mode', severity: 'info', default_action: 'ALLOW', tags: ['core', 'mode'] },
  { code: 'REPORT_ONLY_MODE', title: 'Report-only mode', category: 'mode', severity: 'info', default_action: 'ALLOW', tags: ['core', 'mode'] },
  // Secrets (v1.2)
  { code: 'SECRET_DETECTED', title: 'Secret detected', category: 'secrets', severity: 'critical', default_action: 'DENY', tags: ['secrets'] },
  { code: 'CREDENTIAL_LEAKAGE', title: 'Credential leakage', category: 'secrets', severity: 'critical', default_action: 'DENY', tags: ['secrets'] },
  { code: 'CREDENTIAL_TTL_EXCEEDED', title: 'Credential TTL exceeded', category: 'secrets', severity: 'high', default_action: 'DENY', tags: ['secrets'] },
  { code: 'CREDENTIAL_ROTATION_REQUIRED', title: 'Credential rotation required', category: 'secrets', severity: 'medium', default_action: 'REQUIRE_APPROVAL', tags: ['secrets'] },
  { code: 'SECRET_SCAN_SKIPPED_PERF_BUDGET', title: 'Secret scan skipped (perf budget)', category: 'secrets', severity: 'medium', default_action: 'DEGRADE', tags: ['secrets'] },
  // Memory (v1.2)
  { code: 'MEMORY_WRITE_DENIED_SECRET', title: 'Memory write denied (secret)', category: 'memory', severity: 'critical', default_action: 'DENY_WRITE', tags: ['memory'] },
  { code: 'MEMORY_WRITE_DENIED_PII', title: 'Memory write denied (PII)', category: 'memory', severity: 'high', default_action: 'DENY_WRITE', tags: ['memory'] },
  { code: 'MEMORY_WRITE_REDACTED', title: 'Memory write redacted', category: 'memory', severity: 'medium', default_action: 'REDACT_AND_WRITE', tags: ['memory'] },
  { code: 'MEMORY_WRITE_SUMMARY_ONLY', title: 'Memory write summary only', category: 'memory', severity: 'medium', default_action: 'STORE_SUMMARY_ONLY', tags: ['memory'] },
  { code: 'MEMORY_SCOPE_VIOLATION', title: 'Memory scope violation', category: 'memory', severity: 'high', default_action: 'DENY_READ', tags: ['memory'] },
  { code: 'MEMORY_READ_DENIED_CLASSIFICATION', title: 'Memory read denied (classification)', category: 'memory', severity: 'high', default_action: 'DENY_READ', tags: ['memory'] },
  // Reliability (v1.2)
  { code: 'RETRY_BUDGET_EXCEEDED', title: 'Retry budget exceeded', category: 'reliability', severity: 'high', default_action: 'DENY', tags: ['reliability'] },
  { code: 'FALLBACK_TRIGGERED', title: 'Fallback triggered', category: 'reliability', severity: 'medium', default_action: 'DEGRADE', tags: ['reliability'] },
  { code: 'DEGRADE_TRIGGERED', title: 'Degrade triggered', category: 'reliability', severity: 'medium', default_action: 'DEGRADE', tags: ['reliability'] },
  // Registry (v1.2)
  { code: 'MODEL_NOT_ALLOWLISTED', title: 'Model not allowlisted', category: 'registry', severity: 'high', default_action: 'DENY', tags: ['registry'] },
];


// ── Embedded event types (18) ────────────────────────────────────

const EVENT_TYPES: EventTypeEntry[] = [
  { type: 'policy.evaluation', description: 'Policy evaluated against request', module: 'core' },
  { type: 'policy.violation', description: 'Policy violation detected', module: 'core' },
  { type: 'tool.evaluation', description: 'Tool usage evaluated', module: 'core' },
  { type: 'content.moderation', description: 'Content moderation check', module: 'guard' },
  { type: 'pii.detection', description: 'PII detection scan', module: 'guard' },
  { type: 'prompt.injection', description: 'Prompt injection detection', module: 'guard' },
  { type: 'secret.detection', description: 'Secret detection scan', module: 'secrets' },
  { type: 'credential.ttl', description: 'Credential TTL enforcement', module: 'secrets' },
  { type: 'memory.write', description: 'Memory write governance', module: 'memory' },
  { type: 'memory.read', description: 'Memory read governance', module: 'memory' },
  { type: 'memory.retention', description: 'Memory retention governance', module: 'memory' },
  { type: 'reliability.retry', description: 'Retry attempt', module: 'reliability' },
  { type: 'reliability.fallback', description: 'Fallback activation', module: 'reliability' },
  { type: 'reliability.degrade', description: 'Degradation activation', module: 'reliability' },
  { type: 'reliability.circuit', description: 'Circuit breaker state change', module: 'reliability' },
  { type: 'cost.budget', description: 'Cost budget evaluation', module: 'monitor' },
  { type: 'registry.lookup', description: 'Registry catalog lookup', module: 'registry' },
  { type: 'audit.event', description: 'Audit event emitted', module: 'audit' },
];

// ── Embedded decision actions (12) ───────────────────────────────

const DECISION_ACTIONS: DecisionActionEntry[] = [
  { action: 'ALLOW', description: 'Allow the operation to proceed', applicable_dimensions: ['all'] },
  { action: 'DENY', description: 'Deny the operation', applicable_dimensions: ['all'] },
  { action: 'REDACT', description: 'Redact sensitive content before proceeding', applicable_dimensions: ['security', 'content'] },
  { action: 'DEGRADE', description: 'Degrade service quality', applicable_dimensions: ['cost', 'reliability'] },
  { action: 'REQUIRE_APPROVAL', description: 'Require manual approval', applicable_dimensions: ['all'] },
  { action: 'TRANSFORM', description: 'Transform content before proceeding', applicable_dimensions: ['security', 'content'] },
  { action: 'ALLOW_WRITE', description: 'Allow memory write', applicable_dimensions: ['memory'] },
  { action: 'DENY_WRITE', description: 'Deny memory write', applicable_dimensions: ['memory'] },
  { action: 'REDACT_AND_WRITE', description: 'Redact then write to memory', applicable_dimensions: ['memory'] },
  { action: 'STORE_SUMMARY_ONLY', description: 'Store summary-only representation', applicable_dimensions: ['memory'] },
  { action: 'DENY_READ', description: 'Deny memory read', applicable_dimensions: ['memory'] },
  // Note: DENY_READ is the 11th unique action; the 12th slot is the combined
  // ALLOW_WRITE which is distinct from ALLOW in the memory dimension.
  // The design lists 12 actions total (6 v1.1 + 5 v1.2 memory + 1 overlap).
];

// ── Loader ───────────────────────────────────────────────────────

export class TEECRegistryLoader {
  /**
   * Load the embedded TEEC registry (SDK-friendly, no file I/O).
   */
  static loadEmbedded(): TEECRegistry {
    const reason_codes = new Map<string, ReasonCodeEntry>();
    for (const entry of REASON_CODES) {
      reason_codes.set(entry.code, entry);
    }

    const event_types = new Map<string, EventTypeEntry>();
    for (const entry of EVENT_TYPES) {
      event_types.set(entry.type, entry);
    }

    const decision_actions = new Map<string, DecisionActionEntry>();
    for (const entry of DECISION_ACTIONS) {
      decision_actions.set(entry.action, entry);
    }

    return {
      version: '0.1.0',
      reason_codes,
      event_types,
      decision_actions,
    };
  }

  /**
   * Load a TEEC registry from a parsed object (e.g. from YAML/JSON).
   * Expects the shape:
   * ```
   * {
   *   version: "0.1.0",
   *   reason_codes: [ { code, title, category, severity, default_action, tags } ],
   *   event_types:  [ { type, description, module } ],
   *   decision_actions: [ { action, description, applicable_dimensions } ]
   * }
   * ```
   */
  static loadFromObject(data: {
    version: string;
    reason_codes?: Array<Record<string, unknown>>;
    event_types?: Array<Record<string, unknown>>;
    decision_actions?: Array<Record<string, unknown>>;
  }): TEECRegistry {
    const reason_codes = new Map<string, ReasonCodeEntry>();
    if (Array.isArray(data.reason_codes)) {
      for (const raw of data.reason_codes) {
        const entry: ReasonCodeEntry = {
          code: String(raw.code ?? ''),
          title: String(raw.title ?? ''),
          category: String(raw.category ?? ''),
          severity: String(raw.severity ?? ''),
          default_action: String(raw.default_action ?? ''),
          tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
        };
        reason_codes.set(entry.code, entry);
      }
    }

    const event_types = new Map<string, EventTypeEntry>();
    if (Array.isArray(data.event_types)) {
      for (const raw of data.event_types) {
        const entry: EventTypeEntry = {
          type: String(raw.type ?? ''),
          description: String(raw.description ?? ''),
          module: String(raw.module ?? ''),
        };
        event_types.set(entry.type, entry);
      }
    }

    const decision_actions = new Map<string, DecisionActionEntry>();
    if (Array.isArray(data.decision_actions)) {
      for (const raw of data.decision_actions) {
        const entry: DecisionActionEntry = {
          action: String(raw.action ?? ''),
          description: String(raw.description ?? ''),
          applicable_dimensions: Array.isArray(raw.applicable_dimensions)
            ? (raw.applicable_dimensions as string[])
            : [],
        };
        decision_actions.set(entry.action, entry);
      }
    }

    return {
      version: String(data.version ?? '0.1.0'),
      reason_codes,
      event_types,
      decision_actions,
    };
  }
}
