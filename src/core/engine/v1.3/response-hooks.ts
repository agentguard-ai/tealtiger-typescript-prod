/**
 * TealEngine v1.3 — Response Hook Manager
 *
 * Manages invocation of response hooks (webhooks) triggered by governance
 * decisions. Supports deduplication, rate limiting, and configurable retry.
 *
 * Hooks fire within 100ms target (non-blocking to the caller).
 * Triggers: policy_violation, high_risk, freeze_tamper
 *
 * @module core/engine/v1.3/response-hooks
 * @requirements 5.3, 5.4, 5.5, 5.7
 */

import type { DecisionV13 } from './types';
import type { ResponseHookConfig, ResponseHookResult, ResponseHookTrigger } from './soc-types';

// ── Internal tracking types ──────────────────────────────────────

interface DedupEntry {
  /** Rule/reason code that was deduplicated */
  key: string;
  /** Timestamp of last invocation */
  last_invoked_at: number;
}

interface RateLimitEntry {
  /** Hook ID */
  hook_id: string;
  /** Timestamps of invocations within the current minute window */
  invocations: number[];
}

// ── ResponseHookManager ──────────────────────────────────────────

/**
 * Manages response hook invocations with deduplication, rate limiting,
 * and retry on failure.
 *
 * - Deduplication: suppresses repeated violations of the same rule
 *   within `dedup_window_ms`
 * - Rate limiting: max invocations per minute per hook
 * - Retry: configurable retry policy (max_retries, backoff_ms, timeout_ms)
 */
export class ResponseHookManager {
  /** Deduplication state: hookId:reasonCode → last invocation time */
  private readonly dedupState = new Map<string, DedupEntry>();

  /** Rate limit state: hookId → invocation timestamps */
  private readonly rateLimitState = new Map<string, RateLimitEntry>();

  /** Optional HTTP invoker (injectable for testing) */
  private httpInvoker: (endpoint: string, payload: string) => Promise<{ status_code: number }>;

  constructor(
    invoker?: (endpoint: string, payload: string) => Promise<{ status_code: number }>,
  ) {
    this.httpInvoker = invoker ?? this.defaultHttpInvoker;
  }

  /**
   * Invoke all matching response hooks for a governance decision.
   *
   * Fires within 100ms target (non-blocking). Each hook is evaluated
   * for trigger match, deduplication, and rate limiting before invocation.
   *
   * @param decision - The governance decision that triggered hooks
   * @param hookConfigs - Array of configured response hooks
   * @returns Array of results for each hook invocation attempt
   */
  async invoke(
    decision: DecisionV13,
    hookConfigs: ResponseHookConfig[],
  ): Promise<ResponseHookResult[]> {
    const results: ResponseHookResult[] = [];
    const triggers = this.determineTriggers(decision);

    for (const config of hookConfigs) {
      // Check if this hook's trigger matches the decision
      if (!triggers.includes(config.trigger)) {
        continue;
      }

      // Check deduplication
      const dedupKey = this.buildDedupKey(config.id, decision);
      if (this.isDeduplicated(dedupKey, config.dedup_window_ms)) {
        results.push({
          success: true,
          latency_ms: 0,
          error: 'deduplicated',
        });
        continue;
      }

      // Check rate limiting
      if (this.isRateLimited(config.id, config.rate_limit.max_per_minute)) {
        results.push({
          success: false,
          latency_ms: 0,
          error: 'rate_limited',
        });
        continue;
      }

      // Invoke the hook with retry
      const result = await this.invokeWithRetry(config, decision);
      results.push(result);

      // Record successful invocation for dedup and rate limit tracking
      if (result.success) {
        this.recordInvocation(dedupKey, config.id);
      }
    }

    return results;
  }

  /**
   * Reset all deduplication and rate limiting state.
   * Useful for testing.
   */
  reset(): void {
    this.dedupState.clear();
    this.rateLimitState.clear();
  }

  // ── Private: Trigger determination ───────────────────────────

