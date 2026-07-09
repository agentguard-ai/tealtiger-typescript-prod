/**
 * Multi-Stage Defense Pipeline — Cost Budget Module
 *
 * Checks the estimated cost of a request against session, agent, and daily budgets.
 * Returns DENY with reason code BUDGET_EXCEEDED when any budget would be exceeded.
 * Tracks accumulated costs internally and exposes `addCost()` for external integration.
 *
 * @module pipeline/modules/pre/CostBudgetModule
 * @requirements 6.4, 6.6, 6.7
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
 * Configuration object for CostBudgetModule.
 */
export interface CostBudgetConfig {
  /** Maximum USD spend allowed per session. */
  session_budget?: number;
  /** Maximum USD spend allowed per day. */
  daily_budget?: number;
  /** Maximum USD spend allowed per agent. */
  agent_budget?: number;
  /** Estimated cost per token in USD. Default: 0.00003 */
  cost_per_token?: number;
}

// ── Module Implementation ────────────────────────────────────────

/**
 * Checks the estimated cost of a request against configured budgets.
 * Returns DENY with reason code BUDGET_EXCEEDED when any budget would be exceeded.
 * Returns ALLOW when within all budgets.
 *
 * Cost estimation uses a configurable cost_per_token rate applied to the token
 * count derived from request content length (~4 chars per token heuristic) or
 * explicit token fields in the request.
 *
 * Tracks accumulated session and daily costs internally. Call `addCost()` after
 * a successful LLM response to keep the internal state accurate for subsequent
 * budget checks.
 */
export class CostBudgetModule implements TealModule {
  readonly name = 'CostBudgetModule';
  readonly version = '1.0.0';

  private readonly config: CostBudgetConfig;
  private readonly costPerToken: number;

  /** Accumulated cost for the current session (USD). */
  private sessionSpent = 0;
  /** Accumulated cost for the current day (USD). */
  private dailySpent = 0;
  /** Accumulated cost for the current agent (USD). */
  private agentSpent = 0;
  /** Timestamp of the current day start for daily budget reset detection. */
  private dailyResetTimestamp: number;

  constructor(config: CostBudgetConfig) {
    this.config = config;
    this.costPerToken = config.cost_per_token ?? 0.00003;
    this.dailyResetTimestamp = this.getDayStart(Date.now());
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    // Reset daily budget if we've crossed into a new day
    this.checkDailyReset();

    const estimatedCost = this.estimateCost(request);
    const exceededBudgets: string[] = [];

    // Check session budget
    if (
      this.config.session_budget !== undefined &&
      this.sessionSpent + estimatedCost > this.config.session_budget
    ) {
      exceededBudgets.push(
        `session: $${(this.sessionSpent + estimatedCost).toFixed(6)} > $${this.config.session_budget.toFixed(6)}`,
      );
    }

    // Check daily budget
    if (
      this.config.daily_budget !== undefined &&
      this.dailySpent + estimatedCost > this.config.daily_budget
    ) {
      exceededBudgets.push(
        `daily: $${(this.dailySpent + estimatedCost).toFixed(6)} > $${this.config.daily_budget.toFixed(6)}`,
      );
    }

    // Check agent budget
    if (
      this.config.agent_budget !== undefined &&
      this.agentSpent + estimatedCost > this.config.agent_budget
    ) {
      exceededBudgets.push(
        `agent: $${(this.agentSpent + estimatedCost).toFixed(6)} > $${this.config.agent_budget.toFixed(6)}`,
      );
    }

    if (exceededBudgets.length > 0) {
      return {
        action: DecisionAction.DENY,
        reason_codes: ['BUDGET_EXCEEDED'],
        event_type: 'pipeline.cost_budget',
        metadata: {
          module: this.name,
          estimated_cost: estimatedCost,
          session_spent: this.sessionSpent,
          daily_spent: this.dailySpent,
          agent_spent: this.agentSpent,
          exceeded_budgets: exceededBudgets,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.cost_budget',
      metadata: {
        module: this.name,
        estimated_cost: estimatedCost,
        session_spent: this.sessionSpent,
        daily_spent: this.dailySpent,
        agent_spent: this.agentSpent,
      },
    };
  }

  /**
   * Add an actual cost amount to the internal tracking.
   * Call this after a successful LLM response to keep budget state accurate.
   *
   * @param amount - Cost in USD to add to all budget trackers.
   */
  addCost(amount: number): void {
    this.checkDailyReset();
    this.sessionSpent += amount;
    this.dailySpent += amount;
    this.agentSpent += amount;
  }

  /**
   * Get current accumulated costs for inspection/testing.
   */
  getSpent(): { session: number; daily: number; agent: number } {
    return {
      session: this.sessionSpent,
      daily: this.dailySpent,
      agent: this.agentSpent,
    };
  }

  /**
   * Reset all accumulated costs. Useful for session boundaries.
   */
  resetSession(): void {
    this.sessionSpent = 0;
  }

  /**
   * Estimate cost from the request's token count.
   * Uses explicit token fields if present, otherwise estimates from content length.
   */
  private estimateCost(request: ModuleEvaluationRequest): number {
    const tokenCount = this.estimateTokenCount(request);
    return tokenCount * this.costPerToken;
  }

  /**
   * Estimate token count from request.
   * Priority: explicit max_tokens/maxTokens field → content length heuristic (~4 chars/token).
   */
  private estimateTokenCount(request: ModuleEvaluationRequest): number {
    const maxTokens =
      (request['max_tokens'] as number | undefined) ??
      (request['maxTokens'] as number | undefined);
    if (typeof maxTokens === 'number' && maxTokens > 0) {
      return maxTokens;
    }

    const content = request.content ?? '';
    return Math.ceil(content.length / 4);
  }

  /**
   * Check if a new day has started and reset daily budget if so.
   */
  private checkDailyReset(): void {
    const currentDayStart = this.getDayStart(Date.now());
    if (currentDayStart > this.dailyResetTimestamp) {
      this.dailySpent = 0;
      this.dailyResetTimestamp = currentDayStart;
    }
  }

  /**
   * Get the Unix timestamp for the start of the day (midnight UTC) containing `timestamp`.
   */
  private getDayStart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
}
