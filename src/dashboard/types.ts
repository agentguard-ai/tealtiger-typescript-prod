/**
 * Governance Visibility Dashboard — Types
 *
 * Read-only dashboard types for displaying governance controls,
 * TEEC coverage, module status, and decision statistics.
 *
 * @module dashboard/types
 */

export interface ControlInfo {
  control_id: string;
  dimension: 'SEC' | 'MEM' | 'REL' | 'EVID' | 'REG' | 'COST';
  maturity: 'planned' | 'alpha' | 'beta' | 'stable';
  module: string;
  status: 'implemented' | 'planned';
  description?: string;
}

export interface TEECCoverage {
  reason_codes: number;
  event_types: number;
  decision_actions: number;
  version: string;
}

export interface DecisionStats {
  total: number;
  by_action: Record<string, number>;
  by_reason_code: Record<string, number>;
}

export interface DashboardSnapshot {
  bundle_version: string;
  teec_version: string;
  modules: Record<string, { version: string; initialized: boolean }>;
  controls: { implemented: ControlInfo[]; planned: ControlInfo[] };
  teec_coverage: TEECCoverage;
  decision_stats: DecisionStats;
  timestamp: number;
}
