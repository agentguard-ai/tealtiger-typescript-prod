/**
 * Unit tests for ExecutionStage
 *
 * Covers:
 * - Successful provider call delegation through ObserveProxy
 * - Response metadata extraction (model, latency, usage, cost)
 * - Provider error handling (returns ExecutionResult with error details)
 * - Custom method path dispatch via payload._call
 * - Usage extraction from OpenAI and Anthropic response formats
 *
 * @requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { ExecutionStage } from '../ExecutionStage';
import type { PipelineRequest } from '../types';
import type { ObserveProxy, CostSummary } from '../../observe/types';

// ── Test Helpers ─────────────────────────────────────────────────

function makeCostSummary(overrides: Partial<CostSummary> = {}): CostSummary {
  return {
    totalCost: 0,
    requestCount: 0,
    hasPricingGaps: false,
    sessionDurationMs: 0,
    breakdown: { inputCost: 0, outputCost: 0, imageCost: 0, audioCost: 0 },
    ...overrides,
  };
}

/**
 * Create a mock ObserveProxy that simulates an OpenAI-compatible client
 * with cost tracking.
 */
function createMockProxy(options: {
  response?: any;
  error?: Error;
  costBefore?: CostSummary;
  costAfter?: CostSummary;
  methodPath?: string;
} = {}): ObserveProxy<any> {
  const {
    response = {
      model: 'gpt-4',
      choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    },
    error,
    costBefore = makeCostSummary({ totalCost: 0, requestCount: 0 }),
    costAfter = makeCostSummary({ totalCost: 0.001, requestCount: 1 }),
    methodPath = 'chat.completions.create',
  } = options;

  let getCostCallCount = 0;
  const mockMethod = jest.fn().mockImplementation(async () => {
    if (error) throw error;
    return response;
  });

  // Build nested structure based on method path
  const parts = methodPath.split('.');
  let proxy: any = {};
  let current = proxy;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = mockMethod;

  // Attach ObserveProxy accessor methods
  proxy.getCost = jest.fn().mockImplementation(() => {
    getCostCallCount++;
    return getCostCallCount === 1 ? costBefore : costAfter;
  });
  proxy.getAgentCost = jest.fn().mockReturnValue(costAfter);
  proxy.getBaseline = jest.fn().mockReturnValue(null);
  proxy.getAgentId = jest.fn().mockReturnValue('agent-test');
  proxy.getSessionId = jest.fn().mockReturnValue('session-test');
  proxy.getDecisions = jest.fn().mockReturnValue([]);

  return proxy as ObserveProxy<any>;
}

