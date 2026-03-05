/**
 * TealEngine - Core Policy Framework Types
 * 
 * Defines all policy types and interfaces for TealTiger's embedded policy engine.
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 * 
 * @module core/engine/types
 */

/**
 * Tool Policy Configuration
 * Controls which tools agents can use and how they can use them
 */
export interface ToolPolicy {
  [toolName: string]: {
    /** Whether the tool is allowed to be used */
    allowed: boolean;
    /** Maximum data size for tool operations (e.g., '1MB', '10KB') */
    maxSize?: string;
    /** Rate limiting configuration */
    rateLimit?: {
      /** Maximum number of calls */
      max: number;
      /** Time window (e.g., '1h', '1m', '1d') */
      window: string;
    };
    /** Allowed database tables (for database tools) */
    allowedTables?: string[];
    /** Maximum number of rows to return */
    maxRows?: number;
    /** Additional tool-specific parameters */
    parameters?: Record<string, any>;
  };
}

/**
 * Identity Policy Configuration
 * Enforces agent identity and role-based access control (RBAC)
 */
export interface IdentityPolicy {
  /** Unique agent identifier */
  agentId: string;
  /** Agent role (e.g., 'customer-support', 'admin', 'analyst') */
  role: string;
  /** List of allowed permissions (e.g., 'read:customer_data') */
  permissions: string[];
  /** List of explicitly forbidden actions */
  forbidden?: string[];
  /** Cost limits per agent */
  costLimit?: {
    /** Daily cost limit in dollars */
    daily?: number;
    /** Hourly cost limit in dollars */
    hourly?: number;
    /** Monthly cost limit in dollars */
    monthly?: number;
  };
}

/**
 * Code Execution Policy Configuration
 * Controls what code agents can generate and execute
 */
export interface CodeExecutionPolicy {
  /** Allowed programming languages */
  allowedLanguages: string[];
  /** Blocked function names (e.g., 'eval', 'exec', 'system') */
  blockedFunctions: string[];
  /** Blocked code patterns (regex) */
  blockedPatterns: RegExp[];
  /** Maximum code length in characters */
  maxLength: number;
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Whether sandboxing is required */
  requireSandbox: boolean;
}

/**
 * Behavioral Policy Configuration
 * Monitors and controls agent behavior patterns
 */
export interface BehavioralPolicy {
  /** Cost limits */
  costLimit: {
    /** Daily cost limit in dollars */
    daily?: number;
    /** Hourly cost limit in dollars */
    hourly?: number;
    /** Monthly cost limit in dollars */
    monthly?: number;
  };
  /** Rate limiting configuration */
  rateLimit: {
    /** Maximum number of requests */
    requests: number;
    /** Time window (e.g., '1m', '1h') */
    window: string;
  };
  /** Anomaly detection threshold (e.g., 2.0 = 200% of baseline) */
  anomalyThreshold?: number;
}

/**
 * Memory Policy Configuration
 * Controls what can be stored in agent memory/context
 */
export interface MemoryPolicy {
  /** Maximum memory size in bytes */
  maxSize?: number;
  /** Whether to validate inputs before storage */
  validateInputs?: boolean;
  /** Whether to sanitize content before storage */
  sanitizeBeforeStorage?: boolean;
  /** Blocked content patterns */
  blockedPatterns?: RegExp[];
}

/**
 * Content Policy Configuration
 * Controls content filtering and moderation
 */
export interface ContentPolicy {
  /** PII detection configuration */
  pii?: {
    /** Whether PII detection is enabled */
    enabled: boolean;
    /** Types of PII to block (e.g., 'ssn', 'credit_card', 'email') */
    blockedTypes?: string[];
    /** Whether to redact PII in logs */
    redactInLogs?: boolean;
  };
  /** Content moderation configuration */
  moderation?: {
    /** Whether content moderation is enabled */
    enabled: boolean;
    /** Threshold for blocking content (0-1) */
    threshold?: number;
    /** Categories to moderate (e.g., 'hate', 'violence', 'sexual') */
    categories?: string[];
  };
}

/**
 * Complete TealEngine Policy Configuration
 * Combines all policy types into a single configuration object
 */
export interface TealPolicy {
  /** Tool usage policies */
  tools?: ToolPolicy;
  /** Identity and access control policies */
  identity?: IdentityPolicy;
  /** Code execution policies */
  codeExecution?: CodeExecutionPolicy;
  /** Behavioral monitoring policies */
  behavioral?: BehavioralPolicy;
  /** Memory/context policies */
  memory?: MemoryPolicy;
  /** Content filtering policies */
  content?: ContentPolicy;
}

