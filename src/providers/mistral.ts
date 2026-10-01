/**
 * TealTiger SDK - Mistral AI Provider Entry Point
 * 
 * This entry point includes only Mistral-specific functionality
 * for optimal tree-shaking in serverless environments.
 */

// Core TealTiger functionality
export { TealEngine } from '../core/engine';
export { TealGuard } from '../core/guard/TealGuard';
export { TealCircuit } from '../core/circuit/TealCircuit';
export { TealAudit } from '../core/audit/TealAudit';
export { ContextManager } from '../core/context/ContextManager';

// Mistral client.
//
// This was commented out as "to be implemented" long after it WAS implemented —
// `TealMistral` lives in src/client/mistral.ts. The stale comment meant
// `./providers/mistral` was published and resolved, but exported everything
// EXCEPT the one client the subpath exists to deliver, so
// `import { TealMistral } from 'tealtiger/providers/mistral'` failed.
//
// Note the path: '../client' (singular) re-exports ./mistral. '../clients'
// (plural, as the commented line had it) does not, which is why simply
// uncommenting it would not have worked either.
export { TealMistral, MISTRAL_PRICING } from '../client/mistral';

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
