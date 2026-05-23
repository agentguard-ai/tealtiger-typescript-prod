/**
 * TealAzureOpenAI Client
 * 
 * Drop-in replacement for Azure OpenAI client with integrated security and cost tracking
 * 
 * @deprecated Use `TealAzureOpenAI` from `tealtiger/client` (canonical integrated client).
 * The canonical client extends `TealOpenAI`/`TealBaseClient` and supports full component
 * integration (TealEngine, TealGuard, TealCircuit, TealAudit, TealMonitor).
 * Import: `import { TealAzureOpenAI } from 'tealtiger';` (resolves to canonical version).
 */

import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';

/**
 * Configuration for TealAzureOpenAI client
 */
export interface TealAzureOpenAIConfig {
  /** Azure OpenAI API key */
  apiKey: string;
  /** Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com) */
  endpoint: string;
  /** Azure OpenAI API version (e.g., 2024-02-15-preview) */
  apiVersion?: string;
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
  /** Optional: Azure AD token for authentication */
  azureADToken?: string;
}

/**
 * Chat completion request parameters (Azure OpenAI format)
 */
export interface AzureChatCompletionRequest {
  /** Deployment name (not model name in Azure) */
  deployment: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'function';
    content: string;
    name?: string;
  }>;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
}

/**
 * Chat completion response (Azure OpenAI format)
 */
export interface AzureChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** TealTiger security metadata */
  security?: {
    guardrailResult?: GuardrailEngineResult;
    costRecord?: CostRecord;
    budgetCheck?: BudgetEnforcementResult;
  };
}

/**
 * TealAzureOpenAI client - drop-in replacement for Azure OpenAI with security
 */
export class TealAzureOpenAI {
  private config: TealAzureOpenAIConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: TealAzureOpenAIConfig) {
    this.config = {
      apiVersion: '2024-02-15-preview',
      enableGuardrails: true,
      enableCostTracking: true,
      ...config,
    };

    // Initialize components
    this.guardrailEngine = config.guardrailEngine;
    this.costTracker = config.costTracker;
    this.budgetManager = config.budgetManager;
    this.costStorage = config.costStorage;
  }

  /**
   * Chat completions API
   */
  get chat() {
    return {
      completions: {
        create: this.createChatCompletion.bind(this),
      },
    };
  }

  /**
   * Deployments API (Azure-specific)
   */
  get deployments() {
    return {
      chat: {
        completions: {
          create: this.createChatCompletion.bind(this),
        },
      },
    };
  }

  /**
   * Create a chat completion with security and cost tracking
   */
  private async createChatCompletion(
    request: AzureChatCompletionRequest
  ): Promise<AzureChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: AzureChatCompletionResponse['security'] = {};

    try {
      // 1. Run guardrails on input (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const userMessages = request.messages
          .filter(m => m.role === 'user')
          .map(m => m.content)
          .join('\n');

        const guardrailResult = await this.guardrailEngine.execute(userMessages);
        security.guardrailResult = guardrailResult;

        if (!guardrailResult.passed) {
          const failedGuardrails = guardrailResult.getFailedGuardrails().join(', ');
          throw new Error(
            `Guardrail check failed: ${failedGuardrails} (Risk: ${guardrailResult.maxRiskScore})`
          );
        }
      }

      // 2. Estimate cost and check budget (if enabled)
      if (this.config.enableCostTracking && this.costTracker) {
        // Estimate tokens (rough approximation: 4 chars = 1 token)
        const inputText = request.messages.map(m => m.content).join('\n');
        const estimatedInputTokens = Math.ceil(inputText.length / 4);
        const estimatedOutputTokens = request.max_tokens || 500;

        // Map deployment to model for pricing
        const model = this.mapDeploymentToModel(request.deployment);

        const estimate = this.costTracker.estimateCost(
          model,
          {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          },
          'openai' // Azure uses OpenAI pricing
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

      // 3. Make actual Azure OpenAI API call
      const response = await this.callAzureOpenAI(request);

      // 4. Run guardrails on output (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const assistantMessage = response.choices[0]?.message?.content || '';
        const outputGuardrailResult = await this.guardrailEngine.execute(assistantMessage);

        if (!outputGuardrailResult.passed) {
          const failedGuardrails = outputGuardrailResult.getFailedGuardrails().join(', ');
          throw new Error(
            `Output guardrail check failed: ${failedGuardrails}`
          );
        }
      }

      // 5. Track actual cost (if enabled)
      if (this.config.enableCostTracking && this.costTracker && response.usage) {
        const model = this.mapDeploymentToModel(request.deployment);
        
        const costRecord = this.costTracker.calculateActualCost(
          requestId,
          agentId,
          model,
          {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          },
          'openai' // Azure uses OpenAI pricing
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

      // 6. Return response with security metadata
      return {
        ...response,
        security,
      };
    } catch (error) {
      // Re-throw with context
      if (error instanceof Error) {
        throw new Error(`TealAzureOpenAI error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Map Azure deployment name to OpenAI model name for pricing
   * In production, this could be configured or detected
   */
  private mapDeploymentToModel(deployment: string): string {
    // Common Azure deployment naming patterns
    const lowerDeployment = deployment.toLowerCase();
    
    if (lowerDeployment.includes('gpt-4-32k')) return 'gpt-4-32k';
    if (lowerDeployment.includes('gpt-4-turbo')) return 'gpt-4-turbo';
    if (lowerDeployment.includes('gpt-4')) return 'gpt-4';
    if (lowerDeployment.includes('gpt-35-turbo-16k') || lowerDeployment.includes('gpt-3.5-turbo-16k')) {
      return 'gpt-3.5-turbo-16k';
    }
    if (lowerDeployment.includes('gpt-35-turbo') || lowerDeployment.includes('gpt-3.5-turbo')) {
      return 'gpt-3.5-turbo';
    }
    
    // Default to gpt-3.5-turbo if unknown
    return 'gpt-3.5-turbo';
  }

  /**
   * Call Azure OpenAI API (mock implementation - would use actual Azure OpenAI SDK in production)
   */
  private async callAzureOpenAI(
    request: AzureChatCompletionRequest
  ): Promise<AzureChatCompletionResponse> {
    // In production, this would use the actual Azure OpenAI SDK
    // For now, we'll create a mock response for testing
    
    // This is a placeholder - in real implementation, you would:
    // import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
    // const client = new OpenAIClient(this.config.endpoint, new AzureKeyCredential(this.config.apiKey));
    // return await client.getChatCompletions(request.deployment, request.messages, options);

    // Mock response for testing
    const mockResponse: AzureChatCompletionResponse = {
      id: `chatcmpl-${generateId()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.deployment,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from TealAzureOpenAI.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
        total_tokens: 60,
      },
    };

    return mockResponse;
  }

  /**
   * Get configuration
   */
  getConfig(): TealAzureOpenAIConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TealAzureOpenAIConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a TealAzureOpenAI client
 * @deprecated Use `new TealAzureOpenAI(config)` from `tealtiger/client` (canonical integrated client).
 */
export function createTealAzureOpenAI(config: TealAzureOpenAIConfig): TealAzureOpenAI {
  return new TealAzureOpenAI(config);
}
