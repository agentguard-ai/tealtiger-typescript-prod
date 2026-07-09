/**
 * TealTiger Ollama Client - Integrated with all components
 *
 * Provides governed access to Ollama's OpenAI-compatible local endpoint.
 */

import { TealBaseClient, TealClientConfig, RequestContext } from './base';

/**
 * Configuration for TealOllama.
 */
export interface TealOllamaConfig extends Omit<TealClientConfig, 'apiKey'> {
  /**
   * Optional API key for proxied or secured Ollama deployments.
   *
   * Local Ollama does not require this value.
   */
  apiKey?: string;

  /**
   * Ollama OpenAI-compatible base URL.
   *
   * @default http://localhost:11434/v1
   */
  baseURL?: string;

  /**
   * Default model to use when a request does not specify one.
   */
  model?: string;
}

/**
 * Ollama chat message.
 */
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

/**
 * Ollama OpenAI-compatible chat completion parameters.
 */
export interface OllamaChatCompletionParams {
  model?: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
}

/**
 * Ollama OpenAI-compatible chat completion response.
 */
export interface OllamaChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OllamaChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  metadata?: Record<string, string>;
}

/**
 * TealOllama client.
 *
 * Wraps local Ollama chat calls with the TealBaseClient governance pipeline:
 * TealEngine policy evaluation, TealGuard checks, TealCircuit execution,
 * TealMonitor metrics, and TealAudit records.
 */
export class TealOllama extends TealBaseClient {
  private baseURL: string;
  private defaultModel?: string;
  private apiKey?: string;

  constructor(config: TealOllamaConfig = {}) {
    super({
      ...config,
      apiKey: config.apiKey || 'ollama-local'
    });

    this.baseURL = config.baseURL || 'http://localhost:11434/v1';
    if (config.model !== undefined) {
      this.defaultModel = config.model;
    }
    if (config.apiKey !== undefined) {
      this.apiKey = config.apiKey;
    }
  }

  /**
   * OpenAI-compatible chat API.
   */
  chat = {
    create: async (params: OllamaChatCompletionParams): Promise<OllamaChatCompletionResponse> => {
      const model = params.model || this.defaultModel;
      if (!model) {
        throw new Error('TealOllama: model is required');
      }

      const requestParams = { ...params, model };
      const context: RequestContext = {
        agentId: this.config.agentId || 'default',
        action: 'ollama.chat.create',
        tool: 'ollama.chat',
        model,
        content: params.messages.map(message => message.content).join('\n'),
        metadata: {
          provider: 'ollama',
          baseURL: this.baseURL,
          local: true,
          params: requestParams
        }
      };

      return this.executeRequest(
        () => this._chatCreate(requestParams),
        context
      );
    }
  };

  private async _chatCreate(params: OllamaChatCompletionParams & { model: string }): Promise<OllamaChatCompletionResponse> {
    if (typeof fetch !== 'function') {
      throw new Error('TealOllama: global fetch is not available in this runtime');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const message = await this.parseError(response);
      throw new Error(`Ollama API error: ${message}`);
    }

    const data = await response.json() as OllamaChatCompletionResponse;
    return {
      ...data,
      metadata: {
        ...data.metadata,
        ...this.getComponentMetadata(),
        provider: 'ollama',
        local: 'true'
      }
    };
  }

  private async parseError(response: Response): Promise<string> {
    try {
      const payload = await response.json();
      if (this.hasNestedErrorMessage(payload)) {
        return payload.error.message;
      }
      if (this.hasMessage(payload)) {
        return payload.message;
      }
      return response.statusText;
    } catch {
      return response.statusText;
    }
  }

  private hasNestedErrorMessage(value: unknown): value is { error: { message: string } } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof (value as { error?: unknown }).error === 'object' &&
      (value as { error?: unknown }).error !== null &&
      'message' in (value as { error: Record<string, unknown> }).error &&
      typeof (value as { error: { message?: unknown } }).error.message === 'string'
    );
  }

  private hasMessage(value: unknown): value is { message: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'message' in value &&
      typeof (value as { message?: unknown }).message === 'string'
    );
  }

  /**
   * Get current configuration without exposing credentials.
   */
  override getConfig(): Partial<TealOllamaConfig> {
    return {
      ...super.getConfig(),
      baseURL: this.baseURL,
      ...(this.defaultModel && { model: this.defaultModel })
    };
  }
}

/**
 * Factory function to create a TealOllama client.
 */
export function createTealOllama(config?: TealOllamaConfig): TealOllama {
  return new TealOllama(config);
}
