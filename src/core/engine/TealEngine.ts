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
} from './types';
import { PolicyEvaluator } from './PolicyEvaluator';
import { PolicyCache } from './PolicyCache';
import { PolicyValidator } from './PolicyValidator';

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
  /** TealEngine version */
  public static readonly VERSION = '1.1.0';

  /** Policy configuration */
  private policies: TealPolicy;

  /** Policy cache */
  private cache: PolicyCache;

  /** Policy evaluator instance */
  private evaluator: PolicyEvaluator;

  /** Policy validator instance */
  private validator: PolicyValidator;

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
    }
  ) {
    this.policies = policies;
    
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