/**
 * Policy Evaluation Result
 * Returned by TealEngine after evaluating a request against policies
 */
export interface PolicyEvaluationResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** List of policy rules that were triggered */
  triggeredPolicies: string[];
  /** Additional metadata about the evaluation */
  metadata: {
    /** Time taken to evaluate in milliseconds */
    evaluationTime: number;
    /** Whether the result came from cache */
    cacheHit: boolean;
    /** TealEngine version */
    engine: string;
    /** Additional context */
    [key: string]: any;
  };
}

/**
 * Request Context
 * Information about the request being evaluated
 */
export interface RequestContext {
  /** Agent identifier */
  agentId: string;
  /** Action being performed (e.g., 'chat.create', 'tool.execute') */
  action: string;
  /** Model being used (if applicable) */
  model?: string;
  /** Request content/prompt */
  content?: string;
  /** Tool being called (if applicable) */
  tool?: string;
  /** Tool parameters (if applicable) */
  toolParams?: Record<string, any>;
  /** Code being executed (if applicable) */
  code?: string;
  /** Estimated or actual cost */
  cost?: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Policy Validation Result
 * Returned when validating policy syntax
 */
export interface ValidationResult {
  /** Whether the policy is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** List of validation warnings */
  warnings: ValidationWarning[];
}

/**
 * Validation Error
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Path to the invalid field */
  path: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation Warning
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Path to the field */
  path: string;
}

/**
 * Test Case for Policy Testing
 */
export interface TestCase {
  /** Test case name */
  name: string;
  /** Request context to test */
  context: RequestContext;
  /** Expected result */
  expected: {
    /** Whether request should be allowed */
    allowed: boolean;
    /** Expected triggered policies */
    triggeredPolicies?: string[];
  };
}

/**
 * Coverage Report
 * Shows which policies have been tested
 */
export interface CoverageReport {
  /** Total number of policies */
  totalPolicies: number;
  /** Number of tested policies */
  testedPolicies: number;
  /** Coverage percentage (0-1) */
  coverage: number;
  /** List of untested policies */
  untested: string[];
  /** List of tested policies */
  tested: string[];
}

/**
 * Cache Entry
 * Internal type for policy cache
 */
export interface CacheEntry {
  /** Cached evaluation result */
  result: PolicyEvaluationResult;
  /** Timestamp when cached */
  timestamp: number;
}

// ============================================================================
// Enterprise Adoption Features (v1.1.x) - Phase 1
// P0.1: Policy Rollout Modes & P0.2: Deterministic Decision Contract
// ============================================================================

/**
 * Policy evaluation mode that determines enforcement behavior
 * 
 * @enum {string}
 */
export enum PolicyMode {
  /** Block operations that violate the policy */
  ENFORCE = 'ENFORCE',
  /** Allow operations but log violations */
  MONITOR = 'MONITOR',
  /** Allow all operations and log decisions without evaluating rules */
  REPORT_ONLY = 'REPORT_ONLY'
}

/**
 * Hierarchical mode configuration
 * Priority: policy-specific > environment-specific > global default
 * 
 * @interface ModeConfig
 */
export interface ModeConfig {
  /** Global default mode for all policies */
  default: PolicyMode;
  
  /** Environment-specific mode overrides (e.g., 'production', 'staging') */
  environment?: {
    [envName: string]: PolicyMode;
  };
  
  /** Policy-specific mode overrides (highest priority) */
  policy?: {
    [policyId: string]: PolicyMode;
  };
}

/**
 * Decision action returned by policy-enforcing components
 * 
 * @enum {string}
 */
export enum DecisionAction {
  /** Allow the operation to proceed */
  ALLOW = 'ALLOW',
  /** Deny the operation */
  DENY = 'DENY',
  /** Redact sensitive content before proceeding */
  REDACT = 'REDACT',
  /** Transform content before proceeding */
  TRANSFORM = 'TRANSFORM',
  /** Require manual approval before proceeding */
  REQUIRE_APPROVAL = 'REQUIRE_APPROVAL',
  /** Degrade service quality (e.g., use cheaper model) */
  DEGRADE = 'DEGRADE'
}

/**
 * Standardized reason codes explaining why a decision was made
 * 
 * @enum {string}
 */
