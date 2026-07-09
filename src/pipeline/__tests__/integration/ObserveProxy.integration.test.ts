/**
 * Integration Tests — ObserveProxy Delegation
 *
 * Verifies that the ExecutionStage correctly delegates to the ObserveProxy
 * and that cost tracking and audit logging data are retained through the
 * full pipeline flow.
 *
 * @requirements 3.1, 3.2, 3.3
 */

import { DefensePipeline } from '../../DefensePipeline';
import { ExecutionStage } from '../../ExecutionStage';
import type { PipelineConfig, PipelineRequest } from '../../types';
import type { ObserveProxy, CostSummary } from '../../../observe/types';
import type { TealModule, ModuleResult } from '../../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

function makeCostSummary(overrides: Partial<CostSummary> = {}): CostSummary {
  return {
    totalCost: 0,
    requestCount: 0,
    hasPricingGaps: false,
    breakdown: { inputCost: 0, outputCost: 0, imageCost: 0, audioCost: 0 },
    ...overrides,
  };
}

/**
 * Create a mock ObserveProxy that simulates cost tracking behavior.
 * Each call increments the totalCost by the specified amount.
 */
function createMockObserveProxy(options: {
  response?: any;
  costPerCall?: number;
  error?: Error;
} = {}): ObserveProxy<any> & { callCount: number; auditEvents: any[] } {
  const {
    response = {
      model: 'gpt-4',
      choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
      usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
    },
    costPerCall = 0.003,
    error,
  } = options;

  let totalCost = 0;
  let requestCount = 0;
  const auditEvents: any[] = [];

  const proxy: any = {
    callCount: 0,
    auditEvents,
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          if (error) throw error;
          proxy.callCount++;
          requestCount++;
          totalCost += costPerCall;
          auditEvents.push({
            type: 'llm_call',
            model: response.model,
            timestamp: Date.now(),
            cost: costPerCall,
          });
          return response;
        }),
      },
    },
    getCost: jest.fn().mockImplementation(() =>
      makeCostSummary({ totalCost, requestCount }),
    ),
    getAgentCost: jest.fn().mockImplementation(() =>
      makeCostSummary({ totalCost, requestCount }),
    ),
    getBaseline: jest.fn().mockReturnValue(null),
    getAgentId: jest.fn().mockReturnValue('agent-integration-test'),
    getSessionId: jest.fn().mockReturnValue('session-integration-test'),
    getDecisions: jest.fn().mockReturnValue([]),
  };

  return proxy;
}

/** A module that always ALLOWs (pass-through). */
class AllowModule implements TealModule {
  readonly name = 'AllowModule';
  readonly version = '1.0.0';
  async evaluate(): Promise<ModuleResult> {
    return { action: 'ALLOW' as any, reason_codes: [], event_type: 'test.allow' };
  }
}

/** A module that always DENYs. */
class DenyModule implements TealModule {
  readonly name = 'DenyModule';
  readonly version = '1.0.0';
  async evaluate(): Promise<ModuleResult> {
    return { action: 'DENY' as any, reason_codes: ['FORCED_DENY'], event_type: 'test.deny' };
  }
}

