/**
 * TealTiger SDK - DeepSeek Provider
 *
 * Guarded client for DeepSeek's reasoning and coding models.
 * Implements the same governance pipeline wrapping as existing providers.
 *
 * @module providers/deepseek
 * @requirements 13.2, 13.6, 13.7
 */

import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';
import { ExecutionContext } from '../core/context/ExecutionContext';
import { ContextManager } from '../core/context/ContextManager';
import { postProviderJson } from './http';

// ── DeepSeek-Specific Pricing ────────────────────────────────────

/**
 * DeepSeek model pricing (cost per 1K tokens in USD).
 * DeepSeek offers competitive pricing for reasoning and coding models.
 */
export const DEEPSEEK_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.00219 },
  'deepseek-coder': { input: 0.00014, output: 0.00028 },
};

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration for the DeepSeek guarded client.
 */
export interface DeepSeekConfig {
  /** DeepSeek API key */
  apiKey: string;
  /** Optional: Custom base URL for DeepSeek API */
  baseUrl?: string;
  /** Optional: Default model to use */
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
 * Chat completion request for DeepSeek.
 */
export interface DeepSeekChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
  }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  /** Optional: Execution context for tracing */
  context?: ExecutionContext;
}

/**
 * Chat completion response from DeepSeek.
 */
export interface DeepSeekChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
  /** TealTiger security metadata */
  security?: {
    guardrailResult?: GuardrailEngineResult;
    costRecord?: CostRecord;
    budgetCheck?: BudgetEnforcementResult;
  };
}

// ── Guarded Client ───────────────────────────────────────────────

/**
 * TealDeepSeek — Guarded client for DeepSeek with integrated governance pipeline.
 *
 * Wraps DeepSeek API calls with:
 * - Input/output guardrails (TealGuard)
 * - Cost tracking and budget enforcement
 * - Audit logging via correlation IDs
 */
export class TealDeepSeek {
  private config: DeepSeekConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: DeepSeekConfig) {
    this.config = {
      enableGuardrails: true,
      enableCostTracking: true,
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      ...config,
    };

    this.guardrailEngine = config.guardrailEngine;
    this.costTracker = config.costTracker;
    this.budgetManager = config.budgetManager;
    this.costStorage = config.costStorage;
  }

  /**
   * Chat completions API (OpenAI-compatible interface).
   */
  get chat() {
    return {
      completions: {
        create: this.createChatCompletion.bind(this),
      },
    };
  }

  /**
   * Create a chat completion with governance pipeline wrapping.
   */
  private async createChatCompletion(
    request: DeepSeekChatCompletionRequest
  ): Promise<DeepSeekChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: DeepSeekChatCompletionResponse['security'] = {};
    const executionContext = request.context || ContextManager.createContext();

    try {
      // 1. Run input guardrails
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const userMessages = request.messages
          .filter(m => m.role === 'user')
          .map(m => m.content)
          .join('\n');

        const guardrailResult = await this.guardrailEngine.execute(userMessages, {
          correlation_id: executionContext.correlation_id,
        });
        security.guardrailResult = guardrailResult;

        if (!guardrailResult.passed) {
          const failedGuardrails = guardrailResult.getFailedGuardrails().join(', ');
          throw new Error(
            `Guardrail check failed: ${failedGuardrails} (Risk: ${guardrailResult.maxRiskScore})`
          );
        }
      }

      // 2. Estimate cost and check budget
      if (this.config.enableCostTracking && this.costTracker) {
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
          'deepseek'
        );

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

      // 3. Make DeepSeek API call
      const response = await this.callDeepSeek(request);

      // 4. Run output guardrails
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const assistantMessage = response.choices[0]?.message?.content || '';
        const outputGuardrailResult = await this.guardrailEngine.execute(assistantMessage);

        if (!outputGuardrailResult.passed) {
          const failedGuardrails = outputGuardrailResult.getFailedGuardrails().join(', ');
          throw new Error(`Output guardrail check failed: ${failedGuardrails}`);
        }
      }

      // 5. Track actual cost
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
          'deepseek'
        );

        security.costRecord = costRecord;

        if (this.costStorage) {
          await this.costStorage.store(costRecord);
        }
        if (this.budgetManager) {
          await this.budgetManager.recordCost(costRecord);
        }
      }

      return { ...response, security };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`TealDeepSeek error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call DeepSeek's OpenAI-compatible chat completions API.
   */
  private async callDeepSeek(
    request: DeepSeekChatCompletionRequest
  ): Promise<DeepSeekChatCompletionResponse> {
    const body = { ...request };
    delete body.context;
    return postProviderJson<DeepSeekChatCompletionResponse>({
      baseUrl: this.config.baseUrl!,
      apiKey: this.config.apiKey,
      path: '/chat/completions',
      body,
      providerName: 'DeepSeek',
    });
  }

  /** Get current configuration. */
  getConfig(): DeepSeekConfig {
    return { ...this.config };
  }

  /** Update configuration. */
  updateConfig(updates: Partial<DeepSeekConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Factory function to create a DeepSeek guarded client.
 */
export function createDeepSeekClient(config: DeepSeekConfig): TealDeepSeek {
  return new TealDeepSeek(config);
}
