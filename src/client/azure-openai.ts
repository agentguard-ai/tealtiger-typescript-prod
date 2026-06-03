/**
 * TealAzureOpenAI - Azure OpenAI Service Client with TealTiger Integration
 * 
 * Provides secure access to Azure OpenAI Service with full TealTiger integration.
 * Extends TealOpenAI to maintain OpenAI API compatibility while adding Azure-specific features.
 * 
 * Features:
 * - Azure AD authentication support
 * - Deployment-based model routing
 * - Azure-specific endpoints
 * - Regional data residency
 * - Full TealTiger component integration
 */

import { TealOpenAI, ChatCompletionParams, CompletionParams, ChatCompletionResponse, CompletionResponse } from './openai';
import { TealClientConfig } from './base';
import { AzureOpenAI } from 'openai';

/**
 * Azure OpenAI pricing per 1K tokens (USD)
 * Matches OpenAI pricing but billed through Azure
 * Source: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/
 */
export const AZURE_OPENAI_PRICING = {
  // GPT-4 models
  'gpt-4': {
    prompt: 0.03,
    completion: 0.06
  },
  'gpt-4-32k': {
    prompt: 0.06,
    completion: 0.12
  },
  'gpt-4-turbo': {
    prompt: 0.01,
    completion: 0.03
  },
  'gpt-4-vision': {
    prompt: 0.01,
    completion: 0.03
  },
  
  // GPT-3.5 models
  'gpt-35-turbo': {
    prompt: 0.0005,
    completion: 0.0015
  },
  'gpt-35-turbo-16k': {
    prompt: 0.003,
    completion: 0.004
  },
  
  // GPT-4o models
  'gpt-4o': {
    prompt: 0.005,
    completion: 0.015
  },
  'gpt-4o-mini': {
    prompt: 0.00015,
    completion: 0.0006
  }
} as const;

/**
 * Configuration for TealAzureOpenAI
 */
export interface TealAzureOpenAIConfig extends Omit<TealClientConfig, 'apiKey'> {
  /**
   * Azure OpenAI endpoint
   * Format: https://{resource-name}.openai.azure.com
   */
  endpoint: string;
  
  /**
   * Azure OpenAI API key
   */
  azureApiKey: string;
  
  /**
   * API version (default: 2024-02-15-preview)
   */
  apiVersion?: string;
  
  /**
   * Default deployment name
   * Azure uses deployment names instead of model names
   */
  deployment?: string;
  
  /**
   * Azure region (for metadata)
   */
  region?: string;
  
  /**
   * Azure subscription ID (for metadata)
   */
  subscriptionId?: string;
}

/**
 * TealAzureOpenAI Client
 * 
 * Integrates Azure OpenAI Service with TealTiger security and monitoring components.
 * Maintains OpenAI API compatibility while adding Azure-specific features.
 * 
 * @example
 * ```typescript
 * const client = new TealAzureOpenAI({
 *   endpoint: 'https://my-resource.openai.azure.com',
 *   azureApiKey: process.env.AZURE_OPENAI_API_KEY!,
 *   deployment: 'gpt-4-deployment',
 *   region: 'eastus',
 *   policies: {
 *     tools: { 'chat': { allowed: true } },
 *     identity: { agentId: 'azure-agent', role: 'user' }
 *   }
 * });
 * 
 * const response = await client.chat.create({
 *   model: 'gpt-4', // Maps to deployment
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * 
 * console.log(response.choices[0].message.content);
 * console.log('Cost:', response.metadata?.cost);
 * ```
 */
export class TealAzureOpenAI extends TealOpenAI {
  private azureClient: AzureOpenAI;
  private endpoint: string;
  private apiVersion: string;
  private deployment?: string;
  private region?: string;
  private subscriptionId?: string;

