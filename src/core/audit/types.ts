/**
 * TealAudit - Versioned Audit Event Types
 * 
 * Defines the versioned audit event schema with security-by-default redaction.
 * Part of TealTiger v1.1.x - Enterprise Adoption Features (P0.4)
 * 
 * @module core/audit/types
 */

import { PolicyMode, DecisionAction, ReasonCode } from '../engine/types';

/**
 * Audit schema version
 * Incremented when breaking changes are made to the AuditEvent interface
 */
export const AUDIT_SCHEMA_VERSION = '1.0.0';

/**
 * Audit event type enumeration
 * Categorizes different types of audit events for filtering and analysis
 * 
 * @enum {string}
 */
export enum AuditEventType {
  /** Policy evaluation event */
  POLICY_EVALUATION = 'policy.evaluation',
  
  /** Guardrail check event (PII, prompt injection, content moderation) */
  GUARDRAIL_CHECK = 'guardrail.check',
  
  /** LLM request event */
  LLM_REQUEST = 'llm.request',
  
  /** LLM response event */
  LLM_RESPONSE = 'llm.response',
  
  /** Tool execution event */
  TOOL_EXECUTION = 'tool.execution',
  
  /** Circuit breaker state change event */
  CIRCUIT_STATE_CHANGE = 'circuit.state_change',
  
  /** Anomaly detection event */
  ANOMALY_DETECTED = 'anomaly.detected',
  
  /** Cost threshold exceeded event */
  COST_THRESHOLD_EXCEEDED = 'cost.threshold_exceeded',
  
  /** Cost evaluation event */
  COST_EVALUATION = 'cost.evaluation',
  
  /** Cost budget exceeded event */
  COST_BUDGET_EXCEEDED = 'cost.budget_exceeded'
}

/**
 * Safe content metadata (redacted)
 * Contains metadata about content without exposing raw sensitive data
 * 
 * @interface SafeContent
 */
export interface SafeContent {
  /** SHA-256 hash of the content (for HASH redaction level) */
  hash?: string;
  
  /** Size of the content in bytes */
  size?: number;
  
  /** Category or type of content (e.g., 'prompt', 'response', 'tool_params') */
  category?: string;
}

/**
 * Component version information
 * Tracks which TealTiger components were involved in the event
 * 
 * @interface AuditComponentVersions
 */
export interface AuditComponentVersions {
  /** SDK version */
  sdk?: string;
  
  /** TealEngine version */
  engine?: string;
  
  /** TealGuard version */
  guard?: string;
  
  /** TealCircuit version */
  circuit?: string;
  
  /** TealMonitor version */
  monitor?: string;
}

/**
 * Cost governance metadata
 * Standardized cost fields for FinOps and budget tracking
 * 
 * @interface CostMetadata
 */
export interface CostMetadata {
  /** Estimated cost computed prior to provider execution */
  estimated?: number;
  
  /** Actual cost computed from provider usage metrics (if available) */
  actual?: number;
  
  /** Currency for cost values (default: USD) */
  currency?: string;
  
  /** Budget scope applied (request/session/agent/tenant) */
  budget_scope?: 'request' | 'session' | 'agent' | 'tenant';
  
  /** Budget window (e.g., per_request / per_session / daily / hourly) */
  budget_window?: string;
  
  /** Budget limit used for evaluation */
  budget_limit?: number;
  
  /** Remaining budget at time of evaluation (if tracked) */
  budget_remaining?: number;
  
  /** Cost risk score (0-100), if computed separately */
  risk_score?: number;
  
  /** Model name and tier (if model-aware cost policy applies) */
  model?: string;
  model_tier?: string;
}

/**
 * Versioned audit event
 * 
 * This is the canonical audit event structure used throughout TealTiger.
 * All audit events MUST include schema_version, event_type, timestamp, and correlation_id.
 * 
 * Security-by-default: Raw prompts and responses are NEVER included by default.
 * Use safe_inputs and safe_outputs for redacted content metadata.
 * 
 * @interface AuditEvent
 */
export interface AuditEvent {
  /** Schema version (e.g., '1.0.0') */
  schema_version: string;
  
  /** Event type */
  event_type: AuditEventType;
  
