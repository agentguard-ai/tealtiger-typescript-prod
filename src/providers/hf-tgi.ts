/**
 * TealTiger SDK - Hugging Face Text Generation Inference (TGI) Provider
 *
 * Guarded client for self-hosted HF TGI endpoints.
 * Implements the same governance pipeline wrapping as existing providers.
 *
 * @module providers/hf-tgi
 * @requirements 13.4, 13.6, 13.7
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

// ── HF TGI Pricing (Self-Hosted) ────────────────────────────────

/**
 * HF TGI model pricing (cost per 1K tokens in USD).
 * Self-hosted pricing is based on compute cost amortization.
 * These are reference values; users should override with actual infra costs.
 */
export const HF_TGI_PRICING: Record<string, { input: number; output: number }> = {
  'meta-llama/Meta-Llama-3.1-70B-Instruct': { input: 0.0009, output: 0.0009 },
  'meta-llama/Meta-Llama-3.1-8B-Instruct': { input: 0.0002, output: 0.0002 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.0005, output: 0.0005 },
  'microsoft/Phi-3-medium-128k-instruct': { input: 0.0003, output: 0.0003 },
  'tiiuae/falcon-40b-instruct': { input: 0.0007, output: 0.0007 },
  'bigscience/bloom': { input: 0.001, output: 0.001 },
  // Self-hosted default: users should configure custom pricing
  'custom-model': { input: 0.0005, output: 0.0005 },
};

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration for the HF TGI guarded client.
 */
export interface HfTgiConfig {
  /** API key or token for the TGI endpoint (may be empty for local) */
  apiKey: string;
  /** Base URL for the TGI endpoint (required for self-hosted) */
  baseUrl?: string;
  /** Optional: Default model identifier */
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
  /** Optional: Custom pricing override for self-hosted models */
  customPricing?: Record<string, { input: number; output: number }>;
}

/**
 * Chat completion request for HF TGI (Messages API).
 */
export interface HfTgiChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
  repetition_penalty?: number;
  /** Optional: Execution context for tracing */
  context?: ExecutionContext;
}

/**
 * Text generation request for HF TGI (Generate API).
 */
export interface HfTgiGenerateRequest {
  inputs: string;
  parameters?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_new_tokens?: number;
    repetition_penalty?: number;
    stop?: string[];
    do_sample?: boolean;
  };
  /** Optional: Execution context for tracing */
  context?: ExecutionContext;
}

/**
 * Chat completion response from HF TGI.
 */
export interface HfTgiChatCompletionResponse {
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
 * Text generation response from HF TGI.
 */
export interface HfTgiGenerateResponse {
  generated_text: string;
  details?: {
    finish_reason: string;
    generated_tokens: number;
    prefill_tokens: number;
    seed?: number;
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
 * TealHfTgi — Guarded client for HF TGI with integrated governance pipeline.
 *
 * Wraps HF TGI API calls with:
 * - Input/output guardrails (TealGuard)
 * - Cost tracking and budget enforcement (self-hosted cost model)
 * - Audit logging via correlation IDs
 *
 * Supports both the Messages API (chat) and the Generate API (raw text).
 */
export class TealHfTgi {
  private config: HfTgiConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: HfTgiConfig) {
    this.config = {
      enableGuardrails: true,
      enableCostTracking: true,
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      baseUrl: 'http://localhost:8080',
      ...config,
    };

    this.guardrailEngine = config.guardrailEngine;
    this.costTracker = config.costTracker;
    this.budgetManager = config.budgetManager;
    this.costStorage = config.costStorage;
  }

  /**
   * Chat completions API (Messages API compatible).
   */
  get chat() {
    return {
      completions: {
        create: this.createChatCompletion.bind(this),
      },
    };
  }

  /**
   * Generate API for raw text generation.
   */
  async generate(request: HfTgiGenerateRequest): Promise<HfTgiGenerateResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: HfTgiGenerateResponse['security'] = {};
    const executionContext = request.context || ContextManager.createContext();

    try {
      // 1. Run input guardrails
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const guardrailResult = await this.guardrailEngine.execute(request.inputs, {
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
        const estimatedInputTokens = Math.ceil(request.inputs.length / 4);
        const estimatedOutputTokens = request.parameters?.max_new_tokens || 500;

        const estimate = this.costTracker.estimateCost(
          this.config.model!,
          {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          },
          'hf-tgi'
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

      // 3. Make TGI Generate API call
      const response = await this.callTgiGenerate(request);

      // 4. Run output guardrails
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const outputGuardrailResult = await this.guardrailEngine.execute(
          response.generated_text
        );

        if (!outputGuardrailResult.passed) {
          const failedGuardrails = outputGuardrailResult.getFailedGuardrails().join(', ');
          throw new Error(`Output guardrail check failed: ${failedGuardrails}`);
        }
      }

      // 5. Track actual cost
      if (this.config.enableCostTracking && this.costTracker && response.details) {
        const costRecord = this.costTracker.calculateActualCost(
          requestId,
          agentId,
          this.config.model!,
          {
            inputTokens: response.details.prefill_tokens,
            outputTokens: response.details.generated_tokens,
            totalTokens: response.details.prefill_tokens + response.details.generated_tokens,
          },
          'hf-tgi'
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
        throw new Error(`TealHfTgi error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a chat completion with governance pipeline wrapping.
   */
  private async createChatCompletion(
    request: HfTgiChatCompletionRequest
  ): Promise<HfTgiChatCompletionResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: HfTgiChatCompletionResponse['security'] = {};
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
          'hf-tgi'
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

      // 3. Make TGI Messages API call
      const response = await this.callTgiChat(request);

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
          'hf-tgi'
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
        throw new Error(`TealHfTgi error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call TGI Messages API.
   */
  private async callTgiChat(
    request: HfTgiChatCompletionRequest
  ): Promise<HfTgiChatCompletionResponse> {
    const body = { ...request };
    delete body.context;
    return postProviderJson<HfTgiChatCompletionResponse>({
      baseUrl: this.config.baseUrl!,
      apiKey: this.config.apiKey,
      path: '/v1/chat/completions',
      body,
      providerName: 'HF TGI',
    });
  }

  /**
   * Call TGI Generate API.
   */
  private async callTgiGenerate(
    request: HfTgiGenerateRequest
  ): Promise<HfTgiGenerateResponse> {
    const body = { ...request };
    delete body.context;
    return postProviderJson<HfTgiGenerateResponse>({
      baseUrl: this.config.baseUrl!,
      apiKey: this.config.apiKey,
      path: '/generate',
      body,
      providerName: 'HF TGI',
    });
  }

  /** Get current configuration. */
  getConfig(): HfTgiConfig {
    return { ...this.config };
  }

  /** Update configuration. */
  updateConfig(updates: Partial<HfTgiConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Factory function to create an HF TGI guarded client.
 */
export function createHfTgiClient(config: HfTgiConfig): TealHfTgi {
  return new TealHfTgi(config);
}
