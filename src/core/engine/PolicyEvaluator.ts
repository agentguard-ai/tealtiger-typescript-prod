/**
 * PolicyEvaluator - Policy Evaluation Logic
 * 
 * Evaluates requests against TealEngine policies and determines if they should be allowed.
 * Implements the core policy evaluation algorithm with support for:
 * - Tool policies
 * - Identity policies
 * - Code execution policies
 * - Behavioral policies
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 * 
 * @module core/engine/PolicyEvaluator
 */

import {
  TealPolicy,
  ToolPolicy,
  IdentityPolicy,
  CodeExecutionPolicy,
  BehavioralPolicy,
  ContentPolicy,
  DataClassificationLevel,
  PolicyEvaluationResult,
  RequestContext,
} from './types';

/**
 * PolicyEvaluator - Evaluates requests against policies
 * 
 * The PolicyEvaluator implements the core policy evaluation algorithm.
 * It checks each applicable policy type and aggregates the results.
 * 
 * Evaluation follows AND logic: all policies must pass for the request to be allowed.
 * 
 * @example
 * ```typescript
 * const evaluator = new PolicyEvaluator();
 * const result = evaluator.evaluate(context, policies);
 * 
 * if (!result.allowed) {
 *   console.error('Request blocked:', result.reason);
 * }
 * ```
 */
export class PolicyEvaluator {
  /**
   * Creates a policy evaluation result with default metadata
   * 
   * @private
   */
  private createResult(
    allowed: boolean,
    triggeredPolicies: string[],
    reason?: string
  ): PolicyEvaluationResult {
    const result: PolicyEvaluationResult = {
      allowed,
      triggeredPolicies,
      metadata: {
        evaluationTime: 0,
        cacheHit: false,
        engine: 'PolicyEvaluator',
      },
    };
    
    if (reason) {
      result.reason = reason;
    }
    
    return result;
  }

  /**
   * Evaluates a request context against policies
   * 
   * @param context - Request context to evaluate
   * @param policies - Policy configuration
   * @returns Evaluation result
   */
  public evaluate(context: RequestContext, policies: TealPolicy): PolicyEvaluationResult {
    const results: PolicyEvaluationResult[] = [];
    const startTime = Date.now();

    // 1. Check tool policies
    if (context.tool && policies.tools) {
      results.push(this.evaluateToolPolicy(context, policies.tools));
    }

    // 2. Check identity policies
    if (policies.identity) {
      results.push(this.evaluateIdentityPolicy(context, policies.identity));
    }

    // 3. Check code execution policies
    if (context.code && policies.codeExecution) {
      results.push(this.evaluateCodePolicy(context, policies.codeExecution));
    }

    // 4. Check behavioral policies
    if (policies.behavioral) {
      results.push(this.evaluateBehavioralPolicy(context, policies.behavioral));
    }

    // 5. Check content policies (simplified - would integrate with TealGuard)
    if (policies.content) {
      results.push(this.evaluateContentPolicy(context, policies.content));
    }

    // 6. Aggregate results (AND logic - all must pass)
    const aggregated = this.aggregateResults(results);

    // Add evaluation metadata
    return {
      ...aggregated,
      metadata: {
        ...aggregated.metadata,
        evaluationTime: Date.now() - startTime,
        policiesEvaluated: results.length,
      },
    };
  }

