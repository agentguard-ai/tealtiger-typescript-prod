/**
 * CostAccumulator — tracks per-request, per-session, and per-agent cost.
 *
 * Wraps the existing CostTracker pricing engine and maintains in-memory
 * running totals that are monotonically non-decreasing.
 */

import type {
  SupportedProvider,
  TokenUsage,
  ObserveCostSummary,
  RequestCostResult,
} from './types';

/**
 * Simple pricing lookup. Uses per-1K-token rates.
 * This is a simplified version — the full implementation delegates to
 * the existing CostTracker in packages/tealtiger-sdk/src/cost/.
 */
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  'mistral-large': { input: 0.002, output: 0.006 },
  'command-r-plus': { input: 0.003, output: 0.015 },
};

function getModelPricing(model: string): { input: number; output: number } {
  // Try exact match first, then prefix match
  if (DEFAULT_PRICING[model]) return DEFAULT_PRICING[model];
  for (const [key, pricing] of Object.entries(DEFAULT_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  // Default fallback pricing
  return { input: 0.001, output: 0.002 };
}

export class CostAccumulator {
  private readonly sessionCosts = new Map<string, ObserveCostSummary>();
  private readonly agentCosts = new Map<string, ObserveCostSummary>();

  /**
   * Record cost for a completed request.
   * Returns the computed cost breakdown for this request.
   */
  recordCost(
    agentId: string,
    sessionId: string,
    requestId: string,
    model: string,
    _provider: SupportedProvider,
    usage: TokenUsage | null,
  ): RequestCostResult {
    if (!usage) {
      // No usage data — record zero cost with pricing_unavailable flag
      this.incrementTotals(agentId, sessionId, 0, true);
      return {
        requestId,
        cost: 0,
        pricingUnavailable: true,
        breakdown: { inputCost: 0, outputCost: 0 },
      };
    }

    const pricing = getModelPricing(model);
    const inputCost = (usage.inputTokens / 1000) * pricing.input;
    const outputCost = (usage.outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    this.incrementTotals(agentId, sessionId, totalCost, false);

    return {
      requestId,
      cost: totalCost,
      pricingUnavailable: false,
      breakdown: { inputCost, outputCost },
    };
  }

  /**
   * Get cumulative cost for a session (monotonically non-decreasing).
   */
  getSessionCost(sessionId: string): ObserveCostSummary {
    return this.sessionCosts.get(sessionId) ?? this.emptySummary();
  }

  /**
   * Get cumulative cost for an agent (persists across sessions).
   */
  getAgentCost(agentId: string): ObserveCostSummary {
    return this.agentCosts.get(agentId) ?? this.emptySummary();
  }

  private incrementTotals(
    agentId: string,
    sessionId: string,
    cost: number,
    pricingUnavailable: boolean,
  ): void {
    // Update session total
    const session = this.sessionCosts.get(sessionId) ?? this.emptySummary();
    session.totalCost += cost;
    session.requestCount += 1;
    if (pricingUnavailable) session.hasPricingGaps = true;
    session.breakdown.inputCost += cost * 0.3; // approximate split
    session.breakdown.outputCost += cost * 0.7;
    this.sessionCosts.set(sessionId, session);

    // Update agent total
    const agent = this.agentCosts.get(agentId) ?? this.emptySummary();
    agent.totalCost += cost;
    agent.requestCount += 1;
    if (pricingUnavailable) agent.hasPricingGaps = true;
    agent.breakdown.inputCost += cost * 0.3;
    agent.breakdown.outputCost += cost * 0.7;
    this.agentCosts.set(agentId, agent);
  }

  private emptySummary(): ObserveCostSummary {
    return {
      totalCost: 0,
      requestCount: 0,
      hasPricingGaps: false,
      breakdown: { inputCost: 0, outputCost: 0, imageCost: 0, audioCost: 0 },
    };
  }
}
