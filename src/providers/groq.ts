/**
 * TealTiger SDK - Groq Provider
 *
 * Guarded client for Groq's ultra-fast inference API.
 * Implements the same governance pipeline wrapping as existing providers.
 *
 * @module providers/groq
 * @requirements 13.1, 13.6, 13.7
 */

import { GuardrailEngine, GuardrailEngineResult } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager, BudgetEnforcementResult } from '../cost/BudgetManager';
import { ICostStorage } from '../cost/CostStorage';
import { CostRecord } from '../cost/types';
import { generateId } from '../cost/utils';
import { ExecutionContext } from '../core/context/ExecutionContext';
import { ContextManager } from '../core/context/ContextManager';

// ── Groq-Specific Pricing ────────────────────────────────────────

/**
 * Groq model pricing (cost per 1K tokens in USD).
 * Groq offers extremely fast inference on custom LPU hardware.
 */
export const GROQ_PRICING: Record<string, { input: number; output: number }> = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.00008 },
  'llama-3.1-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-405b-reasoning': { input: 0.006, output: 0.006 },
  'mixtral-8x7b-32768': { input: 0.00024, output: 0.00024 },
  'gemma2-9b-it': { input: 0.00020, output: 0.00020 },
  'llama-guard-3-8b': { input: 0.00020, output: 0.00020 },
};

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration for the Groq guarded client.
 */
export interface GroqConfig {
  /** Groq API key */
  apiKey: string;
  /** Optional: Custom base URL for Groq API */
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
 * Chat completion request for Groq.
 */
export interface GroqChatCompletionRequest {
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
  /** Optional: Execution context for tracing */
  context?: ExecutionContext;
}

/**
 * Chat completion response from Groq.
 */
export interface GroqChatCompletionResponse {
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
    queue_time?: number;
    prompt_time?: number;
    completion_time?: number;
    total_time?: number;
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
 * TealGroq — Guarded client for Groq with integrated governance pipeline.
 *
 * Wraps Groq API calls with:
 * - Input/output guardrails (TealGuard)
 * - Cost tracking and budget enforcement
 * - Audit logging via correlation IDs
 */
export class TealGroq {
  private config: GroqConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: GroqConfig) {
    this.config = {
      enableGuardrails: true,
      enableCostTracking: true,
      model: 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1',
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
    request: GroqChatCompletionRequest
  ): Promise<GroqChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: GroqChatCompletionResponse['security'] = {};
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

      // 3. Make Groq API call
      const response = await this.callGroq(request);

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
        throw new Error(`TealGroq error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call Groq API.
   * In production, this would use the actual Groq SDK or fetch.
   */
  private async callGroq(
    request: GroqChatCompletionRequest
  ): Promise<GroqChatCompletionResponse> {
    // Placeholder — in production, use fetch to Groq's OpenAI-compatible endpoint
    const mockResponse: GroqChatCompletionResponse = {
      id: `chatcmpl-${generateId()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from TealGroq.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
        total_tokens: 60,
        queue_time: 0.001,
        prompt_time: 0.005,
        completion_time: 0.010,
        total_time: 0.016,
      },
    };

    return mockResponse;
  }

  /** Get current configuration. */
  getConfig(): GroqConfig {
    return { ...this.config };
  }

  /** Update configuration. */
  updateConfig(updates: Partial<GroqConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Factory function to create a Groq guarded client.
 */
export function createGroqClient(config: GroqConfig): TealGroq {
  return new TealGroq(config);
}