export enum ReasonCode {
  // Policy compliance
  POLICY_COMPLIANT = 'POLICY_COMPLIANT',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  
  // Content safety
  PII_DETECTED = 'PII_DETECTED',
  PROMPT_INJECTION_DETECTED = 'PROMPT_INJECTION_DETECTED',
  HARMFUL_CONTENT_DETECTED = 'HARMFUL_CONTENT_DETECTED',
  UNSAFE_CODE_DETECTED = 'UNSAFE_CODE_DETECTED',
  
  // Tool misuse (ASI02)
  TOOL_NOT_ALLOWED = 'TOOL_NOT_ALLOWED',
  TOOL_PARAMETER_INVALID = 'TOOL_PARAMETER_INVALID',
  TOOL_RATE_LIMIT_EXCEEDED = 'TOOL_RATE_LIMIT_EXCEEDED',
  
  // Circuit breaker
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  CIRCUIT_HALF_OPEN = 'CIRCUIT_HALF_OPEN',
  
  // Cost governance (P0.6)
  COST_BUDGET_EXCEEDED = 'COST_BUDGET_EXCEEDED',
  COST_VELOCITY_ANOMALY = 'COST_VELOCITY_ANOMALY',
  COST_MODEL_TIER_VIOLATION = 'COST_MODEL_TIER_VIOLATION',
  COST_ESTIMATED_TOO_HIGH = 'COST_ESTIMATED_TOO_HIGH',
  
  // Mode-specific
  MONITOR_MODE_VIOLATION = 'MONITOR_MODE_VIOLATION',
  REPORT_ONLY_MODE = 'REPORT_ONLY_MODE'
}

/**
 * Component version information
 * 
 * @interface ComponentVersions
 */
export interface ComponentVersions {
  /** SDK version */
  sdk: string;
  /** TealEngine version */
  engine: string;
  /** TealGuard version (optional) */
  guard?: string;
  /** TealCircuit version (optional) */
  circuit?: string;
  /** TealMonitor version (optional) */
  monitor?: string;
  /** TealAudit version (optional) */
  audit?: string;
}

/**
 * Cost information for a decision
 * 
 * @interface CostInfo
 */
export interface CostInfo {
  /** Estimated cost before execution */
  estimated?: number;
  /** Actual cost after execution */
  actual?: number;
  /** Currency code (e.g., 'USD') */
  currency?: string;
  /** Model used for cost calculation */
  model?: string;
  /** Token usage breakdown */
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
}

/**
 * Deterministic decision object returned by all policy-enforcing components
 * 
 * @interface Decision
 */
export interface Decision {
  /** Action to take (ALLOW, DENY, REDACT, etc.) */
  action: DecisionAction;
  
  /** Non-empty array of reason codes explaining the decision */
  reason_codes: ReasonCode[];
  
  /** Risk score between 0 and 100 (inclusive) */
  risk_score: number;
  
  /** Evaluation mode used for this decision */
  mode: PolicyMode;
  
  /** Policy ID that was evaluated */
  policy_id: string;
  
  /** Policy version */
  policy_version: string;
  
  /** Component versions involved in the decision */
  component_versions: ComponentVersions;
  
  /** Non-empty correlation ID for request tracing */
  correlation_id: string;
  
  /** Optional trace ID for distributed tracing */
  trace_id?: string;
  
  /** Optional workflow ID for governance-grade aggregation */
  workflow_id?: string;
  
  /** Optional run ID for execution instance tracking */
  run_id?: string;
  
  /** Optional span ID for operation tracking */
  span_id?: string;
  
  /** Optional parent span ID for nested operations */
  parent_span_id?: string;
  
  /** LLM provider (e.g., 'openai', 'anthropic') */
  provider?: string;
  
  /** Human-readable reason for the decision */
  reason: string;
  
  /** Optional metadata */
  metadata?: {
    /** Evaluation time in milliseconds */
    evaluation_time_ms?: number;
    
    /** Whether result was from cache */
    cache_hit?: boolean;
    
    /** Policies that were triggered */
    triggered_policies?: string[];
    
    /** Cost information (P0.6) */
    cost?: CostInfo;
    
    /** Tenant ID for multi-tenancy */
    tenant_id?: string;
    
    /** Application name */
    application?: string;
    
    /** Environment (e.g., 'production', 'staging') */
    environment?: string;
    
    /** Agent purpose or role */
    agent_purpose?: string;
    
    /** Additional custom metadata */
    [key: string]: any;
  };
}

/**
 * Configuration error thrown when invalid mode configuration is provided
 * 
 * @class InvalidConfigurationError
 * @extends {Error}
 */
export class InvalidConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConfigurationError';
    
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidConfigurationError);
    }
  }
}

