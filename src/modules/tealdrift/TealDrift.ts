/**
 * TealDrift — Behavioral Drift Detection Module
 *
 * Maintains rolling statistical baselines per agent/provider/model combination
 * and alerts when behavior diverges beyond a configurable threshold (sigma).
 *
 * Tracked metrics:
 * - refusal_rate: running average of boolean refusal observations
 * - response_length: running mean and variance of response lengths
 * - topic_distribution: frequency map of observed topics
 *
 * Emits reason code: BEHAVIORAL_DRIFT_DETECTED
 *
 * @module modules/tealdrift/TealDrift
 * @requirements 9.20, 9.21
 */

import type {
  RollingStats,
  DriftBaseline,
  DriftConfig,
  DriftObservation,
} from '../../core/engine/v1.3/module-types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
} from '../../core/engine/v1.2/types';

// ── Constants ────────────────────────────────────────────────────

const MODULE_NAME = 'TealDrift';
const MODULE_VERSION = '1.3.0';
const REASON_CODE = 'BEHAVIORAL_DRIFT_DETECTED';
const EVENT_TYPE = 'governance.drift.detected';

// ── Default configuration ────────────────────────────────────────

const DEFAULT_CONFIG: DriftConfig = {
  baseline_window: 100,
  threshold_sigma: 3,
  min_samples: 50,
};

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Generates a composite key for baseline lookup.
 */
function baselineKey(agent_id: string, provider: string, model: string): string {
  return `${agent_id}::${provider}::${model}`;
}

/**
 * Updates rolling stats using Welford's online algorithm.
 */
function updateRollingStats(stats: RollingStats, value: number): RollingStats {
  const newCount = stats.count + 1;
  const delta = value - stats.mean;
  const newMean = stats.mean + delta / newCount;
  const delta2 = value - newMean;
  const newVariance =
    newCount === 1
      ? 0
      : (stats.variance * (stats.count - 1) + delta * delta2) / (newCount - 1);

  return {
    mean: newMean,
    variance: newVariance,
    count: newCount,
  };
}

/**
 * Computes standard deviation from variance.
 */
function stddev(variance: number): number {
  return Math.sqrt(Math.max(0, variance));
}

// ── TealDriftModule ──────────────────────────────────────────────

export class TealDriftModule implements TealModule {
  readonly name = MODULE_NAME;
  readonly version = MODULE_VERSION;

  private config: DriftConfig;
  private baselines: Map<string, DriftBaseline> = new Map();

  constructor(config?: Partial<DriftConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // No async initialization required
  }

  async destroy(): Promise<void> {
    this.baselines.clear();
  }

  /**
   * Updates the rolling statistical baseline for the given observation.
   */
  updateBaseline(observation: DriftObservation): void {
    const key = baselineKey(observation.agent_id, observation.provider, observation.model);
    let baseline = this.baselines.get(key);

    if (!baseline) {
      baseline = {
        agent_id: observation.agent_id,
        provider: observation.provider,
        model: observation.model,
        metrics: {
          refusal_rate: { mean: 0, variance: 0, count: 0 },
          response_length: { mean: 0, variance: 0, count: 0 },
          topic_distribution: new Map<string, number>(),
        },
        sample_count: 0,
        last_updated: Date.now(),
      };
      this.baselines.set(key, baseline);
    }

    // Update refusal_rate (boolean → 0 or 1)
    const refusalValue = observation.refusal ? 1 : 0;
    baseline.metrics.refusal_rate = updateRollingStats(
      baseline.metrics.refusal_rate,
      refusalValue,
    );

    // Update response_length
    baseline.metrics.response_length = updateRollingStats(
      baseline.metrics.response_length,
      observation.response_length,
    );

    // Update topic_distribution
    for (const topic of observation.topics) {
      const current = baseline.metrics.topic_distribution.get(topic) || 0;
      baseline.metrics.topic_distribution.set(topic, current + 1);
    }

    baseline.sample_count++;
    baseline.last_updated = Date.now();
  }

