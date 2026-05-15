/**
 * TealTiger Governance Event Schema — TypeScript Interface
 *
 * Defines the GovernanceEvent format for governance decision events,
 * violations, drift alerts, and tamper attempts. This schema is published
 * as an open specification designed for adoption by any governance tool.
 *
 * JSON Schema: schemas/governance-events/v1.0.0.json
 *
 * @module core/engine/v1.3/governance-event
 * @see Requirements 21.5, 21.6
 */

/**
 * Governance decision details attached to decision events.
 */
export interface GovernanceEventDecision {
  /** The governance decision action taken (e.g., 'ALLOW', 'DENY', 'MODIFY', 'PENDING'). */
  action: string;
  /** Computed risk score for this decision (0.0 = no risk, 1.0 = maximum risk). */
  risk_score: number;
  /** Array of reason codes explaining the decision. */
  reason_codes: string[];
  /** Version of the policy bundle that produced this decision. */
  policy_version: string;
}

/**
 * Violation details attached to violation events.
 */
export interface GovernanceEventViolation {
  /** Identifier of the governance control that was violated (e.g., DIM.CATEGORY.SUBCATEGORY.CONTROL). */
  control_id: string;
  /** Severity level of the violation (e.g., 'critical', 'high', 'medium', 'low'). */
  severity: string;
  /** OWASP category mapping for this violation (e.g., 'LLM06', 'AGENTIC-01'). */
  owasp_category?: string;
}

/**
 * The GovernanceEvent interface defines the canonical format for all
 * governance events emitted by TealTiger and compatible governance tools.
 *
 * This is an open specification — not proprietary to TealTiger.
 * Other governance tools are encouraged to adopt this format.
 */
export interface GovernanceEvent {
  /** Version of this governance event schema. */
  schema_version: '1.0.0';

  /** Unique identifier for this event (UUID v4). */
  event_id: string;

  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: string;

  /**
   * Type of governance event.
   * Examples: 'governance.decision', 'governance.violation',
   * 'governance.drift', 'governance.tamper_attempt'
   */
  event_type: string;

  /** The system that produced this event (e.g., 'tealtiger'). */
  source: string;

  /** Correlation identifier linking this event to the originating agent request trace. */
  correlation_id: string;

  /** Identifier of the agent that triggered this governance event. Optional for system-level events. */
  agent_id?: string;

  /** Present when event_type is 'governance.decision'. Contains the governance decision details. */
  decision?: GovernanceEventDecision;

  /** Present when event_type is 'governance.violation'. Contains violation details. */
  violation?: GovernanceEventViolation;

  /** Additional key-value pairs providing context for the event. */
  metadata: Record<string, unknown>;
}
