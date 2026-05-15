/**
 * TealEngine v1.3 — SOC/IR Pipeline Interfaces
 *
 * Defines types for SIEM export, response hooks, OpenTelemetry span
 * conventions, and related configuration used by the post-evaluation
 * evidence pipeline.
 *
 * @module core/engine/v1.3/soc-types
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

// ── SIEM Export Configuration ────────────────────────────────────

/**
 * Supported SIEM log output formats.
 * - `json`: Structured JSON (default, widest compatibility)
 * - `cef`: Common Event Format (ArcSight, QRadar)
 * - `leef`: Log Event Extended Format (IBM QRadar)
 */
export type SIEMExportFormat = 'json' | 'cef' | 'leef';

/**
 * Supported SIEM export sinks.
 * - `stdout`: Write to process stdout (container-friendly)
 * - `file`: Write to a local file path
 * - `webhook`: POST to an HTTP(S) endpoint
 */
export type SIEMExportSink = 'stdout' | 'file' | 'webhook';

/**
 * Configuration for exporting governance decisions to SIEM systems.
 *
 * Exported logs include: timestamp, decision outcome, reason codes,
 * policy version, agent identity, action type, risk score, and
 * correlation identifier linking to the originating agent request trace.
 *
 * @requirements 5.1, 5.6
 */
export interface SIEMExportConfig {
  /** Log output format */
  format: SIEMExportFormat;
  /** Destination sink type */
  sink: SIEMExportSink;
  /** Endpoint URL (required when sink is 'webhook' or file path when sink is 'file') */
  endpoint?: string;
}

// ── Retry Policy ─────────────────────────────────────────────────

/**
 * Configurable retry policy for response hook invocations.
 *
 * When a response hook invocation fails, the engine retries according
 * to this policy and logs the failure.
 *
 * @requirements 5.7
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts before giving up */
  max_retries: number;
  /** Base backoff interval in milliseconds between retries */
  backoff_ms: number;
  /** Maximum time in milliseconds to wait for a single hook invocation */
  timeout_ms: number;
}

// ── Response Hook Configuration ──────────────────────────────────

/**
 * Trigger conditions for response hook invocation.
 * - `policy_violation`: Any policy rule violation
 * - `high_risk`: Decision risk score exceeds configured threshold
 * - `freeze_tamper`: Attempt to modify or disable a FREEZE rule
 */
export type ResponseHookTrigger = 'policy_violation' | 'high_risk' | 'freeze_tamper';

/**
 * Configuration for a response hook that fires on governance events.
 *
 * Response hooks invoke configured webhooks within 100ms of a decision.
 * Deduplication prevents repeated alerts for the same rule within the
 * configured window. Rate limiting prevents alert storms.
 *
 * @requirements 5.3, 5.4, 5.5, 5.7
 */
export interface ResponseHookConfig {
  /** Unique identifier for this hook */
  id: string;
  /** Event condition that triggers this hook */
  trigger: ResponseHookTrigger;
  /** Webhook endpoint URL to invoke */
  endpoint: string;
  /** Retry policy for failed invocations */
  retry_policy: RetryPolicy;
  /** Deduplication window in milliseconds — suppress repeated violations of the same rule within this period */
  dedup_window_ms: number;
  /** Rate limiting configuration to prevent alert storms */
  rate_limit: {
    /** Maximum hook invocations allowed per minute */
    max_per_minute: number;
  };
}

// ── Response Hook Result ─────────────────────────────────────────

/**
 * Result of a response hook invocation attempt.
 */
export interface ResponseHookResult {
  /** Whether the hook invocation succeeded */
  success: boolean;
  /** HTTP status code returned by the endpoint (if applicable) */
  status_code?: number;
  /** Round-trip latency in milliseconds */
  latency_ms: number;
  /** Error message if the invocation failed */
  error?: string;
}

// ── OpenTelemetry Span Convention ────────────────────────────────

/**
 * OpenTelemetry span attributes emitted for each governance evaluation.
 *
 * These attributes conform to a documented span convention and enable
 * governance decisions to be correlated in distributed tracing systems.
 *
 * @requirements 5.2
 */
export interface OTelSpanAttributes {
  /** The governance decision action (allow, deny, modify, pending) */
  'decision.action': string;
  /** Numeric risk score assigned to the decision */
  'decision.risk_score': number;
  /** Version of the policy bundle that produced the decision */
  'policy.version': string;
  /** Agent identity that submitted the governance request */
  'agent.id': string;
  /** Correlation ID linking to the originating agent request trace */
  'correlation_id': string;
  /** List of module names that participated in evaluation */
  'modules.evaluated': string[];
  /** Reason codes aggregated from all modules */
  'reason_codes': string[];
}

/**
 * OpenTelemetry span convention for TealTiger governance evaluations.
 *
 * Each governance evaluation emits a span with the fixed name
 * `tealtiger.governance.evaluate` and the documented attribute set.
 *
 * @requirements 5.2, 21.7, 21.8
 */
export interface OTelSpanConvention {
  /** Fixed span name for governance evaluations */
  span_name: 'tealtiger.governance.evaluate';
  /** Span attributes following the TealTiger convention */
  attributes: OTelSpanAttributes;
}

// ── OpenTelemetry Configuration ──────────────────────────────────

/**
 * Configuration for OpenTelemetry span emission.
 */
export interface OTelConfig {
  /** Whether OTel span emission is enabled */
  enabled: boolean;
  /** Service name reported in OTel spans */
  service_name: string;
  /** OTLP exporter endpoint URL */
  exporter_endpoint: string;
}
