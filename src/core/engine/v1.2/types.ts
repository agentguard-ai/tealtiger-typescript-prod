/**
 * TealEngine v1.2 — Core Types
 *
 * Extends the v1.1 type surface with TEEC evidence fields, module system,
 * and memory-governance decision actions. All v1.1 types are preserved;
 * nothing is removed or renamed.
 *
 * @module core/engine/v1.2/types
 */

import {
  Decision as V11Decision,
  DecisionAction as V11DecisionAction,
} from '../types';

// ── v1.2 DecisionAction additions (additive only) ───────────────

/**
 * Memory-governance decision actions introduced in v1.2.
 * v1.1 values are preserved via the union type below.
 */
export enum DecisionActionV12 {
  ALLOW_WRITE = 'ALLOW_WRITE',
  DENY_WRITE = 'DENY_WRITE',
  REDACT_AND_WRITE = 'REDACT_AND_WRITE',
  STORE_SUMMARY_ONLY = 'STORE_SUMMARY_ONLY',
  DENY_READ = 'DENY_READ',
}

/** Combined DecisionAction = v1.1 enum + v1.2 enum */
export type DecisionAction = V11DecisionAction | DecisionActionV12;

// ── Registry reference ───────────────────────────────────────────

export interface RegistryRef {
  catalog: 'models' | 'tools' | 'detectors' | 'policies';
  entry_id: string;
  version: string;
  hash: string;
}

// ── Secret finding ───────────────────────────────────────────────

export interface SecretFinding {
  finding_id: string;
  type: string;
  category: string;
  confidence: number;
  severity: string;
  fingerprint: string;
}

// ── v1.2 Decision (superset of v1.1) ────────────────────────────

export interface Decision extends V11Decision {
  /** TEEC-registered event type */
  event_type?: string;
  /** TEEC version pointer */
  teec_version?: string;
  /** Unix ms timestamp */
  timestamp?: number;
  /** Originating module name */
  module?: string;
  /** Governed registry references */
  registry_refs?: RegistryRef[];
  /** Secret findings (when TealSecrets produces them) */
  findings?: SecretFinding[];
}

// ── TealModule interface ─────────────────────────────────────────

export interface ModuleEvaluationRequest {
  content?: string;
  tool?: string;
  toolParams?: Record<string, unknown>;
  model?: string;
  [key: string]: unknown;
}

export interface ModuleContext {
  correlation_id: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  baggage?: Record<string, string>;
  tenant_id?: string;
  user_id?: string;
  session_id?: string;
  agent_id?: string;
  policy_version: string;
  teec_version: string;
  timestamp: number;
}

export interface ModuleResult {
  action: DecisionAction;
  reason_codes: string[];
  event_type: string;
  findings?: SecretFinding[];
  metadata?: Record<string, unknown>;
}

export interface TealModule {
  readonly name: string;
  readonly version: string;
  evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult>;
  init?(config: unknown): Promise<void>;
  destroy?(): Promise<void>;
}

// ── TEEC Registry types ──────────────────────────────────────────

export interface ReasonCodeEntry {
  code: string;
  title: string;
  category: string;
  severity: string;
  default_action: string;
  tags: string[];
}

export interface EventTypeEntry {
  type: string;
  description: string;
  module: string;
}

export interface DecisionActionEntry {
  action: string;
  description: string;
  applicable_dimensions: string[];
}

export interface TEECRegistry {
  version: string;
  reason_codes: Map<string, ReasonCodeEntry>;
  event_types: Map<string, EventTypeEntry>;
  decision_actions: Map<string, DecisionActionEntry>;
}

// ── Module status ────────────────────────────────────────────────

export interface ModuleStatusMap {
  [moduleName: string]: {
    registered: boolean;
    initialized: boolean;
    version: string;
  };
}