  /**
   * Checks whether the given observation represents behavioral drift
   * relative to the established baseline.
   *
   * Returns null if no drift detected or insufficient samples.
   * Returns drift info if behavior diverges beyond threshold_sigma.
   */
  checkDrift(
    observation: DriftObservation,
  ): { drifted: boolean; metric: string; deviation_sigma: number } | null {
    const key = baselineKey(observation.agent_id, observation.provider, observation.model);
    const baseline = this.baselines.get(key);

    // No baseline established yet
    if (!baseline) {
      return null;
    }

    // Not enough samples to make a determination
    if (baseline.sample_count < this.config.min_samples) {
      return null;
    }

    // Check refusal_rate drift
    const refusalValue = observation.refusal ? 1 : 0;
    const refusalStd = stddev(baseline.metrics.refusal_rate.variance);
    if (refusalStd > 0) {
      const refusalDeviation = Math.abs(refusalValue - baseline.metrics.refusal_rate.mean) / refusalStd;
      if (refusalDeviation > this.config.threshold_sigma) {
        return { drifted: true, metric: 'refusal_rate', deviation_sigma: refusalDeviation };
      }
    }

    // Check response_length drift
    const lengthStd = stddev(baseline.metrics.response_length.variance);
    if (lengthStd > 0) {
      const lengthDeviation =
        Math.abs(observation.response_length - baseline.metrics.response_length.mean) / lengthStd;
      if (lengthDeviation > this.config.threshold_sigma) {
        return { drifted: true, metric: 'response_length', deviation_sigma: lengthDeviation };
      }
    }

    // Check topic_distribution drift (new unseen topic = potential drift)
    if (observation.topics.length > 0 && baseline.metrics.topic_distribution.size > 0) {
      const totalTopicObs = Array.from(baseline.metrics.topic_distribution.values()).reduce(
        (sum, v) => sum + v,
        0,
      );
      const unseenTopics = observation.topics.filter(
        (t) => !baseline.metrics.topic_distribution.has(t),
      );
      // If all topics in this observation are unseen and we have a meaningful baseline
      if (unseenTopics.length === observation.topics.length && totalTopicObs >= this.config.min_samples) {
        // Treat as maximum deviation
        return { drifted: true, metric: 'topic_distribution', deviation_sigma: this.config.threshold_sigma + 1 };
      }
    }

    return null;
  }

  /**
   * Gets the current baseline for a given agent/provider/model combination.
   */
  getBaseline(agent_id: string, provider?: string, model?: string): DriftBaseline | undefined {
    if (provider && model) {
      return this.baselines.get(baselineKey(agent_id, provider, model));
    }
    // If provider/model not specified, find first matching agent_id
    for (const [, baseline] of this.baselines) {
      if (baseline.agent_id === agent_id) {
        return baseline;
      }
    }
    return undefined;
  }

  /**
   * TealModule evaluate interface — checks drift for the current request.
   */
  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
  ): Promise<ModuleResult> {
    // Extract drift observation from request metadata
    const observation = request['drift_observation'] as DriftObservation | undefined;

    if (!observation) {
      return {
        action: 'ALLOW' as any,
        reason_codes: [],
        event_type: 'governance.drift.none',
      };
    }

    // Update baseline with new observation
    this.updateBaseline(observation);

    // Check for drift
    const driftResult = this.checkDrift(observation);

    if (driftResult && driftResult.drifted) {
      return {
        action: 'DENY' as any,
        reason_codes: [REASON_CODE],
        event_type: EVENT_TYPE,
        metadata: {
          metric: driftResult.metric,
          deviation_sigma: driftResult.deviation_sigma,
          threshold_sigma: this.config.threshold_sigma,
          agent_id: observation.agent_id,
          provider: observation.provider,
          model: observation.model,
        },
      };
    }

    return {
      action: 'ALLOW' as any,
      reason_codes: [],
      event_type: 'governance.drift.none',
    };
  }
}
