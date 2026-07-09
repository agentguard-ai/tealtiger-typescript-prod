/**
 * Integration Tests — v1.2 Module Composability
 *
 * Verifies that existing v1.2 TealModule implementations can be registered
 * at pipeline stages using assignStage and that they receive identical inputs
 * as when used directly with TealEngineV12.
 *
 * @requirements 8.1, 8.2, 8.4, 8.5, 8.6
 */

import { DefensePipeline } from '../../DefensePipeline';
import { assignStage } from '../../stageAdapter';
import { PipelineStage } from '../../types';
import type { PipelineConfig, PipelineRequest } from '../../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

function createMockObserveProxy(response: any = {
  model: 'gpt-4',
  choices: [{ message: { role: 'assistant', content: 'Hello from GPT-4!' } }],
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
}) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue(response),
      },
    },
    getCost: jest.fn().mockReturnValue({
      totalCost: 0.001,
      requestCount: 1,
      hasPricingGaps: false,
      breakdown: { inputCost: 0.0005, outputCost: 0.0005, imageCost: 0, audioCost: 0 },
    }),
    getAgentCost: jest.fn().mockReturnValue({
      totalCost: 0.001,
      requestCount: 1,
      hasPricingGaps: false,
      breakdown: { inputCost: 0.0005, outputCost: 0.0005, imageCost: 0, audioCost: 0 },
    }),
    getBaseline: jest.fn().mockReturnValue(null),
    getAgentId: jest.fn().mockReturnValue('test-agent'),
    getSessionId: jest.fn().mockReturnValue('test-session'),
    getDecisions: jest.fn().mockReturnValue([]),
  };
}

/**
 * A spy module that captures the arguments passed to evaluate().
 * Simulates TealSecrets behavior — looks for secret patterns in content.
 */
class SpySecretModule implements TealModule {
  readonly name = 'TealSecrets';
  readonly version = '1.2.0';
  public capturedArgs: { request: ModuleEvaluationRequest; ctx: ModuleContext; policy: unknown }[] = [];

  async evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult> {
    this.capturedArgs.push({ request, ctx, policy });

    // Simulate secret detection: if content contains "SECRET_" → DENY
    const content = request.content ?? '';
    if (content.includes('SECRET_')) {
      return {
        action: 'DENY' as any,
        reason_codes: ['SECRET_DETECTED'],
        event_type: 'secret.detection',
        findings: [{ finding_id: 'f1', type: 'api_key', category: 'credentials', confidence: 0.95, severity: 'HIGH', fingerprint: 'abc123' }],
      };
    }
    return { action: 'ALLOW' as any, reason_codes: [], event_type: 'secret.scan' };
  }
}

/**
 * A spy module simulating TealRegistry — checks model/tool allowlists.
 */
class SpyRegistryModule implements TealModule {
  readonly name = 'TealRegistry';
  readonly version = '1.2.0';
  public capturedArgs: { request: ModuleEvaluationRequest; ctx: ModuleContext; policy: unknown }[] = [];
  private readonly allowedModels: string[];

  constructor(allowedModels: string[] = ['gpt-4', 'gpt-3.5-turbo']) {
    this.allowedModels = allowedModels;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult> {
    this.capturedArgs.push({ request, ctx, policy });

    // Simulate registry check: if model not in allowlist → DENY
    const model = request.model ?? '';
    if (model && !this.allowedModels.includes(model)) {
      return {
        action: 'DENY' as any,
        reason_codes: ['MODEL_NOT_REGISTERED'],
        event_type: 'registry.check',
      };
    }
    return { action: 'ALLOW' as any, reason_codes: [], event_type: 'registry.check' };
  }
}

/**
 * A spy module simulating TealMemory at post-execution stage.
 */
class SpyMemoryModule implements TealModule {
  readonly name = 'TealMemory';
  readonly version = '1.2.0';
  public capturedArgs: { request: ModuleEvaluationRequest; ctx: ModuleContext; policy: unknown }[] = [];

