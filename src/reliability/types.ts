/**
 * TealReliability Module — Types
 *
 * All TealReliability-specific types for retry, fallback, degrade,
 * and circuit breaker governance.
 *
 * @module reliability/types
 */

// ── Circuit Breaker State ────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ── Backoff Strategy ─────────────────────────────────────────────

export type BackoffStrategy = 'exponential' | 'linear' | 'fixed';

// ── Retry Config ─────────────────────────────────────────────────

export interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  budgetMs: number;
  transientCodes: number[];
  backoff: BackoffStrategy;
  baseDelayMs: number;
}

// ── Fallback ─────────────────────────────────────────────────────

export interface FallbackEntry {
  provider: string;
  model: string;
  priority: number;
}

export interface FallbackChainConfig {
  chain: FallbackEntry[];
  triggers: string[];
}

// ── Degrade ──────────────────────────────────────────────────────

export interface DegradeConfig {
  strategy: 'cheaper_model' | 'disable_tools' | 'summary_only' | 'custom';
  triggers: string[];
  customHandler?: (request: any) => any;
}

// ── Circuit Breaker ──────────────────────────────────────────────

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  cooldownMs: number;
  halfOpenProbes: number;
}

// ── Combined Config ──────────────────────────────────────────────

export interface TealReliabilityConfig {
  retry?: RetryConfig;
  fallback?: FallbackChainConfig;
  degrade?: DegradeConfig;
  circuit?: CircuitBreakerConfig;
}

// ── Reliability Event ────────────────────────────────────────────

export interface ReliabilityEvent {
  type: 'retry' | 'fallback' | 'degrade' | 'circuit';
  reason_code: string;
  provider?: string;
  model?: string;
  attempt?: number;
  elapsed_ms?: number;
  circuit_state?: CircuitState;
}

// ── Transient Error ──────────────────────────────────────────────

export class TransientError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'TransientError';
    this.statusCode = statusCode;
  }
}
