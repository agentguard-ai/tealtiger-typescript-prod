/**
 * TealGuard - Enhanced Guardrails with TealEngine Integration
 * 
 * TealGuard extends the existing GuardrailEngine with policy-driven configuration,
 * custom rules support, composition capabilities, and performance optimizations.
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 */

import { TealEngine } from '../engine/TealEngine';
import type { 
  TealPolicy, 
  RequestContext, 
  Decision
} from '../engine/types';
import { DecisionAction, ReasonCode, PolicyMode } from '../engine/types';
import { ExecutionContext } from '../context/ExecutionContext';
import { ContextManager } from '../context/ContextManager';
import { getComponentVersionsWithGuard } from '../utils/version';
import {
  GuardrailEngine,
  GuardrailEngineOptions,
  GuardrailEngineResult,
  Guardrail,
  GuardrailResult
} from '../../guardrails';

/**
 * TealGuard Configuration
 */
export interface TealGuardConfig {
  /** TealEngine instance for policy evaluation */
  engine?: TealEngine;
  /** Policy configuration (if engine not provided) */
  policy?: TealPolicy;
  /** Guardrail engine options */
  engineOptions?: GuardrailEngineOptions;
  /** Enable policy-driven guardrail configuration */
  policyDriven?: boolean;
  /** Custom guardrail rules */
  customRules?: CustomGuardrailRule[];
  /** Enable result caching */
  enableCache?: boolean;
  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  cacheTTL?: number;
  /** Maximum cache size (default: 1000) */
  cacheMaxSize?: number;
}

/**
 * Custom Guardrail Rule
 */
export interface CustomGuardrailRule {
  name: string;
  description?: string;
  enabled?: boolean;
  evaluate: (input: any, context?: Record<string, any>) => Promise<GuardrailResult> | GuardrailResult;
}

/**
 * TealGuard Result
 */
export interface TealGuardResult {
  /** Whether all checks passed */
  passed: boolean;
  /** Guardrail execution results */
  guardrailResults: GuardrailEngineResult;
  /** Policy evaluation result (if policy-driven) */
  policyResult?: {
    allowed: boolean;
    reason?: string;
    triggeredPolicies: string[];
  };
  /** Combined execution time */
  executionTime: number;
  /** Whether result came from cache */
  cacheHit: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Cache Entry
 */
interface CacheEntry {
  result: Decision;
  timestamp: number;
}

/**
 * TealGuard - Enhanced Guardrails System
 * 
 * Integrates TealEngine policies with guardrail execution for comprehensive
 * content validation and policy enforcement.
 * 
 * Performance Optimizations:
 * - Parallel guardrail execution (inherited from GuardrailEngine)
 * - Result caching with LRU eviction
 * - Optimized PII detection with compiled patterns
 */
export class TealGuard {
  private engine?: TealEngine;
  private guardrailEngine: GuardrailEngine;
  private config: TealGuardConfig;
  private customRules: Map<string, CustomGuardrailRule> = new Map();
  
  // Caching
  private cache: Map<string, CacheEntry> = new Map();
  private cacheOrder: string[] = [];
  private enableCache: boolean;
  private cacheTTL: number;
  private cacheMaxSize: number;

  constructor(config: TealGuardConfig = {}) {
    this.config = config;

    // Initialize TealEngine if policy provided
    if (config.policy && !config.engine) {
      this.engine = new TealEngine(config.policy);
    } else if (config.engine) {
      this.engine = config.engine;
    }

    // Initialize GuardrailEngine with parallel execution enabled by default
    const engineOptions: GuardrailEngineOptions = {
      parallelExecution: true,
      continueOnError: true,
      timeout: 5000,
      ...config.engineOptions
    };
    this.guardrailEngine = new GuardrailEngine(engineOptions);

    // Initialize cache settings
    this.enableCache = config.enableCache ?? false;
    this.cacheTTL = config.cacheTTL ?? 60000; // 1 minute default
    this.cacheMaxSize = config.cacheMaxSize ?? 1000;

    // Register custom rules
    if (config.customRules) {
      config.customRules.forEach(rule => this.addCustomRule(rule));
    }
  }

