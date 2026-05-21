/**
 * TealEngine - Core Policy Framework
 * 
 * TealTiger's embedded policy engine that provides enterprise-grade AI security
 * without requiring any infrastructure. Runs entirely client-side in the SDK.
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 * 
 * @module core/engine/TealEngine
 */

import {
  TealPolicy,
  PolicyEvaluationResult,
  RequestContext,
  ValidationResult,
  TestCase,
  CoverageReport,
  Decision,
  DecisionAction,
  ReasonCode,
  PolicyMode,
  ModeConfig,
  ComponentVersions,
  InvalidConfigurationError,
  formatInvalidPolicyModeMessage,
} from './types';
import { PolicyEvaluator } from './PolicyEvaluator';
import { PolicyCache } from './PolicyCache';
import { PolicyValidator } from './PolicyValidator';
import { ModeResolver } from './ModeResolver';
import { getComponentVersions, getPackageVersion } from '../utils/version';
import { ExecutionContext } from '../context/ExecutionContext';
import { ContextManager } from '../context/ContextManager';

/**
 * TealEngine - Policy Definition, Validation, and Enforcement Engine
 * 
 * TealEngine is the core of TealTiger's policy framework. It provides:
 * - Policy definition and validation
 * - Request evaluation against policies
 * - Policy testing and coverage reporting
 * - Pre-built policy templates
 * 
 * @example
 * ```typescript
 * import { TealEngine } from 'tealtiger';
 * 
 * const engine = new TealEngine({
 *   tools: {
 *     file_delete: { allowed: false },
 *     file_read: { allowed: true, maxSize: '1MB' }
 *   },
 *   identity: {
 *     agentId: 'support-001',
 *     role: 'customer-support',
 *     permissions: ['read:customer_data', 'write:tickets']
 *   }
 * });
 * 
 * const result = engine.evaluate({
 *   agentId: 'support-001',
 *   action: 'tool.execute',
 *   tool: 'file_delete'
 * });
 * 
 * if (!result.allowed) {
 *   console.error('Policy violation:', result.reason);
 * }
 * ```
 */
export class TealEngine {
  /** TealEngine version (dynamically loaded from package.json) */
  public static readonly VERSION = getPackageVersion();

  /** Policy configuration */
  private policies: TealPolicy;

  /** Mode configuration */
  private modeConfig: ModeConfig;

  /** Policy cache */
  private cache: PolicyCache;

  /** Policy evaluator instance */
  private evaluator: PolicyEvaluator;

  /** Policy validator instance */
  private validator: PolicyValidator;

  /** Component versions */
  private componentVersions: ComponentVersions;

