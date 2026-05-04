/**
 * TealTiger SDK - Cohere Provider Entry Point
 * 
 * This entry point includes only Cohere-specific functionality
 * for optimal tree-shaking in serverless environments.
 */

// Core TealTiger functionality
export { TealEngine } from '../core/engine';
export { TealGuard } from '../core/guard/TealGuard';
export { TealCircuit } from '../core/circuit/TealCircuit';
export { TealAudit } from '../core/audit/TealAudit';
export { ContextManager } from '../core/context/ContextManager';

// Cohere client (to be implemented)
// export { TealCohere } from '../clients';

// Types
export type { TealClientConfig, RequestContext } from '../client';
export type { TealPolicy, PolicyEvaluationResult } from '../core/engine';
export type { TealGuardConfig, TealGuardResult } from '../core/guard/TealGuard';
export type { ExecutionContext } from '../core/context/ExecutionContext';

// Cost tracking
export { CostTracker, BudgetManager } from '../cost';
export type { CostRecord, BudgetConfig } from '../cost';

// Guardrails
export { GuardrailEngine, PIIDetectionGuardrail, ContentModerationGuardrail, PromptInjectionGuardrail } from '../guardrails';

// Errors
export { TealTigerError, PolicyViolationError, GuardrailViolationError } from '../client';
