/**
 * TealTiger SDK - xAI (Grok) Provider
 *
 * Guarded client for xAI's Grok models.
 * Implements the same governance pipeline wrapping as existing providers.
 *
 * @module providers/xai
 * @requirements 13.5, 13.6, 13.7
 */

import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';
import { ExecutionContext } from '../core/context/ExecutionContext';
import { ContextManager } from '../core/context/ContextManager';

// ── xAI-Specific Pricing ─────────────────────────────────────────

/**
 * xAI (Grok) model pricing (cost per 1K tokens in USD).
 */
export const XAI_PRICING: Record<string, { input: number; output: number }> = {
  'grok-3': { input: 0.003, output: 0.015 },
  'grok-3-mini': { input: 0.0003, output: 0.0005 },
  'grok-2': { input: 0.002, output: 0.010 },
  'grok-2-mini': { input: 0.0002, output: 0.0004 },
  'grok-beta': { input: 0.005, output: 0.015 },
};

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration for the xAI guarded client.
 */
export interface XaiConfig {
  /** xAI API key */
  apiKey: string;
  /** Optional: Custom base URL for xAI API */
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
 * Chat completion request for xAI.
 */
export interface XaiChatCompletionRequest {
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
 * Chat completion response from xAI.
 */
export interface XaiChatCompletionResponse {
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
 * TealXai — Guarded client for xAI (Grok) with integrated governance pipeline.
 *
 * Wraps xAI API calls with:
 * - Input/output guardrails (TealGuard)
 * - Cost tracking and budget enforcement
 * - Audit logging via correlation IDs
 */
export class TealXai {
  private config: XaiConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: XaiConfig) {
    this.config = {
      enableGuardrails: true,
      enableCostTracking: true,
      model: 'grok-3',
      baseUrl: 'https://api.x.ai/v1',
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
    request: XaiChatCompletionRequest
  ): Promise<XaiChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: XaiChatCompletionResponse['security'] = {};
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
          'custom'
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

      // 3. Make xAI API call
      const response = await this.callXai(request);

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
          'custom'
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
        throw new Error(`TealXai error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call xAI API.
   * In production, this would use fetch to xAI's OpenAI-compatible endpoint.
   */
  private async callXai(
    request: XaiChatCompletionRequest
  ): Promise<XaiChatCompletionResponse> {
    const mockResponse: XaiChatCompletionResponse = {
      id: `chatcmpl-${generateId()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from TealXai.',
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

  /** Get current configuration. */
  getConfig(): XaiConfig {
    return { ...this.config };
  }

  /** Update configuration. */
  updateConfig(updates: Partial<XaiConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Factory function to create an xAI guarded client.
 */
export function createXaiClient(config: XaiConfig): TealXai {
  return new TealXai(config);
}