  /**
   * Creates a new TealEngine instance
   * 
   * @param policies - Policy configuration
   * @param options - Engine options
   * 
   * @throws {Error} If policies are invalid
   * 
   * @example
   * ```typescript
   * const engine = new TealEngine({
   *   tools: {
   *     database_query: { 
   *       allowed: true,
   *       maxRows: 1000 
   *     }
   *   }
   * });
   * ```
   */
  constructor(
    policies: TealPolicy,
    options?: {
      /** Cache TTL in milliseconds */
      cacheTTL?: number;
      /** Whether to enable caching */
      cacheEnabled?: boolean;
      /** Maximum cache size */
      cacheMaxSize?: number;
      /** Mode configuration */
      mode?: ModeConfig;
    }
  ) {
    this.policies = policies;
    
    // Initialize mode configuration (default to ENFORCE)
    this.modeConfig = options?.mode || {
      default: PolicyMode.ENFORCE
    };
    
    // Validate mode configuration
    if (this.modeConfig) {
      ModeResolver.validateModeConfiguration(this.modeConfig);
    }
    
    // Initialize component versions from package.json
    this.componentVersions = getComponentVersions();
    
    // Build cache options, only including defined values
    const cacheOptions: {
      ttl?: number;
      enabled?: boolean;
      maxSize?: number;
    } = {};
    
    if (options?.cacheTTL !== undefined) {
      cacheOptions.ttl = options.cacheTTL;
    }
    if (options?.cacheEnabled !== undefined) {
      cacheOptions.enabled = options.cacheEnabled;
    }
    if (options?.cacheMaxSize !== undefined) {
      cacheOptions.maxSize = options.cacheMaxSize;
    }
    
    this.cache = new PolicyCache(cacheOptions);
    this.evaluator = new PolicyEvaluator();
    this.validator = new PolicyValidator();

    // Validate policies on initialization
    const validation = this.validate();
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join(', ');
      throw new Error(`TealEngine: Invalid policy configuration: ${errorMessages}`);
    }
  }

  /**
   * Evaluates a request against configured policies
   * 
   * @param context - Request context to evaluate
   * @returns Policy evaluation result
   * 
   * @example
   * ```typescript
   * const result = engine.evaluate({
   *   agentId: 'agent-001',
   *   action: 'tool.execute',
   *   tool: 'file_delete',
   *   toolParams: { path: '/data.txt' }
   * });
   * 
   * if (!result.allowed) {
   *   throw new Error(result.reason);
   * }
   * ```
   */
  public evaluate(context: RequestContext): PolicyEvaluationResult {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.cache.generateKey(context);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
        },
      };
    }

    // Evaluate policies using PolicyEvaluator
    const result = this.evaluator.evaluate(context, this.policies);

    // Add engine metadata
    const finalResult: PolicyEvaluationResult = {
      ...result,
      metadata: {
        ...result.metadata,
        evaluationTime: Date.now() - startTime,
        cacheHit: false,
        engine: `TealEngine v${TealEngine.VERSION}`,
      },
    };

    // Cache the result
    this.cache.set(cacheKey, finalResult);

    return finalResult;
  }

  /**
   * Evaluates a request with mode-specific behavior and returns a Decision object
   * 
   * @param context - Request context to evaluate
   * @param executionContext - Execution context for tracing (optional, will be auto-generated if not provided)
   * @returns Decision object with mode-specific behavior
   * 
   * @example
   * ```typescript
   * const decision = engine.evaluateWithMode({
   *   agentId: 'agent-001',
   *   action: 'tool.execute',
   *   tool: 'file_delete'
   * });
   * 
   * if (decision.action === DecisionAction.DENY) {
   *   throw new Error(decision.reason);
   * }
   * ```
   */
  public evaluateWithMode(
    context: RequestContext,
    executionContext?: ExecutionContext
  ): Decision {
    const startTime = Date.now();

    // Ensure we have an execution context with correlation_id
    const execContext = executionContext || ContextManager.createContext();

    // Resolve the effective mode for this policy
    const policyId = this.getPolicyIdFromContext(context);
    
    const modeResolution = ModeResolver.resolvePolicyMode({
      policyId,
      ...(executionContext?.environment && { environment: executionContext.environment }),
      modeConfig: this.modeConfig
    });
    
    const effectiveMode = modeResolution.mode;

    // REPORT_ONLY mode: Always allow without evaluating policies
    if (effectiveMode === PolicyMode.REPORT_ONLY) {
      const metadata: Record<string, any> = {
        evaluation_time_ms: Date.now() - startTime,
        cache_hit: false,
        triggered_policies: [],
        evaluation_performed: false
      };
      
      if (execContext.tenant_id) metadata.tenant_id = execContext.tenant_id;
      if (execContext.application) metadata.application = execContext.application;
      if (execContext.environment) metadata.environment = execContext.environment;
      if (execContext.agent_purpose) metadata.agent_purpose = execContext.agent_purpose;

      const decision: Decision = {
        action: DecisionAction.ALLOW,
        reason_codes: [ReasonCode.REPORT_ONLY_MODE],
        risk_score: 0,
        mode: PolicyMode.REPORT_ONLY,
        policy_id: policyId,
        policy_version: TealEngine.VERSION,
        component_versions: this.componentVersions,
        correlation_id: execContext.correlation_id,
        ...(execContext.trace_id && { trace_id: execContext.trace_id }),
        ...(execContext.workflow_id && { workflow_id: execContext.workflow_id }),
        ...(execContext.run_id && { run_id: execContext.run_id }),
        ...(execContext.span_id && { span_id: execContext.span_id }),
        ...(execContext.parent_span_id && { parent_span_id: execContext.parent_span_id }),
        ...(context.metadata?.provider && { provider: context.metadata.provider as string }),
        reason: 'Request allowed in REPORT_ONLY mode (policy evaluation skipped)',
        metadata
      };

      return decision;
    }

    // Evaluate policies using PolicyEvaluator
    const evalResult = this.evaluator.evaluate(context, this.policies);

    // Calculate risk score based on evaluation result
    const riskScore = this.calculateRiskScore(evalResult);

    // Determine reason codes
    const reasonCodes = this.determineReasonCodes(evalResult);

    // MONITOR mode: Always allow but log violations
    if (effectiveMode === PolicyMode.MONITOR) {
      const metadata: Record<string, any> = {
        evaluation_time_ms: Date.now() - startTime,
        cache_hit: false,
        triggered_policies: evalResult.triggeredPolicies,
        evaluation_performed: true
      };
      
      if (execContext.tenant_id) metadata.tenant_id = execContext.tenant_id;
      if (execContext.application) metadata.application = execContext.application;
      if (execContext.environment) metadata.environment = execContext.environment;
      if (execContext.agent_purpose) metadata.agent_purpose = execContext.agent_purpose;

      const decision: Decision = {
        action: DecisionAction.ALLOW,
        reason_codes: evalResult.allowed 
          ? [ReasonCode.POLICY_COMPLIANT]
          : [ReasonCode.MONITOR_MODE_VIOLATION, ...reasonCodes],
        risk_score: riskScore,
        mode: PolicyMode.MONITOR,
        policy_id: policyId,
        policy_version: TealEngine.VERSION,
        component_versions: this.componentVersions,
        correlation_id: execContext.correlation_id,
        ...(execContext.trace_id && { trace_id: execContext.trace_id }),
        ...(execContext.workflow_id && { workflow_id: execContext.workflow_id }),
        ...(execContext.run_id && { run_id: execContext.run_id }),
        ...(execContext.span_id && { span_id: execContext.span_id }),
        ...(execContext.parent_span_id && { parent_span_id: execContext.parent_span_id }),
        ...(context.metadata?.provider && { provider: context.metadata.provider as string }),
        reason: evalResult.allowed
          ? 'Request allowed and compliant with policy'
          : `Request allowed in MONITOR mode but would violate policy: ${evalResult.reason}`,
        metadata
      };

      return decision;
    }

    // ENFORCE mode: Block violations, allow compliant requests
    if (effectiveMode === PolicyMode.ENFORCE) {
      const metadata: Record<string, any> = {
        evaluation_time_ms: Date.now() - startTime,
        cache_hit: false,
        triggered_policies: evalResult.triggeredPolicies,
        evaluation_performed: true
      };
      
      if (execContext.tenant_id) metadata.tenant_id = execContext.tenant_id;
      if (execContext.application) metadata.application = execContext.application;
      if (execContext.environment) metadata.environment = execContext.environment;
      if (execContext.agent_purpose) metadata.agent_purpose = execContext.agent_purpose;

      const decision: Decision = {
        action: evalResult.allowed ? DecisionAction.ALLOW : DecisionAction.DENY,
        reason_codes: evalResult.allowed 
          ? [ReasonCode.POLICY_COMPLIANT]
          : reasonCodes,
        risk_score: riskScore,
        mode: PolicyMode.ENFORCE,
        policy_id: policyId,
        policy_version: TealEngine.VERSION,
        component_versions: this.componentVersions,
        correlation_id: execContext.correlation_id,
        ...(execContext.trace_id && { trace_id: execContext.trace_id }),
        ...(execContext.workflow_id && { workflow_id: execContext.workflow_id }),
        ...(execContext.run_id && { run_id: execContext.run_id }),
        ...(execContext.span_id && { span_id: execContext.span_id }),
        ...(execContext.parent_span_id && { parent_span_id: execContext.parent_span_id }),
        ...(context.metadata?.provider && { provider: context.metadata.provider as string }),
        reason: evalResult.allowed
          ? 'Request allowed and compliant with policy'
          : evalResult.reason || 'Request denied by policy',
        metadata
      };

      return decision;
    }

    // Fallback (should never reach here due to mode validation)
    throw new InvalidConfigurationError(formatInvalidPolicyModeMessage(effectiveMode));
  }

  /**
   * Calculates risk score based on policy evaluation result
   * 
   * @private
   * @param result - Policy evaluation result
   * @returns Risk score (0-100)
   */
  private calculateRiskScore(result: PolicyEvaluationResult): number {
    if (result.allowed) {
      return 0; // No risk if allowed
    }

    // Base risk score for violations
    let riskScore = 50;

    // Increase risk based on triggered policies
    const triggeredCount = result.triggeredPolicies.length;
    riskScore += Math.min(triggeredCount * 10, 40);

    // Check for high-risk policy violations
    const highRiskPatterns = [
      'tools.file_delete',
      'tools.database_delete',
      'identity.forbidden',
      'codeExecution.blockedFunctions',
      'codeExecution.blockedPatterns'
    ];

    for (const policy of result.triggeredPolicies) {
      if (highRiskPatterns.some(pattern => policy.includes(pattern))) {
        riskScore = Math.min(riskScore + 20, 100);
      }
    }

    return Math.min(Math.max(riskScore, 0), 100);
  }

  /**
   * Determines reason codes from policy evaluation result
   * 
   * @private
   * @param result - Policy evaluation result
   * @returns Array of reason codes
   */
  private determineReasonCodes(
    result: PolicyEvaluationResult
  ): ReasonCode[] {
    if (result.allowed) {
      return [ReasonCode.POLICY_COMPLIANT];
    }

    const codes: ReasonCode[] = [ReasonCode.POLICY_VIOLATION];

    // Map triggered policies to reason codes
    for (const policy of result.triggeredPolicies) {
      if (policy.includes('tools')) {
        // Check if it's a tool not allowed violation
        if (policy.includes('allowed') || result.reason?.includes('blocked') || result.reason?.includes('not defined')) {
          codes.push(ReasonCode.TOOL_NOT_ALLOWED);
        } else if (policy.includes('rateLimit')) {
          codes.push(ReasonCode.TOOL_RATE_LIMIT_EXCEEDED);
        }
      } else if (policy.includes('identity.forbidden')) {
        codes.push(ReasonCode.POLICY_VIOLATION);
      } else if (policy.includes('codeExecution')) {
        codes.push(ReasonCode.UNSAFE_CODE_DETECTED);
      } else if (policy.includes('behavioral.costLimit')) {
        codes.push(ReasonCode.COST_BUDGET_EXCEEDED);
      }
    }

    // Remove duplicates
    return Array.from(new Set(codes));
  }

  /**
   * Extracts policy ID from request context
   * 
   * @private
   * @param context - Request context
   * @returns Policy ID
   */
  private getPolicyIdFromContext(context: RequestContext): string {
    // Generate policy ID based on context
    if (context.tool) {
      return `tools.${context.tool}`;
    } else if (context.code) {
      return 'codeExecution';
    } else if (context.action) {
      return `action.${context.action}`;
    } else {
      return 'general';
    }
  }

  /**
   * Validates the policy configuration
   * 
   * @returns Validation result with errors and warnings
   * 
   * @example
   * ```typescript
   * const validation = engine.validate();
   * if (!validation.valid) {
   *   console.error('Policy errors:', validation.errors);
   * }
   * if (validation.warnings.length > 0) {
   *   console.warn('Policy warnings:', validation.warnings);
   * }
   * ```
   */
  public validate(): ValidationResult {
    return this.validator.validate(this.policies);
  }

  /**
   * Tests a policy against a sample request
   * 
   * @param testCase - Test case to run
   * @returns Policy evaluation result
   * 
   * @example
   * ```typescript
   * const result = engine.test({
   *   name: 'Block file deletion',
   *   context: {
   *     agentId: 'agent-001',
   *     action: 'tool.execute',
   *     tool: 'file_delete'
   *   },
   *   expected: {
   *     allowed: false,
   *     triggeredPolicies: ['tools.file_delete']
   *   }
   * });
   * ```
   */
  public test(testCase: TestCase): PolicyEvaluationResult {
    return this.evaluate(testCase.context);
  }

  /**
   * Gets policy coverage report
   * 
   * Shows which policies have been tested and which haven't
   * 
   * @returns Coverage report
   * 
   * @example
   * ```typescript
   * const coverage = engine.getCoverage();
   * console.log(`Coverage: ${(coverage.coverage * 100).toFixed(1)}%`);
   * console.log('Untested policies:', coverage.untested);
   * ```
   */
  public getCoverage(): CoverageReport {
    // Note: Coverage tracking requires PolicyTester
    // This method returns empty report - use PolicyTester for actual coverage tracking
    return {
      totalPolicies: 0,
      testedPolicies: 0,
      coverage: 0,
      untested: [],
      tested: [],
    };
  }

  /**
   * Gets the current policy configuration
   * 
   * @returns Current policies
   */
  public getPolicies(): Readonly<TealPolicy> {
    return Object.freeze({ ...this.policies });
  }

  /**
   * Gets the current mode configuration
   * 
   * @returns Current mode configuration
   */
  public getModeConfig(): Readonly<ModeConfig> {
    return Object.freeze({ ...this.modeConfig });
  }

  /**
   * Updates the policy configuration
   * 
   * @param policies - New policy configuration
   * @throws {Error} If new policies are invalid
   * 
   * @example
   * ```typescript
   * engine.updatePolicies({
   *   ...engine.getPolicies(),
   *   tools: {
   *     ...engine.getPolicies().tools,
   *     new_tool: { allowed: true }
   *   }
   * });
   * ```
   */
  public updatePolicies(policies: TealPolicy): void {
    // Validate new policies by creating a temporary engine
    // This will throw if policies are invalid
    const tempEngine = new TealEngine(policies, {
      cacheEnabled: false,
    });
    
    // Ensure validation passes
    const validation = tempEngine.validate();
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join(', ');
      throw new Error(`TealEngine: Invalid policy configuration: ${errorMessages}`);
    }

    // If validation passes, update policies and clear cache
    this.policies = policies;
    this.clearCache();
  }

  /**
   * Clears the evaluation cache
   * 
   * @example
   * ```typescript
   * engine.clearCache();
   * ```
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   * 
   * @returns Cache stats
   */
  public getCacheStats(): {
    size: number;
    maxSize: number;
    enabled: boolean;
    ttl: number;
  } {
    return this.cache.getStats();
  }

  /**
   * Pre-built policy templates for common use cases
   * 
   * @example
   * ```typescript
   * const engine = new TealEngine(
   *   TealEngine.Templates.customerSupport()
   * );
   * ```
   */
  public static Templates = {
    /**
     * Customer support agent template
     * Allows reading customer data and creating tickets
     */
    customerSupport(): TealPolicy {
      return {
        tools: {
          search_knowledge_base: { allowed: true },
          create_ticket: { allowed: true },
          read_customer_data: { allowed: true },
          update_customer_data: { allowed: false },
          delete_customer_data: { allowed: false },
        },
        identity: {
          agentId: 'customer-support',
          role: 'support',
          permissions: ['read:customer_data', 'write:tickets', 'read:knowledge_base'],
          forbidden: ['delete:*', 'write:customer_data'],
        },
        behavioral: {
          costLimit: { daily: 50, hourly: 10 },
          rateLimit: { requests: 100, window: '1m' },
        },
      };
    },

    /**
     * Data analysis agent template
     * Allows querying databases with restrictions
     */
    dataAnalysis(): TealPolicy {
      return {
        tools: {
          database_query: {
            allowed: true,
            maxRows: 10000,
            allowedTables: ['analytics', 'reports', 'metrics'],
          },
          database_write: { allowed: false },
          database_delete: { allowed: false },
        },
        codeExecution: {
          allowedLanguages: ['python', 'sql'],
          blockedFunctions: ['eval', 'exec', 'system', 'subprocess'],
          blockedPatterns: [/os\.system/, /subprocess\./, /__import__/],
          maxLength: 10000,
          timeout: 30000,
          requireSandbox: true,
        },
        behavioral: {
          costLimit: { daily: 100, hourly: 20 },
          rateLimit: { requests: 50, window: '1m' },
        },
      };
    },

    /**
     * Code generation agent template
     * Allows code generation with safety restrictions
     */
    codeGeneration(): TealPolicy {
      return {
        codeExecution: {
          allowedLanguages: ['python', 'javascript', 'typescript'],
          blockedFunctions: ['eval', 'exec', 'system'],
          blockedPatterns: [/eval\s*\(/, /exec\s*\(/, /os\.system/],
          maxLength: 50000,
          timeout: 60000,
          requireSandbox: true,
        },
        behavioral: {
          costLimit: { daily: 200, hourly: 50 },
          rateLimit: { requests: 30, window: '1m' },
        },
      };
    },

    /**
     * Safe code execution template
     * Strict restrictions for code execution
     */
    codeExecutionSafe(): TealPolicy {
      return {
        codeExecution: {
          allowedLanguages: ['python'],
          blockedFunctions: [
            'eval',
            'exec',
            'compile',
            'system',
            'subprocess',
            'os.system',
            'os.popen',
            '__import__',
          ],
          blockedPatterns: [
            /eval\s*\(/,
            /exec\s*\(/,
            /os\.system/,
            /subprocess\./,
            /__import__/,
            /open\s*\(/,
          ],
          maxLength: 5000,
          timeout: 10000,
          requireSandbox: true,
        },
      };
    },

    /**
     * Strict security template
     * Maximum security, minimal permissions
     */
    strictSecurity(): TealPolicy {
      return {
        tools: {},
        codeExecution: {
          allowedLanguages: [],
          blockedFunctions: ['*'],
          blockedPatterns: [/.*/],
          maxLength: 0,
          timeout: 0,
          requireSandbox: true,
        },
        behavioral: {
          costLimit: { daily: 10, hourly: 2 },
          rateLimit: { requests: 10, window: '1m' },
          anomalyThreshold: 1.5,
        },
        content: {
          pii: {
            enabled: true,
            blockedTypes: ['ssn', 'credit_card', 'email', 'phone', 'address'],
            redactInLogs: true,
          },
          moderation: {
            enabled: true,
            threshold: 0.7,
            categories: ['hate', 'violence', 'sexual', 'self-harm'],
          },
        },
      };
    },

    /**
     * Development template
     * Permissive settings for development and testing
     */
    development(): TealPolicy {
      return {
        tools: {
          '*': { allowed: true },
        },
        behavioral: {
          costLimit: { daily: 1000, hourly: 200 },
          rateLimit: { requests: 1000, window: '1m' },
        },
      };
    },
  };
}
