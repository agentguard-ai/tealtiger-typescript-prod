/**
 * TealReliability Module — Reliability Governance
 *
 * Implements bounded retry, fallback chain, deterministic degrade,
 * and circuit breaker with audit-grade evidence. Deterministic:
 * same config + same failure sequence = same behavior.
 *
 * @module reliability/TealReliability
 */

import { DecisionAction, ReasonCode } from '../core/engine/types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
  Decision,
} from '../core/engine/v1.2/types';
import type {
  TealReliabilityConfig,
  RetryConfig,
  FallbackChainConfig,
  DegradeConfig,
  CircuitBreakerConfig,
  CircuitState,
  ReliabilityEvent,
} from './types';
import { TransientError } from './types';

// ── Default configs ──────────────────────────────────────────────

const DEFAULT_RETRY: RetryConfig = {
  enabled: true,
  maxAttempts: 3,
  budgetMs: 10000,
  transientCodes: [429, 500, 502, 503],
  backoff: 'exponential',
  baseDelayMs: 200,
};

const DEFAULT_CIRCUIT: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  cooldownMs: 30000,
  halfOpenProbes: 1,
};

// ── Per-provider circuit state ───────────────────────────────────

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  halfOpenSuccesses: number;
}

// ── TealReliability ──────────────────────────────────────────────

export class TealReliability implements TealModule {
  readonly name = 'TealReliability';
  readonly version = '1.2.0';

  private readonly retryConfig: RetryConfig;
  private readonly fallbackConfig: FallbackChainConfig | undefined;
  private readonly degradeConfig: DegradeConfig | undefined;
  private readonly circuitConfig: CircuitBreakerConfig;
  private readonly circuits: Map<string, CircuitBreakerState> = new Map();

  /** Overridable clock for testing */
  now: () => number = () => Date.now();

  /** Overridable sleep for testing */
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  constructor(config: TealReliabilityConfig) {
    this.retryConfig = config.retry ?? DEFAULT_RETRY;
    this.fallbackConfig = config.fallback;
    this.degradeConfig = config.degrade;
    this.circuitConfig = config.circuit ?? DEFAULT_CIRCUIT;
  }

  // ── TealModule interface ─────────────────────────────────────

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    // Module evaluate delegates to executeWithReliability with a no-op fn
    const events: ReliabilityEvent[] = [];
    const provider = (request as any).provider ?? 'default';
    const circuitState = this.getCircuitState(provider);

    if (circuitState === 'OPEN') {
      events.push({
        type: 'circuit',
        reason_code: ReasonCode.CIRCUIT_OPEN,
        provider,
        circuit_state: 'OPEN',
      });
      return {
        action: DecisionAction.DENY,
        reason_codes: [ReasonCode.CIRCUIT_OPEN],
        event_type: 'reliability.circuit_open',
        metadata: { events, provider },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [ReasonCode.POLICY_COMPLIANT],
      event_type: 'reliability.evaluate',
      metadata: { events, provider, circuit_state: circuitState },
    };
  }

  // ── Public API: executeWithReliability ────────────────────────

