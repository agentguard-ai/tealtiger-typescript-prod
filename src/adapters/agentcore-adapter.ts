/**
 * TealTiger SDK - AWS AgentCore Governance Plugin
 *
 * Hooks into the AgentCore pre-action and post-action lifecycle stages.
 * Evaluates tool calls, memory writes, and inter-agent messages through
 * TealTiger's governance pipeline. Propagates TealTiger correlation IDs
 * into AgentCore's observability traces.
 *
 * @module adapters/agentcore-adapter
 * @requirements 14.5, 14.6, 14.7, 14.8
 */

import { BaseGovernanceAdapter, PlatformDecision } from './GovernanceAdapter';
import type { GovernanceRequest } from '../core/engine/v1.3/types';

// ── AgentCore-Specific Types ─────────────────────────────────────

/**
 * AgentCore action types.
 */
export type AgentCoreActionType =
  | 'tool_call'
  | 'memory_write'
  | 'memory_read'
  | 'inter_agent_message'
  | 'response_generation'
  | 'planning';

/**
 * AgentCore action — represents an action in the agent lifecycle.
 */
export interface AgentCoreAction {
  /** Unique action identifier */
  actionId: string;
  /** Type of action */
  type: AgentCoreActionType;
  /** Agent performing the action */
  agentId: string;
  /** Tool name (for tool_call type) */
  toolName?: string;
  /** Tool input parameters */
  toolInput?: Record<string, unknown>;
  /** Content being processed */
  content?: string;
  /** Target agent (for inter_agent_message) */
  targetAgentId?: string;
  /** Memory scope (for memory operations) */
  memoryScope?: string;
  /** Session ID */
  sessionId?: string;
  /** Trace context for observability */
  traceContext?: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * AgentCore decision — the response format expected by AgentCore runtime.
 */
export interface AgentCoreDecision {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Action to take: proceed, block, or modify */
  action: 'proceed' | 'block' | 'modify';
  /** Reason for the decision */
  reason?: string;
  /** Reason codes from governance evaluation */
  reasonCodes?: string[];
  /** Modified content (when action is 'modify') */
  modifiedContent?: string;
  /** Risk score (0-100) */
  riskScore?: number;
  /** TealTiger correlation ID for trace propagation */
  correlationId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Post-action audit record.
 */
export interface AgentCorePostActionRecord {
  /** Action that was executed */
  action: AgentCoreAction;
  /** Result of the action */
  result: unknown;
  /** TealTiger correlation ID */
  correlationId: string;
  /** Timestamp */
  timestamp: number;
}

// ── AgentCore Adapter Configuration ──────────────────────────────

/**
 * Configuration for the AgentCore governance plugin.
 */
export interface AgentCoreAdapterConfig {
  /** Environment identifier */
  environment?: string;
  /** Whether to evaluate post-action results */
  enablePostActionAudit?: boolean;
  /** Action types to evaluate (default: all) */
  evaluateActionTypes?: AgentCoreActionType[];
}

// ── AgentCore Governance Plugin ──────────────────────────────────

/**
 * AgentCorePlugin — Governance plugin for AWS AgentCore.
 *
 * Hooks into the agent lifecycle at pre-action and post-action stages.
 * Evaluates tool calls, memory writes, and inter-agent messages through
 * TealTiger's governance pipeline.
 *
 * Usage:
 * ```typescript
 * const plugin = new AgentCorePlugin();
 * await plugin.initialize(engine);
 *
 * // Pre-action hook
 * const decision = await plugin.preAction(action);
 * if (!decision.allowed) {
 *   // Block the action
 * }
 *
 * // Post-action hook (audit)
 * await plugin.postAction(action, result);
 * ```
 */
export class AgentCorePlugin extends BaseGovernanceAdapter {
  readonly platform = 'agentcore' as const;
  private adapterConfig: AgentCoreAdapterConfig;
  private postActionRecords: AgentCorePostActionRecord[] = [];

  constructor(config: AgentCoreAdapterConfig = {}) {
    super();
    this.adapterConfig = {
      environment: 'production',
      enablePostActionAudit: true,
      evaluateActionTypes: [
        'tool_call',
        'memory_write',
        'inter_agent_message',
        'response_generation',
      ],
      ...config,
    };
  }

  /**
   * Evaluate a platform-generic request (implements GovernanceAdapter interface).
   */
  async evaluate(platformRequest: unknown): Promise<PlatformDecision> {
    const action = platformRequest as AgentCoreAction;
    const decision = await this.preAction(action);
    return {
      allowed: decision.allowed,
      reason_codes: decision.reasonCodes ?? [],
      metadata: decision.metadata ?? {},
    };
  }

