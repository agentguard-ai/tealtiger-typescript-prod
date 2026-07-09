/**
 * BehavioralBaseline — computes statistical summary of request patterns
 * from the first N requests through an observe() proxy.
 *
 * Once complete (N samples collected), the baseline is frozen and
 * subsequent samples are ignored (immutable after completion).
 */

import type { BaselineSample, BaselineResult, PercentileStats } from './types';

/**
 * Computes P50, P95, P99 percentiles for a sorted array of numbers.
 */
function computePercentiles(sorted: number[]): PercentileStats {
  const n = sorted.length;
  return {
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
  };
}

export class BehavioralBaseline {
  private readonly windowSize: number;
  private readonly samples: BaselineSample[] = [];
  private completed = false;
  private computedStats: BaselineResult['stats'] | null = null;

  /**
   * @param windowSize Number of requests to collect before computing stats. Default: 100.
   */
  constructor(windowSize = 100) {
    this.windowSize = windowSize;
  }

  /**
   * Add a sample to the baseline. No-op if baseline is already complete.
   */
  addSample(sample: BaselineSample): void {
    if (this.completed) return;

    this.samples.push(sample);

    if (this.samples.length >= this.windowSize) {
      this.completed = true;
      this.computedStats = this.computeStats();
    }
  }

  /**
   * Get current baseline status and stats.
   */
  getBaseline(): BaselineResult {
    return {
      isComplete: this.completed,
      sampleCount: this.samples.length,
      windowSize: this.windowSize,
      stats: this.computedStats,
    };
  }

  /**
   * Check if baseline computation is complete.
   */
  isComplete(): boolean {
    return this.completed;
  }

  private computeStats(): BaselineResult['stats'] {
    const latencies = this.samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const inputTokens = this.samples.map((s) => s.inputTokens).sort((a, b) => a - b);
    const outputTokens = this.samples.map((s) => s.outputTokens).sort((a, b) => a - b);
    const costs = this.samples.map((s) => s.costUsd).sort((a, b) => a - b);
    const toolCalls = this.samples.map((s) => s.toolCallCount).sort((a, b) => a - b);

    return {
      latencyMs: computePercentiles(latencies),
      inputTokens: computePercentiles(inputTokens),
      outputTokens: computePercentiles(outputTokens),
      costUsd: computePercentiles(costs),
      toolCallCount: computePercentiles(toolCalls),
    };
  }
}
