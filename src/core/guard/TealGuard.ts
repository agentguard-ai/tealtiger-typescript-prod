/**
 * TealGuard - Enhanced Guardrails with TealEngine Integration
 * 
 * TealGuard extends the existing GuardrailEngine with policy-driven configuration,
 * custom rules support, composition capabilities, and performance optimizations.
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 */

import { TealEngine } from '../engine/TealEngine';
import type { TealPolicy, RequestContext } from '../engine/types';
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
  result: TealGuardResult;
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
   * Optimizations:
   * - Parallel execution of independent guardrails
   * - Result caching with LRU eviction
   * - Early return on cache hit
   */
  async check(input: any, context: Record<string, any> = {}): Promise<TealGuardResult> {
    const startTime = Date.now();

    // Check cache first
    if (this.enableCache) {
      const cacheKey = this.generateCacheKey(input, context);
      const cached = this.getFromCache(cacheKey);
      
      if (cached) {
        // Update execution time to reflect cache lookup
        return {
          ...cached,
          executionTime: Date.now() - startTime,
          cacheHit: true,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Execute guardrails (parallel execution handled by GuardrailEngine)
    const guardrailResults = await this.guardrailEngine.execute(input, context);

    // Evaluate policy if policy-driven mode is enabled
    let policyResult;
    if (this.config.policyDriven && this.engine) {
      const requestContext: RequestContext = {
        agentId: context.agentId || 'default',
        action: context.action || 'guardrail.check',
        content: typeof input === 'string' ? input : JSON.stringify(input),
        ...context
      };

      const evaluation = this.engine.evaluate(requestContext);
      policyResult = {
        allowed: evaluation.allowed,
        triggeredPolicies: evaluation.triggeredPolicies,
        ...(evaluation.reason && { reason: evaluation.reason })
      };
    }

    const executionTime = Date.now() - startTime;

    // Combine results
    const passed = guardrailResults.passed && (policyResult?.allowed ?? true);

    const result: TealGuardResult = {
      passed,
      guardrailResults,
      executionTime,
      cacheHit: false,
      timestamp: new Date().toISOString(),
      ...(policyResult && { policyResult })
    };

    // Cache result
    if (this.enableCache) {
      const cacheKey = this.generateCacheKey(input, context);
      this.addToCache(cacheKey, result);
    }

    return result;
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
   * Generate cache key from input and context
   */
  private generateCacheKey(input: any, context: Record<string, any>): string {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    const contextStr = JSON.stringify(context);
    
    // Simple hash function for cache key
    return this.simpleHash(inputStr + contextStr);
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
  private getFromCache(key: string): TealGuardResult | null {
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
  private addToCache(key: string, result: TealGuardResult): void {
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
