import type { ObserveCostSummary } from './types';

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

/**
 * Format an observe() cost summary for logs and terminal output.
 *
 * @param summary - Cost information returned by `getCost()` or `getAgentCost()`.
 * @returns A compact USD total, request count, and input/output breakdown.
 */
export function formatCost(summary: ObserveCostSummary): string {
  const requestLabel = summary.requestCount === 1 ? 'request' : 'requests';
  const estimateLabel = summary.hasPricingGaps ? ' (estimated)' : '';

  if (summary.totalCost === 0 && summary.requestCount === 0) {
    return `$0.00 (0 requests)${estimateLabel}`;
  }

  const total = `${formatUsd(summary.totalCost)} (${summary.requestCount} ${requestLabel})`;
  const breakdown =
    `Input: ${formatUsd(summary.breakdown.inputCost)} | ` +
    `Output: ${formatUsd(summary.breakdown.outputCost)}`;
  return `${total} | ${breakdown}${estimateLabel}`;
}
