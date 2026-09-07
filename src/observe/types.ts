/**
 * Shared types for the observe() zero-config instrumentation module.
 *
 * These types define the interfaces for ObserveProxy, provider detection,
 * cost tracking, behavioral baseline, and PII scanning.
 *
 * @module observe/types
 * @requirements 1.1, 1.3, 1.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { TokenUsage } from '../cost/types';
import type { DecisionV21 } from '../core/engine/v2.1/types';

// Re-export TokenUsage so consumers of observe module can import from here
export { TokenUsage };

// --- Provider Types ---

/**
 * The 12 supported LLM provider types that observe() can wrap.
 */
export type SupportedProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'bedrock'
  | 'azure-openai'
  | 'cohere'
  | 'mistral'
  | 'deepseek'
  | 'groq'
  | 'xai'
  | 'together'
  | 'hf-tgi';

/**
 * Information about a tool call detected in a provider response.
 */
export interface ToolCallInfo {
  toolName: string;
  argumentCount: number;
  /** SHA-256 hash of JSON.stringify(arguments) */
  argumentsHash: string;
}

/**
 * Provider-specific signature defining how to interact with a provider client.
 */
export interface ProviderSignature {
  provider: SupportedProvider;
  /** Method paths that indicate LLM API calls to intercept */
  interceptMethods: string[];
  /** Extract token usage from this provider's response */
  usageExtractor: (response: unknown) => TokenUsage | null;
  /** Extract model name from request/response */
  modelExtractor: (request: unknown, response: unknown) => string;
  /** Extract tool calls from the response */
  toolCallExtractor: (response: unknown) => ToolCallInfo[];
}


// --- Observe Config ---

/**
 * Optional configuration for observe().
 * If omitted, agentId and sessionId are auto-generated as UUID v4.
 */
export interface ObserveConfig {
  /** Agent identifier. Auto-generated UUID v4 if omitted. */
  agentId?: string;
  /** Session identifier. Auto-generated UUID v4 if omitted. */
  sessionId?: string;
  /** Number of requests for baseline computation. Default: 100. */
  baselineWindow?: number;
  /**
   * Enable TEEC v2.1 governance decision production for all intercepted calls.
   * When true, each call through the proxy produces a DecisionV21 with cryptographic seals.
   * Requires `governance_seal_secret` to be provided.
   */
  governance?: boolean;
  /**
   * The seal secret for HMAC-SHA256 governance seals.
   * Required when `governance: true`. Throws SealConfigurationError at init if missing.
   */
  governance_seal_secret?: string;
}

// --- Cost Types ---

/**
 * Summary of accumulated cost for a session or agent.
 */
export interface ObserveCostSummary {
  /** Total accumulated cost in USD */
  totalCost: number;
  /** Number of requests processed */
  requestCount: number;
  /** Whether any request had pricing unavailable */
  hasPricingGaps: boolean;
  /** Elapsed time in milliseconds since the observe() session started */
  sessionDurationMs: number;
  /** Breakdown by cost category */
  breakdown: {
    inputCost: number;
    outputCost: number;
    imageCost: number;
    audioCost: number;
  };
}

export type CostSummary = ObserveCostSummary;

/**
 * Cost result for a single request.
 */
export interface RequestCostResult {
  requestId: string;
  cost: number;
  pricingUnavailable: boolean;
  breakdown: {
    inputCost: number;
    outputCost: number;
    imageCost?: number;
    audioCost?: number;
  };
}

// --- Baseline Types ---

/**
 * A single sample for behavioral baseline computation.
 */
export interface BaselineSample {
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCallCount: number;
}

/**
 * Percentile statistics (P50, P95, P99) for a metric.
 */
export interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Result of behavioral baseline computation.
 */
export interface BaselineResult {
  /** Whether the baseline has collected enough samples */
  isComplete: boolean;
  /** Number of samples collected so far */
  sampleCount: number;
  /** Target window size */
  windowSize: number;
  /** Computed statistics (null if baseline is incomplete) */
  stats: {
    latencyMs: PercentileStats;
    inputTokens: PercentileStats;
    outputTokens: PercentileStats;
    costUsd: PercentileStats;
    toolCallCount: PercentileStats;
  } | null;
}

// --- PII Types ---

/**
 * Summary of PII detections in a payload.
 */
export interface PIIDetectionSummary {
  /** Number of PII instances detected */
  count: number;
  /** Types found (e.g., ['email', 'ssn']) */
  types: string[];
  /** Whether detection was in request or response */
  phase: 'request' | 'response';
}

// --- ObserveProxy Type ---

/**
 * The proxy type returned by observe(). Extends the original client type
 * with telemetry accessor methods.
 */
export type ObserveProxy<T> = T & {
  /** Get accumulated cost for this session */
  getCost(): ObserveCostSummary;
  /** Get accumulated cost for the agent (across sessions) */
  getAgentCost(): ObserveCostSummary;
  /** Get the behavioral baseline (null if incomplete) */
  getBaseline(): BaselineResult | null;
  /** Get the agent ID for this proxy */
  getAgentId(): string;
  /** Get the session ID for this proxy */
  getSessionId(): string;
  /**
   * Get TEEC v2.1 governance decisions produced by the proxy.
   * Returns an empty array if governance mode is not enabled.
   */
  getDecisions(): DecisionV21[];
};

// --- Internal State ---

/**
 * Internal state held per observe() proxy instance.
 * Not exported publicly — used by observe.ts and the intercepted method wrapper.
 *
 * Component fields use `any` as placeholders until their respective modules
 * (CostAccumulator, BehavioralBaseline, ObservePIIScanner, ObserveAuditLogger)
 * are created and imported properly.
 */
export interface ObserveState {
  agentId: string;
  sessionId: string;
  provider: SupportedProvider;
  providerSignature: ProviderSignature;
  /** CostAccumulator instance — typed as any until module is created */
  costAccumulator: any;
  /** BehavioralBaseline instance — typed as any until module is created */
  baseline: any;
  /** ObservePIIScanner instance — typed as any until module is created */
  piiScanner: any;
  /** ObserveAuditLogger instance — typed as any until module is created */
  auditLogger: any;
  requestCount: number;
}
