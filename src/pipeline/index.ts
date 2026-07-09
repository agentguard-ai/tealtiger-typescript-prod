/**
 * Multi-Stage Defense Pipeline — Public API
 *
 * Re-exports all public types, classes, errors, and utilities
 * for the three-stage governance pipeline (PRE_EXECUTION → EXECUTION → POST_EXECUTION).
 *
 * @module pipeline
 * @requirements 11.1, 11.3
 */

// ── Core Orchestrator ────────────────────────────────────────────
export { DefensePipeline } from './DefensePipeline';

// ── Types ────────────────────────────────────────────────────────
export {
  PipelineStage,
  RemediationAction,
  ACTION_SEVERITY,
} from './types';

export type {
  PipelineConfig,
  PipelineRequest,
  PipelineResult,
  StageDecision,
  ModuleEvalDetail,
  PipelineHooks,
  PipelineTimingMetadata,
  ExecutionMetadata,
  ExecutionResult,
} from './types';

// ── Errors ───────────────────────────────────────────────────────
export {
  PipelineError,
  ModuleValidationError,
  PipelineConfigError,
  ModuleTimeoutError,
  ResampleBudgetExhaustedError,
} from './errors';

// ── Stage Adapter Utility ────────────────────────────────────────
export { assignStage } from './stageAdapter';

// ── StageDecisionBuilder ─────────────────────────────────────────
export { StageDecisionBuilder } from './StageDecisionBuilder';
export type { ContiguityResult } from './StageDecisionBuilder';

// ── Built-in Modules ─────────────────────────────────────────────
export {
  PolicyEvaluationModule,
  InputValidationModule,
  PIIScannerModule,
  CostBudgetModule,
  ToolAllowlistModule,
  ContentModerationModule,
  OutputPIIModule,
  HallucinationMarkerModule,
  ToolCallValidationModule,
  CostReconciliationModule,
} from './modules';
