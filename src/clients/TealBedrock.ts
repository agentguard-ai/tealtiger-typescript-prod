/**
 * TealBedrock Client
 * 
 * AWS Bedrock integration with TealTiger security and cost tracking
 * Supports multiple providers: Claude, Titan, Jurassic, Command, Llama
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';

/**
 * Bedrock pricing per 1M tokens (USD) by provider
 */
const BEDROCK_PRICING = {
  // Anthropic Claude
  'anthropic.claude-v2': { input: 8.0, output: 24.0 },
  'anthropic.claude-v2:1': { input: 8.0, output: 24.0 },
  'anthropic.claude-instant-v1': { input: 0.8, output: 2.4 },
  'anthropic.claude-3-sonnet': { input: 3.0, output: 15.0 },
  'anthropic.claude-3-haiku': { input: 0.25, output: 1.25 },
  
  // Amazon Titan
  'amazon.titan-text-express-v1': { input: 0.2, output: 0.6 },
  'amazon.titan-text-lite-v1': { input: 0.15, output: 0.2 },
  'amazon.titan-embed-text-v1': { input: 0.1, output: 0.0 },
  
  // AI21 Jurassic
  'ai21.j2-ultra-v1': { input: 15.0, output: 15.0 },
  'ai21.j2-mid-v1': { input: 12.5, output: 12.5 },
  
  // Cohere Command
  'cohere.command-text-v14': { input: 1.5, output: 2.0 },
  'cohere.command-light-text-v14': { input: 0.3, output: 0.6 },
  
  // Meta Llama
  'meta.llama2-13b-chat-v1': { input: 0.75, output: 1.0 },
  'meta.llama2-70b-chat-v1': { input: 1.95, output: 2.56 },
};

/**
 * Configuration for TealBedrock client
 */
export interface TealBedrockConfig {
  /** AWS region */
  region?: string;
  /** AWS credentials */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
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
}

/**
 * Bedrock invoke model parameters
 */
export interface InvokeModelParams {
  /** Model ID to invoke */
  modelId?: string;
  /** Request body (provider-specific format) */
  body: any;
  /** Content type */
  contentType?: string;
  /** Accept type */
  accept?: string;
}

/**
 * Bedrock invoke model response
 */
export interface InvokeModelResponse {
  /** Response body */
  body: any;
  /** Model ID used */
  modelId: string;
  /** Usage metadata */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** TealTiger security metadata */
  security?: {
    guardrailResult?: GuardrailEngineResult;
    costRecord?: CostRecord;
    budgetCheck?: BudgetEnforcementResult;
  };
  /** Additional metadata */
  metadata?: {
    provider: string;
    region: string;
    cost?: string;
    [key: string]: any;
  };
}

/**
 * TealBedrock client - AWS Bedrock with TealTiger security
 */
