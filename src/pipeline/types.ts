/**
 * Multi-Stage Defense Pipeline — Type Definitions
 *
 * Contains all enums, interfaces, and constants for the three-stage
 * governance pipeline (PRE_EXECUTION → EXECUTION → POST_EXECUTION).
 *
 * @module pipeline/types
 * @requirements 1.1, 5.1, 5.2, 5.4, 13.1, 13.2, 13.3
 */

import type { TealModule, ModuleContext } from '../core/engine/v1.2/types';
import type { ObserveProxy } from '../observe/types';

// ── Enums ────────────────────────────────────────────────────────

/**
 * The three ordered lifecycle stages of a governed LLM request.
 */
export enum PipelineStage {
  PRE_EXECUTION = 'PRE_EXECUTION',
  EXECUTION = 'EXECUTION',
  POST_EXECUTION = 'POST_EXECUTION',
}

/**
 * Actions that the PostExecutionStage can trigger when a module
 * reports a policy violation on the LLM response.
 */
export enum RemediationAction {
  RESAMPLE = 'RESAMPLE',
  REDACT = 'REDACT',
  DENY_RESPONSE = 'DENY_RESPONSE',
}

// ── Action Severity Ordering (MostRestrictiveWins) ───────────────

/**
 * Severity ordering for governance actions. Higher values are more restrictive.
 * Used by the MostRestrictiveWins merge strategy within each stage.
 *
 * For the pipeline's stage-level decision, effective categories are:
 * - DENY (severity >= 70): Stage blocks → triggers appropriate behavior
 * - MONITOR (severity 10–60): Stage proceeds with monitoring metadata
 * - ALLOW (severity 0): Stage permits without flags
 */
export const ACTION_SEVERITY: Record<string, number> = {
  DENY: 100,
  DENY_WRITE: 100,
  DENY_READ: 100,
  REQUIRE_APPROVAL: 80,
  REDACT: 70,
  REDACT_AND_WRITE: 70,
  DEGRADE: 60,
  STORE_SUMMARY_ONLY: 60,
  TRANSFORM: 50,
  MONITOR: 10,
  ALLOW: 0,
};

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration object provided to the DefensePipeline at construction.
 * Specifies registered modules per stage, failure policy, and TEEC v2.1 settings.
 */
export interface PipelineConfig {
  /** Modules to run at the PRE_EXECUTION stage */
  preExecutionModules: TealModule[];
  /** Modules to run at the POST_EXECUTION stage */
  postExecutionModules: TealModule[];
  /** Existing ObserveProxy instance; if omitted, one is created wrapping providerClient */
  observeProxy?: ObserveProxy<any>;
  /** Raw provider client (required if observeProxy not provided) */
  providerClient?: any;
  /** TEEC v2.1 seal secret — presence enables cryptographic provenance */
  seal_secret?: string;
  /** Maximum resample attempts for post-execution remediation. Default: 2 */
  resample_budget?: number;
  /** Whether module failures block the request. Default: true */
  fail_closed?: boolean;
  /** Module evaluation timeout in milliseconds. Default: 5000 */
  module_timeout_ms?: number;
  /** Agent identifier for TEEC v2.1 scoping */
  agent_id?: string;
  /** Pipeline lifecycle hooks */
  hooks?: PipelineHooks;
}

// ── Lifecycle Hooks ──────────────────────────────────────────────

/**
 * Lifecycle callbacks that fire at defined points during pipeline execution.
 * Hooks are non-blocking and non-fatal — exceptions are logged but never propagated.
 */
export interface PipelineHooks {
  /** Fired before evaluating pre-execution modules. Cannot modify request. */
  beforePreExecution?: (request: PipelineRequest) => void | Promise<void>;
  /** Fired after pre-execution stage produces a decision. */
  afterPreExecution?: (decision: StageDecision) => void | Promise<void>;
  /** Fired before forwarding request to the LLM provider. */
  beforeExecution?: (request: PipelineRequest) => void | Promise<void>;
  /** Fired after provider response is received. */
  afterExecution?: (response: any, metadata: ExecutionMetadata) => void | Promise<void>;
  /** Fired before evaluating post-execution modules. */
  beforePostExecution?: (response: any, request: PipelineRequest) => void | Promise<void>;
  /** Fired after post-execution stage produces a decision. */
  afterPostExecution?: (decision: StageDecision) => void | Promise<void>;
  /** Fired each time a remediation action is triggered. */
  onRemediation?: (action: RemediationAction, decision: StageDecision, attempt: number) => void | Promise<void>;
}

// ── Request / Result ─────────────────────────────────────────────

/**
 * Input to the DefensePipeline.execute() method.
 */
export interface PipelineRequest {
  /** The raw request payload to send to the LLM provider */
  payload: Record<string, unknown>;
  /** Correlation ID for tracing (auto-generated UUID v4 if omitted) */
  correlation_id?: string;
  /** Additional context for module evaluation */
  context?: Partial<ModuleContext>;
}

/**
 * Composite result returned by the DefensePipeline after all stages complete.
 * Contains the final action, all StageDecisions, the response (if allowed),
 * and full timing metadata.
 */
