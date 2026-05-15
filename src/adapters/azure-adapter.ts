/**
 * TealTiger SDK - Azure AI Agent Service Middleware
 *
 * Integrates into the Azure AI Agent Service tool-call pipeline.
 * Supports deployment as Azure Functions-based middleware or as an
 * in-process SDK integration. Integrates with Azure Monitor and
 * Application Insights for governance decision telemetry.
 *
 * @module adapters/azure-adapter
 * @requirements 14.9, 14.10, 14.11, 14.12
 */

import { BaseGovernanceAdapter, PlatformDecision } from './GovernanceAdapter';
import type { GovernanceRequest } from '../core/engine/v1.3/types';

// ── Azure-Specific Types ─────────────────────────────────────────

/**
 * Azure tool call — represents a tool invocation in Azure AI Agent Service.
 */
export interface AzureToolCall {
  /** Unique tool call identifier */
  id: string;
  /** Tool function name */
  function: {
    name: string;
    arguments: string;
  };
  /** Tool type (always 'function' for now) */
  type: 'function';
}

/**
 * Azure agent context — metadata about the agent and session.
 */
export interface AzureAgentContext {
  /** Agent deployment name */
  deploymentName: string;
  /** Azure resource group */
  resourceGroup?: string;
  /** Azure subscription ID */
  subscriptionId?: string;
  /** Session/thread ID */
  threadId?: string;
  /** Run ID */
  runId?: string;
  /** User identity (from Azure AD) */
  userIdentity?: string;
  /** Content being processed */
  content?: string;
  /** Model being used */
  model?: string;
}

/**
 * Azure middleware result — the response format for the tool-call pipeline.
 */
export interface AzureMiddlewareResult {
  /** Whether the tool call is allowed */
  allowed: boolean;
  /** Action: allow, deny, or modify */
  action: 'allow' | 'deny' | 'modify';
  /** Reason for the decision */
  reason?: string;
  /** Reason codes from governance evaluation */
  reasonCodes?: string[];
  /** Modified arguments (when action is 'modify') */
  modifiedArguments?: string;
  /** Risk score (0-100) */
  riskScore?: number;
  /** Correlation ID for Application Insights */
  correlationId?: string;
  /** Telemetry data for Azure Monitor */
  telemetry?: AzureTelemetryData;
}

/**
 * Telemetry data for Azure Monitor / Application Insights integration.
 */
export interface AzureTelemetryData {
  /** Custom dimensions for Application Insights */
  customDimensions: Record<string, string>;
  /** Custom metrics */
  customMetrics?: Record<string, number>;
  /** Operation name for tracing */
  operationName: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Azure Functions HTTP request (simplified for middleware).
 */
export interface AzureFunctionRequest {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body */
  body: {
    toolCalls?: AzureToolCall[];
    agentContext?: AzureAgentContext;
    content?: string;
  };
}

/**
 * Azure Functions HTTP response.
 */
export interface AzureFunctionResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: {
    results: AzureMiddlewareResult[];
  };
}

// ── Azure Adapter Configuration ──────────────────────────────────

/**
 * Configuration for the Azure AI Agent Service middleware.
 */
export interface AzureAdapterConfig {
  /** Environment identifier */
  environment?: string;
  /** Whether to emit telemetry to Application Insights */
  enableTelemetry?: boolean;
  /** Application Insights instrumentation key (for direct integration) */
  instrumentationKey?: string;
  /** Default deployment name */
  deploymentName?: string;
}

// ── Azure Agent Middleware ────────────────────────────────────────

/**
 * AzureAgentMiddleware — Governance middleware for Azure AI Agent Service.
 *
 * Integrates into the tool-call pipeline and evaluates tool invocations
 * and content generation through TealTiger's governance pipeline.
 *
 * Supports two deployment modes:
 * 1. Azure Functions-based middleware (HTTP trigger)
 * 2. In-process SDK integration (direct method calls)
 *
 * Usage (in-process):
 * ```typescript
 * const middleware = new AzureAgentMiddleware();
 * await middleware.initialize(engine);
 *
 * const result = await middleware.evaluateToolCall(toolCall, agentContext);
 * if (!result.allowed) {
 *   // Block the tool call
 * }
 * ```
 *
 * Usage (Azure Functions):
 * ```typescript
 * const middleware = new AzureAgentMiddleware({ enableTelemetry: true });
 * await middleware.initialize(engine);
 *
 * // In Azure Function handler:
 * const response = await middleware.handleFunctionRequest(request);
 * return response;
 * ```
 */
