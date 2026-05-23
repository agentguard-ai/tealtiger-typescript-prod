/**
 * TealOpenAI Client
 * 
 * Drop-in replacement for OpenAI client with integrated security and cost tracking
 * 
 * @deprecated Use `TealOpenAI` from `tealtiger/client` (canonical integrated client).
 * The canonical client extends `TealBaseClient` and supports full component integration
 * (TealEngine, TealGuard, TealCircuit, TealAudit, TealMonitor).
 * Import: `import { TealOpenAI } from 'tealtiger';` (resolves to canonical version).
 */

import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';
import { ExecutionContext } from '../core/context/ExecutionContext';
import { ContextManager } from '../core/context/ContextManager';

/**
 * Configuration for TealOpenAI client
 */
export interface TealOpenAIConfig {
  /** OpenAI API key */
  apiKey: string;
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
  /** Optional: OpenAI base URL */
  baseURL?: string;
  /** Optional: Organization ID */
  organization?: string;
}

/**
 * Chat completion request parameters
 */
export interface ChatCompletionRequest {
  model: string;
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
  /** Optional: Execution context for tracing (auto-generated if not provided) */
  context?: ExecutionContext;
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
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
 * TealOpenAI client - drop-in replacement for OpenAI with security
 */
export class TealOpenAI {
  private config: TealOpenAIConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: TealOpenAIConfig) {
    this.config = {
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
   * Create a chat completion with security and cost tracking
   */
  private async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: ChatCompletionResponse['security'] = {};

    // Ensure we have an ExecutionContext (auto-generate if not provided)
    const executionContext = request.context || ContextManager.createContext();

    try {
      // 1. Run guardrails on input (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const userMessages = request.messages
          .filter(m => m.role === 'user')
          .map(m => m.content)
          .join('\n');

        const guardrailResult = await this.guardrailEngine.execute(userMessages, {
          correlation_id: executionContext.correlation_id
        });
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

        const estimate = this.costTracker.estimateCost(
          request.model,
          {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          },
          'openai'
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
              `Budget exceeded: ${budgetCheck.blockedBy?.name} (Limit: $${budgetCheck.blockedBy?.limit})`
            );
          }
        }
      }

      // 3. Make actual OpenAI API call
      const response = await this.callOpenAI(request);

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
        const costRecord = this.costTracker.calculateActualCost(
          requestId,
          agentId,
          request.model,
          {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          },
          'openai'
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
        throw new Error(`TealOpenAI error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call OpenAI API (mock implementation - would use actual OpenAI SDK in production)
   */
  private async callOpenAI(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    // In production, this would use the actual OpenAI SDK
    // For now, we'll create a mock response for testing
    
    // This is a placeholder - in real implementation, you would:
    // import OpenAI from 'openai';
    // const openai = new OpenAI({ apiKey: this.config.apiKey });
    // return await openai.chat.completions.create(request);

    // Mock response for testing
    const mockResponse: ChatCompletionResponse = {
      id: `chatcmpl-${generateId()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from TealOpenAI.',
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
  getConfig(): TealOpenAIConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TealOpenAIConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a TealOpenAI client
 * @deprecated Use `new TealOpenAI(config)` from `tealtiger/client` (canonical integrated client).
 */
export function createTealOpenAI(config: TealOpenAIConfig): TealOpenAI {
  return new TealOpenAI(config);
}
