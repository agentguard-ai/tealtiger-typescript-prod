/**
 * TealTiger SDK - Main Export
 * 
 * This is the main entry point for the TealTiger SDK
 */

/** @deprecated Use integrated provider clients (TealOpenAI, TealAnthropic, etc.) from './client' instead. */
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
  ValidationResult,
  ValidationError,
  ValidationWarning,
  TestCase,
  CoverageReport
} from './core/engine';

// Enterprise Adoption Features (v1.1.x) - P0.1, P0.2, P0.3
export type {
  PolicyMode,
  ModeConfig,
  DecisionAction,
  ReasonCode,
  Decision,
  ComponentVersions,
  CostInfo
} from './core/engine/types';

export {
  InvalidConfigurationError,
  PolicyViolationError as EnginePolicyViolationError
} from './core/engine/types';

// ExecutionContext and ContextManager (P0.3)
export { ContextManager } from './core/context/ContextManager';
export type {
  ExecutionContext,
  ExecutionContextOptions
} from './core/context/ExecutionContext';
export { CONTEXT_HEADERS } from './core/context/ExecutionContext';

// TealGuard - Enhanced Guardrails (v1.1.0)
export { TealGuard } from './core/guard/TealGuard';
export type {
  TealGuardConfig,
  TealGuardResult,
  CustomGuardrailRule
} from './core/guard/TealGuard';

// TealCircuit - Circuit Breaker (v1.1.0)
export { TealCircuit, CircuitOpenError as TealCircuitOpenError } from './core/circuit/TealCircuit';
export type {
  CircuitState,
  TealCircuitConfig
} from './core/circuit/TealCircuit';

// TealAudit - Audit Logging (v1.1.x) - P0.4
export { TealAudit, ConsoleOutput, CustomOutput } from './core/audit/TealAudit';
export type {
  AuditEvent as LegacyAuditEvent,
  AuditFilter,
  AuditConfig,
  AuditOutput,
  TealAuditConfig,
  CustomRedactionRule
} from './core/audit/TealAudit';

export type {
  AuditEvent as VersionedAuditEvent,
  AuditEventType
} from './core/audit/types';

export {
  RedactionLevel
} from './core/audit/redaction';

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
  SDKStatistics
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

/** @deprecated Use canonical clients from './client' instead (TealOpenAI, TealAnthropic, TealGemini, TealBedrock, etc.). */
export {
  createTealOpenAI,
  createTealAnthropic,
  TealAzureOpenAI,
  createTealAzureOpenAI
} from './clients';

/** @deprecated Use client config types from './client' instead. */
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