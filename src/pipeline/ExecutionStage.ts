/**
 * Multi-Stage Defense Pipeline — Execution Stage
 *
 * Delegates LLM provider calls to the ObserveProxy, which transparently
 * handles cost tracking, audit logging, PII scanning, and behavioral baseline.
 * Extracts response metadata (model, latency, usage, cost) and handles
 * provider errors gracefully.
 *
 * @module pipeline/ExecutionStage
 * @requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { ObserveProxy } from '../observe/types';
import type { PipelineRequest, ExecutionResult, ExecutionMetadata } from './types';

/**
 * The ExecutionStage forwards requests to the LLM provider through the
 * ObserveProxy. It does NOT produce its own StageDecision — instrumentation
 * data is recorded by the ObserveProxy's existing audit and cost systems.
 *
 * The proxy is a transparent wrapper over the original provider client, so
 * calling methods on it (e.g., `proxy.chat.completions.create(payload)`)
 * triggers the same instrumentation as observe() mode.
 */
export class ExecutionStage {
  constructor(private readonly observeProxy: ObserveProxy<any>) {}

  /**
   * Forward request to the LLM provider via ObserveProxy.
   * Returns the raw provider response and extracted metadata on success,
   * or error details on failure.
   *
   * The method uses the request payload to determine how to call the provider:
   * - If payload contains a `_call` field, it's used as the method path
   *   (e.g., "chat.completions.create") for dynamic dispatch.
   * - Otherwise, the entire payload is passed to `chat.completions.create`
   *   as the default OpenAI-compatible call pattern.
   */
  async execute(request: PipelineRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Get cost snapshot before the call
      const costBefore = this.observeProxy.getCost();

      // Determine call method and arguments from payload
      const response = await this.invokeProvider(request.payload);

      const latencyMs = Date.now() - startTime;

      // Extract metadata from response and cost accumulator
      const metadata = this.extractMetadata(response, latencyMs, costBefore);

      return {
        success: true,
        response,
        metadata,
      };
    } catch (error: any) {
      return {
        success: false,
        response: null,
        metadata: null,
        error: {
          message: error?.message ?? String(error),
          code: error?.code ?? error?.status ?? undefined,
        },
      };
    }
  }

  /**
   * Invoke the LLM provider through the ObserveProxy.
   *
   * Supports two dispatch modes:
   * 1. Explicit method path via `payload._call` (e.g., "chat.completions.create")
   * 2. Default: calls `proxy.chat.completions.create(payload)` for OpenAI-compatible providers
   *
   * The ObserveProxy intercepts these calls transparently, applying cost tracking,
   * audit logging, PII scanning, and behavioral baseline instrumentation.
   */
  private async invokeProvider(payload: Record<string, unknown>): Promise<any> {
    // Extract the method path and call args
    const methodPath = (payload._call as string) ?? 'chat.completions.create';
    const callArgs = payload._call ? { ...payload, _call: undefined } : payload;

    // Resolve the nested method on the proxy (e.g., "chat.completions.create" → proxy.chat.completions.create)
    const method = this.resolveMethod(this.observeProxy, methodPath);

    if (typeof method !== 'function') {
      throw new Error(
        `Unable to resolve provider method '${methodPath}' on ObserveProxy. ` +
        `Ensure the underlying provider client exposes this method.`,
      );
    }

    // Call through the proxy — ObserveProxy's interceptor handles instrumentation
    return method.call(this.observeProxy, callArgs);
  }

  /**
   * Resolve a dotted method path on an object.
   * e.g., "chat.completions.create" → obj.chat.completions.create
   */
  private resolveMethod(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Extract execution metadata from the provider response and cost data.
   *
   * Attempts to read standard OpenAI-compatible fields from the response:
   * - model: response.model
   * - usage: response.usage.{prompt_tokens, completion_tokens, total_tokens}
   * - cost: computed from the cost accumulator delta
   */
  private extractMetadata(
    response: any,
    latencyMs: number,
    costBefore: { totalCost: number; requestCount: number },
  ): ExecutionMetadata {
    // Extract model from response (OpenAI-compatible pattern)
    const model: string = response?.model ?? 'unknown';

    // Extract token usage (OpenAI-compatible response structure)
    const usage = this.extractUsage(response);

    // Compute cost delta from the ObserveProxy's cost accumulator
    const costAfter = this.observeProxy.getCost();
    const costUsd = costAfter.totalCost - costBefore.totalCost;

    return {
      model,
      latency_ms: latencyMs,
      usage,
      cost_usd: Math.max(0, costUsd),
    };
  }

  /**
   * Extract token usage from the provider response.
   * Handles the OpenAI-compatible format (prompt_tokens/completion_tokens)
   * and falls back to input_tokens/output_tokens for Anthropic-style responses.
   */
  private extractUsage(response: any): ExecutionMetadata['usage'] {
    const responseUsage = response?.usage;

    if (!responseUsage) {
      return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    }

    // OpenAI format: prompt_tokens / completion_tokens
    const inputTokens: number =
      responseUsage.prompt_tokens ??
      responseUsage.input_tokens ??
      0;

    const outputTokens: number =
      responseUsage.completion_tokens ??
      responseUsage.output_tokens ??
      0;

    const totalTokens: number =
      responseUsage.total_tokens ??
      inputTokens + outputTokens;

    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    };
  }
}
