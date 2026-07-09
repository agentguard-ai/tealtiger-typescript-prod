/**
 * Unit tests for DefensePipeline orchestrator.
 *
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 2.5, 3.1, 4.3, 5.1, 5.5, 13.1, 13.4
 */

import { DefensePipeline } from '../DefensePipeline';
import type { PipelineConfig, PipelineRequest, PipelineHooks } from '../types';
import { PipelineStage } from '../types';
import { ModuleValidationError, PipelineConfigError } from '../errors';
import type { TealModule, ModuleResult, ModuleContext } from '../../core/engine/v1.2/types';

// ── Helpers ────────────────────────────────────────────────────────

function createMockModule(
  name: string,
  version: string,
  result: Partial<ModuleResult> = {},
): TealModule {
  return {
    name,
    version,
    evaluate: jest.fn().mockResolvedValue({
      action: 'ALLOW',
      reason_codes: [],
      event_type: 'test.evaluation',
      ...result,
    }),
  };
}

function createMockObserveProxy(response: any = { model: 'gpt-4', choices: [{ message: { content: 'Hello' } }] }) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue(response),
      },
    },
    getCost: jest.fn().mockReturnValue({ totalCost: 0.01, requestCount: 1, hasPricingGaps: false, breakdown: { inputCost: 0.005, outputCost: 0.005, imageCost: 0, audioCost: 0 } }),
    getAgentCost: jest.fn().mockReturnValue({ totalCost: 0.01, requestCount: 1, hasPricingGaps: false, breakdown: { inputCost: 0.005, outputCost: 0.005, imageCost: 0, audioCost: 0 } }),
    getBaseline: jest.fn().mockReturnValue(null),
    getAgentId: jest.fn().mockReturnValue('test-agent'),
    getSessionId: jest.fn().mockReturnValue('test-session'),
    getDecisions: jest.fn().mockReturnValue([]),
  };
}

function createBaseConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    preExecutionModules: [],
    postExecutionModules: [],
    observeProxy: createMockObserveProxy(),
    ...overrides,
  };
}