  /**
   * Evaluates tool policy
   * 
   * Checks if the requested tool is allowed and if parameters are within limits.
   * 
   * @private
   * @param context - Request context
   * @param toolPolicies - Tool policies
   * @returns Evaluation result
   */
  private evaluateToolPolicy(
    context: RequestContext,
    toolPolicies: ToolPolicy
  ): PolicyEvaluationResult {
    const tool = context.tool!;
    const toolParams = context.toolParams;

    // Check if tool has a specific policy
    const policy = toolPolicies[tool];

    // Check wildcard policy
    const wildcardPolicy = toolPolicies['*'];

    // If no policy found, check if wildcard allows
    if (!policy && !wildcardPolicy) {
      return this.createResult(
        false,
        [`tools.${tool}`],
        `Tool '${tool}' is not defined in policy`
      );
    }

    // Use specific policy if available, otherwise use wildcard
    const activePolicy = policy || wildcardPolicy!;

    // Check if tool is explicitly blocked
    if (!activePolicy.allowed) {
      return this.createResult(
        false,
        [`tools.${tool}`],
        `Tool '${tool}' is blocked by policy`
      );
    }

    // Check parameter constraints if provided
    if (toolParams && activePolicy.maxSize) {
      // Check size constraints (simplified - would need proper size calculation)
      const paramSize = JSON.stringify(toolParams).length;
      const maxSize = this.parseSize(activePolicy.maxSize);
      
      if (paramSize > maxSize) {
        return this.createResult(
          false,
          [`tools.${tool}.maxSize`],
          `Tool parameters exceed max size of ${activePolicy.maxSize}`
        );
      }
    }

    // Check maxRows for database queries
    if (activePolicy.maxRows && toolParams?.limit) {
      if (toolParams.limit > activePolicy.maxRows) {
        return this.createResult(
          false,
          [`tools.${tool}.maxRows`],
          `Query limit ${toolParams.limit} exceeds max rows ${activePolicy.maxRows}`
        );
      }
    }

    // Check allowedTables for database queries
    if (activePolicy.allowedTables && toolParams?.table) {
      if (!activePolicy.allowedTables.includes(toolParams.table)) {
        return this.createResult(
          false,
          [`tools.${tool}.allowedTables`],
          `Table '${toolParams.table}' is not in allowed tables list`
        );
      }
    }

    return this.createResult(true, [`tools.${tool}`]);
  }

  /**
   * Evaluates identity policy
   * 
   * Checks if the agent has the required permissions and is not forbidden.
   * 
   * @private
   * @param context - Request context
   * @param identityPolicy - Identity policy
   * @returns Evaluation result
   */
  private evaluateIdentityPolicy(
    context: RequestContext,
    identityPolicy: IdentityPolicy
  ): PolicyEvaluationResult {
    // Check if agent ID matches
    if (context.agentId !== identityPolicy.agentId) {
      return this.createResult(
        false,
        ['identity.agentId'],
        `Agent ID '${context.agentId}' does not match policy agent '${identityPolicy.agentId}'`
      );
    }

    // Check forbidden actions
    if (identityPolicy.forbidden && context.action) {
      for (const forbidden of identityPolicy.forbidden) {
        if (this.matchesPattern(context.action, forbidden)) {
          return this.createResult(
            false,
            ['identity.forbidden'],
            `Action '${context.action}' is forbidden by identity policy`
          );
        }
      }
    }

    return this.createResult(true, ['identity']);
  }

  /**
   * Evaluates code execution policy
   * 
   * Checks if code execution is allowed and if code meets safety requirements.
   * 
   * @private
   * @param codeExecutionPolicy - Code execution policy
   * @returns Evaluation result
   */
  private evaluateCodePolicy(
    context: RequestContext,
    codeExecutionPolicy: CodeExecutionPolicy
  ): PolicyEvaluationResult {
    const code = context.code!;
    // Extract language from metadata or default to 'unknown'
    const language = (context.metadata?.language as string) || 'unknown';

    // Check if language is allowed
    if (!codeExecutionPolicy.allowedLanguages.includes(language)) {
      return this.createResult(
        false,
        ['codeExecution.allowedLanguages'],
        `Code language '${language}' is not allowed`
      );
    }

    // Check code length
    if (code.length > codeExecutionPolicy.maxLength) {
      return this.createResult(
        false,
        ['codeExecution.maxLength'],
        `Code length ${code.length} exceeds max length ${codeExecutionPolicy.maxLength}`
      );
    }

    // Check for blocked functions
    for (const blockedFunc of codeExecutionPolicy.blockedFunctions) {
      if (code.includes(blockedFunc)) {
        return this.createResult(
          false,
          ['codeExecution.blockedFunctions'],
          `Code contains blocked function: ${blockedFunc}`
        );
      }
    }

    // Check for blocked patterns
    for (const pattern of codeExecutionPolicy.blockedPatterns) {
      if (pattern.test(code)) {
        return this.createResult(
          false,
          ['codeExecution.blockedPatterns'],
          `Code matches blocked pattern: ${pattern.source}`
        );
      }
    }

    // Check sandbox requirement
    const sandboxed = context.metadata?.sandboxed as boolean;
    if (codeExecutionPolicy.requireSandbox && !sandboxed) {
      return this.createResult(
        false,
        ['codeExecution.requireSandbox'],
        'Code execution requires sandbox but none is available'
      );
    }

    return this.createResult(true, ['codeExecution']);
  }