  async evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult> {
    this.capturedArgs.push({ request, ctx, policy });

    // Simulate memory governance: if response contains "CLASSIFIED" → DENY_WRITE
    const content = request.content ?? '';
    if (content.includes('CLASSIFIED')) {
      return {
        action: 'DENY_WRITE' as any,
        reason_codes: ['MEMORY_CLASSIFICATION_DENIED'],
        event_type: 'memory.governance',
      };
    }
    return { action: 'ALLOW' as any, reason_codes: [], event_type: 'memory.governance' };
  }
}

function makeRequest(payload: Record<string, unknown> = {}): PipelineRequest {
  return {
    payload: {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
      content: 'Hello, how are you?',
      ...payload,
    },
    correlation_id: 'composability-test-001',
    context: {
      session_id: 'session-123',
      user_id: 'user-456',
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('v1.2 Module Composability Integration', () => {
  describe('assignStage registration at pipeline stages', () => {
    it('should accept v1.2 TealModule objects assigned with assignStage at PRE_EXECUTION', () => {
      const secretsModule = new SpySecretModule();
      const assigned = assignStage(secretsModule, PipelineStage.PRE_EXECUTION);

      const config: PipelineConfig = {
        preExecutionModules: [assigned],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };

      expect(() => new DefensePipeline(config)).not.toThrow();
    });

    it('should accept v1.2 TealModule objects assigned with assignStage at POST_EXECUTION', () => {
      const memoryModule = new SpyMemoryModule();
      const assigned = assignStage(memoryModule, PipelineStage.POST_EXECUTION);

      const config: PipelineConfig = {
        preExecutionModules: [],
        postExecutionModules: [assigned],
        observeProxy: createMockObserveProxy(),
      };

      expect(() => new DefensePipeline(config)).not.toThrow();
    });

    it('should accept multiple v1.2 modules at the same stage', () => {
      const secretsModule = assignStage(new SpySecretModule(), PipelineStage.PRE_EXECUTION);
      const registryModule = assignStage(new SpyRegistryModule(), PipelineStage.PRE_EXECUTION);

      const config: PipelineConfig = {
        preExecutionModules: [secretsModule, registryModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };

      expect(() => new DefensePipeline(config)).not.toThrow();
    });
  });

  describe('Module receives identical inputs as TealEngineV12', () => {
    it('should pass ModuleEvaluationRequest with content field to pre-execution module', async () => {
      const secretsModule = new SpySecretModule();
      const config: PipelineConfig = {
        preExecutionModules: [secretsModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest({ content: 'Check this text for secrets' });

      await pipeline.execute(request);

      expect(secretsModule.capturedArgs.length).toBe(1);
      const captured = secretsModule.capturedArgs[0];

      // Module should receive content from the payload
      expect(captured.request.content).toBe('Check this text for secrets');
    });

    it('should pass ModuleContext with correlation_id, policy_version, and teec_version', async () => {
      const secretsModule = new SpySecretModule();
      const config: PipelineConfig = {
        preExecutionModules: [secretsModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
        agent_id: 'test-agent-001',
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest();

      await pipeline.execute(request);

      const ctx = secretsModule.capturedArgs[0].ctx;
      expect(ctx.correlation_id).toBe('composability-test-001');
      expect(ctx.policy_version).toBeDefined();
      expect(ctx.teec_version).toBe('2.1');
      expect(ctx.timestamp).toBeGreaterThan(0);
      expect(ctx.agent_id).toBe('test-agent-001');
      expect(ctx.session_id).toBe('session-123');
      expect(ctx.user_id).toBe('user-456');
    });

    it('should pass model field from payload to registry module', async () => {
      const registryModule = new SpyRegistryModule(['gpt-4']);
      const config: PipelineConfig = {
        preExecutionModules: [registryModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest({ model: 'gpt-4' });

      await pipeline.execute(request);

      const captured = registryModule.capturedArgs[0];
      expect(captured.request.model).toBe('gpt-4');
    });

    it('should pass response content to post-execution modules', async () => {
      const providerResponse = {
        model: 'gpt-4',
        choices: [{ message: { content: 'This is a response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      const memoryModule = new SpyMemoryModule();
      const config: PipelineConfig = {
        preExecutionModules: [],
        postExecutionModules: [memoryModule],
        observeProxy: createMockObserveProxy(providerResponse),
      };
      const pipeline = new DefensePipeline(config);

      await pipeline.execute(makeRequest());

      expect(memoryModule.capturedArgs.length).toBe(1);
      const captured = memoryModule.capturedArgs[0];
      // Post-execution receives the serialized response as content
      expect(captured.request.content).toBeDefined();
      expect(captured.request._response).toEqual(providerResponse);
    });
  });

  describe('Pipeline correctly handles module results', () => {
    it('should block request when TealSecrets detects a secret (pre-execution DENY)', async () => {
      const secretsModule = new SpySecretModule();
      const config: PipelineConfig = {
        preExecutionModules: [secretsModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest({ content: 'My key is SECRET_KEY_12345' });

      const result = await pipeline.execute(request);

      expect(result.allowed).toBe(false);
      expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.pre_decision.action).toBe('DENY');
      expect(result.pre_decision.reason_codes).toContain('SECRET_DETECTED');
      expect(result.response).toBeNull();
    });

    it('should allow request when TealSecrets finds no secrets', async () => {
      const secretsModule = new SpySecretModule();
      const config: PipelineConfig = {
        preExecutionModules: [secretsModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest({ content: 'Normal request without secrets' });

      const result = await pipeline.execute(request);

      expect(result.allowed).toBe(true);
      expect(result.pre_decision.action).toBe('ALLOW');
    });

    it('should block unregistered models through TealRegistry', async () => {
      const registryModule = new SpyRegistryModule(['gpt-4']);
      const config: PipelineConfig = {
        preExecutionModules: [registryModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest({ model: 'unregistered-model' });

      const result = await pipeline.execute(request);

      expect(result.allowed).toBe(false);
      expect(result.pre_decision.action).toBe('DENY');
      expect(result.pre_decision.reason_codes).toContain('MODEL_NOT_REGISTERED');
    });

    it('should trigger post-execution remediation when TealMemory denies', async () => {
      // The response string-contains "CLASSIFIED" which triggers SpyMemoryModule's DENY_WRITE
      const classifiedResponse = 'CLASSIFIED information here';
      const memoryModule = new SpyMemoryModule();
      const config: PipelineConfig = {
        preExecutionModules: [],
        postExecutionModules: [memoryModule],
        observeProxy: createMockObserveProxy(classifiedResponse),
        resample_budget: 0,
      };
      const pipeline = new DefensePipeline(config);

      // Use a request without 'content' in payload to avoid overwriting post-eval content
      const request: PipelineRequest = {
        payload: { model: 'gpt-4', messages: [{ role: 'user', content: 'Tell me something' }] },
        correlation_id: 'composability-test-memory',
      };

      const result = await pipeline.execute(request);

      // DENY_WRITE has severity >= 70, so it should trigger post-execution block
      expect(result.allowed).toBe(false);
      expect(result.post_decision).not.toBeNull();
      expect(result.post_decision!.action).toBe('DENY_WRITE');
      expect(result.post_decision!.reason_codes).toContain('MEMORY_CLASSIFICATION_DENIED');
    });

    it('should merge multiple module results using MostRestrictiveWins', async () => {
      const secretsModule = new SpySecretModule(); // Will return ALLOW
      const registryModule = new SpyRegistryModule(['gpt-4']); // Will return DENY for unknown model

      const config: PipelineConfig = {
        preExecutionModules: [secretsModule, registryModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      // Secrets allows (no SECRET_ pattern), but registry denies (unknown model)
      const request = makeRequest({ model: 'unregistered-model', content: 'Clean content' });

      const result = await pipeline.execute(request);

      // MostRestrictiveWins: DENY > ALLOW → merged is DENY
      expect(result.allowed).toBe(false);
      expect(result.pre_decision.action).toBe('DENY');
      expect(result.pre_decision.reason_codes).toContain('MODEL_NOT_REGISTERED');
    });

    it('should include per-module details in StageDecision', async () => {
      const secretsModule = new SpySecretModule();
      const registryModule = new SpyRegistryModule(['gpt-4']);

      const config: PipelineConfig = {
        preExecutionModules: [secretsModule, registryModule],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);
      const request = makeRequest({ model: 'gpt-4', content: 'Normal text' });

      const result = await pipeline.execute(request);

      const moduleDetails = result.pre_decision.module_details;
      expect(moduleDetails.length).toBe(2);

      const secretsDetail = moduleDetails.find(d => d.name === 'TealSecrets');
      expect(secretsDetail).toBeDefined();
      expect(secretsDetail!.version).toBe('1.2.0');
      expect(secretsDetail!.action).toBe('ALLOW');

      const registryDetail = moduleDetails.find(d => d.name === 'TealRegistry');
      expect(registryDetail).toBeDefined();
      expect(registryDetail!.version).toBe('1.2.0');
      expect(registryDetail!.action).toBe('ALLOW');
    });
  });
});
