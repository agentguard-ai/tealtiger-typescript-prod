/**
 * TealGemini Client
 * 
 * Google Gemini integration with TealTiger security and cost tracking
 * 
 * @deprecated Use `TealGemini` from `tealtiger/client` (canonical integrated client).
 * The canonical client extends `TealBaseClient` and supports full component integration
 * (TealEngine, TealGuard, TealCircuit, TealAudit, TealMonitor).
 * Import: `import { TealGemini } from 'tealtiger';` (resolves to canonical version).
 */

import { GoogleGenerativeAI, GenerateContentRequest, GenerateContentResult, Content, SafetySetting } from '@google/generative-ai';
import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';

/**
 * Gemini pricing per 1M tokens (USD)
 */
const GEMINI_PRICING = {
  'gemini-pro': {
    input: 0.50,
    output: 1.50
  },
  'gemini-pro-vision': {
    input: 0.50,
    output: 1.50
  },
  'gemini-ultra': {
    input: 7.00,
    output: 21.00
  },
  'gemini-1.5-pro': {
    input: 3.50,
    output: 10.50
  },
  'gemini-1.5-flash': {
    input: 0.35,
    output: 1.05
  }
};

/**
 * Configuration for TealGemini client
 */
export interface TealGeminiConfig {
  /** Google API key */
  apiKey: string;
  /** Default model to use */
  model?: string;
  /** Optional: Agent ID for tracking */
  agentId?: string;
  /** Optional: Enable guardrails (default: true) */
  enableGuardrails?: boolean;
  /** Optional: Enable cost tracking (default: true) */
  enableCostTracking?: boolean;
  /** Optional: Guardrail engine instance */
  guardrailEngine?: GuardrailEngine;
  /** Optional: Cost tracker instance */
  costTracker?: CostTracker;
  /** Optional: Budget manager instance */
  budgetManager?: BudgetManager;
  /** Optional: Cost storage instance */
  costStorage?: ICostStorage;
  /** Optional: Safety settings */
  safetySettings?: SafetySetting[];
  /** Optional: Generation config */
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

/**
 * Gemini generate content parameters
 */
export interface GenerateContentParams {
  /** Model to use (overrides config default) */
  model?: string;
  /** Content to generate from */
  contents: Content[];
  /** Optional: Safety settings */
  safetySettings?: SafetySetting[];
  /** Optional: Generation config */
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

/**
 * Gemini generate content response
 */
export interface GenerateContentResponse {
  /** Response text */
  text: string;
  /** Full response from Gemini */
  response: any;
  /** Usage metadata */
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  /** Model used */
  model: string;
  /** TealTiger security metadata */
  security?: {
    guardrailResult?: GuardrailEngineResult;
    costRecord?: CostRecord;
    budgetCheck?: BudgetEnforcementResult;
  };
  /** Additional metadata */
  metadata?: {
    provider: string;
    cost?: string;
    [key: string]: any;
  };
}

/**
 * TealGemini client - Google Gemini with TealTiger security
 */
export class TealGemini {
  private config: TealGeminiConfig;
  private geminiClient: GoogleGenerativeAI;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: TealGeminiConfig) {
    this.config = {
      model: 'gemini-pro',
      enableGuardrails: true,
      enableCostTracking: true,
      ...config,
    };

    // Initialize Gemini client
    this.geminiClient = new GoogleGenerativeAI(config.apiKey);

    // Initialize TealTiger components
    this.guardrailEngine = config.guardrailEngine;
    this.costTracker = config.costTracker;
    this.budgetManager = config.budgetManager;
    this.costStorage = config.costStorage;
  }

  /**
   * Generate content with security and cost tracking
   */
  async generateContent(
    params: GenerateContentParams
  ): Promise<GenerateContentResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const model = params.model || this.config.model || 'gemini-pro';
    const security: GenerateContentResponse['security'] = {};

    try {
      // 1. Extract text content for guardrails
      const inputText = this.extractContent(params.contents);

      // 2. Run guardrails on input (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const guardrailResult = await this.guardrailEngine.execute(inputText);
        security.guardrailResult = guardrailResult;

        if (!guardrailResult.passed) {
          const failedGuardrails = guardrailResult.getFailedGuardrails().join(', ');
          throw new Error(
            `Guardrail check failed: ${failedGuardrails} (Risk: ${guardrailResult.maxRiskScore})`
          );
        }
      }