  /**
   * Evaluates behavioral policy
   * 
   * Checks rate limits and cost limits (simplified - full implementation would track state).
   * 
   * @private
   * @param context - Request context
   * @param behavioralPolicy - Behavioral policy
   * @returns Evaluation result
   */
  private evaluateBehavioralPolicy(
    context: RequestContext,
    behavioralPolicy: BehavioralPolicy
  ): PolicyEvaluationResult {
    // Note: Full implementation would require state tracking
    // This is a simplified version that checks policy structure

    // Check if cost is provided and within limits
    if (context.cost && behavioralPolicy.costLimit) {
      const { daily } = behavioralPolicy.costLimit;
      
      // This is simplified - real implementation would track cumulative costs
      if (daily && context.cost > daily) {
        return this.createResult(
          false,
          ['behavioral.costLimit.daily'],
          `Estimated cost ${context.cost} exceeds daily limit ${daily}`
        );
      }
    }

    // Rate limiting would require state tracking in production
    // For now, we just validate the policy structure
    if (behavioralPolicy.rateLimit) {
      // Policy is valid, allow the request
      // Real implementation would check against request history
    }

    return this.createResult(true, ['behavioral']);
  }

  /**
   * Evaluates content policy
   * 
   * Checks PII and content moderation policies (simplified).
   * 
   * @private
   * @param _context - Request context (unused in simplified version)
   * @param _contentPolicy - Content policy (unused in simplified version)
   * @returns Evaluation result
   */
  private evaluateContentPolicy(
    context: RequestContext,
    contentPolicy: ContentPolicy
  ): PolicyEvaluationResult {
    const requestedClassification = (
      context.metadata?.dataClassification ??
      context.metadata?.data_classification ??
      context.toolParams?.dataClassification ??
      context.toolParams?.data_classification
    ) as DataClassificationLevel | undefined;

    const maxClassification = contentPolicy.dataClassification?.maxLevel;
    if (
      requestedClassification &&
      maxClassification &&
      this.compareDataClassification(requestedClassification, maxClassification) > 0
    ) {
      return this.createResult(
        false,
        ['content.dataClassification'],
        `Data classification '${requestedClassification}' exceeds maximum '${maxClassification}'`
      );
    }

    // Simplified implementation
    // Full implementation would integrate with TealGuard
    return this.createResult(true, ['content']);
  }

  private compareDataClassification(
    left: DataClassificationLevel,
    right: DataClassificationLevel
  ): number {
    const levels: Record<DataClassificationLevel, number> = {
      public: 0,
      internal: 1,
      confidential: 2,
      restricted: 3,
    };

    return levels[left] - levels[right];
  }

  /**
   * Aggregates multiple evaluation results
   * 
   * Uses AND logic: all results must be allowed for final result to be allowed.
   * 
   * @private
   * @param results - Array of evaluation results
   * @returns Aggregated result
   */
  private aggregateResults(results: PolicyEvaluationResult[]): PolicyEvaluationResult {
    // If no results, allow by default
    if (results.length === 0) {
      return this.createResult(true, []);
    }

    // Check if all results are allowed
    const allAllowed = results.every(r => r.allowed);

    if (allAllowed) {
      return this.createResult(
        true,
        results.flatMap(r => r.triggeredPolicies)
      );
    }

    // Find first blocked result
    const blocked = results.find(r => !r.allowed)!;

    return this.createResult(
      false,
      results.flatMap(r => r.triggeredPolicies),
      blocked.reason
    );
  }

  /**
   * Parses size string to bytes
   * 
   * @private
   * @param size - Size string (e.g., "1MB", "500KB")
   * @returns Size in bytes
   */
  private parseSize(size: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };

    const match = size.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match) {
      return parseInt(size, 10);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return value * (units[unit] || 1);
  }

  /**
   * Checks if a string matches a pattern (supports wildcards)
   * 
   * @private
   * @param value - Value to check
   * @param pattern - Pattern (supports * wildcard)
   * @returns True if matches
   */
  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(value);
    }

    return value === pattern;
  }
}
