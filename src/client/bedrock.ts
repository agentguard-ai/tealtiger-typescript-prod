/**
 * TealBedrock - AWS Bedrock Client with TealTiger Integration
 * 
 * Provides secure access to AWS Bedrock API with support for multiple providers:
 * - Anthropic Claude (claude-v2, claude-instant)
 * - Amazon Titan (titan-text, titan-embeddings)
 * - AI21 Jurassic (jurassic-2-ultra, jurassic-2-mid)
 * - Cohere Command (command-text, command-light)
 * - Meta Llama (llama2-13b, llama2-70b)
 * 
 * Features:
 * - Policy enforcement (TealEngine)
 * - Content validation (TealGuard)
 * - Cost tracking (TealMonitor)
 * - Circuit breaker (TealCircuit)
 * - Audit logging (TealAudit)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} from '@aws-sdk/client-bedrock-runtime';
import { TealBaseClient, TealClientConfig, RequestContext } from './base';

/**
 * Bedrock pricing per 1K tokens (USD)
 * Source: https://aws.amazon.com/bedrock/pricing/
 */
export const BEDROCK_PRICING = {
  // Anthropic Claude
  'anthropic.claude-v2': {
    input: 0.008,
    output: 0.024
  },
  'anthropic.claude-v2:1': {
    input: 0.008,
    output: 0.024
  },
  'anthropic.claude-instant-v1': {
    input: 0.0008,
    output: 0.0024
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    input: 0.003,
    output: 0.015
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    input: 0.00025,
    output: 0.00125
  },
  
  // Amazon Titan
  'amazon.titan-text-lite-v1': {
    input: 0.0003,
    output: 0.0004
  },
  'amazon.titan-text-express-v1': {
    input: 0.0008,
    output: 0.0016
  },
  'amazon.titan-embed-text-v1': {
    input: 0.0001,
    output: 0
  },
  
  // AI21 Jurassic
  'ai21.j2-ultra-v1': {
    input: 0.0188,
    output: 0.0188
  },
  'ai21.j2-mid-v1': {
    input: 0.0125,
    output: 0.0125
  },
  
  // Cohere Command
  'cohere.command-text-v14': {
    input: 0.0015,
    output: 0.002
  },
  'cohere.command-light-text-v14': {
    input: 0.0003,
    output: 0.0006
  },
  
  // Meta Llama
  'meta.llama2-13b-chat-v1': {
    input: 0.00075,
    output: 0.001
  },
  'meta.llama2-70b-chat-v1': {
    input: 0.00195,
    output: 0.00256
  }
} as const;

/**
 * Bedrock provider types
 */
export type BedrockProvider = 
  | 'anthropic'
  | 'amazon'
  | 'ai21'
  | 'cohere'
  | 'meta';

/**
 * Parameters for invokeModel
 */
export interface InvokeModelParams {
  modelId: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
}

/**
 * Response from invokeModel
 */
export interface InvokeModelResponse {
  text: string;
  stopReason?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  metadata?: {
    provider: string;
    model: string;
    region: string;
    cost: string;
    policyEvaluation?: any;
    guardrailResults?: any;
    monitoringMetrics?: any;
    circuitState?: string;
  };
}

/**
 * Configuration for TealBedrock
 */
