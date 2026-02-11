/**
 * TealTiger SDK - Main Export
 * 
 * This is the main entry point for the TealTiger SDK
 */

// Main SDK class (legacy)
export { TealTiger } from './client/TealTiger';

// Integrated Clients (v1.1.0)
export { TealBaseClient, TealOpenAI, TealAnthropic } from './client';
export type { TealClientConfig, RequestContext } from './client';
export {
  TealTigerError,
  PolicyViolationError,
  GuardrailViolationError,
  CircuitOpenError,
  AnomalyDetectedError
} from './client';

// TealEngine - Core Policy Framework (v1.1.0)
export { TealEngine } from './core/engine';
export type {
  TealPolicy,
  ToolPolicy,
  IdentityPolicy,
  CodeExecutionPolicy,
  BehavioralPolicy,
  MemoryPolicy,
  ContentPolicy,
  PolicyEvaluationResult,
  RequestContext,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  TestCase,
  CoverageReport
} from './core/engine';

// Policy utilities
export { 
  PolicyBuilder, 
  createPolicy, 
  PolicyTemplates 
} from './policy/PolicyBuilder';

export { 
  PolicyTester, 
  createPolicyTester 
} from './policy/PolicyTester';

export { 
  PolicyValidator,
  createPolicyValidator
} from './policy/PolicyValidator';

export { 
  PolicySimulator,
  createPolicySimulator
} from './policy/PolicySimulator';

export type {
  PolicyTestResult,
  PolicyTestSuite
} from './policy/PolicyTester';

export type {
  PolicyValidationResult,
  PolicyConflict,
  PolicySetAnalysis
} from './policy/PolicyValidator';

export type {
  SimulationScenario,
  SimulationRequestResult,
  SimulationResult,
  BatchSimulationResult
} from './policy/PolicySimulator';

// Types and interfaces
export type {
  TealTigerConfig,
  ToolParameters,
  SecurityContext,
  SecurityDecision,
  SecurityAction,
  RiskLevel,
  ToolExecutionRequest,
  ToolExecutionResult,
  SecurityEvaluationResponse,
  SecurityPolicy,
  PolicyCondition,
  PolicyTransformation,
  AuditEntry,
  AuditTrailResponse,
  SDKStatistics,
  TealTigerError
} from './types';

// Error classes
export {
  BaseTealTigerError,
  TealTigerConfigError,
  TealTigerNetworkError,
  TealTigerServerError,
  TealTigerSecurityError,
  TealTigerValidationError,
  TealTigerAuthError,
  createTealTigerError,
  isTealTigerError,
  getErrorDetails
} from './utils/errors';

// Error codes enum
export { TealTigerErrorCode } from './types';

// Utility functions
export {
  validateConfig,
  validateToolName,
  validateToolParameters,
  validateAgentId,
  validateSecurityContext,
  sanitizeParameters,
  sanitizeConfig
} from './utils/validation';

// Configuration
export { Configuration, DEFAULT_CONFIG } from './config/Configuration';

// Guardrails
export {
  Guardrail,
  GuardrailResult,
  GuardrailConfig,
  GuardrailMetadata,
  GuardrailResultData,
  GuardrailEngine,
  GuardrailEngineResult,
  GuardrailEngineOptions,
  GuardrailExecutionResult,
  PIIDetectionGuardrail,
  PIIDetectionConfig,
  ContentModerationGuardrail,
  ContentModerationConfig,
  PromptInjectionGuardrail,
  PromptInjectionConfig
} from './guardrails';

// Cost Tracking
export {
  CostTracker,
  BudgetManager,
  InMemoryCostStorage,
  createCostStorage,
  getModelPricing
} from './cost';

export type {
  ModelProvider,
  ModelPricing,
  TokenUsage,
  CostEstimate,
  CostRecord,
  BudgetConfig,
  BudgetStatus,
  CostAlert,
  CostSummary,
  CostTrackerConfig,
  ICostStorage
} from './cost';

export type {
  BudgetEnforcementResult
} from './cost/BudgetManager';

// Drop-in Client Wrappers
export {
  TealOpenAI,
  createTealOpenAI,
  TealAnthropic,
  createTealAnthropic,
  TealAzureOpenAI,
  createTealAzureOpenAI
} from './clients';

export type {
  TealOpenAIConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  TealAnthropicConfig,
  MessageCreateRequest,
  MessageCreateResponse,
  MessageContent,
  TealAzureOpenAIConfig,
  AzureChatCompletionRequest,
  AzureChatCompletionResponse
} from './clients';

// Version
export const VERSION = '0.2.2';