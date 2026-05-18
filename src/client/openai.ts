/**
 * TealTiger OpenAI Client - Integrated with all components
 * 
 * This client extends TealBaseClient and integrates with OpenAI's API
 */

import { TealBaseClient, TealClientConfig, RequestContext } from './base';
import { getModelPricing } from '../cost/pricing';

/**
 * OpenAI-specific configuration
 */
export interface TealOpenAIConfig extends TealClientConfig {
  openaiApiKey?: string; // Optional: use apiKey if not provided
  baseURL?: string;
  organization?: string;
  enableCostTracking?: boolean;
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
  cost?: number;
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
  cost?: number;
  metadata?: Record<string, string>; // TealTiger metadata
}

/**
 * TealTiger OpenAI Client
 */
export class TealOpenAI extends TealBaseClient {
  private openaiApiKey: string;
  private baseURL: string;
  private organization?: string;
  private enableCostTracking: boolean;

  constructor(config: TealOpenAIConfig) {
    super(config);
    
    this.openaiApiKey = config.openaiApiKey || config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.enableCostTracking = config.enableCostTracking !== false;
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
    
    const cost = !this.enableCostTracking
      ? undefined
      : this.calculateCost(data.model, data.usage);
    
    // Add TealTiger metadata
    return {
      ...data,
      ...(cost !== undefined && { cost }),
      metadata: {
        ...this.getComponentMetadata(),
        ...(cost !== undefined && { cost: cost.toFixed(4) })
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
    
    const cost = !this.enableCostTracking
      ? undefined
      : this.calculateCost(data.model, data.usage);
    
    // Add TealTiger metadata
    return {
      ...data,
      ...(cost !== undefined && { cost }),
      metadata: {
        ...this.getComponentMetadata(),
        ...(cost !== undefined && { cost: cost.toFixed(4) })
      }
    } as CompletionResponse;
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
    const pricing = getModelPricing(model, 'openai');

    if (!pricing) {
      return 0;
    }

    const promptCost = (usage.prompt_tokens / 1000) * pricing.inputCostPer1K;
    const completionCost = (usage.completion_tokens / 1000) * pricing.outputCostPer1K;

    return promptCost + completionCost;
  }
}
