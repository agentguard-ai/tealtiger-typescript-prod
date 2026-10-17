/**
 * TealTiger SDK - OpenAI Provider Entry Point
 * 
 * This entry point includes only OpenAI-specific functionality
 * for optimal tree-shaking in serverless environments.
 */

// Core TealTiger functionality
export { TealEngine } from '../core/engine';
export { TealGuard } from '../core/guard/TealGuard';
export { TealCircuit } from '../core/circuit/TealCircuit';
export { TealAudit } from '../core/audit/TealAudit';
export { ContextManager } from '../core/context/ContextManager';

// OpenAI client
export { TealOpenAI } from '../client/openai';
export { createTealOpenAI } from '../clients/TealOpenAI';

// Types
export type { TealClientConfig, RequestContext } from '../client/base';
export type { TealOpenAIConfig, ChatCompletionRequest, ChatCompletionResponse } from '../clients/TealOpenAI';
export type { TealPolicy, PolicyEvaluationResult } from '../core/engine';
export type { TealGuardConfig, TealGuardResult } from '../core/guard/TealGuard';
export type { ExecutionContext } from '../core/context/ExecutionContext';

// Cost tracking
export { CostTracker, BudgetManager } from '../cost';
export type { CostRecord, BudgetConfig } from '../cost';

// Guardrails
export { GuardrailEngine, PIIDetectionGuardrail, ContentModerationGuardrail, PromptInjectionGuardrail } from '../guardrails';

// Errors
export { TealTigerError, PolicyViolationError, GuardrailViolationError } from '../client/base';
