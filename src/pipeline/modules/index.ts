/**
 * Multi-Stage Defense Pipeline — Built-in Module Exports
 *
 * Re-exports all 5 pre-execution and 5 post-execution modules
 * for convenient access from the pipeline package.
 *
 * @module pipeline/modules
 */

// ── Pre-Execution Modules ────────────────────────────────────────
export { PolicyEvaluationModule } from './pre/PolicyEvaluationModule';
export { InputValidationModule } from './pre/InputValidationModule';
export { PIIScannerModule } from './pre/PIIScannerModule';
export { CostBudgetModule } from './pre/CostBudgetModule';
export { ToolAllowlistModule } from './pre/ToolAllowlistModule';

// ── Post-Execution Modules ───────────────────────────────────────
export { ContentModerationModule } from './post/ContentModerationModule';
export { OutputPIIModule } from './post/OutputPIIModule';
export { HallucinationMarkerModule } from './post/HallucinationMarkerModule';
export { ToolCallValidationModule } from './post/ToolCallValidationModule';
export { CostReconciliationModule } from './post/CostReconciliationModule';
