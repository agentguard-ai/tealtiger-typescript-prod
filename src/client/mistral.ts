/**
 * TealMistral - Mistral AI Client with TealTiger Integration
 * 
 * Provides secure access to Mistral AI with full TealTiger integration.
 * Extends TealOpenAI to maintain OpenAI API compatibility while adding Mistral-specific features.
 * 
 * Features:
 * - OpenAI-compatible API
 * - European data residency (GDPR compliant)
 * - Mistral-specific models (Large, Medium, Small, Mixtral)
 * - Full TealTiger component integration
 * - Streaming support
 */

import { TealOpenAI, ChatCompletionParams, CompletionParams, ChatCompletionResponse, CompletionResponse } from './openai';
import { TealClientConfig } from './base';
import { Mistral } from '@mistralai/mistralai';

/**
 * Mistral AI pricing per 1M tokens (EUR, converted to USD at 1.1 rate)
 * Source: https://mistral.ai/pricing/
 */
export const MISTRAL_PRICING = {
  // Mistral Large (flagship model)
  'mistral-large-latest': {
    input: 4.40,   // €4/1M tokens * 1.1
    output: 13.20  // €12/1M tokens * 1.1
  },
  'mistral-large-2402': {
    input: 4.40,
    output: 13.20
  },
  
  // Mistral Medium (balanced)
  'mistral-medium-latest': {
    input: 2.97,   // €2.7/1M tokens * 1.1
    output: 8.91   // €8.1/1M tokens * 1.1
  },
  'mistral-medium-2312': {
    input: 2.97,
    output: 8.91
  },
  
  // Mistral Small (efficient)
  'mistral-small-latest': {
    input: 1.10,   // €1/1M tokens * 1.1
    output: 3.30   // €3/1M tokens * 1.1
  },
  'mistral-small-2402': {
    input: 1.10,
    output: 3.30
  },
  
  // Mixtral (open-source, cost-effective)
  'open-mixtral-8x7b': {
    input: 0.77,   // €0.7/1M tokens * 1.1
    output: 0.77   // €0.7/1M tokens * 1.1
  },
  'open-mixtral-8x22b': {
    input: 2.20,   // €2/1M tokens * 1.1
    output: 6.60   // €6/1M tokens * 1.1
  },
  
  // Mistral Tiny (ultra-efficient)
  'mistral-tiny': {
    input: 0.33,   // €0.3/1M tokens * 1.1
    output: 0.33   // €0.3/1M tokens * 1.1
  }
} as const;

/**
 * Configuration for TealMistral
 */
export interface TealMistralConfig extends Omit<TealClientConfig, 'apiKey'> {
  /**
   * Mistral AI API key
   */
  mistralApiKey: string;
  
  /**
   * Mistral API endpoint (default: https://api.mistral.ai)
   */
  endpoint?: string;
  
  /**
   * Default model to use
   */
  model?: string;
  
  /**
   * European region (for metadata)
   */
  region?: 'eu-west' | 'eu-central';
}

/**
 * TealMistral Client
 * 
 * Integrates Mistral AI with TealTiger security and monitoring components.
 * Maintains OpenAI API compatibility while adding Mistral-specific features.
 * 
 * @example
 * ```typescript
 * const client = new TealMistral({
 *   mistralApiKey: process.env.MISTRAL_API_KEY!,
 *   model: 'mistral-large-latest',
 *   region: 'eu-west',
 *   policies: {
 *     tools: { 'chat': { allowed: true } },
 *     identity: { agentId: 'mistral-agent', role: 'user' }
 *   }
 * });
 * 
 * const response = await client.chat.create({
 *   model: 'mistral-large-latest',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * 
 * console.log(response.choices[0].message.content);
 * console.log('Cost:', response.metadata?.cost);
 * console.log('Region:', response.metadata?.region);
 * ```
 */
export class TealMistral extends TealOpenAI {
  private mistralClient: Mistral;
  private endpoint: string;
  private defaultModel?: string;
  private region?: string;

