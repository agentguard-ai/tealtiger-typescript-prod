/**
 * Integration Tests — SDK Parity Verification
 *
 * Verifies that the TypeScript pipeline produces semantically equivalent
 * decisions to what the Python pipeline would produce, given identical
 * configurations: same modules, same seal_secret, same request.
 *
 * Since cross-SDK testing is complex (requires running both runtimes),
 * these tests verify the TypeScript pipeline's structural correctness
 * and decision semantics against the documented parity contract.
 *
 * @requirements 11.5
 */

import { DefensePipeline } from '../../DefensePipeline';
import { StageDecisionBuilder } from '../../StageDecisionBuilder';
import { PipelineStage } from '../../types';
import type { PipelineConfig, PipelineRequest } from '../../types';
import type { TealModule, ModuleResult, ModuleContext, ModuleEvaluationRequest } from '../../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

function createMockObserveProxy(response: any = {
  model: 'gpt-4',
  choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
  usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
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
    getAgentId: jest.fn().mockReturnValue('parity-agent'),
    getSessionId: jest.fn().mockReturnValue('parity-session'),
    getDecisions: jest.fn().mockReturnValue([]),
  };
}

/** A deterministic module for parity testing. */
class DeterministicAllowModule implements TealModule {
  readonly name: string;
  readonly version: string;

  constructor(name: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
  }

  async evaluate(
    _request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    return {
      action: 'ALLOW' as any,
      reason_codes: [],
      event_type: `${this.name}.evaluation`,
    };
  }
}

/** A deterministic DENY module with fixed reason codes. */
class DeterministicDenyModule implements TealModule {
  readonly name: string;
  readonly version: string;
  private readonly reasonCode: string;

  constructor(name: string, reasonCode: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
    this.reasonCode = reasonCode;
  }

  async evaluate(
    _request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    return {
      action: 'DENY' as any,
      reason_codes: [this.reasonCode],
      event_type: `${this.name}.violation`,
    };
  }
}

/** A MONITOR module for parity testing. */
class DeterministicMonitorModule implements TealModule {
  readonly name: string;
  readonly version: string;
  private readonly reasonCode: string;

  constructor(name: string, reasonCode: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
    this.reasonCode = reasonCode;
  }

  async evaluate(
    _request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    return {
      action: 'MONITOR' as any,
      reason_codes: [this.reasonCode],
      event_type: `${this.name}.monitor`,
    };
  }
}

