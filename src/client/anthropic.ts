/**
 * TealTiger Anthropic Client - Integrated with all components
 * 
 * This client extends TealBaseClient and integrates with Anthropic's API
 */

import { TealBaseClient, TealClientConfig, RequestContext } from './base';

/**
 * Anthropic-specific configuration
 */
export interface TealAnthropicConfig extends TealClientConfig {
  anthropicApiKey?: string; // Optional: use apiKey if not provided
  baseURL?: string;
}

/**
 * Anthropic message
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Anthropic messages parameters
 */
export interface MessagesParams {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string;
}

/**
 * Anthropic messages response
 */
export interface MessagesResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  metadata?: Record<string, string>; // TealTiger metadata
}

/**
 * TealTiger Anthropic Client
 */
export class TealAnthropic extends TealBaseClient {
  private anthropicApiKey: string;
  private baseURL: string;

  constructor(config: TealAnthropicConfig) {
    super(config);
    
    this.anthropicApiKey = config.anthropicApiKey || config.apiKey;
    this.baseURL = config.baseURL || 'https://api.anthropic.com/v1';
  }

  /**
   * Create a message
   */
  messages = {
    create: async (params: MessagesParams): Promise<MessagesResponse> => {
      const context: RequestContext = {
        agentId: this.config.agentId || 'default',
        action: 'messages.create',
        tool: 'messages', // Add tool name for policy evaluation
        model: params.model,
        content: params.messages.map(m => m.content).join('\n'),
        metadata: { params }
      };

      return this.executeRequest(
        () => this._messagesCreate(params),
        context
      );
    }
  };

  /**
   * Internal method to call Anthropic messages API
   */
  private async _messagesCreate(params: MessagesParams): Promise<MessagesResponse> {
    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error: any = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const data: any = await response.json();
    
    // Calculate cost
    const cost = this.calculateCost(data.model, data.usage);
    
    // Add TealTiger metadata
    return {
      ...data,
      metadata: {
        ...this.getComponentMetadata(),
        cost: cost.toFixed(4)
      }
    } as MessagesResponse;
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(model: string, usage: { input_tokens: number; output_tokens: number }): number {
    // Pricing per 1M tokens (as of 2026)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-opus': { input: 15, output: 75 },
      'claude-3-sonnet': { input: 3, output: 15 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-2.1': { input: 8, output: 24 },
      'claude-2.0': { input: 8, output: 24 }
    };

    // Find matching model
    const modelKey = Object.keys(pricing).find(key => model.startsWith(key)) || 'claude-3-sonnet';
    const prices = pricing[modelKey];

    const inputCost = (usage.input_tokens / 1000000) * prices.input;
    const outputCost = (usage.output_tokens / 1000000) * prices.output;

    return inputCost + outputCost;
  }
}
