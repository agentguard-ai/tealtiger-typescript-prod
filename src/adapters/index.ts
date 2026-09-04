/**
 * TealTiger SDK - Platform Adapters
 *
 * Governance adapters for cloud AI agent platforms.
 * All adapters use the same TealEngineV13.evaluate() internally,
 * guaranteeing identical decisions for identical inputs regardless of platform.
 *
 * @module adapters
 */

export {
  GovernanceAdapter,
  BaseGovernanceAdapter,
  PlatformDecision,
  PlatformType,
} from './GovernanceAdapter';

export {
  BedrockGuardrailAdapter,
  BedrockGuardrailEvent,
  BedrockGuardrailResponse,
  BedrockGuardrailAction,
  BedrockGuardrailEventType,
  BedrockAdapterConfig,
} from './bedrock-adapter';

export {
  AgentCorePlugin,
  AgentCoreAction,
  AgentCoreActionType,
  AgentCoreDecision,
  AgentCorePostActionRecord,
  AgentCoreAdapterConfig,
} from './agentcore-adapter';

export {
  AzureAgentMiddleware,
  AzureToolCall,
  AzureAgentContext,
  AzureMiddlewareResult,
  AzureTelemetryData,
  AzureFunctionRequest,
  AzureFunctionResponse,
  AzureAdapterConfig,
} from './azure-adapter';

export {
  toHeliconeHeaders,
  withHeliconeHeaders,
  HELICONE_PROPERTY_PREFIX,
  HeliconeHeaderOptions,
} from './helicone-adapter';
