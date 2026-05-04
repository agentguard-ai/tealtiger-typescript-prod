/**
 * TealTiger SDK - Azure OpenAI Provider Entry Point
 * 
 * This entry point includes only Azure OpenAI-specific functionality
 * for optimal tree-shaking in serverless environments.
 */

// Core TealTiger functionality
export { TealEngine } from '../core/engine';
export { TealGuard } from '../core/guard/TealGuard';
export { TealCircuit } from '../core/circuit/TealCircuit';
export { TealAudit } from '../core/audit/TealAudit';
export { ContextManager } from '../core/context/ContextManager';

// Azure OpenAI client
export { TealAzureOpenAI, createTealAzureOpenAI } from '../clients';

// Types
export type { TealClientConfig, RequestContext } from '../client';
export type { TealAzureOpenAIConfig, AzureChatCompletionRequest, AzureChatCompletionResponse } from '../clients';
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