  /** Timestamp in ISO 8601 format */
  timestamp: string;
  
  /** Correlation ID for request tracing (required) */
  correlation_id: string;
  
  /** Trace ID for distributed tracing (optional) */
  trace_id?: string;
  
  /** Workflow ID for governance-grade aggregation (optional) */
  workflow_id?: string;
  
  /** Run ID for execution instance tracking (optional) */
  run_id?: string;
  
  /** Span ID for operation tracking (optional) */
  span_id?: string;
  
  /** Parent span ID for nested operations (optional) */
  parent_span_id?: string;
  
  /** Policy ID that was evaluated */
  policy_id?: string;
  
  /** Policy version */
  policy_version?: string;
  
  /** Evaluation mode used (ENFORCE, MONITOR, REPORT_ONLY) */
  mode?: PolicyMode;
  
  /** Decision action (ALLOW, DENY, REDACT, etc.) */
  action?: DecisionAction;
  
  /** Reason codes explaining the decision */
  reason_codes?: ReasonCode[];
  
  /** Risk score (0-100) */
  risk_score?: number;
  
  /** Agent identifier */
  agent_id?: string;
  
  /** LLM provider (e.g., 'openai', 'anthropic') */
  provider?: string;
  
  /** Model name (e.g., 'gpt-4', 'claude-3-opus') */
  model?: string;
  
  /**
   * Cost (deprecated): prefer metadata.cost.* standardized keys.
   * Kept for backwards compatibility with existing TealAudit.
   */
  cost?: number;
  
  /** Duration of the operation in milliseconds */
  duration?: number;
  
  /** Safe inputs (redacted content metadata) */
  safe_inputs?: SafeContent;
  
  /** Safe outputs (redacted content metadata) */
  safe_outputs?: SafeContent;
  
  /** Error message if operation failed */
  error?: string;
  
  /** Component versions involved in the event */
  component_versions?: AuditComponentVersions;
  
  /**
   * Additional metadata (non-sensitive)
   * Cost fields MUST be placed under metadata.cost
   */
  metadata?: Record<string, any> & {
    /** Cost governance (standardized keys) */
    cost?: CostMetadata;
  };
}

/**
 * Validates that an AuditEventType value is valid
 * 
 * @param type - The event type to validate
 * @returns true if valid, false otherwise
 */
export function isValidAuditEventType(type: any): type is AuditEventType {
  return Object.values(AuditEventType).includes(type);
}

/**
 * Validates that an AuditEvent has all required fields
 * 
 * @param event - The audit event to validate
 * @throws {Error} if event is invalid
 */
export function validateAuditEvent(event: AuditEvent): void {
  if (!event) {
    throw new Error('AuditEvent is required');
  }
  
  if (!event.schema_version || typeof event.schema_version !== 'string') {
    throw new Error('AuditEvent must have a valid schema_version');
  }
  
  if (!isValidAuditEventType(event.event_type)) {
    throw new Error(`Invalid audit event type: ${event.event_type}`);
  }
  
  if (!event.timestamp || typeof event.timestamp !== 'string') {
    throw new Error('AuditEvent must have a valid ISO 8601 timestamp');
  }
  
  if (!event.correlation_id || typeof event.correlation_id !== 'string') {
    throw new Error('AuditEvent must have a non-empty correlation_id');
  }
  
  // Validate ISO 8601 timestamp format
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!timestampRegex.test(event.timestamp)) {
    throw new Error(`Invalid ISO 8601 timestamp format: ${event.timestamp}`);
  }
}

/**
 * Creates a new AuditEvent with required fields
 * 
 * @param type - Event type
 * @param correlation_id - Correlation ID for tracing
 * @param partial - Optional partial event data
 * @returns Complete AuditEvent with defaults
 */
export function createAuditEvent(
  type: AuditEventType,
  correlation_id: string,
  partial?: Partial<AuditEvent>
): AuditEvent {
  const event: AuditEvent = {
    schema_version: AUDIT_SCHEMA_VERSION,
    event_type: type,
    timestamp: new Date().toISOString(),
    correlation_id,
    ...partial
  };
  
  validateAuditEvent(event);
  return event;
}
