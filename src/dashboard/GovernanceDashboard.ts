/**
 * Governance Visibility Dashboard — Read-Only
 *
 * Provides a read-only view of governance controls, TEEC coverage,
 * module status, and decision statistics. Strictly read-only — no
 * capability to modify policies, registries, controls, or runtime config.
 *
 * No runtime coupling: TealEngineV12 operates identically without it.
 *
 * @module dashboard/GovernanceDashboard
 */

import type { TealEngineV12 } from '../core/engine/v1.2/TealEngineV12';
import type { Decision as V12Decision } from '../core/engine/v1.2/types';
import type { Decision as V11Decision } from '../core/engine/types';
import type {
  ControlInfo,
  TEECCoverage,
  DecisionStats,
  DashboardSnapshot,
} from './types';
import { IMPLEMENTED_CONTROLS, PLANNED_CONTROLS } from './controls';

type Decision = V12Decision | V11Decision;

const BUNDLE_VERSION = '1.2.0';

export class GovernanceDashboard {
  private readonly engine: TealEngineV12 | null;
  private readonly stats: DecisionStats;

  constructor(engine?: TealEngineV12) {
    this.engine = engine ?? null;
    this.stats = {
      total: 0,
      by_action: {},
      by_reason_code: {},
    };
  }

  /**
   * Get a full dashboard snapshot — read-only aggregate of all governance state.
   */
  getSnapshot(): DashboardSnapshot {
    return {
      bundle_version: BUNDLE_VERSION,
      teec_version: this.getTEECCoverage().version,
      modules: this.getModuleStatus(),
      controls: {
        implemented: [...IMPLEMENTED_CONTROLS],
        planned: [...PLANNED_CONTROLS],
      },
      teec_coverage: this.getTEECCoverage(),
      decision_stats: this.getDecisionStats(),
      timestamp: Date.now(),
    };
  }

  /**
   * Get controls grouped by governance dimension.
   */
  getControlsByDimension(): Record<string, ControlInfo[]> {
    const all = [...IMPLEMENTED_CONTROLS, ...PLANNED_CONTROLS];
    const grouped: Record<string, ControlInfo[]> = {};
    for (const control of all) {
      if (!grouped[control.dimension]) {
        grouped[control.dimension] = [];
      }
      grouped[control.dimension].push(control);
    }
    return grouped;
  }

  /**
   * Get TEEC coverage — counts of registered reason codes, event types, actions.
   */
  getTEECCoverage(): TEECCoverage {
    if (this.engine) {
      const registry = this.engine.getTEECRegistry();
      return {
        reason_codes: registry.reason_codes.size,
        event_types: registry.event_types.size,
        decision_actions: registry.decision_actions.size,
        version: registry.version,
      };
    }
    // Standalone defaults (from embedded TEEC registry constants)
    return {
      reason_codes: 32,
      event_types: 18,
      decision_actions: 11,
      version: '0.1.0',
    };
  }

  /**
   * Get module registration and initialization status.
   */
  getModuleStatus(): Record<string, { version: string; initialized: boolean }> {
    if (this.engine) {
      const status = this.engine.getModuleStatus();
      const result: Record<string, { version: string; initialized: boolean }> = {};
      for (const [name, info] of Object.entries(status)) {
        result[name] = { version: info.version, initialized: info.initialized };
      }
      return result;
    }
    return {};
  }

  /**
   * Get decision statistics — totals and breakdowns by action and reason code.
   */
  getDecisionStats(): DecisionStats {
    return {
      total: this.stats.total,
      by_action: { ...this.stats.by_action },
      by_reason_code: { ...this.stats.by_reason_code },
    };
  }

  /**
   * Record a decision for statistics tracking.
   * Call this after each evaluateV12() to track decision stats in memory.
   */
  recordDecision(decision: Decision): void {
    this.stats.total++;

    const action = String(decision.action);
    this.stats.by_action[action] = (this.stats.by_action[action] ?? 0) + 1;

    if (decision.reason_codes) {
      for (const code of decision.reason_codes) {
        const codeStr = String(code);
        this.stats.by_reason_code[codeStr] =
          (this.stats.by_reason_code[codeStr] ?? 0) + 1;
      }
    }
  }
}
