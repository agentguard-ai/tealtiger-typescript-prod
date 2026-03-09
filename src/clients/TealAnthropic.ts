/**
 * TealAnthropic Client
 * 
 * Drop-in replacement for Anthropic client with integrated security and cost tracking
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
 * Configuration for TealAnthropic client
 */
export interface TealAnthropicConfig {
  /** Anthropic API key */
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
  /** Optional: Anthropic base URL */
  baseURL?: string;
}

/**
 * Message content types
 */
export type MessageContent = string | Array<{
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}>;

/**
 * Message create request parameters
 */
export interface MessageCreateRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: MessageContent;
  }>;
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: {
    user_id?: string;
  };
  /** Optional: Execution context for tracing (auto-generated if not provided) */
  context?: ExecutionContext;
}

/**
 * Message create response
 */
export interface MessageCreateResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  /** TealTiger security metadata */
  security?: {
    guardrailResult?: GuardrailEngineResult;
    costRecord?: CostRecord;
    budgetCheck?: BudgetEnforcementResult;
  };
}

/**
 * TealAnthropic client - drop-in replacement for Anthropic with security
 */
export class TealAnthropic {
  private config: TealAnthropicConfig;
  private guardrailEngine: GuardrailEngine | undefined;
  private costTracker: CostTracker | undefined;
  private budgetManager: BudgetManager | undefined;
  private costStorage: ICostStorage | undefined;

  constructor(config: TealAnthropicConfig) {
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
   * Messages API
   */
  get messages() {
    return {
      create: this.createMessage.bind(this),
    };
  }

  /**
   * Create a message with security and cost tracking
   */
  private async createMessage(
    request: MessageCreateRequest
  ): Promise<MessageCreateResponse> {
    const requestId = generateId();
    const agentId = this.config.agentId || 'default-agent';
    const security: MessageCreateResponse['security'] = {};

    // Ensure we have an ExecutionContext (auto-generate if not provided)
    const executionContext = request.context || ContextManager.createContext();

    try {
      // 1. Run guardrails on input (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const userMessages = request.messages
          .filter(m => m.role === 'user')
          .map(m => this.extractTextContent(m.content))
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
        const inputText = request.messages
          .map(m => this.extractTextContent(m.content))
          .join('\n');
        const systemText = request.system || '';
        const estimatedInputTokens = Math.ceil((inputText.length + systemText.length) / 4);
        const estimatedOutputTokens = request.max_tokens;

        const estimate = this.costTracker.estimateCost(
          request.model,
          {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          },
          'anthropic'
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

      // 3. Make actual Anthropic API call
      const response = await this.callAnthropic(request);

      // 4. Run guardrails on output (if enabled)
      if (this.config.enableGuardrails && this.guardrailEngine) {
        const assistantMessage = response.content
          .map(c => c.text)
          .join('\n');
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
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
          'anthropic'
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
        throw new Error(`TealAnthropic error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract text content from message content (handles both string and array formats)
   */
  private extractTextContent(content: MessageContent): string {
    if (typeof content === 'string') {
      return content;
    }
    
    return content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join('\n');
  }

  /**
   * Call Anthropic API (mock implementation - would use actual Anthropic SDK in production)
   */
  private async callAnthropic(
    request: MessageCreateRequest
  ): Promise<MessageCreateResponse> {
    // In production, this would use the actual Anthropic SDK
    // For now, we'll create a mock response for testing
    
    // This is a placeholder - in real implementation, you would:
    // import Anthropic from '@anthropic-ai/sdk';
    // const anthropic = new Anthropic({ apiKey: this.config.apiKey });
    // return await anthropic.messages.create(request);

    // Mock response for testing
    const mockResponse: MessageCreateResponse = {
      id: `msg-${generateId()}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is a mock response from TealAnthropic.',
        },
      ],
      model: request.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 50,
        output_tokens: 10,
      },
    };

    return mockResponse;
  }

  /**
   * Get configuration
   */
  getConfig(): TealAnthropicConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TealAnthropicConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a TealAnthropic client
 */
export function createTealAnthropic(config: TealAnthropicConfig): TealAnthropic {
  return new TealAnthropic(config);
}