export class AzureAgentMiddleware extends BaseGovernanceAdapter {
  readonly platform = 'azure' as const;
  private adapterConfig: AzureAdapterConfig;

  constructor(config: AzureAdapterConfig = {}) {
    super();
    this.adapterConfig = {
      environment: 'production',
      enableTelemetry: true,
      ...config,
    };
  }

  /**
   * Evaluate a platform-generic request (implements GovernanceAdapter interface).
   */
  async evaluate(platformRequest: unknown): Promise<PlatformDecision> {
    const request = platformRequest as {
      toolCall: AzureToolCall;
      agentContext?: AzureAgentContext;
    };
    const result = await this.evaluateToolCall(
      request.toolCall,
      request.agentContext
    );
    return {
      allowed: result.allowed,
      reason_codes: result.reasonCodes ?? [],
      metadata: result.telemetry?.customDimensions ?? {},
    };
  }

  /**
   * Evaluate a single tool call through the governance pipeline.
   *
   * This is the primary in-process integration point.
   */
  async evaluateToolCall(
    toolCall: AzureToolCall,
    agentContext?: AzureAgentContext
  ): Promise<AzureMiddlewareResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    // Translate to GovernanceRequest
    const governanceRequest = this.translateToolCallToGovernanceRequest(
      toolCall,
      agentContext
    );

    // Evaluate via TealEngine
    const decision = await this.evaluateViaEngine(governanceRequest);

    const durationMs = Date.now() - startTime;

    // Build telemetry data
    const telemetry = this.buildTelemetry(
      toolCall,
      decision,
      correlationId,
      durationMs
    );