export class TealBedrock {
  private config: TealBedrockConfig;
  private bedrockClient: BedrockRuntimeClient;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: TealBedrockConfig = {}) {
    this.config = {
      region: 'us-east-1',
      model: 'anthropic.claude-v2',
      enableGuardrails: true,
      enableCostTracking: true,
      ...config,
    };

    // Initialize Bedrock client
    const clientConfig: any = {};
    if (this.config.region) {
      clientConfig.region = this.config.region;
    }
    if (this.config.credentials) {
      clientConfig.credentials = this.config.credentials;
    }
    this.bedrockClient = new BedrockRuntimeClient(clientConfig);

    // Initialize TealTiger components
    this.guardrailEngine = config.guardrailEngine;
    this.costTracker = config.costTracker;
    this.budgetManager = config.budgetManager;
    this.costStorage = config.costStorage;
  }

  /**
   * Invoke a Bedrock model with security and cost tracking
   */
  async invokeModel(params: InvokeModelParams): Promise<InvokeModelResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const modelId = params.modelId || this.config.model || 'anthropic.claude-v2';
    const security: InvokeModelResponse['security'] = {};

    try {
      // 1. Extract text content for guardrails
      const inputText = this.extractInputText(modelId, params.body);

      // 2. Run guardrails on input (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine && inputText) {
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
      if (this.config.enableCostTracking && this.costTracker && inputText) {
        const estimatedInputTokens = Math.ceil(inputText.length / 4);
        const estimatedOutputTokens = this.extractMaxTokens(modelId, params.body) || 500;

        const estimate = this.costTracker.estimateCost(
          modelId,
          {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          },
          'custom'
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

      // 4. Make actual Bedrock API call
      const response = await this._invokeModel(params);

      // 5. Run guardrails on output (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const outputText = this.extractOutputText(modelId, response.body);
        if (outputText) {
          const outputGuardrailResult = await this.guardrailEngine.execute(outputText);

          if (!outputGuardrailResult.passed) {
            const failedGuardrails = outputGuardrailResult.getFailedGuardrails().join(', ');
            throw new Error(
              `Output guardrail check failed: ${failedGuardrails}`
            );
          }
        }
      }

      // 6. Track actual cost (if enabled)
      if (this.config.enableCostTracking && this.costTracker && response.usage) {
        const costRecord = this.costTracker.calculateActualCost(
          requestId,
          agentId,
          modelId,
          {
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            totalTokens: response.usage.totalTokens,
          },
          'custom'
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
        throw new Error(`TealBedrock error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Private method to call Bedrock API
   */
  private async _invokeModel(params: InvokeModelParams): Promise<InvokeModelResponse> {
    const modelId = params.modelId || this.config.model || 'anthropic.claude-v2';

    // Format request body based on provider
    const requestBody = JSON.stringify(params.body);

    const command = new InvokeModelCommand({
      modelId,
      body: requestBody,
      contentType: params.contentType || 'application/json',
      accept: params.accept || 'application/json',
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Parse usage based on provider
    const usage = this.extractUsage(modelId, responseBody);

    // Calculate cost
    const cost = usage ? this.calculateCost(modelId, usage) : 0;

    return {
      body: responseBody,
      modelId,
      usage,
      metadata: {
        provider: 'bedrock',
        region: this.config.region || 'us-east-1',
        cost: cost.toFixed(6),
      },
    };
  }

  /**
   * Extract input text from request body based on provider
   */
  private extractInputText(modelId: string, body: any): string | null {
    if (modelId.startsWith('anthropic.claude')) {
      return body.prompt || body.messages?.map((m: any) => m.content).join('\n') || null;
    } else if (modelId.startsWith('amazon.titan')) {
      return body.inputText || null;
    } else if (modelId.startsWith('ai21.j2')) {
      return body.prompt || null;
    } else if (modelId.startsWith('cohere.command')) {
      return body.prompt || null;
    } else if (modelId.startsWith('meta.llama')) {
      return body.prompt || null;
    }
    return null;
  }

  /**
   * Extract output text from response body based on provider
   */
  private extractOutputText(modelId: string, body: any): string | null {
    if (modelId.startsWith('anthropic.claude')) {
      return body.completion || body.content?.[0]?.text || null;
    } else if (modelId.startsWith('amazon.titan')) {
      return body.results?.[0]?.outputText || null;
    } else if (modelId.startsWith('ai21.j2')) {
      return body.completions?.[0]?.data?.text || null;
    } else if (modelId.startsWith('cohere.command')) {
      return body.generations?.[0]?.text || null;
    } else if (modelId.startsWith('meta.llama')) {
      return body.generation || null;
    }
    return null;
  }

  /**
   * Extract max tokens from request body based on provider
   */
  private extractMaxTokens(modelId: string, body: any): number | null {
    if (modelId.startsWith('anthropic.claude')) {
      return body.max_tokens_to_sample || body.max_tokens || null;
    } else if (modelId.startsWith('amazon.titan')) {
      return body.textGenerationConfig?.maxTokenCount || null;
    } else if (modelId.startsWith('ai21.j2')) {
      return body.maxTokens || null;
    } else if (modelId.startsWith('cohere.command')) {
      return body.max_tokens || null;
    } else if (modelId.startsWith('meta.llama')) {
      return body.max_gen_len || null;
    }
    return null;
  }

  /**
   * Extract usage metadata from response based on provider
   */
  private extractUsage(modelId: string, body: any): { inputTokens: number; outputTokens: number; totalTokens: number } {
    let inputTokens = 0;
    let outputTokens = 0;

    if (modelId.startsWith('anthropic.claude')) {
      // Claude returns usage in the response
      inputTokens = body.usage?.input_tokens || 0;
      outputTokens = body.usage?.output_tokens || 0;
    } else if (modelId.startsWith('amazon.titan')) {
      inputTokens = body.inputTextTokenCount || 0;
      outputTokens = body.results?.[0]?.tokenCount || 0;
    } else if (modelId.startsWith('ai21.j2')) {
      // Jurassic doesn't always return token counts, estimate from text
      const outputText = body.completions?.[0]?.data?.text || '';
      outputTokens = Math.ceil(outputText.length / 4);
    } else if (modelId.startsWith('cohere.command')) {
      // Cohere returns token counts
      inputTokens = body.meta?.billed_units?.input_tokens || 0;
      outputTokens = body.meta?.billed_units?.output_tokens || 0;
    } else if (modelId.startsWith('meta.llama')) {
      // Llama returns token counts
      inputTokens = body.prompt_token_count || 0;
      outputTokens = body.generation_token_count || 0;
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Calculate cost based on Bedrock pricing
   */
  private calculateCost(
    modelId: string,
    usage: { inputTokens: number; outputTokens: number }
  ): number {
    const pricing = BEDROCK_PRICING[modelId as keyof typeof BEDROCK_PRICING];
    
    if (!pricing) {
      // Default pricing if model not found
      return 0;
    }

    const inputCost = (usage.inputTokens / 1000000) * pricing.input;
    const outputCost = (usage.outputTokens / 1000000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get configuration
   */
  getConfig(): TealBedrockConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TealBedrockConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Recreate client if region or credentials changed
    if (updates.region || updates.credentials) {
      const clientConfig: any = {};
      if (this.config.region) {
        clientConfig.region = this.config.region;
      }
      if (this.config.credentials) {
        clientConfig.credentials = this.config.credentials;
      }
      this.bedrockClient = new BedrockRuntimeClient(clientConfig);
    }
  }
}

/**
 * Create a TealBedrock client
 */
export function createTealBedrock(config?: TealBedrockConfig): TealBedrock {
  return new TealBedrock(config);
}
