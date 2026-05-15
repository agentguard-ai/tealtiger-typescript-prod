/**
 * TealTiger SDK - AWS Bedrock Agents Guardrail Adapter
 *
 * Conforms to the Bedrock Guardrails API contract. Translates Bedrock
 * guardrail events into TealTiger GovernanceRequests and returns
 * ALLOW/DENY in the format expected by the Bedrock Agents runtime.
 *
 * Supports deployment as:
 * - Lambda-backed action group
 * - Custom guardrail
 *
 * @module adapters/bedrock-adapter
 * @requirements 14.1, 14.2, 14.3, 14.4
 */

import { BaseGovernanceAdapter, PlatformDecision } from './GovernanceAdapter';
import type { GovernanceRequest } from '../core/engine/v1.3/types';

// ── Bedrock-Specific Types ───────────────────────────────────────

/**
 * Bedrock Guardrail event types.
 */
export type BedrockGuardrailEventType =
  | 'PRE_PROCESSING'
  | 'ORCHESTRATION'
  | 'KNOWLEDGE_BASE_RESPONSE_GENERATION'
  | 'POST_PROCESSING';

/**
 * Bedrock guardrail event — the input from Bedrock Agents runtime.
 */
export interface BedrockGuardrailEvent {
  /** Event type in the Bedrock lifecycle */
  messageVersion: string;
  /** Source of the event */
  source: BedrockGuardrailEventType;
  /** Input text to evaluate */
  inputText?: string;
  /** Output text to evaluate (for post-processing) */
  outputText?: string;
  /** Agent information */
  agent?: {
    name: string;
    id: string;
    alias: string;
    version: string;
  };
  /** Action group information (for tool invocations) */
  actionGroup?: {
    name: string;
    apiPath: string;
    httpMethod: string;
    parameters?: Record<string, { value: string }>;
  };
  /** Knowledge base information */
  knowledgeBase?: {
    id: string;
    query: string;
  };
  /** Session attributes */
  sessionAttributes?: Record<string, string>;
  /** Prompt session attributes */
  promptSessionAttributes?: Record<string, string>;
}

/**
 * Bedrock guardrail response action.
 */
export type BedrockGuardrailAction = 'ALLOW' | 'DENY';

/**
 * Bedrock guardrail response — the output expected by Bedrock Agents runtime.
 */
export interface BedrockGuardrailResponse {
  /** Action to take */
  action: BedrockGuardrailAction;
  /** Optional: Message to return when denied */
  message?: string;
  /** Optional: Reason codes for the decision */
  reasonCodes?: string[];
  /** Optional: Risk score (0-100) */
  riskScore?: number;
  /** Optional: Additional metadata */
  metadata?: Record<string, unknown>;
}

// ── Bedrock Adapter Configuration ────────────────────────────────

/**
 * Configuration for the Bedrock guardrail adapter.
 */
export interface BedrockAdapterConfig {
  /** Default action class for Bedrock events */
  defaultActionClass?: string;
  /** Environment identifier */
  environment?: string;
  /** Agent ID to use for NHI identity */
  agentId?: string;
}

// ── Bedrock Guardrail Adapter ────────────────────────────────────

/**
 * BedrockGuardrailAdapter — Translates Bedrock Guardrails API events
 * into TealTiger governance evaluations.
 *
 * Usage:
 * ```typescript
 * const adapter = new BedrockGuardrailAdapter();
 * await adapter.initialize(engine);
 *
 * // In Lambda handler:
 * const response = await adapter.evaluateGuardrail(event);
 * return response;
 * ```
 */
export class BedrockGuardrailAdapter extends BaseGovernanceAdapter {
  readonly platform = 'bedrock' as const;
  private adapterConfig: BedrockAdapterConfig;

  constructor(config: BedrockAdapterConfig = {}) {
    super();
    this.adapterConfig = {
      defaultActionClass: 'TOOL_INVOKE',
      environment: 'production',
      ...config,
    };
  }