function createRequest(overrides: Partial<PipelineRequest> = {}): PipelineRequest {
  return {
    payload: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('DefensePipeline', () => {
  describe('constructor validation', () => {
    it('should construct successfully with valid config and observeProxy', () => {
      const config = createBaseConfig();
      expect(() => new DefensePipeline(config)).not.toThrow();
    });

    it('should construct successfully with providerClient instead of observeProxy', () => {
      const config = createBaseConfig({
        observeProxy: undefined,
        providerClient: { chat: { completions: { create: jest.fn() } } },
      });
      expect(() => new DefensePipeline(config)).not.toThrow();
    });

    it('should throw PipelineConfigError when neither observeProxy nor providerClient is provided', () => {
      const config: PipelineConfig = {
        preExecutionModules: [],
        postExecutionModules: [],
      };
      expect(() => new DefensePipeline(config)).toThrow(PipelineConfigError);
      expect(() => new DefensePipeline(config)).toThrow(
        'Either observeProxy or providerClient must be provided',
      );
    });

    it('should throw ModuleValidationError when a module is missing name', () => {
      const badModule = { version: '1.0', evaluate: jest.fn() } as any;
      const config = createBaseConfig({ preExecutionModules: [badModule] });
      expect(() => new DefensePipeline(config)).toThrow(ModuleValidationError);
    });

    it('should throw ModuleValidationError when a module is missing version', () => {
      const badModule = { name: 'test', evaluate: jest.fn() } as any;
      const config = createBaseConfig({ preExecutionModules: [badModule] });
      expect(() => new DefensePipeline(config)).toThrow(ModuleValidationError);
    });

    it('should throw ModuleValidationError when a module is missing evaluate', () => {
      const badModule = { name: 'test', version: '1.0' } as any;
      const config = createBaseConfig({ postExecutionModules: [badModule] });
      expect(() => new DefensePipeline(config)).toThrow(ModuleValidationError);
    });

    it('should throw ModuleValidationError with module name and missing fields', () => {
      const badModule = { name: 'broken-module', version: '1.0' } as any;
      const config = createBaseConfig({ preExecutionModules: [badModule] });
      try {
        new DefensePipeline(config);
        fail('Expected ModuleValidationError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ModuleValidationError);
        expect(err.moduleName).toBe('broken-module');
        expect(err.missingFields).toContain('evaluate');
      }
    });

    it('should accept zero modules at each stage', () => {
      const config = createBaseConfig({
        preExecutionModules: [],
        postExecutionModules: [],
      });
      expect(() => new DefensePipeline(config)).not.toThrow();
    });

    it('should validate modules in both pre and post arrays', () => {
      const goodModule = createMockModule('good', '1.0');
      const badModule = { name: '', version: '1.0', evaluate: jest.fn() } as any;
      const config = createBaseConfig({
        preExecutionModules: [goodModule],
        postExecutionModules: [badModule],
      });
      expect(() => new DefensePipeline(config)).toThrow(ModuleValidationError);
    });
  });

  describe('execute() — pre-execution ALLOW flow', () => {
    it('should return allowed result when all stages pass', async () => {
      const preModule = createMockModule('pre-mod', '1.0');
      const postModule = createMockModule('post-mod', '1.0');
      const config = createBaseConfig({
        preExecutionModules: [preModule],
        postExecutionModules: [postModule],
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(true);
      expect(result.response).not.toBeNull();
      expect(result.blocked_stage).toBeNull();
      expect(result.provider_error).toBe(false);
      expect(result.pre_decision).toBeDefined();
      expect(result.pre_decision.stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.post_decision).not.toBeNull();
      expect(result.post_decision!.stage).toBe(PipelineStage.POST_EXECUTION);
    });

    it('should auto-generate correlation_id when not provided', async () => {
      const preModule = createMockModule('pre-mod', '1.0');
      const config = createBaseConfig({ preExecutionModules: [preModule] });
      const pipeline = new DefensePipeline(config);
      await pipeline.execute(createRequest());

      // The module's evaluate should have been called with a context containing correlation_id
      const evaluateCall = (preModule.evaluate as jest.Mock).mock.calls[0];
      const ctx = evaluateCall[1] as ModuleContext;
      expect(ctx.correlation_id).toBeDefined();
      expect(ctx.correlation_id.length).toBeGreaterThan(0);
    });

    it('should use provided correlation_id when given', async () => {
      const preModule = createMockModule('pre-mod', '1.0');
      const config = createBaseConfig({ preExecutionModules: [preModule] });
      const pipeline = new DefensePipeline(config);
      await pipeline.execute(createRequest({ correlation_id: 'my-custom-id' }));

      const evaluateCall = (preModule.evaluate as jest.Mock).mock.calls[0];
      const ctx = evaluateCall[1] as ModuleContext;
      expect(ctx.correlation_id).toBe('my-custom-id');
    });

    it('should include timing metadata in result', async () => {
      const config = createBaseConfig();
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.timing).toBeDefined();
      expect(result.timing.pipeline_entry).toBeGreaterThan(0);
      expect(result.timing.pre_execution_start).toBeGreaterThanOrEqual(result.timing.pipeline_entry);
      expect(result.timing.pre_execution_end).toBeGreaterThanOrEqual(result.timing.pre_execution_start);
      expect(result.timing.execution_start).toBeGreaterThanOrEqual(result.timing.pre_execution_end);
      expect(result.timing.execution_end).toBeGreaterThanOrEqual(result.timing.execution_start!);
      expect(result.timing.post_execution_start).toBeGreaterThanOrEqual(result.timing.execution_end!);
      expect(result.timing.post_execution_end).toBeGreaterThanOrEqual(result.timing.post_execution_start!);
      expect(result.total_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include decisions array in result', async () => {
      const config = createBaseConfig();
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.decisions).toHaveLength(2); // pre + post
      expect(result.decisions[0].stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.decisions[1].stage).toBe(PipelineStage.POST_EXECUTION);
    });
  });

  describe('execute() — pre-execution DENY flow', () => {
    it('should block request when pre-execution returns DENY', async () => {
      const denyModule = createMockModule('deny-mod', '1.0', {
        action: 'DENY' as any,
        reason_codes: ['POLICY_VIOLATION'],
      });
      const observeProxy = createMockObserveProxy();
      const config = createBaseConfig({
        preExecutionModules: [denyModule],
        observeProxy,
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(false);
      expect(result.response).toBeNull();
      expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.post_decision).toBeNull();
      // Provider should NOT be called
      expect(observeProxy.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should block request when pre-execution returns REDACT (severity 70)', async () => {
      const redactModule = createMockModule('redact-mod', '1.0', {
        action: 'REDACT' as any,
        reason_codes: ['PII_DETECTED'],
      });
      const observeProxy = createMockObserveProxy();
      const config = createBaseConfig({
        preExecutionModules: [redactModule],
        observeProxy,
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(false);
      expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(observeProxy.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should proceed to execution when pre-execution returns MONITOR', async () => {
      const monitorModule = createMockModule('monitor-mod', '1.0', {
        action: 'MONITOR' as any,
        reason_codes: ['COST_WARNING'],
      });
      const config = createBaseConfig({ preExecutionModules: [monitorModule] });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(true);
      expect(result.blocked_stage).toBeNull();
    });
  });

  describe('execute() — provider error flow', () => {
    it('should return provider_error result when execution stage fails', async () => {
      const observeProxy = createMockObserveProxy();
      observeProxy.chat.completions.create.mockRejectedValue(
        new Error('Rate limit exceeded'),
      );
      const config = createBaseConfig({ observeProxy });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(false);
      expect(result.provider_error).toBe(true);
      expect(result.provider_error_details).toBeDefined();
      expect(result.provider_error_details!.message).toBe('Rate limit exceeded');
      expect(result.post_decision).toBeNull();
    });
  });

  describe('execute() — post-execution DENY + remediation', () => {
    it('should trigger DENY_RESPONSE when post-execution DENY without remediation metadata', async () => {
      const postModule = createMockModule('post-deny', '1.0', {
        action: 'DENY' as any,
        reason_codes: ['CONTENT_VIOLATION'],
      });
      const config = createBaseConfig({ postExecutionModules: [postModule] });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(false);
      expect(result.blocked_stage).toBe(PipelineStage.POST_EXECUTION);
      expect(result.remediation_action).toBe('DENY_RESPONSE');
    });

    it('should trigger REDACT when post-execution module metadata includes remediation: redact', async () => {
      const redactModule = createMockModule('pii-output', '1.0', {
        action: 'DENY' as any,
        reason_codes: ['PII_IN_RESPONSE'],
        metadata: {
          remediation: 'redact',
          redact: (resp: any) => ({ ...resp, choices: [{ message: { content: '[REDACTED]' } }] }),
        },
      });
      const config = createBaseConfig({ postExecutionModules: [redactModule] });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(true);
      expect(result.redacted).toBe(true);
      expect(result.remediation_action).toBe('REDACT');
      expect(result.response).toBeDefined();
    });

    it('should trigger RESAMPLE and succeed when second attempt passes', async () => {
      let callCount = 0;
      const postModule: TealModule = {
        name: 'content-mod',
        version: '1.0',
        evaluate: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 1) {
            return {
              action: 'DENY',
              reason_codes: ['TOXIC_CONTENT'],
              event_type: 'content.moderation',
              metadata: { remediation: 'resample' },
            };
          }
          return { action: 'ALLOW', reason_codes: [], event_type: 'content.moderation' };
        }),
      };

      const observeProxy = createMockObserveProxy();
      const config = createBaseConfig({
        postExecutionModules: [postModule],
        observeProxy,
        resample_budget: 2,
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(true);
      expect(result.resample_count).toBeGreaterThan(0);
      expect(result.remediation_action).toBe('RESAMPLE');
      expect(result.remediation_exhausted).toBe(false);
    });

    it('should exhaust resample budget and return denied when all attempts fail', async () => {
      const alwaysDenyModule = createMockModule('always-deny', '1.0', {
        action: 'DENY' as any,
        reason_codes: ['TOXIC'],
        metadata: { remediation: 'resample' },
      });
      const observeProxy = createMockObserveProxy();
      const config = createBaseConfig({
        postExecutionModules: [alwaysDenyModule],
        observeProxy,
        resample_budget: 2,
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(false);
      expect(result.remediation_exhausted).toBe(true);
      expect(result.resample_count).toBe(2);
      expect(result.remediation_action).toBe('RESAMPLE');
    });
  });

  describe('execute() — zero modules pass-through', () => {
    it('should pass-through when no pre or post modules registered', async () => {
      const config = createBaseConfig({
        preExecutionModules: [],
        postExecutionModules: [],
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(true);
      expect(result.pre_decision.action).toBe('ALLOW');
      expect(result.post_decision!.action).toBe('ALLOW');
    });
  });

  describe('execute() — hooks integration', () => {
    it('should invoke all hooks in order during successful execution', async () => {
      const callOrder: string[] = [];
      const hooks: PipelineHooks = {
        beforePreExecution: jest.fn(() => { callOrder.push('beforePre'); }),
        afterPreExecution: jest.fn(() => { callOrder.push('afterPre'); }),
        beforeExecution: jest.fn(() => { callOrder.push('beforeExec'); }),
        afterExecution: jest.fn(() => { callOrder.push('afterExec'); }),
        beforePostExecution: jest.fn(() => { callOrder.push('beforePost'); }),
        afterPostExecution: jest.fn(() => { callOrder.push('afterPost'); }),
      };
      const config = createBaseConfig({ hooks });
      const pipeline = new DefensePipeline(config);
      await pipeline.execute(createRequest());

      expect(callOrder).toEqual([
        'beforePre', 'afterPre', 'beforeExec', 'afterExec', 'beforePost', 'afterPost',
      ]);
    });

    it('should invoke onRemediation hook during remediation', async () => {
      const onRemediation = jest.fn();
      const postModule = createMockModule('deny-mod', '1.0', {
        action: 'DENY' as any,
        reason_codes: ['VIOLATION'],
      });
      const config = createBaseConfig({
        postExecutionModules: [postModule],
        hooks: { onRemediation },
      });
      const pipeline = new DefensePipeline(config);
      await pipeline.execute(createRequest());

      expect(onRemediation).toHaveBeenCalledWith('DENY_RESPONSE', expect.any(Object), 0);
    });

    it('should not fail when hooks throw exceptions', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const hooks: PipelineHooks = {
        beforePreExecution: () => { throw new Error('hook crash'); },
      };
      const config = createBaseConfig({ hooks });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.allowed).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('getModuleStatus()', () => {
    it('should return empty modules list when no modules registered', () => {
      const config = createBaseConfig();
      const pipeline = new DefensePipeline(config);
      const status = pipeline.getModuleStatus();
      expect(status.modules).toHaveLength(0);
    });

    it('should return status for all registered modules', () => {
      const preModule = createMockModule('pre-mod', '1.0');
      const postModule = createMockModule('post-mod', '2.0');
      const config = createBaseConfig({
        preExecutionModules: [preModule],
        postExecutionModules: [postModule],
      });
      const pipeline = new DefensePipeline(config);
      const status = pipeline.getModuleStatus();

      expect(status.modules).toHaveLength(2);
      expect(status.modules[0]).toEqual({
        name: 'pre-mod',
        version: '1.0',
        stage: PipelineStage.PRE_EXECUTION,
        registered: true,
      });
      expect(status.modules[1]).toEqual({
        name: 'post-mod',
        version: '2.0',
        stage: PipelineStage.POST_EXECUTION,
        registered: true,
      });
    });
  });

  describe('toJSON() serialization', () => {
    it('should serialize PipelineResult to JSON without information loss', async () => {
      const config = createBaseConfig({
        preExecutionModules: [createMockModule('pre', '1.0')],
        postExecutionModules: [createMockModule('post', '1.0')],
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());
      const json = result.toJSON();

      expect(json.allowed).toBe(result.allowed);
      expect(json.response).toEqual(result.response);
      expect(json.pre_decision).toEqual(result.pre_decision);
      expect(json.post_decision).toEqual(result.post_decision);
      expect(json.blocked_stage).toEqual(result.blocked_stage);
      expect(json.total_latency_ms).toBe(result.total_latency_ms);
      expect(json.resample_count).toBe(result.resample_count);
      expect(json.remediation_action).toBe(result.remediation_action);
      expect(json.redacted).toBe(result.redacted);
      expect(json.remediation_exhausted).toBe(result.remediation_exhausted);
      expect(json.provider_error).toBe(result.provider_error);
      expect(json.decisions).toEqual(result.decisions);
      expect(json.timing).toEqual(result.timing);
    });

    it('should produce valid JSON via JSON.stringify', async () => {
      const config = createBaseConfig({
        preExecutionModules: [createMockModule('pre', '1.0')],
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());
      const jsonString = JSON.stringify(result);
      const parsed = JSON.parse(jsonString);

      expect(parsed.allowed).toBe(true);
      expect(parsed.timing.pipeline_entry).toBeGreaterThan(0);
    });
  });

  describe('TEEC v2.1 integration', () => {
    it('should produce decisions with TEEC fields when seal_secret is configured', async () => {
      const config = createBaseConfig({
        preExecutionModules: [createMockModule('pre', '1.0')],
        postExecutionModules: [createMockModule('post', '1.0')],
        seal_secret: 'test-seal-secret',
        agent_id: 'test-agent',
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      // Pre-decision should have TEEC fields
      expect(result.pre_decision.intent_ref).toBeDefined();
      expect(result.pre_decision.receipt_ref).toBeDefined();
      expect(result.pre_decision.seq).toBeDefined();
      expect(result.pre_decision.governance_seal).toBeDefined();

      // Post-decision should have TEEC fields
      expect(result.post_decision!.intent_ref).toBeDefined();
      expect(result.post_decision!.receipt_ref).toBeDefined();
      expect(result.post_decision!.seq).toBeGreaterThan(result.pre_decision.seq!);
    });

    it('should NOT produce TEEC fields when seal_secret is not configured', async () => {
      const config = createBaseConfig({
        preExecutionModules: [createMockModule('pre', '1.0')],
      });
      const pipeline = new DefensePipeline(config);
      const result = await pipeline.execute(createRequest());

      expect(result.pre_decision.intent_ref).toBeUndefined();
      expect(result.pre_decision.receipt_ref).toBeUndefined();
      expect(result.pre_decision.governance_seal).toBeUndefined();
    });
  });
});
