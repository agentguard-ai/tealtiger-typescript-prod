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
    reason?: string,
    triggeringClause?: string
  ): PolicyEvaluationResult {
    const result: PolicyEvaluationResult = {
      allowed,
      triggeredPolicies,
      // Each evaluator returns exactly one clause when it denies, so the
      // first entry is the cause. On an allow no clause denied, hence `none`.
      triggeringClause:
        triggeringClause ?? (allowed ? 'none' : triggeredPolicies[0] ?? 'unknown'),
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
    //
    // TA-7: `tools` absent and `tools: {}` are DIFFERENT, and the difference is
    // load-bearing:
    //
    //   - absent      -> no tool policy is configured, nothing to enforce,
    //                    the section is inapplicable.
    //   - `{}` present -> an allowlist that permits nothing. TA-4's default-deny
    //                    applies, so every tool is denied as absent.
    //
    // Collapsing the two would mean a misconfiguration producing an empty map
    // silently permits every tool. Fail-closed is the correct reading for a
    // governance product, and it is the behaviour the existing suite asserts.
    const toolPolicyConfigured =
      policies.tools !== undefined && policies.tools !== null;

    if (toolPolicyConfigured) {
      // TA-1: a `tool.execute` request must name a tool. Per conformance spec
      // 4.1 a missing required field is reported as malformed input, not as a
      // governance denial - otherwise it is indistinguishable from a real
      // policy decision about a real tool.
      //
      // Only meaningful where a tool policy exists: with no tool policy there
      // is no clause the missing field could be required by.
      if (context.action === 'tool.execute' && !context.tool) {
        results.push(
          this.createResult(
            false,
            ['request.tool.missing'],
            "Request action is 'tool.execute' but no tool was supplied",
            'request.tool.missing'
          )
        );
      } else if (context.tool) {
        results.push(this.evaluateToolPolicy(context, policies.tools!));
      }
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
    if (context.content && policies.content) {
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

    // TA-6: tool names match exactly. No case folding, no normalisation, no
    // pattern matching. `*` is the single exception and is handled below as an
    // explicit fallback entry rather than as a pattern.
    const policy = Object.prototype.hasOwnProperty.call(toolPolicies, tool)
      ? toolPolicies[tool]
      : undefined;

    // Wildcard is a declared fallback, not a wildcard match: a specific entry
    // always takes precedence over it.
    const wildcardPolicy = Object.prototype.hasOwnProperty.call(toolPolicies, '*')
      ? toolPolicies['*']
      : undefined;

    // TA-4: a tool absent from the map, with no `*` fallback, is denied.
    // Default-deny is normative - an unknown tool is not an allowed tool.
    //
    // TA-5: this clause is `tools.<tool>.absent`, deliberately distinct from
    // the `tools.<tool>.allowed` clause used when an entry exists and denies.
    // Both carry TOOL_NOT_ALLOWED, but they are different policy facts and an
    // operator needs to tell them apart.
    if (!policy && !wildcardPolicy) {
      return this.createResult(
        false,
        [`tools.${tool}.absent`],
        `Tool '${tool}' is not defined in policy`,
        `tools.${tool}.absent`
      );
    }

    // Specific entry wins over the `*` fallback.
    const activePolicy = policy ?? wildcardPolicy!;
    // Attribute the decision to whichever entry actually governed it, so a
    // denial inherited from `*` is not reported as if a specific entry existed.
    const clauseOwner = policy ? tool : '*';

    // TA-2: an entry configured `allowed: false` denies.
    // TA-3: `allowed: true` means the tool policy permits; other sections still
    // apply, which aggregateResults enforces.
    if (!activePolicy.allowed) {
      return this.createResult(
        false,
        [`tools.${clauseOwner}.allowed`],
        `Tool '${tool}' is blocked by policy`,
        `tools.${clauseOwner}.allowed`
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
    _context: RequestContext,
    _contentPolicy: any
  ): PolicyEvaluationResult {
    // Simplified implementation
    // Full implementation would integrate with TealGuard
    return this.createResult(true, ['content']);
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

    // The aggregate's triggeredPolicies lists every clause consulted, including
    // those that allowed, so the denying clause must be carried across
    // explicitly rather than inferred from position.
    return this.createResult(
      false,
      results.flatMap(r => r.triggeredPolicies),
      blocked.reason,
      blocked.triggeringClause
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