  /**
   * Check input against all guardrails and policies
   * 
   * Returns a Decision object with the same structure as TealEngine for consistency.
   * 
   * Optimizations:
   * - Parallel execution of independent guardrails
   * - Result caching with LRU eviction
   * - Early return on cache hit
   * 
   * @param input - Input to check
   * @param context - Execution context with correlation_id (auto-generated if not provided)
   * @returns Decision object with action, reason_codes, risk_score, and metadata
   */
  async check(input: any, context?: ExecutionContext): Promise<Decision> {
    const startTime = Date.now();

    // Ensure we have a valid ExecutionContext
    const executionContext = context || ContextManager.createContext();

    // Check cache first (using correlation_id as part of cache key)
    if (this.enableCache) {
      const cacheKey = this.generateCacheKey(input, executionContext);
      const cached = this.getFromCache(cacheKey);
      
      if (cached) {
        // Update correlation_id and metadata for cache hit
        const updatedDecision: Decision = {
          ...cached,
          correlation_id: executionContext.correlation_id,
          metadata: {
            ...cached.metadata,
            evaluation_time_ms: Date.now() - startTime,
            cache_hit: true
          }
        };
        
        // Update optional fields only if defined
        if (executionContext.trace_id) updatedDecision.trace_id = executionContext.trace_id;
        if (executionContext.workflow_id) updatedDecision.workflow_id = executionContext.workflow_id;
        if (executionContext.run_id) updatedDecision.run_id = executionContext.run_id;
        if (executionContext.span_id) updatedDecision.span_id = executionContext.span_id;
        if (executionContext.parent_span_id) updatedDecision.parent_span_id = executionContext.parent_span_id;
        
        return updatedDecision;
      }
    }

    // Execute guardrails (parallel execution handled by GuardrailEngine)
    const guardrailResults = await this.guardrailEngine.execute(input, {
      correlation_id: executionContext.correlation_id
    });

    // Evaluate policy if policy-driven mode is enabled
    let policyDecision: Decision | undefined;
    if (this.config.policyDriven && this.engine) {
      const requestContext: RequestContext = {
        agentId: executionContext.tenant_id || 'default',
        action: 'guardrail.check',
        content: typeof input === 'string' ? input : JSON.stringify(input),
        metadata: {
          correlation_id: executionContext.correlation_id,
          trace_id: executionContext.trace_id,
          workflow_id: executionContext.workflow_id,
          run_id: executionContext.run_id,
          span_id: executionContext.span_id
        }
      };

      policyDecision = this.engine.evaluateWithMode(requestContext, executionContext);
    }

    const executionTime = Date.now() - startTime;

    // Determine overall action based on guardrail and policy results
    const passed = guardrailResults.passed && (policyDecision?.action === DecisionAction.ALLOW || !policyDecision);
    
    // Build Decision object
    const decision = this.buildDecision(
      passed,
      guardrailResults,
      policyDecision,
      executionContext,
      executionTime
    );

    // Cache result
    if (this.enableCache) {
      const cacheKey = this.generateCacheKey(input, executionContext);
      this.addToCache(cacheKey, decision);
    }

    return decision;
  }

  /**
   * Register a standard guardrail
   */
  registerGuardrail(guardrail: Guardrail): void {
    this.guardrailEngine.registerGuardrail(guardrail);
  }

  /**
   * Unregister a guardrail by name
   */
  unregisterGuardrail(name: string): void {
    this.guardrailEngine.unregisterGuardrail(name);
  }

  /**
   * Add a custom guardrail rule
   */
  addCustomRule(rule: CustomGuardrailRule): void {
    // Create a Guardrail wrapper for the custom rule
    const guardrail = new CustomGuardrailWrapper(rule);
    this.customRules.set(rule.name, rule);
    this.guardrailEngine.registerGuardrail(guardrail);
  }

  /**
   * Remove a custom rule
   */
  removeCustomRule(name: string): void {
    if (this.customRules.has(name)) {
      this.customRules.delete(name);
      this.guardrailEngine.unregisterGuardrail(name);
    }
  }

  /**
   * Get all registered guardrails
   */
  getRegisteredGuardrails(): Array<ReturnType<Guardrail['getMetadata']>> {
    return this.guardrailEngine.getRegisteredGuardrails();
  }

  /**
   * Update TealEngine policy
   */
  updatePolicy(policy: TealPolicy): void {
    if (this.engine) {
      this.engine.updatePolicies(policy);
    } else {
      this.engine = new TealEngine(policy);
    }
    
    // Clear cache when policy changes
    this.clearCache();
  }

  /**
   * Enable policy-driven mode
   */
  enablePolicyDriven(): void {
    this.config.policyDriven = true;
  }

  /**
   * Disable policy-driven mode
   */
  disablePolicyDriven(): void {
    this.config.policyDriven = false;
  }

  /**
   * Clear all guardrails
   */
  clearGuardrails(): void {
    this.guardrailEngine.clearGuardrails();
    this.customRules.clear();
  }

  /**
   * Enable result caching
   */
  enableResultCache(): void {
    this.enableCache = true;
  }

