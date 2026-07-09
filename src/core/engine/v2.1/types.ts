/**
 * TealEngine v2.1 — Core Types
 *
 * Extends the v1.2 Decision type with TEEC v2.1 governance contract fields:
 * cryptographic seals, intent binding, receipt chaining, and sequence counters.
 *
 * @module core/engine/v2.1/types
 */

import { Decision as V12Decision } from '../v1.2/types';

// ── GovernanceSeal ───────────────────────────────────────────────

/**
 * Cryptographic seal applied to each TEEC v2.1 Decision.
 * Contains a reproducible HMAC-SHA256, the timestamp at which the seal
 * was computed, and the identity of the producing agent.
 */
export interface GovernanceSeal {
  /** Hex-encoded HMAC-SHA256 of the decision payload + timestamp + agent_id */
  hmac: string;
  /** Unix milliseconds at which the seal was computed */
  timestamp: number;
  /** Identity of the agent that produced the decision */
  agent_id: string;
}

// ── DecisionV21 ─────────────────────────────────────────────────

/**
 * TEEC v2.1 Decision — a strict superset of the v1.2 Decision type.
 * Adds six cryptographic/ordering fields for tamper-evidence and TOCTOU closure.
 */
export interface DecisionV21 extends V12Decision {
  /** SHA-256 hash of the serialized request payload (intent binding) */
  intent_ref: string;
  /** SHA-256 hash linking this decision to the prior decision in the chain */
  receipt_ref: string;
  /** Monotonically increasing sequence number scoped to this agent_id */
  seq: number;
  /** Global decision counter across all agents within the engine instance */
  running_count: number;
  /** SHA-256 hash of the canonically normalized request payload */
  normalization_id: string;
  /** Cryptographic seal for tamper-evidence */
  governance_seal: GovernanceSeal;
  /** TEEC version identifier — always "2.1" for this type */
  teec_version: '2.1';
}

// ── Genesis constant ─────────────────────────────────────────────

/**
 * Well-known genesis value used as the "previous receipt_ref" for the first
 * Decision in an agent's chain (seq=1). 64 hex zero characters.
 */
export const GENESIS_RECEIPT_REF = '0'.repeat(64);

// ── Validation types ─────────────────────────────────────────────

/**
 * Context required to validate a single governance decision.
 */
export interface ValidationContext {
  /** The original request payload that triggered the governance evaluation */
  request_payload: Record<string, unknown>;
  /** The seal_secret used to produce the GovernanceSeal */
  seal_secret: string;
  /** Reference time for timestamp drift check (Unix ms). Defaults to Date.now() */
  reference_time?: number;
  /** Acceptable timestamp drift window in ms. Defaults to 60000 (60 seconds) */
  timestamp_tolerance_ms?: number;
}

/**
 * Successful validation result from validate_governance_decision.
 */
export interface ValidationSuccess {
  valid: true;
  /** Recomputed receipt_ref for the validated decision */
  receipt_ref: string;
  /** Verified intent_ref from the decision */
  intent_ref: string;
}

/**
 * Failed validation result from validate_governance_decision.
 */
export interface ValidationFailure {
  valid: false;
  /** Specific type of validation failure */
  error_type: 'seal_mismatch' | 'intent_mismatch' | 'schema_violation' | 'timestamp_drift';
  /** Human-readable error message */
  message: string;
}

/** Discriminated union of validation outcomes */
export type ValidationResult = ValidationSuccess | ValidationFailure;

// ── Contiguity verification types ────────────────────────────────

/**
 * Successful contiguity verification — the decision chain is intact.
 */
export interface ContiguitySuccess {
  valid: true;
  /** Number of decisions verified in the chain */
  count: number;
}

/**
 * Failed contiguity verification — a break was detected in the chain.
 */
export interface ContiguityFailure {
  valid: false;
  /** Index of the first failing decision in the input array */
  index: number;
  /** Specific check that failed */
  check: 'seq_gap' | 'chain_break' | 'count_regression' | 'version_incompatible';
  /** Human-readable error message */
  message: string;
}

/** Discriminated union of contiguity verification outcomes */
export type ContiguityResult = ContiguitySuccess | ContiguityFailure;
