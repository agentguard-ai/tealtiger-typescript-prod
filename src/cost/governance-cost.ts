/**
 * Governance-Owned Cost Limits — TealMonitor v2
 *
 * Enforces cost budgets defined in governance policy bundles.
 * Governance limits take precedence over application-level limits (floor enforcement).
 * Application code cannot raise limits above governance-defined ceilings.
 *
 * @module cost/governance-cost
 * @requirements 17.1–17.4
 */

import { CostGovernanceConfig } from '../core/engine/v1.3/module-types';

/**
 * Parameters for a budget check request.
 */
export interface BudgetCheckParams {
  agent_id: string;
  estimated_cost: number;
  session_id?: string;
  reasoning_tokens?: number;
}

/**
 * Result of a budget check.
 */
export interface BudgetCheckResult {
  allowed: boolean;
  reason_code?: string;
  remaining_budget: number;
}

/**
 * Internal tracking record for cumulative costs.
 */
interface CostAccumulator {
  total: number;
  last_reset: number;
}

/**
 * GovernanceCostEnforcer — Enforces governance-owned cost limits.
 *
 * Governance limits are defined in policy bundles and take absolute precedence
 * over any application-configured limits. The enforcer tracks cumulative costs
 * per agent, per session, and per day, and denies requests that would exceed
 * governance ceilings.
 */
export class GovernanceCostEnforcer {
  private config: CostGovernanceConfig;

  /** Cumulative cost per agent (keyed by agent_id). */
  private agentCosts: Map<string, CostAccumulator> = new Map();

  /** Cumulative cost per session (keyed by session_id). */
  private sessionCosts: Map<string, CostAccumulator> = new Map();

  /** Cumulative daily cost (keyed by date string YYYY-MM-DD). */
  private dailyCosts: Map<string, CostAccumulator> = new Map();

  /** Reasoning tokens consumed per session (keyed by session_id or agent_id). */
  private reasoningTokens: Map<string, number> = new Map();

  constructor(config: CostGovernanceConfig) {
    this.config = config;
  }

  /**
   * Check whether a request is within governance budget limits.
   *
   * Evaluates all applicable governance limits in order:
   * 1. Per-request max
   * 2. Reasoning token budget
   * 3. Per-session max
   * 4. Per-daily max
   * 5. Per-agent max
   *
   * Returns the most restrictive remaining budget across all limits.
   */
  checkBudget(params: BudgetCheckParams): BudgetCheckResult {
    const limits = this.config.governance_limits;

    // If no governance limits are configured, allow everything
    if (!limits) {
      return { allowed: true, remaining_budget: Infinity };
    }

    // 1. Per-request max
    if (params.estimated_cost > limits.per_request_max) {
      return {
        allowed: false,
        reason_code: 'COST_BUDGET_EXCEEDED',
        remaining_budget: limits.per_request_max,
      };
    }

    // 2. Reasoning token budget
    if (
      limits.reasoning_token_budget !== undefined &&
      params.reasoning_tokens !== undefined
    ) {
      const key = params.session_id || params.agent_id;
      const consumed = this.reasoningTokens.get(key) || 0;
      if (consumed + params.reasoning_tokens > limits.reasoning_token_budget) {
        return {
          allowed: false,
          reason_code: 'REASONING_TOKEN_BUDGET_EXCEEDED',
          remaining_budget: Math.max(0, limits.reasoning_token_budget - consumed),
        };
      }
    }

    // 3. Per-session max
    if (params.session_id) {
      const sessionAccum = this.sessionCosts.get(params.session_id);
      const sessionTotal = sessionAccum ? sessionAccum.total : 0;
      if (sessionTotal + params.estimated_cost > limits.per_session_max) {
        return {
          allowed: false,
          reason_code: 'COST_BUDGET_EXCEEDED',
          remaining_budget: Math.max(0, limits.per_session_max - sessionTotal),
        };
      }
    }

    // 4. Per-daily max
    const today = this.getTodayKey();
    const dailyAccum = this.dailyCosts.get(today);
    const dailyTotal = dailyAccum ? dailyAccum.total : 0;
    if (dailyTotal + params.estimated_cost > limits.per_daily_max) {
      return {
        allowed: false,
        reason_code: 'COST_BUDGET_EXCEEDED',
        remaining_budget: Math.max(0, limits.per_daily_max - dailyTotal),
      };
    }

    // 5. Per-agent max
    const agentAccum = this.agentCosts.get(params.agent_id);
    const agentTotal = agentAccum ? agentAccum.total : 0;
    if (agentTotal + params.estimated_cost > limits.per_agent_max) {
      return {
        allowed: false,
        reason_code: 'COST_BUDGET_EXCEEDED',
        remaining_budget: Math.max(0, limits.per_agent_max - agentTotal),
      };
    }

    // Calculate the most restrictive remaining budget
    const remainingBudgets = [
      limits.per_request_max - params.estimated_cost,
      limits.per_daily_max - dailyTotal - params.estimated_cost,
      limits.per_agent_max - agentTotal - params.estimated_cost,
    ];

    if (params.session_id) {
      const sessionAccum = this.sessionCosts.get(params.session_id);
      const sessionTotal = sessionAccum ? sessionAccum.total : 0;
      remainingBudgets.push(limits.per_session_max - sessionTotal - params.estimated_cost);
    }

    const remaining_budget = Math.max(0, Math.min(...remainingBudgets));

    return { allowed: true, remaining_budget };
  }