  /**
   * Evaluate a platform-generic request (implements GovernanceAdapter interface).
   */
  async evaluate(platformRequest: unknown): Promise<PlatformDecision> {
    const event = platformRequest as BedrockGuardrailEvent;
    const response = await this.evaluateGuardrail(event);
    return {
      allowed: response.action === 'ALLOW',
      reason_codes: response.reasonCodes ?? [],
      metadata: response.metadata ?? {},
    };
  }

  /**
   * Evaluate a Bedrock guardrail event through TealTiger's governance pipeline.
   *
   * Translates the Bedrock event into a GovernanceRequest, evaluates it,
   * and returns the result in Bedrock's expected response format.
   */
  async evaluateGuardrail(
    event: BedrockGuardrailEvent
  ): Promise<BedrockGuardrailResponse> {
    // Translate Bedrock event → GovernanceRequest
    const governanceRequest = this.translateToGovernanceRequest(event);

    // Evaluate via TealEngine
    const decision = await this.evaluateViaEngine(governanceRequest);

    // Translate Decision → Bedrock response
    return this.translateToBedrockResponse(decision);
  }

  /**
   * Translate a Bedrock guardrail event into a TealTiger GovernanceRequest.
   */
  private translateToGovernanceRequest(
    event: BedrockGuardrailEvent
  ): GovernanceRequest {
    const actionClass = this.resolveActionClass(event);
    const content = event.inputText || event.outputText || '';

    const request: GovernanceRequest = {
      content,
      model: event.agent?.name || 'bedrock-agent',
      action_class: actionClass,
      action_attributes: {
        source: event.source,
        message_version: event.messageVersion,
      },
    };

    // Add action group details if present (tool invocation)
    if (event.actionGroup) {
      request.action_attributes = {
        ...request.action_attributes,
        tool: event.actionGroup.name,
        api_path: event.actionGroup.apiPath,
        http_method: event.actionGroup.httpMethod,
        parameters: event.actionGroup.parameters,
      };
      request.tool = event.actionGroup.name;
    }

    // Add knowledge base details if present
    if (event.knowledgeBase) {
      request.action_attributes = {
        ...request.action_attributes,
        knowledge_base_id: event.knowledgeBase.id,
        query: event.knowledgeBase.query,
      };
    }

    // Add agent identity
    if (event.agent) {
      request.action_attributes = {
        ...request.action_attributes,
        agent_id: event.agent.id,
        agent_name: event.agent.name,
        agent_version: event.agent.version,
      };
    }

    return request;
  }

  /**
   * Resolve the action class from a Bedrock event.
   */
  private resolveActionClass(event: BedrockGuardrailEvent): string {
    switch (event.source) {
      case 'ORCHESTRATION':
        return event.actionGroup ? 'TOOL_INVOKE' : 'REASONING';
      case 'KNOWLEDGE_BASE_RESPONSE_GENERATION':
        return 'READ';
      case 'PRE_PROCESSING':
        return 'REASONING';
      case 'POST_PROCESSING':
        return 'REASONING';
      default:
        return this.adapterConfig.defaultActionClass || 'TOOL_INVOKE';
    }
  }

  /**
   * Translate a TealTiger Decision into a Bedrock guardrail response.
   */
  private translateToBedrockResponse(
    decision: { action: string; reason_codes?: string[]; risk_score?: number; policy_version?: string }
  ): BedrockGuardrailResponse {
    const action: BedrockGuardrailAction =
      decision.action === 'ALLOW' ? 'ALLOW' : 'DENY';

    const response: BedrockGuardrailResponse = {
      action,
    };

    if (decision.reason_codes) {
      response.reasonCodes = decision.reason_codes;
    }

    if (decision.risk_score !== undefined) {
      response.riskScore = decision.risk_score;
    }

    response.metadata = {
      policy_version: decision.policy_version,
      evaluated_by: 'tealtiger',
    };

    if (action === 'DENY') {
      response.message = `Action denied by TealTiger governance: ${(decision.reason_codes ?? []).join(', ')}`;
    }

    return response;
  }
}
