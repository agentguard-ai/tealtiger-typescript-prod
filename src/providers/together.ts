/**
 * TealTiger SDK - Together AI Provider
 *
 * Guarded client for Together AI's open-source model hosting platform.
 * Implements the same governance pipeline wrapping as existing providers.
 *
 * @module providers/together
 * @requirements 13.3, 13.6, 13.7
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

// ── Together AI-Specific Pricing ─────────────────────────────────

/**
 * Together AI model pricing (cost per 1K tokens in USD).
 * Together AI hosts open-source models with per-token pricing.
 */
export const TOGETHER_PRICING: Record<string, { input: number; output: number }> = {
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': { input: 0.005, output: 0.005 },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.00088, output: 0.00088 },
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { input: 0.00018, output: 0.00018 },
  'mistralai/Mixtral-8x22B-Instruct-v0.1': { input: 0.0012, output: 0.0012 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.0006, output: 0.0006 },
  'Qwen/Qwen2.5-72B-Instruct-Turbo': { input: 0.0012, output: 0.0012 },
  'deepseek-ai/DeepSeek-R1': { input: 0.003, output: 0.007 },
  'google/gemma-2-27b-it': { input: 0.0008, output: 0.0008 },
};

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration for the Together AI guarded client.
 */
export interface TogetherConfig {
  /** Together AI API key */
  apiKey: string;
  /** Optional: Custom base URL for Together AI API */
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
 * Chat completion request for Together AI.
 */
export interface TogetherChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
  }>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  repetition_penalty?: number;
  /** Optional: Execution context for tracing */
  context?: ExecutionContext;
}

/**
 * Chat completion response from Together AI.
 */
export interface TogetherChatCompletionResponse {
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

// ── Guarded Client ───────────────────────────────────────────────

/**
 * TealTogether — Guarded client for Together AI with integrated governance pipeline.
 *
 * Wraps Together AI API calls with:
 * - Input/output guardrails (TealGuard)
 * - Cost tracking and budget enforcement
 * - Audit logging via correlation IDs
 */
export class TealTogether {
  private config: TogetherConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: TogetherConfig) {
    this.config = {
      enableGuardrails: true,
      enableCostTracking: true,
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      baseUrl: 'https://api.together.xyz/v1',
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
    request: TogetherChatCompletionRequest
  ): Promise<TogetherChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: TogetherChatCompletionResponse['security'] = {};
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
          'together'
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

      // 3. Make Together AI API call
      const response = await this.callTogether(request);

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
          'together'
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
        throw new Error(`TealTogether error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call Together AI's OpenAI-compatible chat completions API.
   */
  private async callTogether(
    request: TogetherChatCompletionRequest
  ): Promise<TogetherChatCompletionResponse> {
    const body = { ...request };
    delete body.context;
    return postProviderJson<TogetherChatCompletionResponse>({
      baseUrl: this.config.baseUrl!,
      apiKey: this.config.apiKey,
      path: '/chat/completions',
      body,
      providerName: 'Together AI',
    });
  }

  /** Get current configuration. */
  getConfig(): TogetherConfig {
    return { ...this.config };
  }

  /** Update configuration. */
  updateConfig(updates: Partial<TogetherConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Factory function to create a Together AI guarded client.
 */
export function createTogetherClient(config: TogetherConfig): TealTogether {
  return new TealTogether(config);
}