  constructor(config: TealMistralConfig) {
    // Convert Mistral config to OpenAI config for parent class
    super({
      ...config,
      apiKey: config.mistralApiKey,
      openaiApiKey: config.mistralApiKey,
      baseURL: config.endpoint || 'https://api.mistral.ai/v1'
    });
    
    this.endpoint = config.endpoint || 'https://api.mistral.ai/v1';
    
    // Handle optional properties explicitly
    if (config.model !== undefined) {
      this.defaultModel = config.model;
    }
    if (config.region !== undefined) {
      this.region = config.region;
    }
    
    // Initialize Mistral client
    this.mistralClient = new Mistral({
      apiKey: config.mistralApiKey
    });
  }

  /**
   * Override chat.create to use Mistral API
   * 
   * @param params - Chat completion parameters
   * @returns Chat completion response with Mistral metadata
   * 
   * @example
   * ```typescript
   * const response = await client.chat.create({
   *   model: 'mistral-large-latest',
   *   messages: [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'What is Mistral AI?' }
   *   ],
   *   temperature: 0.7,
   *   max_tokens: 500
   * });
   * ```
   */
  chat = {
    create: async (params: ChatCompletionParams) => {
      const metadata: Record<string, any> = { 
        params,
        provider: 'mistral',
        endpoint: this.endpoint,
        dataResidency: 'EU'
      };
      
      if (this.region) metadata.region = this.region;
      
      const context = {
        agentId: this.config.agentId || 'default',
        action: 'chat.create',
        tool: 'chat',
        model: params.model || this.defaultModel || 'mistral-large-latest',
        content: params.messages.map(m => m.content).join('\n'),
        metadata
      };

      return this.executeRequest(
        () => this._mistralChatCreate(params),
        context
      );
    }
  };

  /**
   * Override completions.create to use Mistral API
   * 
   * @param params - Completion parameters
   * @returns Completion response with Mistral metadata
   * 
   * @example
   * ```typescript
   * const response = await client.completions.create({
   *   model: 'mistral-small-latest',
   *   prompt: 'Once upon a time',
   *   max_tokens: 100
   * });
   * ```
   */
  completions = {
    create: async (params: CompletionParams) => {
      const metadata: Record<string, any> = { 
        params,
        provider: 'mistral',
        endpoint: this.endpoint,
        dataResidency: 'EU'
      };
      
      if (this.region) metadata.region = this.region;
      
      const context = {
        agentId: this.config.agentId || 'default',
        action: 'completions.create',
        tool: 'completions',
        model: params.model || this.defaultModel || 'mistral-large-latest',
        content: params.prompt,
        metadata
      };

      return this.executeRequest(
        () => this._mistralCompletionsCreate(params),
        context
      );
    }
  };