/**
 * Policy violation error thrown in ENFORCE mode
 * Carries the Decision object that caused the violation
 * 
 * @class PolicyViolationError
 * @extends {Error}
 */
export class PolicyViolationError extends Error {
  public readonly decision: Decision;
  
  constructor(message: string, decision: Decision) {
    super(message);
    this.name = 'PolicyViolationError';
    this.decision = decision;
    
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PolicyViolationError);
    }
  }
}

/**
 * Validates that a PolicyMode value is valid
 * 
 * @param mode - The mode to validate
 * @returns true if valid, false otherwise
 */
export function isValidPolicyMode(mode: any): mode is PolicyMode {
  return Object.values(PolicyMode).includes(mode);
}

/**
 * Validates that a DecisionAction value is valid
 * 
 * @param action - The action to validate
 * @returns true if valid, false otherwise
 */
export function isValidDecisionAction(action: any): action is DecisionAction {
  return Object.values(DecisionAction).includes(action);
}

/**
 * Validates that a ReasonCode value is valid
 * 
 * @param code - The reason code to validate
 * @returns true if valid, false otherwise
 */
export function isValidReasonCode(code: any): code is ReasonCode {
  return Object.values(ReasonCode).includes(code);
}

/**
 * Validates that a risk score is within valid range (0-100)
 * 
 * @param score - The risk score to validate
 * @returns true if valid, false otherwise
 */
export function isValidRiskScore(score: number): boolean {
  return typeof score === 'number' && score >= 0 && score <= 100 && !isNaN(score);
}

/**
 * Validates that a Decision object has all required fields
 * 
 * @param decision - The decision to validate
 * @throws {InvalidConfigurationError} if decision is invalid
 */
export function validateDecision(decision: Decision): void {
  if (!decision) {
    throw new InvalidConfigurationError('Decision object is required');
  }
  
  if (!isValidDecisionAction(decision.action)) {
    throw new InvalidConfigurationError(`Invalid decision action: ${decision.action}`);
  }
  
  if (!Array.isArray(decision.reason_codes) || decision.reason_codes.length === 0) {
    throw new InvalidConfigurationError('Decision must have at least one reason code');
  }
  
  for (const code of decision.reason_codes) {
    if (!isValidReasonCode(code)) {
      throw new InvalidConfigurationError(`Invalid reason code: ${code}`);
    }
  }
  
  if (!isValidRiskScore(decision.risk_score)) {
    throw new InvalidConfigurationError(`Risk score must be between 0 and 100, got: ${decision.risk_score}`);
  }
  
  if (!isValidPolicyMode(decision.mode)) {
    throw new InvalidConfigurationError(`Invalid policy mode: ${decision.mode}`);
  }
  
  if (!decision.policy_id || typeof decision.policy_id !== 'string') {
    throw new InvalidConfigurationError('Decision must have a valid policy_id');
  }
  
  if (!decision.policy_version || typeof decision.policy_version !== 'string') {
    throw new InvalidConfigurationError('Decision must have a valid policy_version');
  }
  
  if (!decision.correlation_id || typeof decision.correlation_id !== 'string') {
    throw new InvalidConfigurationError('Decision must have a non-empty correlation_id');
  }
  
  if (!decision.component_versions || typeof decision.component_versions !== 'object') {
    throw new InvalidConfigurationError('Decision must have component_versions');
  }
  
  if (!decision.reason || typeof decision.reason !== 'string') {
    throw new InvalidConfigurationError('Decision must have a human-readable reason');
  }
}

/**
 * Validates that a ModeConfig object is valid
 * 
 * @param config - The mode configuration to validate
 * @throws {InvalidConfigurationError} if configuration is invalid
 */
export function validateModeConfig(config: ModeConfig): void {
  if (!config) {
    throw new InvalidConfigurationError('ModeConfig is required');
  }
  
  if (!isValidPolicyMode(config.default)) {
    throw new InvalidConfigurationError(`Invalid default mode: ${config.default}`);
  }
  
  if (config.environment) {
    for (const [env, mode] of Object.entries(config.environment)) {
      if (!isValidPolicyMode(mode)) {
        throw new InvalidConfigurationError(`Invalid mode for environment '${env}': ${mode}`);
      }
    }
  }
  
  if (config.policy) {
    for (const [policyId, mode] of Object.entries(config.policy)) {
      if (!isValidPolicyMode(mode)) {
        throw new InvalidConfigurationError(`Invalid mode for policy '${policyId}': ${mode}`);
      }
    }
  }
}
