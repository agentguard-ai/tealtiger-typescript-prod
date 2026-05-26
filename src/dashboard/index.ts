/**
 * Governance Visibility Dashboard — Exports
 * @module dashboard
 */

export { GovernanceDashboard } from './GovernanceDashboard';
export { BundleExporter } from './BundleExporter';
export type { SecretScanArtifact } from './BundleExporter';
export { IMPLEMENTED_CONTROLS, PLANNED_CONTROLS } from './controls';
export type {
  ControlInfo,
  TEECCoverage,
  DecisionStats,
  DashboardSnapshot,
} from './types';