  /**
   * Pre-action governance hook.
   *
   * Called before an agent action is executed. Evaluates the action
   * through TealTiger's governance pipeline and returns a decision.
   */
  async preAction(action: AgentCoreAction): Promise<AgentCoreDecision> {
    // Skip evaluation for action types not in the configured list
    if (
      this.adapterConfig.evaluateActionTypes &&
      !this.adapterConfig.evaluateActionTypes.includes(action.type)
    ) {
      return {
        allowed: true,
        action: 'proceed',
        correlationId: generateCorrelationId(),
      };
    }

    // Translate AgentCore action → GovernanceRequest
    const governanceRequest = this.translateToGovernanceRequest(action);

    // Evaluate via TealEngine
    const decision = await this.evaluateViaEngine(governanceRequest);

    // Generate correlation ID for trace propagation
    const correlationId = generateCorrelationId();

    // Translate Decision → AgentCore decision
    return this.translateToAgentCoreDecision(decision, correlationId);
  }

  /**
   * Post-action audit hook.
   *
   * Called after an agent action completes. Records the action result
   * for audit purposes and propagates correlation IDs.
   */
  async postAction(action: AgentCoreAction, result: unknown): Promise<void> {
    if (!this.adapterConfig.enablePostActionAudit) {
      return;
    }

    const record: AgentCorePostActionRecord = {
      action,
      result,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
    };

    this.postActionRecords.push(record);

    // In production, this would emit to AgentCore's observability pipeline
    // and propagate the TealTiger correlation ID into the trace context
  }

  /**
   * Get post-action audit records (for testing/debugging).
   */
  getPostActionRecords(): ReadonlyArray<AgentCorePostActionRecord> {
    return this.postActionRecords;
  }

  /**
   * Clear post-action audit records.
   */
  clearPostActionRecords(): void {
    this.postActionRecords = [];
  }

  /**
   * Translate an AgentCore action into a TealTiger GovernanceRequest.
   */
  private translateToGovernanceRequest(
    action: AgentCoreAction
  ): GovernanceRequest {
    const actionClass = this.resolveActionClass(action);

    const request: GovernanceRequest = {
      content: action.content || '',
      model: action.agentId,
      action_class: actionClass,
      action_attributes: {
        action_id: action.actionId,
        action_type: action.type,
        agent_id: action.agentId,
        session_id: action.sessionId,
      },
    };

    // Add tool-specific attributes
    if (action.type === 'tool_call' && action.toolName) {
      request.tool = action.toolName;
      request.action_attributes = {
        ...request.action_attributes,
        tool_name: action.toolName,
        tool_input: action.toolInput,
      };
    }

    // Add inter-agent message attributes
    if (action.type === 'inter_agent_message' && action.targetAgentId) {
      request.action_attributes = {
        ...request.action_attributes,
        target_agent_id: action.targetAgentId,
      };
    }

    // Add memory operation attributes
    if (
      (action.type === 'memory_write' || action.type === 'memory_read') &&
      action.memoryScope
    ) {
      request.action_attributes = {
        ...request.action_attributes,
        memory_scope: action.memoryScope,
      };
    }

    // Propagate trace context
    if (action.traceContext) {
      request.action_attributes = {
        ...request.action_attributes,
        trace_id: action.traceContext.traceId,
        span_id: action.traceContext.spanId,
        parent_span_id: action.traceContext.parentSpanId,
      };
    }

    return request;
  }

  /**
   * Resolve the action class from an AgentCore action type.
   */
  private resolveActionClass(action: AgentCoreAction): string {
    switch (action.type) {
      case 'tool_call':
        return 'TOOL_INVOKE';
      case 'memory_write':
        return 'MEMORY_WRITE';
      case 'memory_read':
        return 'READ';
      case 'inter_agent_message':
        return 'TOOL_INVOKE';
      case 'response_generation':
        return 'REASONING';
      case 'planning':
        return 'PLAN';
      default:
        return 'TOOL_INVOKE';
    }
  }

  /**
   * Translate a TealTiger Decision into an AgentCore decision.
   */
  private translateToAgentCoreDecision(
    rawDecision: unknown,
    correlationId: string
  ): AgentCoreDecision {
    const decision = rawDecision as {
      action: string;
      reason_codes?: string[];
      risk_score?: number;
      policy_version?: string;
      findings?: Array<Record<string, unknown>>;
    };

    let action: AgentCoreDecision['action'];
    let modifiedContent: string | undefined;

    switch (decision.action) {
      case 'ALLOW':
        action = 'proceed';
        break;
      case 'MODIFY':
        action = 'modify';
        // Extract sanitized content from findings if available
        modifiedContent = decision.findings?.[0]?.sanitized_content as string | undefined;
        break;
      default:
        action = 'block';
        break;
    }

    const result: AgentCoreDecision = {
      allowed: decision.action === 'ALLOW' || decision.action === 'MODIFY',
      action,
      correlationId,
      metadata: {
        policy_version: decision.policy_version,
        evaluated_by: 'tealtiger',
      },
    };

    const reason = (decision.reason_codes ?? []).join(', ');
    if (reason) {
      result.reason = reason;
    }

    if (decision.reason_codes) {
      result.reasonCodes = decision.reason_codes;
    }

    if (modifiedContent) {
      result.modifiedContent = modifiedContent;
    }

    if (decision.risk_score !== undefined) {
      result.riskScore = decision.risk_score;
    }

    return result;
  }
}

// ── Utility ──────────────────────────────────────────────────────

/**
 * Generate a correlation ID for trace propagation.
 */
function generateCorrelationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
