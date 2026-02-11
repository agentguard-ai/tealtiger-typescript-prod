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