export interface TealBedrockConfig extends TealClientConfig {
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  defaultModel?: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

/**
 * TealBedrock Client
 * 
 * Integrates AWS Bedrock with TealTiger security and monitoring components.
 * Supports multiple AI providers through a unified interface.
 * 
 * @example
 * ```typescript
 * const client = new TealBedrock({
 *   region: 'us-east-1',
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
 *   },
 *   policies: {
 *     tools: { allowed: ['*'] },
 *     identity: { allowedAgents: ['*'] }
 *   }
 * });
 * 
 * const response = await client.invokeModel({
 *   modelId: 'anthropic.claude-v2',
 *   prompt: 'Explain quantum computing'
 * });
 * 
 * console.log(response.text);
 * console.log('Cost:', response.metadata?.cost);
 * ```
 */
export class TealBedrock extends TealBaseClient {
  private bedrockClient: BedrockRuntimeClient;
  private region: string;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: TealBedrockConfig) {
    super(config);
    
    this.region = config.region || 'us-east-1';
    this.defaultModel = config.defaultModel || 'anthropic.claude-v2';
    this.defaultMaxTokens = config.defaultMaxTokens || 2048;
    this.defaultTemperature = config.defaultTemperature || 0.7;
    
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      ...(config.credentials && { credentials: config.credentials })
    });
  }

  /**
   * Invoke a Bedrock model
   * 
   * @param params - Invocation parameters
   * @returns Model response with metadata
   * 
   * @example
   * ```typescript
   * const response = await client.invokeModel({
   *   modelId: 'anthropic.claude-v2',
   *   prompt: 'What is machine learning?',
   *   maxTokens: 1000,
   *   temperature: 0.7
   * });
   * ```
   */
  async invokeModel(
    params: InvokeModelParams
  ): Promise<InvokeModelResponse> {
    const modelId = params.modelId || this.defaultModel;
    const provider = this.getProvider(modelId);

    const context: RequestContext = {
      agentId: this.config.agentId || 'default',
      action: 'invokeModel',
      tool: 'invokeModel',
      model: modelId,
      content: params.prompt,
      metadata: { 
        provider: 'bedrock',
        bedrockProvider: provider,
        region: this.region,
        params 
      }
    };

    return this.executeRequest(
      async () => this._invokeModel(params),
      context
    );
  }

  /**
   * Invoke a Bedrock model with streaming
   * 
   * @param params - Invocation parameters
   * @returns Async generator for streaming responses
   * 
   * @example
   * ```typescript
   * const stream = client.invokeModelStream({
   *   modelId: 'anthropic.claude-v2',
   *   prompt: 'Write a story'
   * });
   * 
   * for await (const chunk of stream) {
   *   if (!chunk.done) {
   *     process.stdout.write(chunk.text);
   *   }
   * }
   * ```
   */
  async *invokeModelStream(
    params: InvokeModelParams
  ): AsyncGenerator<{ text: string; done: boolean }> {
    const modelId = params.modelId || this.defaultModel;
    const provider = this.getProvider(modelId);
    const requestBody = this.formatRequest(provider, params);
    
    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });
    
    const response = await this.bedrockClient.send(command);
    
    if (response.body) {
      for await (const event of response.body) {
        if (event.chunk) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          const text = this.extractTextFromChunk(provider, chunk);
          if (text) {
            yield { text, done: false };
          }
        }
      }
    }
    
    yield { text: '', done: true };
  }

  /**
   * Private method to execute actual Bedrock API call
   */
  private async _invokeModel(
    params: InvokeModelParams
  ): Promise<InvokeModelResponse> {
    const modelId = params.modelId || this.defaultModel;
    const provider = this.getProvider(modelId);
    const requestBody = this.formatRequest(provider, params);
    
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });
    
    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Parse response based on provider
    const parsed = this.parseResponse(provider, responseBody);
    
    // Calculate cost
    const cost = this.calculateCost(modelId, parsed.inputTokens || 0, parsed.outputTokens || 0);
    
    return {
      text: parsed.text,
      stopReason: parsed.stopReason,
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      metadata: {
        ...this.getComponentMetadata(),
        provider: 'bedrock',
        model: modelId,
        region: this.region,
        cost: cost.toFixed(6)
      }
    };
  }

  /**
   * Get provider from model ID
   */
  private getProvider(modelId: string): BedrockProvider {
    if (modelId.startsWith('anthropic.')) return 'anthropic';
    if (modelId.startsWith('amazon.')) return 'amazon';
    if (modelId.startsWith('ai21.')) return 'ai21';
    if (modelId.startsWith('cohere.')) return 'cohere';
    if (modelId.startsWith('meta.')) return 'meta';
    throw new Error(`Unknown provider for model: ${modelId}`);
  }

  /**
   * Format request based on provider
   */
  private formatRequest(provider: BedrockProvider, params: InvokeModelParams): any {
    const maxTokens = params.maxTokens || this.defaultMaxTokens;
    const temperature = params.temperature !== undefined ? params.temperature : this.defaultTemperature;
    
    switch (provider) {
      case 'anthropic':
        return {
          prompt: `\n\nHuman: ${params.prompt}\n\nAssistant:`,
          max_tokens_to_sample: maxTokens,
          temperature,
          ...(params.topP && { top_p: params.topP }),
          ...(params.stopSequences && { stop_sequences: params.stopSequences })
        };
      
      case 'amazon':
        return {
          inputText: params.prompt,
          textGenerationConfig: {
            maxTokenCount: maxTokens,
            temperature,
            ...(params.topP && { topP: params.topP }),
            ...(params.stopSequences && { stopSequences: params.stopSequences })
          }
        };
      
      case 'ai21':
        return {
          prompt: params.prompt,
          maxTokens,
          temperature,
          ...(params.topP && { topP: params.topP }),
          ...(params.stopSequences && { stopSequences: params.stopSequences })
        };
      
      case 'cohere':
        return {
          prompt: params.prompt,
          max_tokens: maxTokens,
          temperature,
          ...(params.topP && { p: params.topP }),
          ...(params.stopSequences && { stop_sequences: params.stopSequences })
        };
      
      case 'meta':
        return {
          prompt: params.prompt,
          max_gen_len: maxTokens,
          temperature,
          ...(params.topP && { top_p: params.topP })
        };
      
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Parse response based on provider
   */
  private parseResponse(provider: BedrockProvider, response: any): {
    text: string;
    stopReason?: string;
    inputTokens?: number;
    outputTokens?: number;
  } {
    switch (provider) {
      case 'anthropic':
        return {
          text: response.completion,
          stopReason: response.stop_reason,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens
        };
      
      case 'amazon':
        return {
          text: response.results?.[0]?.outputText || '',
          inputTokens: response.inputTextTokenCount,
          outputTokens: response.results?.[0]?.tokenCount
        };
      
      case 'ai21':
        return {
          text: response.completions?.[0]?.data?.text || '',
          stopReason: response.completions?.[0]?.finishReason?.reason
        };
      
      case 'cohere':
        return {
          text: response.generations?.[0]?.text || '',
          stopReason: response.generations?.[0]?.finish_reason
        };
      
      case 'meta':
        return {
          text: response.generation || '',
          stopReason: response.stop_reason,
          inputTokens: response.prompt_token_count,
          outputTokens: response.generation_token_count
        };
      
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Extract text from streaming chunk
   */
  private extractTextFromChunk(provider: BedrockProvider, chunk: any): string {
    switch (provider) {
      case 'anthropic':
        return chunk.completion || '';
      case 'amazon':
        return chunk.outputText || '';
      case 'ai21':
        return chunk.data?.text || '';
      case 'cohere':
        return chunk.text || '';
      case 'meta':
        return chunk.generation || '';
      default:
        return '';
    }
  }

  /**
   * Calculate cost based on token usage and model pricing
   */
  private calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const pricing = BEDROCK_PRICING[modelId as keyof typeof BEDROCK_PRICING];
    if (!pricing) {
      return 0;
    }
    
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get metadata from all components
   */
  protected getComponentMetadata(): Record<string, any> {
    const metadata: Record<string, any> = {};

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
