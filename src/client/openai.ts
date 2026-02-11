/**
 * TealTiger OpenAI Client - Integrated with all components
 * 
 * This client extends TealBaseClient and integrates with OpenAI's API
 */

import { TealBaseClient, TealClientConfig, RequestContext } from './base';

/**
 * OpenAI-specific configuration
 */
export interface TealOpenAIConfig extends TealClientConfig {
  openaiApiKey?: string; // Optional: use apiKey if not provided
  baseURL?: string;
  organization?: string;
}

/**
 * OpenAI chat message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI chat completion parameters
 */
export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
}

/**
 * OpenAI chat completion response
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  metadata?: Record<string, string>; // TealTiger metadata
}

/**
 * OpenAI completion parameters
 */
export interface CompletionParams {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

/**
 * OpenAI completion response
 */
export interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  metadata?: Record<string, string>; // TealTiger metadata
}

/**
 * TealTiger OpenAI Client
 */
export class TealOpenAI extends TealBaseClient {
  private openaiApiKey: string;
  private baseURL: string;
  private organization?: string;

  constructor(config: TealOpenAIConfig) {
    super(config);
    
    this.openaiApiKey = config.openaiApiKey || config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    if (config.organization) {
      this.organization = config.organization;
    }
  }

  /**
   * Create a chat completion
   */
  chat = {
    create: async (params: ChatCompletionParams): Promise<ChatCompletionResponse> => {
      const context: RequestContext = {
        agentId: this.config.agentId || 'default',
        action: 'chat.create',
        tool: 'chat', // Add tool name for policy evaluation
        model: params.model,
        content: params.messages.map(m => m.content).join('\n'),
        metadata: { params }
      };

      return this.executeRequest(
        () => this._chatCreate(params),
        context
      );
    }
  };

  /**
   * Create a completion
   */
  completions = {
    create: async (params: CompletionParams): Promise<CompletionResponse> => {
      const context: RequestContext = {
        agentId: this.config.agentId || 'default',
        action: 'completions.create',
        tool: 'completions', // Add tool name for policy evaluation
        model: params.model,
        content: params.prompt,
        metadata: { params }
      };

      return this.executeRequest(
        () => this._completionsCreate(params),
        context
      );
    }
  };

  /**
   * Internal method to call OpenAI chat API
   */
  private async _chatCreate(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
        ...(this.organization && { 'OpenAI-Organization': this.organization })
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error: any = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
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
    } as ChatCompletionResponse;
  }

  /**
   * Internal method to call OpenAI completions API
   */
  private async _completionsCreate(params: CompletionParams): Promise<CompletionResponse> {
    const response = await fetch(`${this.baseURL}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
        ...(this.organization && { 'OpenAI-Organization': this.organization })
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error: any = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
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
    } as CompletionResponse;
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
    // Pricing per 1K tokens (as of 2026)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
      'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
      'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 }
    };

    // Find matching model (handle versioned models like gpt-4-0613)
    const modelKey = Object.keys(pricing).find(key => model.startsWith(key)) || 'gpt-3.5-turbo';
    const prices = pricing[modelKey];

    const promptCost = (usage.prompt_tokens / 1000) * prices.prompt;
    const completionCost = (usage.completion_tokens / 1000) * prices.completion;

    return promptCost + completionCost;
  }
}