  constructor(config: TealAzureOpenAIConfig) {
    // Convert Azure config to OpenAI config for parent class
    super({
      ...config,
      apiKey: config.azureApiKey,
      openaiApiKey: config.azureApiKey,
      baseURL: config.endpoint
    });
    
    this.endpoint = config.endpoint;
    this.apiVersion = config.apiVersion || '2024-02-15-preview';
    
    // Handle optional properties explicitly
    if (config.deployment !== undefined) {
      this.deployment = config.deployment;
    }
    if (config.region !== undefined) {
      this.region = config.region;
    }
    if (config.subscriptionId !== undefined) {
      this.subscriptionId = config.subscriptionId;
    }
    
    // Initialize Azure OpenAI client
    this.azureClient = new AzureOpenAI({
      apiKey: config.azureApiKey,
      endpoint: this.endpoint,
      apiVersion: this.apiVersion
    });
  }

  /**
   * Override chat.create to use Azure deployments
   * 
   * @param params - Chat completion parameters
   * @returns Chat completion response with Azure metadata
   * 
   * @example
   * ```typescript
   * const response = await client.chat.create({
   *   model: 'gpt-4', // Maps to Azure deployment
   *   messages: [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'What is Azure OpenAI?' }
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
        provider: 'azure-openai',
        endpoint: this.endpoint
      };
      
      if (this.region) metadata.region = this.region;
      
      const context = {
        agentId: this.config.agentId || 'default',
        action: 'chat.create',
        tool: 'chat',
        model: params.model,
        content: params.messages.map(m => m.content).join('\n'),
        metadata
      };

      return this.executeRequest(
        () => this._azureChatCreate(params),
        context
      );
    }
  };

  /**
   * Override completions.create to use Azure deployments
   * 
   * @param params - Completion parameters
   * @returns Completion response with Azure metadata
   * 
   * @example
   * ```typescript
   * const response = await client.completions.create({
   *   model: 'gpt-35-turbo-instruct',
   *   prompt: 'Once upon a time',
   *   max_tokens: 100
   * });
   * ```
   */
  completions = {
    create: async (params: CompletionParams) => {
      const metadata: Record<string, any> = { 
        params,
        provider: 'azure-openai',
        endpoint: this.endpoint
      };
      
      if (this.region) metadata.region = this.region;
      
      const context = {
        agentId: this.config.agentId || 'default',
        action: 'completions.create',
        tool: 'completions',
        model: params.model,
        content: params.prompt,
        metadata
      };

      return this.executeRequest(
        () => this._azureCompletionsCreate(params),
        context
      );
    }
  };