  /**
   * Determine which triggers apply to a given decision.
   */
  private determineTriggers(decision: DecisionV13): ResponseHookTrigger[] {
    const triggers: ResponseHookTrigger[] = [];

    // policy_violation: any DENY decision with reason codes
    if (decision.action === 'DENY' && decision.reason_codes && decision.reason_codes.length > 0) {
      triggers.push('policy_violation');
    }

    // high_risk: risk score above threshold (default: 80)
    if ((decision.risk_score ?? 0) >= 80) {
      triggers.push('high_risk');
    }

    // freeze_tamper: specific reason code
    const reasonCodes = (decision.reason_codes ?? []) as string[];
    if (reasonCodes.includes('FREEZE_TAMPER_ATTEMPT') || reasonCodes.includes('FREEZE_BLOCK')) {
      triggers.push('freeze_tamper');
    }

    return triggers;
  }

  // ── Private: Deduplication ───────────────────────────────────

  private buildDedupKey(hookId: string, decision: DecisionV13): string {
    // Dedup by hook + first reason code (the primary violation)
    const primaryReason = (decision.reason_codes ?? [])[0] ?? 'unknown';
    return `${hookId}:${primaryReason}`;
  }

  private isDeduplicated(key: string, windowMs: number): boolean {
    const entry = this.dedupState.get(key);
    if (!entry) return false;

    const elapsed = Date.now() - entry.last_invoked_at;
    return elapsed < windowMs;
  }

  // ── Private: Rate limiting ───────────────────────────────────

  private isRateLimited(hookId: string, maxPerMinute: number): boolean {
    const entry = this.rateLimitState.get(hookId);
    if (!entry) return false;

    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    // Prune old invocations
    entry.invocations = entry.invocations.filter((t) => t > oneMinuteAgo);

    return entry.invocations.length >= maxPerMinute;
  }

  // ── Private: Invocation tracking ─────────────────────────────

  private recordInvocation(dedupKey: string, hookId: string): void {
    const now = Date.now();

    // Update dedup state
    this.dedupState.set(dedupKey, {
      key: dedupKey,
      last_invoked_at: now,
    });

    // Update rate limit state
    const entry = this.rateLimitState.get(hookId);
    if (entry) {
      entry.invocations.push(now);
    } else {
      this.rateLimitState.set(hookId, {
        hook_id: hookId,
        invocations: [now],
      });
    }
  }

  // ── Private: Retry logic ─────────────────────────────────────

  private async invokeWithRetry(
    config: ResponseHookConfig,
    decision: DecisionV13,
  ): Promise<ResponseHookResult> {
    const payload = JSON.stringify({
      event: config.trigger,
      decision: {
        action: decision.action,
        reason_codes: decision.reason_codes,
        risk_score: decision.risk_score,
        correlation_id: decision.correlation_id,
        timestamp: decision.timestamp,
      },
      hook_id: config.id,
      invoked_at: new Date().toISOString(),
    });

    const maxAttempts = (config.retry_policy.max_retries ?? 0) + 1;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Backoff before retry
        const delay = config.retry_policy.backoff_ms * Math.pow(2, attempt - 1);
        await this.sleep(Math.min(delay, config.retry_policy.timeout_ms));
      }

      const startTime = Date.now();
      try {
        const response = await this.withTimeout(
          this.httpInvoker(config.endpoint, payload),
          config.retry_policy.timeout_ms,
        );
        const latency = Date.now() - startTime;

        if (response.status_code >= 200 && response.status_code < 300) {
          return {
            success: true,
            status_code: response.status_code,
            latency_ms: latency,
          };
        }

        lastError = `HTTP ${response.status_code}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: false,
      latency_ms: 0,
      error: `Failed after ${maxAttempts} attempts: ${lastError}`,
    };
  }

  // ── Private: HTTP invocation ─────────────────────────────────

  private async defaultHttpInvoker(
    endpoint: string,
    payload: string,
  ): Promise<{ status_code: number }> {
    if (typeof globalThis.fetch === 'function') {
      const response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      return { status_code: response.status };
    }

    // Fallback for environments without fetch
    throw new Error(`ResponseHookManager: fetch not available for endpoint ${endpoint}`);
  }

  // ── Private: Utilities ───────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
