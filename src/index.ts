/**
 * TealTiger SDK - Main Export
 * 
 * This is the main entry point for the TealTiger SDK
 */

// ─── v1.4: observe() — Zero-Config Entry Point ──────────────────────────────
export { observe, freeze, unfreeze, formatCost } from './observe';
export type {
  ObserveConfig,
  ObserveProxy,
  ObserveCostSummary,
  BaselineResult,
  PercentileStats,
  PIIDetectionSummary,
  SupportedProvider,
} from './observe';
export { UnsupportedProviderError, FrozenAgentError } from './observe';

// Main SDK class (legacy)
export { TealTiger } from './client/TealTiger';

// Integrated Clients (v1.1.0)
export {
  TealBaseClient,
  TealOpenAI,
  TealAnthropic,
  TealOllama,
  createTealOllama
} from './client';
export type {
  TealClientConfig,
  RequestContext,
  TealOllamaConfig,
  OllamaChatMessage,
  OllamaChatCompletionParams,
  OllamaChatCompletionResponse
} from './client';
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
//
// PolicyMode, DecisionAction and ReasonCode are `enum`s — runtime values, not
// just types. They were previously in the `export type { ... }` block below,
// which strips the runtime binding: consumers got
// "cannot be used as a value because it was exported using 'export type'",
// and the symbols were genuinely absent from dist/index.js.
//
// That made the documented TealEngine usage impossible — `PolicyMode.ENFORCE`
// and `DecisionAction.ALLOW` are how the engine's API is meant to be called.
// Exported as values here; the interfaces stay type-only below.
export {
  PolicyMode,
  DecisionAction,
  ReasonCode
} from './core/engine/types';

export type {
  ModeConfig,
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

// Helicone integration — project governance decisions into Helicone
// custom-property headers for dashboard visibility.
export {
  toHeliconeHeaders,
  withHeliconeHeaders,
  HELICONE_PROPERTY_PREFIX
} from './adapters/helicone-adapter';
export type { HeliconeHeaderOptions } from './adapters/helicone-adapter';

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

// Drop-in Client Wrappers (legacy - use TealOpenAI/TealAnthropic from './client' instead)
export {
  createTealOpenAI,
  createTealAnthropic,
  TealAzureOpenAI,
  createTealAzureOpenAI,
  // TealMultiProvider was documented in the README but never exported, so it
  // was unreachable from the published package despite existing at
  // src/clients/TealMultiProvider.ts.
  TealMultiProvider
} from './clients';

export type {
  ProviderType,
  ProviderConfig,
  RoutingStrategy,
  MultiProviderResponse,
  AggregatedMetrics,
  TealMultiProviderConfig
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
//
// NOTE: this duplicates `version` in package.json and must be bumped with it.
// Keeping it in sync is currently manual — see the drift this caused on the
// Python side, where a hardcoded __version__ and pyproject.toml both read 1.4.0
// while 1.4.1 was live on PyPI.
//
// It is left as a literal rather than read from package.json because importing
// package.json into the bundle would pull it into every consumer's build and
// change the published surface. A release-time check or a generated file is the
// right fix; until then, bump both.
export const VERSION = '1.6.0';