      // 3. Estimate cost and check budget (if enabled)
      if (this.config.enableCostTracking && this.costTracker) {
        const estimatedInputTokens = Math.ceil(inputText.length / 4);
        const estimatedOutputTokens = params.generationConfig?.maxOutputTokens || 500;

        const estimate = this.costTracker.estimateCost(
          model,
          {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          },
          'google'
        );

        // Check budget
        if (this.budgetManager) {
          const budgetCheck = await this.budgetManager.checkBudget(
            agentId,
            estimate.estimatedCost
          );
          security.budgetCheck = budgetCheck;

          if (!budgetCheck.allowed) {
            throw new Error(
              `Budget exceeded: ${budgetCheck.blockedBy?.name} (Limit: ${budgetCheck.blockedBy?.limit})`
            );
          }
        }
      }

      // 4. Make actual Gemini API call
      const response = await this._generateContent(params);

      // 5. Run guardrails on output (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const outputGuardrailResult = await this.guardrailEngine.execute(response.text);

        if (!outputGuardrailResult.passed) {
          const failedGuardrails = outputGuardrailResult.getFailedGuardrails().join(', ');
          throw new Error(
            `Output guardrail check failed: ${failedGuardrails}`
          );
        }
      }

      // 6. Track actual cost (if enabled)
      if (this.config.enableCostTracking && this.costTracker && response.usage) {
        const costRecord = this.costTracker.calculateActualCost(
          requestId,
          agentId,
          model,
          {
            inputTokens: response.usage.promptTokenCount,
            outputTokens: response.usage.candidatesTokenCount,
            totalTokens: response.usage.totalTokenCount,
          },
          'google'
        );

        security.costRecord = costRecord;

        // Store cost record
        if (this.costStorage) {
          await this.costStorage.store(costRecord);
        }

        // Record cost with budget manager
        if (this.budgetManager) {
          await this.budgetManager.recordCost(costRecord);
        }
      }

      // 7. Return response with security metadata
      return {
        ...response,
        security,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`TealGemini error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate content with streaming
   */
  async *generateContentStream(
    params: GenerateContentParams
  ): AsyncGenerator<string, void, unknown> {
    const model = params.model || this.config.model || 'gemini-pro';
    const geminiModel = this.geminiClient.getGenerativeModel({ model });

    // Merge configs
    const safetySettings = params.safetySettings || this.config.safetySettings;
    const generationConfig = params.generationConfig || this.config.generationConfig;
    
    const request: GenerateContentRequest = {
      contents: params.contents,
      ...(safetySettings && { safetySettings }),
      ...(generationConfig && { generationConfig }),
    };

    const result = await geminiModel.generateContentStream(request);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      yield chunkText;
    }
  }

  /**
   * Private method to call Gemini API
   */
  private async _generateContent(
    params: GenerateContentParams
  ): Promise<GenerateContentResponse> {
    const model = params.model || this.config.model || 'gemini-pro';
    const geminiModel = this.geminiClient.getGenerativeModel({ model });

    // Merge configs
    const safetySettings = params.safetySettings || this.config.safetySettings;
    const generationConfig = params.generationConfig || this.config.generationConfig;
    
    const request: GenerateContentRequest = {
      contents: params.contents,
      ...(safetySettings && { safetySettings }),
      ...(generationConfig && { generationConfig }),
    };

    const result: GenerateContentResult = await geminiModel.generateContent(request);
    const response = result.response;
    const text = response.text();

    // Extract usage metadata
    const usage = response.usageMetadata ? {
      promptTokenCount: response.usageMetadata.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata.totalTokenCount || 0,
    } : {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    // Calculate cost
    const cost = this.calculateCost(model, usage);

    return {
      text,
      response,
      usage,
      model,
      metadata: {
        provider: 'google',
        cost: cost.toFixed(6),
      },
    };
  }

  /**
   * Extract text content from Gemini contents array
   */
  private extractContent(contents: GenerateContentParams['contents']): string {
    return contents
      .map(content => 
        content.parts
          .map(part => part.text || '')
          .join(' ')
      )
      .join('\n');
  }

  /**
   * Calculate cost based on Gemini pricing
   */
  private calculateCost(
    model: string,
    usage: { promptTokenCount: number; candidatesTokenCount: number }
  ): number {
    const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING['gemini-pro'];
    
    const inputCost = (usage.promptTokenCount / 1000000) * pricing.input;
    const outputCost = (usage.candidatesTokenCount / 1000000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get configuration
   */
  getConfig(): TealGeminiConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TealGeminiConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a TealGemini client
 * @deprecated Use `new TealGemini(config)` from `tealtiger/client` (canonical integrated client).
 */
export function createTealGemini(config: TealGeminiConfig): TealGemini {
  return new TealGemini(config);
}
