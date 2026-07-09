/**
 * Multi-Stage Defense Pipeline — Cost Reconciliation Module
 *
 * Compares actual response token usage against pre-execution cost estimates.
 * Returns MONITOR when the actual cost exceeds the estimate by more than
 * a configurable tolerance (default 20%).
 *
 * This module never returns DENY — it only flags cost overruns for
 * observability. The pipeline continues regardless of the finding.
 *
 * @module pipeline/modules/post/CostReconciliationModule
 * @requirements 7.5, 7.6, 7.7
 */

import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';
import { DecisionAction } from '../../../core/engine/types';

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration object for CostReconciliationModule.
 */
export interface CostReconciliationConfig {
  /** Tolerance percentage (0–1 scale). Default: 0.2 (20%). */
  tolerance_pct?: number;
}

// ── Module Implementation ────────────────────────────────────────

/**
 * Compares actual token usage against pre-execution cost estimates and
 * returns MONITOR when the actual cost exceeds the estimate by more than
 * the configured tolerance.
 *
 * The module reads cost data from the evaluation request:
 * - `_execution_metadata.usage.total_tokens` — actual token usage from provider
 * - `_estimated_tokens` — pre-execution token estimate (from CostBudgetModule or user)
 *
 * When a cost overrun is detected:
 * - action: MONITOR
 * - reason_codes: ['COST_OVERRUN']
 * - metadata: { actual_tokens, estimated_tokens, overrun_pct, tolerance_pct }
 *
 * When within tolerance or when estimates are unavailable:
 * - action: ALLOW
 * - reason_codes: []
 */
export class CostReconciliationModule implements TealModule {
  readonly name = 'CostReconciliationModule';
  readonly version = '1.0.0';

  private readonly tolerancePct: number;

  constructor(config?: CostReconciliationConfig) {
    this.tolerancePct = config?.tolerance_pct ?? 0.2;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    const actualTokens = this.extractActualTokens(request);
    const estimatedTokens = this.extractEstimatedTokens(request);

    // If either value is missing or invalid, we cannot reconcile — ALLOW
    if (actualTokens === null || estimatedTokens === null || estimatedTokens <= 0) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'pipeline.cost_reconciliation',
        metadata: {
          module: this.name,
          actual_tokens: actualTokens,
          estimated_tokens: estimatedTokens,
          reconciliation_possible: false,
        },
      };
    }

    // Calculate overrun percentage
    const overrunPct = (actualTokens - estimatedTokens) / estimatedTokens;

    if (overrunPct > this.tolerancePct) {
      return {
        action: 'MONITOR' as any,
        reason_codes: ['COST_OVERRUN'],
        event_type: 'pipeline.cost_reconciliation',
        metadata: {
          module: this.name,
          actual_tokens: actualTokens,
          estimated_tokens: estimatedTokens,
          overrun_pct: overrunPct,
          tolerance_pct: this.tolerancePct,
          reconciliation_possible: true,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.cost_reconciliation',
      metadata: {
        module: this.name,
        actual_tokens: actualTokens,
        estimated_tokens: estimatedTokens,
        overrun_pct: overrunPct,
        tolerance_pct: this.tolerancePct,
        reconciliation_possible: true,
      },
    };
  }

  /**
   * Extract actual token usage from execution metadata.
   * Looks for `_execution_metadata.usage.total_tokens` in the request.
   */
  private extractActualTokens(request: ModuleEvaluationRequest): number | null {
    const execMeta = request._execution_metadata as
      | { usage?: { total_tokens?: number } }
      | undefined;

    if (
      execMeta &&
      typeof execMeta === 'object' &&
      execMeta.usage &&
      typeof execMeta.usage.total_tokens === 'number'
    ) {
      return execMeta.usage.total_tokens;
    }

    // Fallback: check _response metadata
    const response = request._response as
      | { usage?: { total_tokens?: number } }
      | undefined;

    if (
      response &&
      typeof response === 'object' &&
      response.usage &&
      typeof response.usage.total_tokens === 'number'
    ) {
      return response.usage.total_tokens;
    }

    return null;
  }

  /**
   * Extract the pre-execution token estimate from the request.
   * Looks for `_estimated_tokens` field set by CostBudgetModule or pipeline context.
   */
  private extractEstimatedTokens(request: ModuleEvaluationRequest): number | null {
    if (typeof request._estimated_tokens === 'number' && request._estimated_tokens > 0) {
      return request._estimated_tokens;
    }
    return null;
  }
}
