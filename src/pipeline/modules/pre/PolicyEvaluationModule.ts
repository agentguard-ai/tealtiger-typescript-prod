/**
 * Multi-Stage Defense Pipeline — Policy Evaluation Module
 *
 * Evaluates requests against a configurable policy (blocked models, blocked topics,
 * token limits) and returns DENY with reason code POLICY_VIOLATION when any policy
 * rule is violated.
 *
 * @module pipeline/modules/pre/PolicyEvaluationModule
 * @requirements 6.1, 6.6, 6.7
 */

import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';
import { DecisionAction } from '../../../core/engine/types';

// ── Configuration ────────────────────────────────────────────────

/**
 * Policy rules that govern what requests are permitted.
 */
export interface PolicyRules {
  /** Model identifiers that are not allowed. Matched case-insensitively. */
  blockedModels?: string[];
  /** Topic keywords that are not allowed in request content. Matched case-insensitively. */
  blockedTopics?: string[];
  /** Maximum token count allowed in a request. */
  maxTokens?: number;
}

/**
 * Configuration object for PolicyEvaluationModule.
 */
export interface PolicyEvaluationConfig {
  /** The policy rules to evaluate requests against. */
  policy: PolicyRules;
}

// ── Module Implementation ────────────────────────────────────────

/**
 * Evaluates a request against a TealEngine policy configuration.
 * Returns DENY with reason code POLICY_VIOLATION when any policy rule is violated.
 * Returns ALLOW when all rules pass.
 *
 * Supported policy rules:
 * - `blockedModels`: Denies requests targeting a blocked model.
 * - `blockedTopics`: Denies requests containing blocked topic keywords in content.
 * - `maxTokens`: Denies requests exceeding the configured token limit.
 */
export class PolicyEvaluationModule implements TealModule {
  readonly name = 'PolicyEvaluationModule';
  readonly version = '1.0.0';

  private readonly policy: PolicyRules;

  constructor(config: PolicyEvaluationConfig) {
    this.policy = config.policy;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    const violations: string[] = [];

    // Check blocked models
    if (this.policy.blockedModels && this.policy.blockedModels.length > 0) {
      const requestModel = request.model?.toLowerCase();
      if (requestModel) {
        const blocked = this.policy.blockedModels.find(
          (m) => m.toLowerCase() === requestModel,
        );
        if (blocked) {
          violations.push(`Blocked model: ${blocked}`);
        }
      }
    }

    // Check blocked topics
    if (this.policy.blockedTopics && this.policy.blockedTopics.length > 0) {
      const content = (request.content ?? '').toLowerCase();
      if (content) {
        for (const topic of this.policy.blockedTopics) {
          if (content.includes(topic.toLowerCase())) {
            violations.push(`Blocked topic: ${topic}`);
          }
        }
      }
    }

    // Check max tokens
    if (this.policy.maxTokens !== undefined) {
      const tokenCount = this.estimateTokenCount(request);
      if (tokenCount > this.policy.maxTokens) {
        violations.push(
          `Token limit exceeded: ${tokenCount} > ${this.policy.maxTokens}`,
        );
      }
    }

    // Return result based on violations
    if (violations.length > 0) {
      return {
        action: DecisionAction.DENY,
        reason_codes: ['POLICY_VIOLATION'],
        event_type: 'pipeline.policy_evaluation',
        metadata: {
          violations,
          module: this.name,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.policy_evaluation',
      metadata: {
        module: this.name,
      },
    };
  }

  /**
   * Estimate the token count from a request.
   * Uses the `max_tokens` or `maxTokens` field from the payload if present,
   * otherwise estimates based on content length (rough 4 chars per token heuristic).
   */
  private estimateTokenCount(request: ModuleEvaluationRequest): number {
    // Check for explicit token fields in the request
    const maxTokens =
      (request['max_tokens'] as number | undefined) ??
      (request['maxTokens'] as number | undefined);
    if (typeof maxTokens === 'number') {
      return maxTokens;
    }

    // Fall back to content-length-based estimation (~4 chars per token)
    const content = request.content ?? '';
    return Math.ceil(content.length / 4);
  }
}