function makeParityRequest(): PipelineRequest {
  return {
    payload: {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      content: 'What is 2+2?',
    },
    correlation_id: 'parity-test-correlation-id',
    context: {
      session_id: 'parity-session',
      user_id: 'parity-user',
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('SDK Parity Verification', () => {
  describe('Decision action parity', () => {
    it('should produce ALLOW action when all modules allow (matches Python behavior)', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicAllowModule('PolicyEvaluation'),
          new DeterministicAllowModule('InputValidation'),
        ],
        postExecutionModules: [
          new DeterministicAllowModule('ContentModeration'),
        ],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      expect(result.allowed).toBe(true);
      expect(result.pre_decision.action).toBe('ALLOW');
      expect(result.post_decision!.action).toBe('ALLOW');
      expect(result.blocked_stage).toBeNull();
    });

    it('should produce DENY action at pre-execution with correct reason codes', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicAllowModule('InputValidation'),
          new DeterministicDenyModule('PolicyEvaluation', 'POLICY_VIOLATION'),
        ],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Python pipeline would produce the same: blocked at PRE_EXECUTION with DENY
      expect(result.allowed).toBe(false);
      expect(result.pre_decision.action).toBe('DENY');
      expect(result.pre_decision.reason_codes).toContain('POLICY_VIOLATION');
      expect(result.pre_decision.stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.blocked_stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.response).toBeNull();
      expect(result.post_decision).toBeNull();
    });

    it('should produce MONITOR action when no DENY is present but MONITOR is', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicAllowModule('InputValidation'),
          new DeterministicMonitorModule('CostBudget', 'BUDGET_WARNING'),
        ],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // MONITOR does not block — pipeline proceeds (same behavior in Python)
      expect(result.allowed).toBe(true);
      expect(result.pre_decision.action).toBe('MONITOR');
      expect(result.pre_decision.reason_codes).toContain('BUDGET_WARNING');
    });
  });

  describe('Reason code aggregation parity', () => {
    it('should aggregate reason codes from all modules at a stage', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicDenyModule('PolicyEvaluation', 'POLICY_VIOLATION'),
          new DeterministicDenyModule('InputValidation', 'INPUT_INVALID'),
        ],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Both Python and TS should aggregate reason codes from all modules
      expect(result.pre_decision.reason_codes).toContain('POLICY_VIOLATION');
      expect(result.pre_decision.reason_codes).toContain('INPUT_INVALID');
      expect(result.pre_decision.reason_codes.length).toBe(2);
    });

    it('should include reason codes from ALLOW/MONITOR modules alongside DENY', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicMonitorModule('CostBudget', 'BUDGET_WARNING'),
          new DeterministicDenyModule('PolicyEvaluation', 'POLICY_VIOLATION'),
        ],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Both SDKs aggregate all reason codes regardless of action
      expect(result.pre_decision.reason_codes).toContain('BUDGET_WARNING');
      expect(result.pre_decision.reason_codes).toContain('POLICY_VIOLATION');
    });
  });

  describe('TEEC v2.1 field parity', () => {
    const SEAL_SECRET = 'parity-test-seal-secret-v2.1';
    const AGENT_ID = 'parity-agent-id';

    it('should produce TEEC v2.1 fields when seal_secret is configured', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
        seal_secret: SEAL_SECRET,
        agent_id: AGENT_ID,
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Pre-decision TEEC v2.1 fields
      expect(result.pre_decision.intent_ref).toBeDefined();
      expect(result.pre_decision.receipt_ref).toBeDefined();
      expect(result.pre_decision.seq).toBeDefined();
      expect(result.pre_decision.running_count).toBeDefined();
      expect(result.pre_decision.normalization_id).toBeDefined();
      expect(result.pre_decision.governance_seal).toBeDefined();
      expect(result.pre_decision.governance_seal!.agent_id).toBe(AGENT_ID);
      expect(result.pre_decision.governance_seal!.hmac).toBeDefined();
      expect(result.pre_decision.governance_seal!.timestamp).toBeGreaterThan(0);

      // Post-decision TEEC v2.1 fields
      expect(result.post_decision!.intent_ref).toBeDefined();
      expect(result.post_decision!.receipt_ref).toBeDefined();
      expect(result.post_decision!.seq).toBeDefined();
      expect(result.post_decision!.governance_seal).toBeDefined();
    });

    it('should NOT produce TEEC v2.1 fields when seal_secret is absent', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
        // No seal_secret
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      expect(result.pre_decision.intent_ref).toBeUndefined();
      expect(result.pre_decision.receipt_ref).toBeUndefined();
      expect(result.pre_decision.seq).toBeUndefined();
      expect(result.pre_decision.governance_seal).toBeUndefined();
    });

    it('should produce valid contiguity chain across decisions (Python produces same chain semantics)', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
        seal_secret: SEAL_SECRET,
        agent_id: AGENT_ID,
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // The decisions array should form a valid contiguity chain
      expect(result.decisions.length).toBe(2);
      expect(result.decisions[0].stage).toBe(PipelineStage.PRE_EXECUTION);
      expect(result.decisions[1].stage).toBe(PipelineStage.POST_EXECUTION);

      // Verify seq is monotonically increasing
      expect(result.decisions[1].seq!).toBeGreaterThan(result.decisions[0].seq!);

      // Verify contiguity using StageDecisionBuilder
      const builder = new StageDecisionBuilder(SEAL_SECRET, AGENT_ID);
      const contiguity = builder.verifyContiguity(result.decisions);
      expect(contiguity.valid).toBe(true);
    });

    it('should produce deterministic intent_ref for the same payload (same as Python would)', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
        seal_secret: SEAL_SECRET,
        agent_id: AGENT_ID,
      };

      const pipeline1 = new DefensePipeline(config);
      const pipeline2 = new DefensePipeline(config);

      const request = makeParityRequest();
      const result1 = await pipeline1.execute(request);
      const result2 = await pipeline2.execute(request);

      // Same request payload → same intent_ref (deterministic hashing)
      expect(result1.pre_decision.intent_ref).toBe(result2.pre_decision.intent_ref);
    });
  });

  describe('PipelineResult structure parity', () => {
    it('should include all required PipelineResult fields (matches Python to_dict())', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Verify all PipelineResult fields are present (same structure as Python SDK)
      expect(typeof result.allowed).toBe('boolean');
      expect(result.response).not.toBeNull();
      expect(result.pre_decision).toBeDefined();
      expect(result.post_decision).toBeDefined();
      expect(result.blocked_stage).toBeNull();
      expect(typeof result.total_latency_ms).toBe('number');
      expect(result.total_latency_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.resample_count).toBe('number');
      expect(result.remediation_action).toBeNull();
      expect(typeof result.redacted).toBe('boolean');
      expect(typeof result.remediation_exhausted).toBe('boolean');
      expect(typeof result.provider_error).toBe('boolean');
      expect(Array.isArray(result.decisions)).toBe(true);
      expect(result.timing).toBeDefined();
    });

    it('should serialize to JSON without information loss (matches Python to_dict())', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
        seal_secret: SEAL_SECRET,
        agent_id: 'parity-agent',
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());
      const json = result.toJSON();

      // Verify toJSON() preserves all key fields
      expect(json.allowed).toBe(result.allowed);
      expect(json.response).toEqual(result.response);
      expect(json.blocked_stage).toBe(result.blocked_stage);
      expect(json.total_latency_ms).toBe(result.total_latency_ms);
      expect(json.resample_count).toBe(result.resample_count);
      expect(json.remediation_action).toBe(result.remediation_action);
      expect(json.redacted).toBe(result.redacted);
      expect(json.remediation_exhausted).toBe(result.remediation_exhausted);
      expect(json.provider_error).toBe(result.provider_error);
      expect(json.decisions).toEqual(result.decisions);
      expect(json.timing).toEqual(result.timing);
    });

    it('should produce timing metadata with required timestamps', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('InputValidation')],
        postExecutionModules: [new DeterministicAllowModule('ContentModeration')],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Both SDKs produce the same timing metadata structure
      expect(result.timing.pipeline_entry).toBeGreaterThan(0);
      expect(result.timing.pre_execution_start).toBeGreaterThan(0);
      expect(result.timing.pre_execution_end).toBeGreaterThanOrEqual(result.timing.pre_execution_start);
      expect(result.timing.execution_start).toBeGreaterThan(0);
      expect(result.timing.execution_end).toBeGreaterThanOrEqual(result.timing.execution_start!);
      expect(result.timing.post_execution_start).toBeGreaterThan(0);
      expect(result.timing.post_execution_end).toBeGreaterThanOrEqual(result.timing.post_execution_start!);
      expect(typeof result.timing.hook_time_ms).toBe('number');
      expect(Array.isArray(result.timing.remediation_attempts)).toBe(true);
    });
  });

  describe('MostRestrictiveWins merge parity', () => {
    it('should merge as DENY when any module produces DENY (same in both SDKs)', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicAllowModule('ModuleA'),
          new DeterministicMonitorModule('ModuleB', 'WARNING_B'),
          new DeterministicDenyModule('ModuleC', 'VIOLATION_C'),
        ],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      expect(result.pre_decision.action).toBe('DENY');
    });

    it('should merge as MONITOR when MONITOR present but no DENY (same in both SDKs)', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicAllowModule('ModuleA'),
          new DeterministicMonitorModule('ModuleB', 'COST_WARNING'),
        ],
        postExecutionModules: [new DeterministicAllowModule('PostModA')],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      expect(result.pre_decision.action).toBe('MONITOR');
    });

    it('should merge as ALLOW when all modules produce ALLOW (same in both SDKs)', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicAllowModule('ModuleA'),
          new DeterministicAllowModule('ModuleB'),
        ],
        postExecutionModules: [new DeterministicAllowModule('PostModA')],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      expect(result.pre_decision.action).toBe('ALLOW');
      expect(result.post_decision!.action).toBe('ALLOW');
    });
  });

  describe('StageDecision structure parity', () => {
    it('should include per-module details with name, version, action, and reason_codes', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [
          new DeterministicDenyModule('PolicyEvaluation', 'POLICY_VIOLATION', '2.1.0'),
          new DeterministicMonitorModule('CostBudget', 'BUDGET_WARNING', '1.3.0'),
        ],
        postExecutionModules: [],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      const details = result.pre_decision.module_details;
      expect(details.length).toBe(2);

      // Both SDKs produce module_details with name, version, action, reason_codes, latency_ms
      for (const detail of details) {
        expect(typeof detail.name).toBe('string');
        expect(typeof detail.version).toBe('string');
        expect(typeof detail.action).toBe('string');
        expect(Array.isArray(detail.reason_codes)).toBe(true);
        expect(typeof detail.latency_ms).toBe('number');
      }

      const policyDetail = details.find(d => d.name === 'PolicyEvaluation');
      expect(policyDetail!.version).toBe('2.1.0');
      expect(policyDetail!.action).toBe('DENY');
      expect(policyDetail!.reason_codes).toContain('POLICY_VIOLATION');
    });

    it('should tag StageDecision with the correct stage enum value', async () => {
      const config: PipelineConfig = {
        preExecutionModules: [new DeterministicAllowModule('PreMod')],
        postExecutionModules: [new DeterministicAllowModule('PostMod')],
        observeProxy: createMockObserveProxy(),
      };
      const pipeline = new DefensePipeline(config);

      const result = await pipeline.execute(makeParityRequest());

      // Both SDKs use the same stage enum values
      expect(result.pre_decision.stage).toBe('PRE_EXECUTION');
      expect(result.post_decision!.stage).toBe('POST_EXECUTION');
    });
  });
});

const SEAL_SECRET = 'parity-test-seal-secret-v2.1';