  async executeWithReliability<T>(
    fn: () => Promise<T>,
    ctx: ModuleContext,
    provider?: string,
  ): Promise<{ result?: T; decision: Decision; events: ReliabilityEvent[] }> {
    const events: ReliabilityEvent[] = [];
    const prov = provider ?? 'default';

    // 1. Circuit breaker check
    const circuitState = this.getCircuitState(prov);
    if (circuitState === 'OPEN') {
      events.push({
        type: 'circuit',
        reason_code: ReasonCode.CIRCUIT_OPEN,
        provider: prov,
        circuit_state: 'OPEN',
      });
      // Route to fallback or deny
      return this.handleFallbackOrDeny(events, ctx, prov);
    }

    // 2. Retry loop
    const startTime = this.now();
    const maxAttempts = this.retryConfig.enabled ? this.retryConfig.maxAttempts : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const elapsed = this.now() - startTime;
      if (elapsed >= this.retryConfig.budgetMs) {
        events.push({
          type: 'retry',
          reason_code: ReasonCode.RETRY_BUDGET_EXCEEDED,
          attempt,
          elapsed_ms: elapsed,
          provider: prov,
        });
        break;
      }

      try {
        const result = await fn();
        // Success — reset circuit on success
        this.recordSuccess(prov);
        return {
          result,
          decision: this.makeDecision(
            DecisionAction.ALLOW,
            [ReasonCode.POLICY_COMPLIANT],
            ctx,
            'Request succeeded',
          ),
          events,
        };
      } catch (err) {
        const statusCode = this.getStatusCode(err);
        const isTransient =
          statusCode !== undefined &&
          this.retryConfig.transientCodes.includes(statusCode);

        if (!isTransient) {
          // Non-transient error — don't retry, record failure
          this.recordFailure(prov);
          return {
            decision: this.makeDecision(
              DecisionAction.DENY,
              [ReasonCode.POLICY_VIOLATION],
              ctx,
              `Non-transient error: ${(err as Error).message}`,
            ),
            events,
          };
        }

        // Transient failure
        this.recordFailure(prov);
        events.push({
          type: 'retry',
          reason_code: ReasonCode.RETRY_TRANSIENT_FAILURE,
          attempt,
          elapsed_ms: this.now() - startTime,
          provider: prov,
        });

        // Check if circuit just opened
        if (this.getCircuitState(prov) === 'OPEN') {
          events.push({
            type: 'circuit',
            reason_code: ReasonCode.CIRCUIT_OPEN,
            provider: prov,
            circuit_state: 'OPEN',
          });
          return this.handleFallbackOrDeny(events, ctx, prov);
        }

        // Backoff before next attempt (skip if last attempt)
        if (attempt < maxAttempts) {
          const delay = this.computeBackoff(attempt);
          const remainingBudget = this.retryConfig.budgetMs - (this.now() - startTime);
          if (delay >= remainingBudget) {
            events.push({
              type: 'retry',
              reason_code: ReasonCode.RETRY_BUDGET_EXCEEDED,
              attempt: attempt + 1,
              elapsed_ms: this.now() - startTime,
              provider: prov,
            });
            break;
          }
          await this.sleep(delay);
        }
      }
    }

    // Retry budget exceeded — emit event and try fallback
    const hasExceededEvent = events.some(
      (e) => e.reason_code === ReasonCode.RETRY_BUDGET_EXCEEDED,
    );
    if (!hasExceededEvent) {
      events.push({
        type: 'retry',
        reason_code: ReasonCode.RETRY_BUDGET_EXCEEDED,
        elapsed_ms: this.now() - startTime,
        provider: prov,
      });
    }