export interface PipelineResult {
  /** Whether the response was ultimately delivered to the caller */
  allowed: boolean;
  /** The LLM response (null when blocked/denied) */
  response: any | null;
  /** Pre-execution stage decision */
  pre_decision: StageDecision;
  /** Post-execution stage decision (null if blocked pre-execution or provider error) */
  post_decision: StageDecision | null;
  /** Stage that caused blocking, if any */
  blocked_stage: PipelineStage | null;
  /** Wall-clock time from pipeline entry to result (ms) */
  total_latency_ms: number;
  /** Number of resample attempts (0 if none) */
  resample_count: number;
  /** Final remediation action taken, or null */
  remediation_action: RemediationAction | null;
  /** Whether the response was redacted */
  redacted: boolean;
  /** Whether the resample budget was exhausted */
  remediation_exhausted: boolean;
  /** Whether the LLM provider threw an error */
  provider_error: boolean;
  /** Provider error details, if any */
  provider_error_details?: { message: string; code?: string };
  /** Chronologically ordered stage decisions */
  decisions: StageDecision[];
  /** Detailed timing metadata */
  timing: PipelineTimingMetadata;

  /**
   * Serialize to JSON without information loss.
   * All fields use JSON-compatible types.
   */
  toJSON(): Record<string, unknown>;
}

// ── Timing Metadata ──────────────────────────────────────────────

/**
 * Detailed timing breakdown of pipeline execution.
 * All timestamps are Unix milliseconds.
 */
export interface PipelineTimingMetadata {
  /** Timestamp when the pipeline received the request */
  pipeline_entry: number;
  /** Timestamp when pre-execution evaluation started */
  pre_execution_start: number;
  /** Timestamp when pre-execution evaluation ended */
  pre_execution_end: number;
  /** Timestamp when execution (provider call) started (null if blocked pre-execution) */
  execution_start: number | null;
  /** Timestamp when execution (provider call) ended (null if blocked pre-execution) */
  execution_end: number | null;
  /** Timestamp when post-execution evaluation started (null if not reached) */
  post_execution_start: number | null;
  /** Timestamp when post-execution evaluation ended (null if not reached) */
  post_execution_end: number | null;
  /** Total time spent executing hooks (ms) */
  hook_time_ms: number;
  /** Timing for each remediation attempt */
  remediation_attempts: Array<{ start: number; end: number }>;
}

// ── Stage Decision ───────────────────────────────────────────────

/**
 * A governance decision produced by a single pipeline stage.
 * Tagged with the stage that produced it and enriched with TEEC v2.1
 * cryptographic fields when a seal_secret is configured.
 */
export interface StageDecision {
  /** The merged action for the stage (most restrictive wins) */
  action: string;
  /** All reason codes from evaluated modules */
  reason_codes: string[];
  /** Which pipeline stage produced this decision */
  stage: PipelineStage;
  /** Stage evaluation duration in milliseconds */
  latency_ms: number;
  /** Per-module evaluation details */
  module_details: ModuleEvalDetail[];
  /** Remediation details (PostExecution only, when remediation triggered) */
  remediation?: {
    action: RemediationAction;
    /** Name of the module that triggered the violation */
    triggered_by: string;
    /** Resample attempt number */
    attempt: number;
  };
  /** TEEC v2.1: Intent reference (hash of input payload) */
  intent_ref?: string;
  /** TEEC v2.1: Receipt reference (chains to previous decision) */
  receipt_ref?: string;
  /** TEEC v2.1: Monotonically increasing sequence number */
  seq?: number;
  /** TEEC v2.1: Per-pipeline running count */
  running_count?: number;
  /** TEEC v2.1: Normalization identifier */
  normalization_id?: string;
  /** TEEC v2.1: Cryptographic governance seal */
  governance_seal?: {
    hmac: string;
    timestamp: number;
    agent_id: string;
  };
}

// ── Module Evaluation Detail ─────────────────────────────────────

/**
 * Per-module evaluation result recorded in the StageDecision.
 * Captures timing, action, reason codes, and any error for audit trail.
 */
export interface ModuleEvalDetail {
  /** Module name */
  name: string;
  /** Module version */
  version: string;
  /** Module evaluation duration in milliseconds */
  latency_ms: number;
  /** Action produced by this module */
  action: string;
  /** Reason codes from this module */
  reason_codes: string[];
  /** Error message if module threw or timed out */
  error?: string;
  /** Arbitrary metadata produced by the module */
  metadata?: Record<string, unknown>;
}

// ── Execution Metadata ───────────────────────────────────────────

/**
 * Metadata extracted from the LLM provider response by the ExecutionStage
 * via the ObserveProxy instrumentation.
 */
export interface ExecutionMetadata {
  /** Model identifier used for the request */
  model: string;
  /** Provider call latency in milliseconds */
  latency_ms: number;
  /** Token usage breakdown */
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  /** Estimated cost in USD */
  cost_usd: number;
}

// ── Execution Result ─────────────────────────────────────────────

/**
 * Result from the ExecutionStage after forwarding a request to the LLM provider.
 */
export interface ExecutionResult {
  /** Whether the provider call succeeded */
  success: boolean;
  /** The raw LLM response (null on failure) */
  response: any | null;
  /** Extracted metadata (null on failure) */
  metadata: ExecutionMetadata | null;
  /** Error details if the provider threw */
  error?: { message: string; code?: string };
}