  /**
   * Internal method to call Azure OpenAI chat API
   */
  private async _azureChatCreate(params: ChatCompletionParams) {
    // Use deployment name if provided, otherwise use model name
    const deploymentName = this.deployment || params.model;
    
    try {
      // Build request params with proper null handling for OpenAI SDK
      const requestParams: any = {
        model: deploymentName,
        messages: params.messages
      };
      
      if (params.temperature !== undefined) requestParams.temperature = params.temperature;
      if (params.max_tokens !== undefined) requestParams.max_tokens = params.max_tokens;
      if (params.top_p !== undefined) requestParams.top_p = params.top_p;
      if (params.frequency_penalty !== undefined) requestParams.frequency_penalty = params.frequency_penalty;
      if (params.presence_penalty !== undefined) requestParams.presence_penalty = params.presence_penalty;
      if (params.stop !== undefined) requestParams.stop = params.stop;
      
      const result = await this.azureClient.chat.completions.create(requestParams);

      // Calculate cost
      const usage = {
        prompt_tokens: result.usage?.prompt_tokens || 0,
        completion_tokens: result.usage?.completion_tokens || 0
      };
      const cost = this.calculateAzureCost(params.model, usage);

      // Build metadata
      const metadata: Record<string, any> = {
        ...this.getComponentMetadata(),
        provider: 'azure-openai',
        deployment: deploymentName,
        endpoint: this.endpoint,
        cost: cost.toFixed(4)
      };

      // Format response to match OpenAI format
      return {
        id: result.id,
        object: result.object,
        created: result.created,
        model: params.model,
        choices: result.choices.map((choice: any) => ({
          index: choice.index,
          message: {
            role: choice.message?.role || 'assistant',
            content: choice.message?.content || ''
          },
          finish_reason: choice.finish_reason || 'stop'
        })),
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.prompt_tokens + usage.completion_tokens
        },
        metadata
      } as ChatCompletionResponse;
    } catch (error: any) {
      throw new Error(`Azure OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Internal method to call Azure OpenAI completions API
   */
  private async _azureCompletionsCreate(params: CompletionParams) {
    // Use deployment name if provided, otherwise use model name
    const deploymentName = this.deployment || params.model;
    
    try {
      // Build request params with proper null handling for OpenAI SDK
      const requestParams: any = {
        model: deploymentName,
        prompt: params.prompt
      };
      
      if (params.temperature !== undefined) requestParams.temperature = params.temperature;
      if (params.max_tokens !== undefined) requestParams.max_tokens = params.max_tokens;
      if (params.top_p !== undefined) requestParams.top_p = params.top_p;
      if (params.frequency_penalty !== undefined) requestParams.frequency_penalty = params.frequency_penalty;
      if (params.presence_penalty !== undefined) requestParams.presence_penalty = params.presence_penalty;
      if (params.stop !== undefined) requestParams.stop = params.stop;
      
      const result = await this.azureClient.completions.create(requestParams);

      // Calculate cost
      const usage = {
        prompt_tokens: result.usage?.prompt_tokens || 0,
        completion_tokens: result.usage?.completion_tokens || 0
      };
      const cost = this.calculateAzureCost(params.model, usage);

      // Build metadata
      const metadata: Record<string, any> = {
        ...this.getComponentMetadata(),
        provider: 'azure-openai',
        deployment: deploymentName,
        endpoint: this.endpoint,
        cost: cost.toFixed(4)
      };

      // Format response to match OpenAI format
      return {
        id: result.id,
        object: result.object,
        created: result.created,
        model: params.model,
        choices: result.choices.map((choice: any) => ({
          text: choice.text,
          index: choice.index,
          finish_reason: choice.finish_reason || 'stop'
        })),
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.prompt_tokens + usage.completion_tokens
        },
        metadata
      } as CompletionResponse;
    } catch (error: any) {
      throw new Error(`Azure OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Calculate cost based on Azure OpenAI pricing
   */
  private calculateAzureCost(
    model: string,
    usage: { prompt_tokens: number; completion_tokens: number }
  ): number {
    // Normalize model name (Azure uses gpt-35-turbo instead of gpt-3.5-turbo)
    const normalizedModel = model.replace('gpt-3.5', 'gpt-35');
    
    // Find matching pricing
    const pricing = AZURE_OPENAI_PRICING[normalizedModel as keyof typeof AZURE_OPENAI_PRICING];
    
    if (!pricing) {
      // Default to gpt-35-turbo pricing if model not found
      const defaultPricing = AZURE_OPENAI_PRICING['gpt-35-turbo'];
      const promptCost = (usage.prompt_tokens / 1000) * defaultPricing.prompt;
      const completionCost = (usage.completion_tokens / 1000) * defaultPricing.completion;
      return promptCost + completionCost;
    }

    const promptCost = (usage.prompt_tokens / 1000) * pricing.prompt;
    const completionCost = (usage.completion_tokens / 1000) * pricing.completion;

    return promptCost + completionCost;
  }

  /**
   * Get metadata from all components with Azure-specific info
   */
  protected getComponentMetadata(): Record<string, any> {
    const metadata: Record<string, any> = {
      provider: 'azure-openai',
      endpoint: this.endpoint,
      apiVersion: this.apiVersion
    };

    if (this.region) {
      metadata.region = this.region;
    }

    if (this.subscriptionId) {
      metadata.subscriptionId = this.subscriptionId;
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

/**
 * Create a canonical TealAzureOpenAI client.
 */
export function createTealAzureOpenAI(config: TealAzureOpenAIConfig): TealAzureOpenAI {
  return new TealAzureOpenAI(config);
}