  /**
   * Internal method to call Mistral chat API
   */
  private async _mistralChatCreate(params: ChatCompletionParams) {
    const model = params.model || this.defaultModel || 'mistral-large-latest';
    
    try {
      // Build request params with proper null handling for Mistral SDK
      const requestParams: any = {
        model,
        messages: params.messages
      };
      
      if (params.temperature !== undefined) requestParams.temperature = params.temperature;
      if (params.max_tokens !== undefined) requestParams.maxTokens = params.max_tokens;
      if (params.top_p !== undefined) requestParams.topP = params.top_p;
      if (params.stop !== undefined) requestParams.stop = params.stop;
      
      const result = await this.mistralClient.chat.complete(requestParams);

      // Calculate cost
      const usage = {
        prompt_tokens: result.usage?.promptTokens || 0,
        completion_tokens: result.usage?.completionTokens || 0
      };
      const cost = this.calculateMistralCost(model, usage);

      // Build metadata
      const metadata: Record<string, any> = {
        ...this.getComponentMetadata(),
        provider: 'mistral',
        endpoint: this.endpoint,
        dataResidency: 'EU',
        cost: cost.toFixed(4)
      };

      if (this.region) metadata.region = this.region;

      // Format response to match OpenAI format
      return {
        id: result.id || 'mistral-' + Date.now(),
        object: 'chat.completion',
        created: result.created || Math.floor(Date.now() / 1000),
        model,
        choices: result.choices?.map((choice: any) => ({
          index: choice.index || 0,
          message: {
            role: choice.message?.role || 'assistant',
            content: choice.message?.content || ''
          },
          finish_reason: choice.finishReason || 'stop'
        })) || [],
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.prompt_tokens + usage.completion_tokens
        },
        metadata
      } as ChatCompletionResponse;
    } catch (error: any) {
      throw new Error(`Mistral AI API error: ${error.message}`);
    }
  }

  /**
   * Internal method to call Mistral completions API
   * Note: Mistral primarily uses chat API, this converts to chat format
   */
  private async _mistralCompletionsCreate(params: CompletionParams) {
    const model = params.model || this.defaultModel || 'mistral-large-latest';
    
    try {
      // Convert completion to chat format (Mistral uses chat API)
      const requestParams: any = {
        model,
        messages: [
          { role: 'user', content: params.prompt }
        ]
      };
      
      if (params.temperature !== undefined) requestParams.temperature = params.temperature;
      if (params.max_tokens !== undefined) requestParams.maxTokens = params.max_tokens;
      if (params.top_p !== undefined) requestParams.topP = params.top_p;
      if (params.stop !== undefined) requestParams.stop = params.stop;
      
      const result = await this.mistralClient.chat.complete(requestParams);

      // Calculate cost
      const usage = {
        prompt_tokens: result.usage?.promptTokens || 0,
        completion_tokens: result.usage?.completionTokens || 0
      };
      const cost = this.calculateMistralCost(model, usage);

      // Build metadata
      const metadata: Record<string, any> = {
        ...this.getComponentMetadata(),
        provider: 'mistral',
        endpoint: this.endpoint,
        dataResidency: 'EU',
        cost: cost.toFixed(4)
      };

      if (this.region) metadata.region = this.region;

      // Format response to match OpenAI completions format
      return {
        id: result.id || 'mistral-' + Date.now(),
        object: 'text_completion',
        created: result.created || Math.floor(Date.now() / 1000),
        model,
        choices: result.choices?.map((choice: any) => ({
          text: choice.message?.content || '',
          index: choice.index || 0,
          finish_reason: choice.finishReason || 'stop'
        })) || [],
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.prompt_tokens + usage.completion_tokens
        },
        metadata
      } as CompletionResponse;
    } catch (error: any) {
      throw new Error(`Mistral AI API error: ${error.message}`);
    }
  }

  /**
   * Calculate cost based on Mistral AI pricing
   */
  private calculateMistralCost(
    model: string,
    usage: { prompt_tokens: number; completion_tokens: number }
  ): number {
    // Find matching pricing
    const pricing = MISTRAL_PRICING[model as keyof typeof MISTRAL_PRICING];
    
    if (!pricing) {
      // Default to mistral-large-latest pricing if model not found
      const defaultPricing = MISTRAL_PRICING['mistral-large-latest'];
      const inputCost = (usage.prompt_tokens / 1000000) * defaultPricing.input;
      const outputCost = (usage.completion_tokens / 1000000) * defaultPricing.output;
      return inputCost + outputCost;
    }

    const inputCost = (usage.prompt_tokens / 1000000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1000000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get metadata from all components with Mistral-specific info
   */
  protected getComponentMetadata(): Record<string, any> {
    const metadata: Record<string, any> = {
      provider: 'mistral',
      endpoint: this.endpoint,
      dataResidency: 'EU'
    };

    if (this.region) {
      metadata.region = this.region;
    }

    if (this.engine) {
      metadata.policyEvaluation = 'enabled';
    }

    if (this.guard) {
      metadata.guardrailResults = 'enabled';
    }

    if (this.monitor) {
      metadata.monitoringMetrics = 'enabled';
    }

    if (this.circuit) {
      metadata.circuitState = this.circuit.getState();
    }

    return metadata;
  }
}