    // Translate to Azure middleware result
    return this.translateToMiddlewareResult(
      decision,
      correlationId,
      telemetry
    );
  }

  /**
   * Handle an Azure Functions HTTP request (for Functions-based deployment).
   *
   * Evaluates all tool calls in the request body and returns results.
   */
  async handleFunctionRequest(
    request: AzureFunctionRequest
  ): Promise<AzureFunctionResponse> {
    const toolCalls = request.body.toolCalls ?? [];
    const agentContext = request.body.agentContext;

    const results: AzureMiddlewareResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.evaluateToolCall(toolCall, agentContext);
      results.push(result);
    }

    // If no tool calls but content is present, evaluate content directly
    if (toolCalls.length === 0 && request.body.content) {
      const contentResult = await this.evaluateContent(
        request.body.content,
        agentContext
      );
      results.push(contentResult);
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-TealTiger-Version': '1.3.0',
      },
      body: { results },
    };
  }

  /**
   * Evaluate raw content (for content generation governance).
   */
  async evaluateContent(
    content: string,
    agentContext?: AzureAgentContext
  ): Promise<AzureMiddlewareResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    const governanceRequest: GovernanceRequest = {
      content,
      model: agentContext?.model || agentContext?.deploymentName || 'azure-agent',
      action_class: 'REASONING',
      action_attributes: {
        deployment_name: agentContext?.deploymentName,
        thread_id: agentContext?.threadId,
        run_id: agentContext?.runId,
        user_identity: agentContext?.userIdentity,
      },
    };

    const decision = await this.evaluateViaEngine(governanceRequest);
    const durationMs = Date.now() - startTime;

    const telemetry: AzureTelemetryData = {
      customDimensions: {
        'tealtiger.decision.action': decision.action,
        'tealtiger.correlation_id': correlationId,
        'tealtiger.deployment_name': agentContext?.deploymentName || '',
      },
      customMetrics: {
        'tealtiger.risk_score': decision.risk_score ?? 0,
        'tealtiger.duration_ms': durationMs,
      },
      operationName: 'TealTiger.Governance.EvaluateContent',
      durationMs,
    };

    return this.translateToMiddlewareResult(decision, correlationId, telemetry);
  }

  /**
   * Translate a tool call into a GovernanceRequest.
   */
  private translateToolCallToGovernanceRequest(
    toolCall: AzureToolCall,
    agentContext?: AzureAgentContext
  ): GovernanceRequest {
    let parsedArguments: Record<string, unknown> = {};
    try {
      parsedArguments = JSON.parse(toolCall.function.arguments);
    } catch {
      // If arguments aren't valid JSON, treat as raw string
      parsedArguments = { raw: toolCall.function.arguments };
    }

    const request: GovernanceRequest = {
      content: toolCall.function.arguments,
      model: agentContext?.model || agentContext?.deploymentName || 'azure-agent',
      tool: toolCall.function.name,
      action_class: 'TOOL_INVOKE',
      action_attributes: {
        tool_call_id: toolCall.id,
        tool_name: toolCall.function.name,
        tool_arguments: parsedArguments,
        deployment_name: agentContext?.deploymentName,
        resource_group: agentContext?.resourceGroup,
        subscription_id: agentContext?.subscriptionId,
        thread_id: agentContext?.threadId,
        run_id: agentContext?.runId,
        user_identity: agentContext?.userIdentity,
      },
    };

    return request;
  }

  /**
   * Build telemetry data for Azure Monitor / Application Insights.
   */
  private buildTelemetry(
    toolCall: AzureToolCall,
    rawDecision: unknown,
    correlationId: string,
    durationMs: number
  ): AzureTelemetryData {
    const decision = rawDecision as {
      action: string;
      reason_codes?: string[];
      risk_score?: number;
      policy_version?: string;
    };

    return {
      customDimensions: {
        'tealtiger.decision.action': decision.action,
        'tealtiger.policy.version': decision.policy_version || '',
        'tealtiger.reason_codes': (decision.reason_codes ?? []).join(','),
        'tealtiger.correlation_id': correlationId,
        'tealtiger.tool.name': toolCall.function.name,
      },
      customMetrics: {
        'tealtiger.risk_score': decision.risk_score ?? 0,
        'tealtiger.duration_ms': durationMs,
      },
      operationName: 'TealTiger.Governance.EvaluateToolCall',
      durationMs,
    };
  }

  /**
   * Translate a TealTiger Decision into an Azure middleware result.
   */
  private translateToMiddlewareResult(
    rawDecision: unknown,
    correlationId: string,
    telemetry: AzureTelemetryData
  ): AzureMiddlewareResult {
    const decision = rawDecision as {
      action: string;
      reason_codes?: string[];
      risk_score?: number;
      findings?: Array<Record<string, unknown>>;
    };

    let action: AzureMiddlewareResult['action'];
    let modifiedArguments: string | undefined;

    switch (decision.action) {
      case 'ALLOW':
        action = 'allow';
        break;
      case 'MODIFY':
        action = 'modify';
        modifiedArguments = decision.findings?.[0]?.sanitized_content as string | undefined;
        break;
      default:
        action = 'deny';
        break;
    }

    const result: AzureMiddlewareResult = {
      allowed: decision.action === 'ALLOW' || decision.action === 'MODIFY',
      action,
      correlationId,
    };

    const reason = (decision.reason_codes ?? []).join(', ');
    if (reason) {
      result.reason = reason;
    }

    if (decision.reason_codes) {
      result.reasonCodes = decision.reason_codes;
    }

    if (modifiedArguments) {
      result.modifiedArguments = modifiedArguments;
    }

    if (decision.risk_score !== undefined) {
      result.riskScore = decision.risk_score;
    }

    if (this.adapterConfig.enableTelemetry) {
      result.telemetry = telemetry;
    }

    return result;
  }
}

// ── Utility ──────────────────────────────────────────────────────

/**
 * Generate a correlation ID compatible with Application Insights.
 */
function generateCorrelationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