function makeRequest(content: string = 'Hello, world!'): PipelineRequest {
  return {
    payload: {
      model: 'gpt-4',
      messages: [{ role: 'user', content }],
    },
    correlation_id: 'integration-test-corr-id',
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('ObserveProxy Integration', () => {
  describe('ExecutionStage delegates to ObserveProxy', () => {
    it('should call the provider through the ObserveProxy', async () => {
      const proxy = createMockObserveProxy();
      const stage = new ExecutionStage(proxy);
      const request = makeRequest();

      const result = await stage.execute(request);

      expect(result.success).toBe(true);
      expect(proxy.callCount).toBe(1);
      expect(proxy.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should pass the request payload to the provider', async () => {
      const proxy = createMockObserveProxy();
      const stage = new ExecutionStage(proxy);
      const request = makeRequest('Tell me about security');

      await stage.execute(request);

      expect(proxy.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Tell me about security' }],
        }),
      );
    });

    it('should return the full response from the provider', async () => {
      const expectedResponse = {
        model: 'gpt-4',
        choices: [{ message: { role: 'assistant', content: 'I am GPT-4.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      const proxy = createMockObserveProxy({ response: expectedResponse });
      const stage = new ExecutionStage(proxy);

      const result = await stage.execute(makeRequest());

      expect(result.response).toEqual(expectedResponse);
    });
  });

  describe('Cost tracking through the pipeline', () => {
    it('should track cost delta from before to after provider call', async () => {
      const proxy = createMockObserveProxy({ costPerCall: 0.005 });
      const config: PipelineConfig = {
        preExecutionModules: [new AllowModule()],
        postExecutionModules: [new AllowModule()],
        observeProxy: proxy,
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeRequest());

      // The pipeline should complete and the proxy should have tracked the cost
      expect(result.allowed).toBe(true);
      expect(proxy.getCost).toHaveBeenCalled();
      // Cost should reflect the provider call
      const costSummary = proxy.getCost();
      expect(costSummary.totalCost).toBeGreaterThan(0);
    });

    it('should reflect correct cost when multiple resamples occur', async () => {
      // Post-execution module denies first 2 calls, allows the 3rd
      let callCount = 0;
      const proxy = createMockObserveProxy({ costPerCall: 0.002 });

      const conditionalPostModule: TealModule = {
        name: 'ConditionalDenyModule',
        version: '1.0.0',
        async evaluate(): Promise<ModuleResult> {
          callCount++;
          if (callCount <= 2) {
            return {
              action: 'DENY' as any,
              reason_codes: ['CONTENT_VIOLATION'],
              event_type: 'test.deny',
              metadata: { remediation: 'resample' },
            };
          }
          return { action: 'ALLOW' as any, reason_codes: [], event_type: 'test.allow' };
        },
      };

      const config: PipelineConfig = {
        preExecutionModules: [new AllowModule()],
        postExecutionModules: [conditionalPostModule],
        observeProxy: proxy,
        resample_budget: 3,
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeRequest());

      // Should have called provider 3 times (initial + 2 resamples)
      expect(proxy.callCount).toBe(3);
      // Cost accumulates across all calls
      const costSummary = proxy.getCost();
      expect(costSummary.totalCost).toBeCloseTo(0.006, 5);
      expect(result.allowed).toBe(true);
      expect(result.resample_count).toBe(2);
    });

    it('should not incur cost when request is blocked pre-execution', async () => {
      const proxy = createMockObserveProxy({ costPerCall: 0.005 });
      const config: PipelineConfig = {
        preExecutionModules: [new DenyModule()],
        postExecutionModules: [new AllowModule()],
        observeProxy: proxy,
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeRequest());

      expect(result.allowed).toBe(false);
      expect(proxy.callCount).toBe(0);
      // No cost incurred since provider was never called
      const costSummary = proxy.getCost();
      expect(costSummary.totalCost).toBe(0);
    });
  });

  describe('Audit logging data accessibility', () => {
    it('should produce audit events through the ObserveProxy', async () => {
      const proxy = createMockObserveProxy();
      const config: PipelineConfig = {
        preExecutionModules: [new AllowModule()],
        postExecutionModules: [new AllowModule()],
        observeProxy: proxy,
      };
      const pipeline = new DefensePipeline(config);

      await pipeline.execute(makeRequest());

      // The proxy should have recorded an audit event
      expect(proxy.auditEvents.length).toBe(1);
      expect(proxy.auditEvents[0]).toMatchObject({
        type: 'llm_call',
        model: 'gpt-4',
        cost: 0.003,
      });
    });

    it('should expose execution metadata including model and usage', async () => {
      const response = {
        model: 'claude-3-opus',
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      };
      const proxy = createMockObserveProxy({ response });
      const stage = new ExecutionStage(proxy);

      const result = await stage.execute(makeRequest());

      expect(result.metadata).toMatchObject({
        model: 'claude-3-opus',
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          total_tokens: 300,
        },
      });
      expect(result.metadata!.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should retain agent and session IDs through the proxy', async () => {
      const proxy = createMockObserveProxy();

      expect(proxy.getAgentId()).toBe('agent-integration-test');
      expect(proxy.getSessionId()).toBe('session-integration-test');
    });

    it('should record multiple audit events for resampled requests', async () => {
      let callCount = 0;
      const proxy = createMockObserveProxy();

      const denyThenAllowModule: TealModule = {
        name: 'DenyThenAllow',
        version: '1.0.0',
        async evaluate(): Promise<ModuleResult> {
          callCount++;
          if (callCount === 1) {
            return {
              action: 'DENY' as any,
              reason_codes: ['TOXIC'],
              event_type: 'test.deny',
              metadata: { remediation: 'resample' },
            };
          }
          return { action: 'ALLOW' as any, reason_codes: [], event_type: 'test.allow' };
        },
      };

      const config: PipelineConfig = {
        preExecutionModules: [new AllowModule()],
        postExecutionModules: [denyThenAllowModule],
        observeProxy: proxy,
        resample_budget: 2,
      };
      const pipeline = new DefensePipeline(config);

      await pipeline.execute(makeRequest());

      // Two provider calls = two audit events
      expect(proxy.auditEvents.length).toBe(2);
    });
  });

  describe('Error handling through ObserveProxy', () => {
    it('should handle provider errors gracefully', async () => {
      const providerError = new Error('Service unavailable');
      const proxy = createMockObserveProxy({ error: providerError });
      const config: PipelineConfig = {
        preExecutionModules: [new AllowModule()],
        postExecutionModules: [new AllowModule()],
        observeProxy: proxy,
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeRequest());

      expect(result.allowed).toBe(false);
      expect(result.provider_error).toBe(true);
      expect(result.response).toBeNull();
    });
  });
});