  /**
   * Record a cost after a request has been allowed and executed.
   * Updates all cumulative trackers.
   */
  recordCost(params: {
    agent_id: string;
    cost: number;
    session_id?: string;
    reasoning_tokens?: number;
  }): void {
    const now = Date.now();

    // Update agent cost
    const agentAccum = this.agentCosts.get(params.agent_id) || { total: 0, last_reset: now };
    agentAccum.total += params.cost;
    this.agentCosts.set(params.agent_id, agentAccum);

    // Update session cost
    if (params.session_id) {
      const sessionAccum = this.sessionCosts.get(params.session_id) || { total: 0, last_reset: now };
      sessionAccum.total += params.cost;
      this.sessionCosts.set(params.session_id, sessionAccum);
    }

    // Update daily cost
    const today = this.getTodayKey();
    const dailyAccum = this.dailyCosts.get(today) || { total: 0, last_reset: now };
    dailyAccum.total += params.cost;
    this.dailyCosts.set(today, dailyAccum);

    // Update reasoning tokens
    if (params.reasoning_tokens !== undefined) {
      const key = params.session_id || params.agent_id;
      const current = this.reasoningTokens.get(key) || 0;
      this.reasoningTokens.set(key, current + params.reasoning_tokens);
    }
  }

  /**
   * Enforce governance floor: returns the effective limit that is the minimum
   * of the governance limit and the application limit. Application code cannot
   * raise limits above governance ceilings.
   */
  enforceFloor(appLimit: number, governanceLimit: number): number {
    return Math.min(appLimit, governanceLimit);
  }

  /**
   * Get the current cumulative cost for an agent.
   */
  getAgentCost(agent_id: string): number {
    return this.agentCosts.get(agent_id)?.total || 0;
  }

  /**
   * Get the current cumulative cost for a session.
   */
  getSessionCost(session_id: string): number {
    return this.sessionCosts.get(session_id)?.total || 0;
  }

  /**
   * Get the current daily cumulative cost.
   */
  getDailyCost(): number {
    const today = this.getTodayKey();
    return this.dailyCosts.get(today)?.total || 0;
  }

  /**
   * Reset all tracked costs (useful for testing or daily resets).
   */
  reset(): void {
    this.agentCosts.clear();
    this.sessionCosts.clear();
    this.dailyCosts.clear();
    this.reasoningTokens.clear();
  }

  private getTodayKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}
