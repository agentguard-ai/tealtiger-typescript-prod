/**
 * Error classes for the observe() module.
 */

/**
 * Thrown when observe() receives a client that is not one of the 12 supported providers.
 */
export class UnsupportedProviderError extends Error {
  readonly clientType: string;

  constructor(clientType: string) {
    super(
      `Unsupported provider client: ${clientType}. ` +
      `observe() supports: OpenAI, Anthropic, Gemini, Bedrock, Azure OpenAI, ` +
      `Cohere, Mistral, DeepSeek, Groq, xAI, Together, HF-TGI.`
    );
    this.name = 'UnsupportedProviderError';
    this.clientType = clientType;
  }
}

/**
 * Thrown when a request is made through a proxy whose agent is frozen.
 * The request never reaches the provider.
 */
export class FrozenAgentError extends Error {
  readonly agentId: string;
  readonly isWildcard: boolean;

  constructor(agentId: string, isWildcard: boolean) {
    const reason = isWildcard
      ? 'All agents are frozen (wildcard freeze active)'
      : `Agent '${agentId}' is frozen`;
    super(`Request blocked: ${reason}. Call unfreeze('${agentId}') to restore.`);
    this.name = 'FrozenAgentError';
    this.agentId = agentId;
    this.isWildcard = isWildcard;
  }
}
