/**
 * Cost Anomaly Detection — TealMonitor v2
 *
 * Maintains rolling baselines of cost-per-request per agent/provider and
 * detects anomalies when costs deviate significantly from the baseline.
 *
 * Emits:
 * - `COST_ANOMALY_DETECTED` when a single request cost exceeds a configurable
 *   multiple of the rolling baseline (default: 10x).
 * - `COST_SPIKE_DETECTED` when cumulative session cost growth rate exceeds
 *   a configurable threshold.
 *
 * @module cost/anomaly-detection
 * @requirements 17.8–17.13
 */

/**
 * Parameters for an anomaly check.
 */
export interface AnomalyCheckParams {
  agent_id: string;
  provider: string;
  cost: number;
  session_cost_total?: number;
}

/**
 * Result of an anomaly check.
 */
export interface AnomalyCheckResult {
  anomaly: boolean;
  alert_type?: string;
  reason_code?: string;
}

/**
 * Configuration for the anomaly detector.
 */
export interface AnomalyDetectorConfig {
  /** Number of requests in the rolling baseline window. Default: 100. */
  baseline_window: number;
  /** Multiplier above baseline that triggers anomaly. Default: 10. */
  spike_multiplier: number;
  /** Session cost growth rate threshold (fraction, e.g. 0.5 = 50% growth). */
  growth_rate_threshold: number;
}

/**
 * Internal rolling window for tracking cost history.
 */
interface RollingWindow {
  values: number[];
  sum: number;
}

/**
 * CostAnomalyDetector — Detects cost anomalies using rolling baselines.
 *
 * Maintains a per-agent/provider rolling window of request costs and flags
 * requests that significantly exceed the established baseline.
 */
export class CostAnomalyDetector {
  private config: AnomalyDetectorConfig;

  /** Rolling cost windows keyed by `${agent_id}:${provider}`. */
  private baselines: Map<string, RollingWindow> = new Map();

  /** Previous session cost totals keyed by `${agent_id}:${provider}`. */
  private previousSessionCosts: Map<string, number> = new Map();

  constructor(config: AnomalyDetectorConfig) {
    this.config = config;
  }

  /**
   * Check whether a request cost is anomalous relative to the rolling baseline.
   *
   * Detection logic:
   * 1. If the rolling baseline has enough data and the request cost exceeds
   *    `spike_multiplier × baseline_mean`, emit COST_ANOMALY_DETECTED.
   * 2. If session_cost_total is provided and the growth rate from the previous
   *    check exceeds `growth_rate_threshold`, emit COST_SPIKE_DETECTED.
   *
   * After checking, the cost is added to the rolling baseline window.
   */
  checkAnomaly(params: AnomalyCheckParams): AnomalyCheckResult {
    const key = `${params.agent_id}:${params.provider}`;
    const window = this.getOrCreateWindow(key);

    // Check for single-request anomaly against baseline
    if (window.values.length > 0) {
      const baselineMean = window.sum / window.values.length;
      if (baselineMean > 0 && params.cost > baselineMean * this.config.spike_multiplier) {
        // Record the cost in the window after detection
        this.addToWindow(key, params.cost);
        this.updateSessionCost(key, params.session_cost_total);
        return {
          anomaly: true,
          alert_type: 'single_request_anomaly',
          reason_code: 'COST_ANOMALY_DETECTED',
        };
      }
    }

    // Check for session cost spike (growth rate)
    if (params.session_cost_total !== undefined) {
      const previousTotal = this.previousSessionCosts.get(key);
      if (previousTotal !== undefined && previousTotal > 0) {
        const growthRate = (params.session_cost_total - previousTotal) / previousTotal;
        if (growthRate > this.config.growth_rate_threshold) {
          // Record the cost in the window after detection
          this.addToWindow(key, params.cost);
          this.updateSessionCost(key, params.session_cost_total);
          return {
            anomaly: true,
            alert_type: 'session_cost_spike',
            reason_code: 'COST_SPIKE_DETECTED',
          };
        }
      }
      this.updateSessionCost(key, params.session_cost_total);
    }

    // No anomaly — add cost to baseline window
    this.addToWindow(key, params.cost);

    return { anomaly: false };
  }

  /**
   * Get the current baseline mean for an agent/provider combination.
   */
  getBaselineMean(agent_id: string, provider: string): number | undefined {
    const key = `${agent_id}:${provider}`;
    const window = this.baselines.get(key);
    if (!window || window.values.length === 0) {
      return undefined;
    }
    return window.sum / window.values.length;
  }

  /**
   * Get the number of samples in the baseline for an agent/provider.
   */
  getBaselineSize(agent_id: string, provider: string): number {
    const key = `${agent_id}:${provider}`;
    const window = this.baselines.get(key);
    return window ? window.values.length : 0;
  }

  /**
   * Reset all baselines and session tracking.
   */
  reset(): void {
    this.baselines.clear();
    this.previousSessionCosts.clear();
  }

  private getOrCreateWindow(key: string): RollingWindow {
    let window = this.baselines.get(key);
    if (!window) {
      window = { values: [], sum: 0 };
      this.baselines.set(key, window);
    }
    return window;
  }

  private addToWindow(key: string, cost: number): void {
    const window = this.getOrCreateWindow(key);
    window.values.push(cost);
    window.sum += cost;

    // Evict oldest entries if window exceeds configured size
    while (window.values.length > this.config.baseline_window) {
      const evicted = window.values.shift()!;
      window.sum -= evicted;
    }
  }

  private updateSessionCost(key: string, sessionCostTotal: number | undefined): void {
    if (sessionCostTotal !== undefined) {
      this.previousSessionCosts.set(key, sessionCostTotal);
    }
  }
}