  /**
   * Disable result caching
   */
  disableResultCache(): void {
    this.enableCache = false;
  }

  /**
   * Clear the result cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheOrder = [];
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    // Note: Hit rate tracking would require additional counters
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hitRate: 0 // Placeholder - would need hit/miss counters
    };
  }

  /**
   * Build Decision object from guardrail and policy results
   * 
   * @private
   * @param passed - Whether all checks passed
   * @param guardrailResults - Results from guardrail execution
   * @param policyDecision - Optional policy decision
   * @param context - Execution context
   * @param executionTime - Execution time in milliseconds
   * @returns Decision object
   */
  private buildDecision(
    passed: boolean,
    guardrailResults: GuardrailEngineResult,
    policyDecision: Decision | undefined,
    context: ExecutionContext,
    executionTime: number
  ): Decision {
    // Determine action
    let action: DecisionAction;
    if (policyDecision && policyDecision.action !== DecisionAction.ALLOW) {
      action = policyDecision.action;
    } else if (!passed) {
      action = DecisionAction.DENY;
    } else {
      action = DecisionAction.ALLOW;
    }

    // Determine reason codes
    const reasonCodes = this.determineReasonCodes(guardrailResults, policyDecision);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(guardrailResults, policyDecision);

    // Build human-readable reason
    const reason = this.buildReason(passed, guardrailResults, policyDecision);

    // Get component versions
    const componentVersions = getComponentVersionsWithGuard();

    // Determine mode (default to ENFORCE if not policy-driven)
    const mode = policyDecision?.mode || PolicyMode.ENFORCE;

    // Build triggered policies list
    const triggeredPolicies: string[] = [];
    if (!guardrailResults.passed) {
      guardrailResults.results
        .filter(r => r.result && !r.result.passed)
        .forEach(r => triggeredPolicies.push(`guardrail.${r.guardrailName}`));
    }
    if (policyDecision?.metadata?.triggered_policies) {
      triggeredPolicies.push(...policyDecision.metadata.triggered_policies);
    }

    // Build metadata object with only defined values
    const metadata: Record<string, any> = {
      evaluation_time_ms: executionTime,
      cache_hit: false,
      guardrail_results: {
        passed: guardrailResults.passed,
        total: guardrailResults.results.length,
        failed: guardrailResults.results.filter(r => r.result && !r.result.passed).length
      }
    };

    if (triggeredPolicies.length > 0) {
      metadata.triggered_policies = triggeredPolicies;
    }
    if (context.tenant_id) metadata.tenant_id = context.tenant_id;
    if (context.application) metadata.application = context.application;
    if (context.environment) metadata.environment = context.environment;
    if (context.agent_purpose) metadata.agent_purpose = context.agent_purpose;

    // Build Decision object with only defined optional fields
    const decision: Decision = {
      action,
      reason_codes: reasonCodes,
      risk_score: riskScore,
      mode,
      policy_id: 'guardrail.check',
      policy_version: componentVersions.guard || '1.1.0',
      component_versions: componentVersions,
      correlation_id: context.correlation_id,
      reason,
      metadata
    };

    // Add optional fields only if defined
    if (context.trace_id) decision.trace_id = context.trace_id;
    if (context.workflow_id) decision.workflow_id = context.workflow_id;
    if (context.run_id) decision.run_id = context.run_id;
    if (context.span_id) decision.span_id = context.span_id;
    if (context.parent_span_id) decision.parent_span_id = context.parent_span_id;

    return decision;
  }

  /**
   * Determine reason codes from guardrail and policy results
   * 
   * @private
   * @param guardrailResults - Guardrail execution results
   * @param policyDecision - Optional policy decision
   * @returns Array of reason codes
   */
  private determineReasonCodes(
    guardrailResults: GuardrailEngineResult,
    policyDecision?: Decision
  ): ReasonCode[] {
    const codes: ReasonCode[] = [];

    // If policy decision exists, include its reason codes
    if (policyDecision) {
      codes.push(...policyDecision.reason_codes);
    }

    // Add guardrail-specific reason codes
    if (!guardrailResults.passed) {
      for (const execResult of guardrailResults.results) {
        if (execResult.result && !execResult.result.passed) {
          const name = execResult.guardrailName;
          // Map guardrail names to reason codes
          if (name.toLowerCase().includes('pii')) {
            codes.push(ReasonCode.PII_DETECTED);
          } else if (name.toLowerCase().includes('injection')) {
            codes.push(ReasonCode.PROMPT_INJECTION_DETECTED);
          } else if (name.toLowerCase().includes('harmful') || name.toLowerCase().includes('content')) {
            codes.push(ReasonCode.HARMFUL_CONTENT_DETECTED);
          } else if (name.toLowerCase().includes('code')) {
            codes.push(ReasonCode.UNSAFE_CODE_DETECTED);
          } else {
            // Generic policy violation
            if (!codes.includes(ReasonCode.POLICY_VIOLATION)) {
              codes.push(ReasonCode.POLICY_VIOLATION);
            }
          }
        }
      }
    }

    // If all passed and no codes yet, mark as compliant
    if (codes.length === 0) {
      codes.push(ReasonCode.POLICY_COMPLIANT);
    }

    // Remove duplicates
    return Array.from(new Set(codes));
  }