function makeRequest(payload: Record<string, unknown> = {}): PipelineRequest {
  return {
    payload: {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      ...payload,
    },
    correlation_id: 'test-corr-id',
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('ExecutionStage', () => {
  describe('successful execution', () => {
    it('should delegate to ObserveProxy and return success result', async () => {
      const mockProxy = createMockProxy();
      const stage = new ExecutionStage(mockProxy);
      const request = makeRequest();

      const result = await stage.execute(request);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.model).toBe('gpt-4');
      expect(result.error).toBeUndefined();
    });

    it('should extract model from response', async () => {
      const mockProxy = createMockProxy({
        response: {
          model: 'claude-3-opus',
          usage: { input_tokens: 5, output_tokens: 15 },
        },
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.model).toBe('claude-3-opus');
    });

    it('should measure latency in milliseconds', async () => {
      const mockProxy = createMockProxy();
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.latency_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata?.latency_ms).toBe('number');
    });

    it('should extract OpenAI-format token usage', async () => {
      const mockProxy = createMockProxy({
        response: {
          model: 'gpt-4',
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        },
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.usage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });
    });

    it('should extract Anthropic-format token usage', async () => {
      const mockProxy = createMockProxy({
        response: {
          model: 'claude-3-opus',
          usage: { input_tokens: 80, output_tokens: 40 },
        },
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.usage).toEqual({
        input_tokens: 80,
        output_tokens: 40,
        total_tokens: 120,
      });
    });

    it('should compute cost from ObserveProxy cost delta', async () => {
      const mockProxy = createMockProxy({
        costBefore: makeCostSummary({ totalCost: 0.005 }),
        costAfter: makeCostSummary({ totalCost: 0.008 }),
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.cost_usd).toBeCloseTo(0.003, 5);
    });

    it('should default usage to zeros when response has no usage field', async () => {
      const mockProxy = createMockProxy({
        response: { model: 'gpt-4', choices: [] },
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.usage).toEqual({
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      });
    });

    it('should default model to "unknown" when response has no model field', async () => {
      const mockProxy = createMockProxy({
        response: { choices: [], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } },
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.model).toBe('unknown');
    });
  });

  describe('custom method dispatch', () => {
    it('should use payload._call as the method path when provided', async () => {
      const mockMethod = jest.fn().mockResolvedValue({
        model: 'gpt-4',
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });
      const proxy: any = {
        completions: { create: mockMethod },
        getCost: jest.fn()
          .mockReturnValueOnce(makeCostSummary())
          .mockReturnValueOnce(makeCostSummary({ totalCost: 0.001 })),
        getAgentCost: jest.fn().mockReturnValue(makeCostSummary()),
        getBaseline: jest.fn().mockReturnValue(null),
        getAgentId: jest.fn().mockReturnValue('agent-test'),
        getSessionId: jest.fn().mockReturnValue('session-test'),
        getDecisions: jest.fn().mockReturnValue([]),
      };

      const stage = new ExecutionStage(proxy as ObserveProxy<any>);
      const request = makeRequest({ _call: 'completions.create', prompt: 'Hello' });

      const result = await stage.execute(request);

      expect(result.success).toBe(true);
      expect(mockMethod).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Hello', _call: undefined }),
      );
    });
  });

  describe('error handling', () => {
    it('should return failure result when provider throws', async () => {
      const providerError = new Error('Rate limit exceeded');
      (providerError as any).code = '429';
      const mockProxy = createMockProxy({ error: providerError });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.success).toBe(false);
      expect(result.response).toBeNull();
      expect(result.metadata).toBeNull();
      expect(result.error).toEqual({
        message: 'Rate limit exceeded',
        code: '429',
      });
    });

    it('should handle errors without code property', async () => {
      const mockProxy = createMockProxy({ error: new Error('Network failure') });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Network failure');
      expect(result.error?.code).toBeUndefined();
    });

    it('should handle non-Error thrown values', async () => {
      const mockMethod = jest.fn().mockRejectedValue('string error');
      const proxy: any = {
        chat: { completions: { create: mockMethod } },
        getCost: jest.fn().mockReturnValue(makeCostSummary()),
        getAgentCost: jest.fn().mockReturnValue(makeCostSummary()),
        getBaseline: jest.fn().mockReturnValue(null),
        getAgentId: jest.fn().mockReturnValue('agent-test'),
        getSessionId: jest.fn().mockReturnValue('session-test'),
        getDecisions: jest.fn().mockReturnValue([]),
      };
      const stage = new ExecutionStage(proxy as ObserveProxy<any>);

      const result = await stage.execute(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('string error');
    });

    it('should throw when method path cannot be resolved', async () => {
      const proxy: any = {
        getCost: jest.fn().mockReturnValue(makeCostSummary()),
        getAgentCost: jest.fn().mockReturnValue(makeCostSummary()),
        getBaseline: jest.fn().mockReturnValue(null),
        getAgentId: jest.fn().mockReturnValue('agent-test'),
        getSessionId: jest.fn().mockReturnValue('session-test'),
        getDecisions: jest.fn().mockReturnValue([]),
      };
      const stage = new ExecutionStage(proxy as ObserveProxy<any>);

      const result = await stage.execute(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unable to resolve provider method');
    });

    it('should handle provider error with status property as code', async () => {
      const providerError = new Error('Service unavailable');
      (providerError as any).status = 503;
      const mockProxy = createMockProxy({ error: providerError });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(503);
    });
  });

  describe('ObserveProxy integration', () => {
    it('should call getCost() before and after provider call to compute delta', async () => {
      const mockProxy = createMockProxy();
      const stage = new ExecutionStage(mockProxy);

      await stage.execute(makeRequest());

      // getCost is called twice: before and after the provider call
      expect(mockProxy.getCost).toHaveBeenCalledTimes(2);
    });

    it('should never return negative cost', async () => {
      // Edge case: cost accumulator might reset between calls
      const mockProxy = createMockProxy({
        costBefore: makeCostSummary({ totalCost: 0.01 }),
        costAfter: makeCostSummary({ totalCost: 0.005 }),
      });
      const stage = new ExecutionStage(mockProxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata?.cost_usd).toBe(0);
    });
  });
});