    return this.handleFallbackOrDeny(events, ctx, prov);
  }

  // ── Circuit Breaker Public API ─────────────────────────────────

  getCircuitState(provider?: string): CircuitState {
    const prov = provider ?? 'default';
    const cb = this.circuits.get(prov);
    if (!cb) return 'CLOSED';

    // Check if OPEN should transition to HALF_OPEN
    if (cb.state === 'OPEN') {
      const elapsed = this.now() - cb.lastFailureTime;
      if (elapsed >= this.circuitConfig.cooldownMs) {
        cb.state = 'HALF_OPEN';
        cb.halfOpenSuccesses = 0;
      }
    }

    return cb.state;
  }

  resetCircuit(provider?: string): void {
    const prov = provider ?? 'default';
    this.circuits.delete(prov);
  }

  // ── Fallback Chain ─────────────────────────────────────────────

  private async handleFallbackOrDeny(
    events: ReliabilityEvent[],
    ctx: ModuleContext,
    provider: string,
  ): Promise<{ result?: any; decision: Decision; events: ReliabilityEvent[] }> {
    // Try fallback chain if configured
    if (this.fallbackConfig) {
      const sorted = [...this.fallbackConfig.chain].sort(
        (a, b) => a.priority - b.priority,
      );

      for (const entry of sorted) {
        events.push({
          type: 'fallback',
          reason_code: ReasonCode.FALLBACK_TRIGGERED,
          provider: entry.provider,
          model: entry.model,
        });

        // In a real implementation, we'd attempt the fallback provider here.
        // For the module, we signal the fallback was triggered.
        // The caller is responsible for actually calling the fallback provider.
      }

      // All fallback entries exhausted
      events.push({
        type: 'fallback',
        reason_code: ReasonCode.FALLBACK_CHAIN_EXHAUSTED,
        provider,
      });
    }

    // Try degrade if configured
    if (this.degradeConfig) {
      return this.handleDegrade(events, ctx, provider);
    }

    // No fallback, no degrade → DENY
    return {
      decision: this.makeDecision(
        DecisionAction.DENY,
        this.collectReasonCodes(events),
        ctx,
        'All retry and fallback options exhausted',
      ),
      events,
    };
  }

  // ── Deterministic Degrade ──────────────────────────────────────

  private handleDegrade(
    events: ReliabilityEvent[],
    ctx: ModuleContext,
    provider: string,
  ): { result?: any; decision: Decision; events: ReliabilityEvent[] } {
    events.push({
      type: 'degrade',
      reason_code: ReasonCode.DEGRADE_TRIGGERED,
      provider,
    });

    const metadata: Record<string, unknown> = {
      strategy: this.degradeConfig!.strategy,
      provider,
    };

    if (this.degradeConfig!.strategy === 'custom' && this.degradeConfig!.customHandler) {
      metadata.custom_applied = true;
    }

    return {
      decision: this.makeDecision(
        DecisionAction.DEGRADE,
        this.collectReasonCodes(events),
        ctx,
        `Degraded: ${this.degradeConfig!.strategy}`,
        metadata,
      ),
      events,
    };
  }

  /**
   * Apply degradation to a request object. Deterministic: same input + same config = same output.
   */
  applyDegrade(request: any): any {
    if (!this.degradeConfig) return request;

    switch (this.degradeConfig.strategy) {
      case 'cheaper_model':
        return { ...request, model: 'gpt-3.5-turbo', _degraded: true };
      case 'disable_tools':
        return { ...request, tools: undefined, tool: undefined, _degraded: true };
      case 'summary_only':
        return { ...request, max_tokens: 100, _degraded: true };
      case 'custom':
        if (this.degradeConfig.customHandler) {
          return this.degradeConfig.customHandler(request);
        }
        return request;
      default:
        return request;
    }
  }

  // ── Circuit Breaker Internals ──────────────────────────────────

  private getOrCreateCircuit(provider: string): CircuitBreakerState {
    let cb = this.circuits.get(provider);
    if (!cb) {
      cb = {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        halfOpenSuccesses: 0,
      };
      this.circuits.set(provider, cb);
    }
    return cb;
  }

  private recordFailure(provider: string): void {
    if (!this.circuitConfig.enabled) return;
    const cb = this.getOrCreateCircuit(provider);

    if (cb.state === 'HALF_OPEN') {
      // Probe failed → back to OPEN
      cb.state = 'OPEN';
      cb.lastFailureTime = this.now();
      cb.halfOpenSuccesses = 0;
      return;
    }

    cb.failureCount++;
    cb.lastFailureTime = this.now();

    if (cb.failureCount >= this.circuitConfig.failureThreshold) {
      cb.state = 'OPEN';
    }
  }

  private recordSuccess(provider: string): void {
    if (!this.circuitConfig.enabled) return;
    const cb = this.getOrCreateCircuit(provider);

    if (cb.state === 'HALF_OPEN') {
      cb.halfOpenSuccesses++;
      if (cb.halfOpenSuccesses >= this.circuitConfig.halfOpenProbes) {
        // Enough successful probes → CLOSED
        cb.state = 'CLOSED';
        cb.failureCount = 0;
        cb.halfOpenSuccesses = 0;
      }
      return;
    }

    // In CLOSED state, reset failure count on success
    cb.failureCount = 0;
  }

  // ── Backoff Computation ────────────────────────────────────────

  private computeBackoff(attempt: number): number {
    const base = this.retryConfig.baseDelayMs;
    switch (this.retryConfig.backoff) {
      case 'exponential':
        return base * Math.pow(2, attempt);
      case 'linear':
        return base * attempt;
      case 'fixed':
        return base;
      default:
        return base;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private getStatusCode(err: unknown): number | undefined {
    if (err instanceof TransientError) return err.statusCode;
    if (err && typeof err === 'object' && 'statusCode' in err) {
      return (err as any).statusCode;
    }
    if (err && typeof err === 'object' && 'status' in err) {
      return (err as any).status;
    }
    return undefined;
  }

  private collectReasonCodes(events: ReliabilityEvent[]): ReasonCode[] {
    const codes = new Set<string>();
    for (const e of events) {
      codes.add(e.reason_code);
    }
    // Ensure at least one code
    if (codes.size === 0) {
      codes.add(ReasonCode.POLICY_VIOLATION);
    }
    return [...codes] as ReasonCode[];
  }

  private makeDecision(
    action: DecisionAction,
    reason_codes: ReasonCode[],
    ctx: ModuleContext,
    reason: string,
    extraMetadata?: Record<string, unknown>,
  ): Decision {
    return {
      action,
      reason_codes,
      risk_score: action === DecisionAction.ALLOW ? 0 : 60,
      mode: 'ENFORCE' as any,
      policy_id: 'reliability-governance',
      policy_version: ctx.policy_version,
      component_versions: { sdk: '1.2.0', engine: '1.2.0' },
      correlation_id: ctx.correlation_id,
      reason,
      event_type: 'reliability.governance',
      teec_version: '0.1.0',
      timestamp: this.now(),
      module: this.name,
      metadata: {
        module: this.name,
        version: this.version,
        ...extraMetadata,
      },
    } as Decision;
  }
}