  /**
   * Calculate risk score from guardrail and policy results
   * 
   * @private
   * @param guardrailResults - Guardrail execution results
   * @param policyDecision - Optional policy decision
   * @returns Risk score (0-100)
   */
  private calculateRiskScore(
    guardrailResults: GuardrailEngineResult,
    policyDecision?: Decision
  ): number {
    // If policy decision exists and has higher risk, use it
    if (policyDecision && policyDecision.risk_score > 0) {
      return policyDecision.risk_score;
    }

    // If all guardrails passed, no risk
    if (guardrailResults.passed) {
      return 0;
    }

    // Base risk score for violations
    let riskScore = 50;

    // Increase risk based on number of failed guardrails
    const failedCount = guardrailResults.results.filter(r => r.result && !r.result.passed).length;
    riskScore += Math.min(failedCount * 15, 40);

    // Check for high-risk guardrail failures
    const highRiskGuardrails = ['pii', 'injection', 'harmful', 'unsafe'];
    for (const execResult of guardrailResults.results) {
      if (execResult.result && !execResult.result.passed) {
        const isHighRisk = highRiskGuardrails.some(pattern => 
          execResult.guardrailName.toLowerCase().includes(pattern)
        );
        if (isHighRisk) {
          riskScore = Math.min(riskScore + 10, 100);
        }
      }
    }

    return Math.min(Math.max(riskScore, 0), 100);
  }

  /**
   * Build human-readable reason from results
   * 
   * @private
   * @param passed - Whether all checks passed
   * @param guardrailResults - Guardrail execution results
   * @param policyDecision - Optional policy decision
   * @returns Human-readable reason string
   */
  private buildReason(
    passed: boolean,
    guardrailResults: GuardrailEngineResult,
    policyDecision?: Decision
  ): string {
    if (passed) {
      return 'All guardrail checks passed';
    }

    const failedGuardrails = guardrailResults.results
      .filter(r => r.result && !r.result.passed)
      .map(r => r.guardrailName);

    let reason = `Guardrail check failed: ${failedGuardrails.join(', ')}`;

    if (policyDecision && policyDecision.action !== DecisionAction.ALLOW) {
      reason += ` | Policy: ${policyDecision.reason}`;
    }

    return reason;
  }

  /**
   * Generate cache key from input and context
   */
  private generateCacheKey(input: any, _context: ExecutionContext): string {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    // Don't include correlation_id in cache key since it's unique per request
    // Use a stable hash of just the input
    return this.simpleHash(inputStr);
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get result from cache
   */
  private getFromCache(key: string): Decision | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      this.cacheOrder = this.cacheOrder.filter(k => k !== key);
      return null;
    }

    // Move to end (most recently used)
    this.cacheOrder = this.cacheOrder.filter(k => k !== key);
    this.cacheOrder.push(key);

    return entry.result;
  }

  /**
   * Add result to cache with LRU eviction
   */
  private addToCache(key: string, result: Decision): void {
    // Check if cache is full
    if (this.cache.size >= this.cacheMaxSize && !this.cache.has(key)) {
      // Evict least recently used
      const lruKey = this.cacheOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    // Add or update entry
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });

    // Update order
    this.cacheOrder = this.cacheOrder.filter(k => k !== key);
    this.cacheOrder.push(key);
  }
}

/**
 * Wrapper class to convert CustomGuardrailRule to Guardrail
 */
class CustomGuardrailWrapper extends Guardrail {
  private rule: CustomGuardrailRule;

  constructor(rule: CustomGuardrailRule) {
    super({
      name: rule.name,
      enabled: rule.enabled !== undefined ? rule.enabled : true,
      description: rule.description || 'Custom guardrail rule'
    });
    this.rule = rule;
  }

  async evaluate(input: any, context?: Record<string, any>): Promise<GuardrailResult> {
    const result = await Promise.resolve(this.rule.evaluate(input, context));
    return result;
  }
}
