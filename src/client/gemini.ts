/**
 * TealGemini - Google Gemini Client with TealTiger Integration
 * 
 * Provides secure access to Google Gemini API with:
 * - Policy enforcement (TealEngine)
 * - Content validation (TealGuard)
 * - Cost tracking (TealMonitor)
 * - Circuit breaker (TealCircuit)
 * - Audit logging (TealAudit)
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  SafetySetting
} from '@google/generative-ai';
import { TealBaseClient, TealClientConfig, RequestContext } from './base';

/**
 * Gemini pricing per 1M tokens (USD)
 * Source: https://ai.google.dev/pricing
 */
export const GEMINI_PRICING = {
  'gemini-pro': {
    input: 0.50,
    output: 1.50
  },
  'gemini-pro-vision': {
    input: 0.50,
    output: 1.50
  },
  'gemini-1.5-pro': {
    input: 3.50,
    output: 10.50
  },
  'gemini-1.5-flash': {
    input: 0.35,
    output: 1.05
  },
  'gemini-ultra': {
    input: 7.00,
    output: 21.00
  }
} as const;

/**
 * Safety settings for Gemini
 * Re-export from Google Generative AI
 */
export { SafetySetting, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

/**
 * Generation configuration
 */
export interface GenerationConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

/**
 * Parameters for generateContent
 */
export interface GenerateContentParams {
  contents: Content[];
  model?: string;
  safetySettings?: SafetySetting[];
  generationConfig?: GenerationConfig;
}

/**
 * Response from generateContent
 */
export interface GenerateContentResponse {
  text: string;
  candidates?: any[] | undefined;
  promptFeedback?: any | undefined;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  } | undefined;
  metadata?: {
    provider: string;
    model: string;
    cost: string;
    policyEvaluation?: any;
    guardrailResults?: any;
    monitoringMetrics?: any;
    circuitState?: string;
  };
}

/**
 * Configuration for TealGemini
 */
export interface TealGeminiConfig extends TealClientConfig {
  apiKey: string;
  model?: string;
  safetySettings?: SafetySetting[];
  generationConfig?: GenerationConfig;
}

/**
 * TealGemini Client
 * 
 * Integrates Google Gemini with TealTiger security and monitoring components.
 * 
 * @example
 * ```typescript
 * const client = new TealGemini({
 *   apiKey: process.env.GEMINI_API_KEY!,
 *   model: 'gemini-pro',
 *   policies: {
 *     tools: { allowed: ['*'] },
 *     identity: { allowedAgents: ['*'] }
 *   }
 * });
 * 
 * const response = await client.generateContent({
 *   contents: [{
 *     role: 'user',
 *     parts: [{ text: 'Explain quantum computing' }]
 *   }]
 * });
 * 
 * console.log(response.text);
 * console.log('Cost:', response.metadata?.cost);
 * ```
 */
export class TealGemini extends TealBaseClient {
  private geminiClient: GoogleGenerativeAI;
  private defaultModel: string;
  private defaultSafetySettings?: SafetySetting[] | undefined;
  private defaultGenerationConfig?: GenerationConfig | undefined;

  constructor(config: TealGeminiConfig) {
    super(config);
    
    this.geminiClient = new GoogleGenerativeAI(config.apiKey);
    this.defaultModel = config.model || 'gemini-pro';
    this.defaultSafetySettings = config.safetySettings;
    this.defaultGenerationConfig = config.generationConfig;
  }

  /**
   * Generate content using Gemini
   * 
   * @param params - Generation parameters
   * @returns Generated content with metadata
   * 
   * @example
   * ```typescript
   * const response = await client.generateContent({
   *   contents: [{
   *     role: 'user',
   *     parts: [{ text: 'What is machine learning?' }]
   *   }],
   *   model: 'gemini-pro'
   * });
   * ```
   */
  async generateContent(
    params: GenerateContentParams
  ): Promise<GenerateContentResponse> {
    const model = params.model || this.defaultModel;
    const content = this.extractContent(params.contents);

    const context: RequestContext = {
      agentId: this.config.agentId || 'default',
      action: 'generateContent',
      tool: 'generateContent',
      model,
      content,
      metadata: { 
        provider: 'gemini',
        params 
      }
    };

    return this.executeRequest(
      async () => this._generateContent(params),
      context
    );
  }

  /**
   * Generate content with streaming
   * 
   * @param params - Generation parameters
   * @returns Async generator for streaming responses
   * 
   * @example
   * ```typescript
   * const stream = client.generateContentStream({
   *   contents: [{
   *     role: 'user',
   *     parts: [{ text: 'Write a story' }]
   *   }]
   * });
   * 
   * for await (const chunk of stream) {
   *   process.stdout.write(chunk.text);
   * }
   * ```
   */
  async *generateContentStream(
    params: GenerateContentParams
  ): AsyncGenerator<{ text: string; done: boolean }> {
    const model = params.model || this.defaultModel;
    const geminiModel = this.getModel(model, params);
    
    const result = await geminiModel.generateContentStream({
      contents: params.contents
    });
    
    for await (const chunk of result.stream) {
      const text = chunk.text();
      yield { text, done: false };
    }
    
    yield { text: '', done: true };
  }

  /**
   * Private method to execute actual Gemini API call
   */
  private async _generateContent(
    params: GenerateContentParams
  ): Promise<GenerateContentResponse> {
    const model = params.model || this.defaultModel;
    const geminiModel = this.getModel(model, params);
    
    const result = await geminiModel.generateContent({
      contents: params.contents
    });
    const response = result.response;
    
    // Extract text from response
    const text = response.text();
    
    // Calculate cost
    const cost = this.calculateCost(response, model);
    
    return {
      text,
      candidates: response.candidates || undefined,
      promptFeedback: response.promptFeedback || undefined,
      usageMetadata: response.usageMetadata || undefined,
      metadata: {
        ...this.getComponentMetadata(),
        provider: 'gemini',
        model,
        cost: cost.toFixed(4)
      }
    };
  }

  /**
   * Get Gemini model instance with configuration
   */
  private getModel(modelName: string, params: GenerateContentParams): GenerativeModel {
    const modelParams: any = {
      model: modelName
    };

    if (params.safetySettings) {
      modelParams.safetySettings = params.safetySettings;
    } else if (this.defaultSafetySettings) {
      modelParams.safetySettings = this.defaultSafetySettings;
    }

    if (params.generationConfig) {
      modelParams.generationConfig = params.generationConfig;
    } else if (this.defaultGenerationConfig) {
      modelParams.generationConfig = this.defaultGenerationConfig;
    }

    return this.geminiClient.getGenerativeModel(modelParams);
  }

  /**
   * Extract text content from Gemini contents array
   */
  private extractContent(contents: Content[]): string {
    return contents
      .map(content => 
        content.parts
          .map(part => {
            if ('text' in part) {
              return part.text;
            }
            return '[non-text content]';
          })
          .join(' ')
      )
      .join('\n');
  }

  /**
   * Calculate cost based on token usage and model pricing
   */
  private calculateCost(response: any, model: string): number {
    const usage = response.usageMetadata;
    if (!usage) {
      return 0;
    }

    const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING['gemini-pro'];
    
    const inputCost = (usage.promptTokenCount / 1000000) * pricing.input;
    const outputCost = (usage.candidatesTokenCount / 1000000) * pricing.output;
    
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
