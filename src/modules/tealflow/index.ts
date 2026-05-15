/**
 * TealFlow — Declarative Governance Workflows
 *
 * Re-exports the TealFlow YAML parser and execution engine.
 *
 * @module modules/tealflow
 */

export { TealFlowParser } from './TealFlowParser';
export type { ValidationResult } from './TealFlowParser';
export { TealFlowEngine, evaluateExpression } from './TealFlowEngine';
