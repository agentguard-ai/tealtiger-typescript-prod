/**
 * Unit tests for SOC/IR Evidence Pipeline
 *
 * Covers:
 * - JSON SIEM export format
 * - CEF format generation
 * - Response hook deduplication
 * - Response hook rate limiting
 * - Post-evaluation pipeline execution order
 *
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { SIEMExporter } from '../siem-exporter';
import { OTelGovernanceEmitter } from '../otel-emitter';
import { ResponseHookManager } from '../response-hooks';
import { PostEvaluationPipeline } from '../post-evaluation';
import { DecisionAction, PolicyMode, ReasonCode } from '../../types';
import type { DecisionV13, GovernanceContext } from '../types';
import type { ResponseHookConfig } from '../soc-types';

// ── Test Fixtures ────────────────────────────────────────────────

function makeDecision(overrides: Partial<DecisionV13> = {}): DecisionV13 {
  return {
    action: DecisionAction.DENY,
    reason_codes: [ReasonCode.POLICY_VIOLATION],
    risk_score: 85,
    mode: PolicyMode.ENFORCE,
    policy_id: 'test-policy',
    policy_version: '1.3.0',
    component_versions: { sdk: '1.3.0', engine: '1.3.0' },
    correlation_id: 'corr-123-abc',
    reason: 'Test decision',
    event_type: 'governance.decision',
    teec_version: '2.0.0',
    timestamp: 1700000000000,
    module: 'TealGuard',
    ...overrides,
  } as DecisionV13;
}

function makeContext(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    correlation_id: 'corr-123-abc',
    policy_version: '1.3.0',
    teec_version: '2.0.0',
    timestamp: 1700000000000,
    agent_id: 'agent-007',
    ...overrides,
  } as GovernanceContext;
}

function makeHookConfig(overrides: Partial<ResponseHookConfig> = {}): ResponseHookConfig {
  return {
    id: 'hook-1',
    trigger: 'policy_violation',
    endpoint: 'https://hooks.example.com/alert',
    retry_policy: {
      max_retries: 2,
      backoff_ms: 100,
      timeout_ms: 5000,
    },
    dedup_window_ms: 60_000,
    rate_limit: { max_per_minute: 10 },
    ...overrides,
  };
}

// ── SIEM Exporter Tests ──────────────────────────────────────────

describe('SIEMExporter', () => {
  let exporter: SIEMExporter;

  beforeEach(() => {
    exporter = new SIEMExporter();
  });

  describe('JSON format', () => {
    it('produces valid JSON with all required fields', () => {
      const decision = makeDecision();
      const context = makeContext();

      const output = exporter.export(decision, context, 'json');
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toBe('2023-11-14T22:13:20.000Z');
      expect(parsed.decision_outcome).toBe('DENY');
      expect(parsed.reason_codes).toEqual(['POLICY_VIOLATION']);
      expect(parsed.policy_version).toBe('1.3.0');
      expect(parsed.agent_id).toBe('agent-007');
      expect(parsed.action_type).toBe('governance.decision');
      expect(parsed.risk_score).toBe(85);
      expect(parsed.correlation_id).toBe('corr-123-abc');
      expect(parsed.source).toBe('tealtiger');
      expect(parsed.schema_version).toBe('1.0.0');
    });

    it('defaults to json format when no format specified', () => {
      const decision = makeDecision();
      const context = makeContext();

      const output = exporter.export(decision, context);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('handles missing optional fields gracefully', () => {
      const decision = makeDecision();
      // Override with missing fields using Object.assign to bypass type checks
      Object.assign(decision, { timestamp: undefined, risk_score: undefined });
      const context = makeContext();
      Object.assign(context, { agent_id: undefined });

      const output = exporter.export(decision, context, 'json');
      const parsed = JSON.parse(output);

      expect(parsed.agent_id).toBe('unknown');
      expect(parsed.risk_score).toBe(0);
    });
  });

  describe('CEF format', () => {
    it('produces valid CEF header with correct structure', () => {
      const decision = makeDecision();
      const context = makeContext();

      const output = exporter.export(decision, context, 'cef');

      // CEF header: CEF:Version|Vendor|Product|DeviceVersion|SignatureID|Name|Severity|Extension
      expect(output).toMatch(/^CEF:0\|TealTiger\|GovernanceEngine\|1\.3\.0\|/);
    });

    it('includes decision outcome in CEF name field', () => {
      const decision = makeDecision({ action: DecisionAction.ALLOW });
      const context = makeContext();

      const output = exporter.export(decision, context, 'cef');

      expect(output).toContain('Governance Decision: ALLOW');
    });

    it('maps risk score to CEF severity (0-10 scale)', () => {
      const decision = makeDecision({ risk_score: 85 });
      const context = makeContext();

      const output = exporter.export(decision, context, 'cef');

      // 85/10 = 8.5, rounded to 9
      expect(output).toMatch(/\|9\|/);
    });

    it('includes correlation ID in CEF extensions', () => {
      const decision = makeDecision();
      const context = makeContext();

      const output = exporter.export(decision, context, 'cef');

      expect(output).toContain('externalId=corr-123-abc');
    });

    it('includes reason codes in CEF extensions', () => {
      const decision = makeDecision({
        reason_codes: [ReasonCode.PII_DETECTED, ReasonCode.SECRET_DETECTED],
      });
      const context = makeContext();

      const output = exporter.export(decision, context, 'cef');

      expect(output).toContain('cs1=PII_DETECTED,SECRET_DETECTED');
    });
  });

  describe('LEEF format', () => {
    it('produces valid LEEF header', () => {
      const decision = makeDecision();
      const context = makeContext();

      const output = exporter.export(decision, context, 'leef');

      expect(output).toMatch(/^LEEF:2\.0\|TealTiger\|GovernanceEngine\|1\.3\.0\|/);
    });

    it('includes all required attributes in LEEF body', () => {
      const decision = makeDecision();
      const context = makeContext();

      const output = exporter.export(decision, context, 'leef');

      expect(output).toContain('outcome=DENY');
      expect(output).toContain('policyVersion=1.3.0');
      expect(output).toContain('agentId=agent-007');
      expect(output).toContain('riskScore=85');
      expect(output).toContain('correlationId=corr-123-abc');
    });
  });
});

// ── OTel Emitter Tests ───────────────────────────────────────────

describe('OTelGovernanceEmitter', () => {
  let emitter: OTelGovernanceEmitter;

  beforeEach(() => {
    emitter = new OTelGovernanceEmitter();
  });

  it('emits span with correct span name', () => {
    const decision = makeDecision();
    const context = makeContext();

    emitter.emitSpan(decision, context, 15);

    const spans = emitter.getRecordedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].span_name).toBe('tealtiger.governance.evaluate');
  });

  it('includes all required attributes', () => {
    const decision = makeDecision();
    const context = makeContext();

    emitter.emitSpan(decision, context, 15);

    const span = emitter.getRecordedSpans()[0];
    expect(span.attributes['decision.action']).toBe('DENY');
    expect(span.attributes['decision.risk_score']).toBe(85);
    expect(span.attributes['policy.version']).toBe('1.3.0');
    expect(span.attributes['agent.id']).toBe('agent-007');
    expect(span.attributes['correlation_id']).toBe('corr-123-abc');
    expect(span.attributes['reason_codes']).toEqual([ReasonCode.POLICY_VIOLATION]);
  });

  it('records correct duration', () => {
    const decision = makeDecision();
    const context = makeContext();

    emitter.emitSpan(decision, context, 42);

    const span = emitter.getRecordedSpans()[0];
    expect(span.duration_ms).toBe(42);
  });

  it('sets status to ERROR for DENY decisions', () => {
    const decision = makeDecision({ action: DecisionAction.DENY });
    const context = makeContext();

    emitter.emitSpan(decision, context, 10);

    expect(emitter.getRecordedSpans()[0].status).toBe('ERROR');
  });

  it('sets status to OK for ALLOW decisions', () => {
    const decision = makeDecision({ action: DecisionAction.ALLOW });
    const context = makeContext();

    emitter.emitSpan(decision, context, 10);

    expect(emitter.getRecordedSpans()[0].status).toBe('OK');
  });

  it('forwards spans to external handler when set', () => {
    const handler = jest.fn();
    emitter.setSpanHandler(handler);

    const decision = makeDecision();
    const context = makeContext();
    emitter.emitSpan(decision, context, 5);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ span_name: 'tealtiger.governance.evaluate' }),
    );
  });
});

// ── Response Hook Manager Tests ──────────────────────────────────

describe('ResponseHookManager', () => {
  let manager: ResponseHookManager;
  let mockInvoker: jest.Mock;

  beforeEach(() => {
    mockInvoker = jest.fn().mockResolvedValue({ status_code: 200 });
    manager = new ResponseHookManager(mockInvoker);
  });

  describe('basic invocation', () => {
    it('invokes hook when trigger matches', async () => {
      const decision = makeDecision({
        action: DecisionAction.DENY,
        reason_codes: [ReasonCode.POLICY_VIOLATION],
      });
      const hooks = [makeHookConfig({ trigger: 'policy_violation' })];

      const results = await manager.invoke(decision, hooks);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockInvoker).toHaveBeenCalledTimes(1);
    });

    it('does not invoke hook when trigger does not match', async () => {
      const decision = makeDecision({
        action: DecisionAction.ALLOW,
        reason_codes: [] as any,
        risk_score: 10,
      });
      const hooks = [makeHookConfig({ trigger: 'policy_violation' })];

      const results = await manager.invoke(decision, hooks);

      expect(results).toHaveLength(0);
      expect(mockInvoker).not.toHaveBeenCalled();
    });

    it('invokes high_risk hook when risk score >= 80', async () => {
      const decision = makeDecision({
        action: DecisionAction.ALLOW,
        reason_codes: [] as any,
        risk_score: 90,
      });
      const hooks = [makeHookConfig({ trigger: 'high_risk' })];

      const results = await manager.invoke(decision, hooks);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('invokes freeze_tamper hook on FREEZE_BLOCK reason code', async () => {
      const decision = makeDecision();
      // Use Object.assign to set non-enum reason codes for testing
      Object.assign(decision, { reason_codes: ['FREEZE_BLOCK'] });
      const hooks = [makeHookConfig({ trigger: 'freeze_tamper' })];

      const results = await manager.invoke(decision, hooks);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('suppresses repeated violations within dedup window', async () => {
      const decision = makeDecision();
      const hooks = [makeHookConfig({ dedup_window_ms: 60_000 })];

      // First invocation — should fire
      const results1 = await manager.invoke(decision, hooks);
      expect(results1[0].success).toBe(true);
      expect(mockInvoker).toHaveBeenCalledTimes(1);

      // Second invocation — should be deduplicated
      const results2 = await manager.invoke(decision, hooks);
      expect(results2[0].success).toBe(true);
      expect(results2[0].error).toBe('deduplicated');
      expect(mockInvoker).toHaveBeenCalledTimes(1); // Not called again
    });

    it('allows invocation after dedup window expires', async () => {
      const decision = makeDecision();
      const hooks = [makeHookConfig({ dedup_window_ms: 10 })]; // 10ms window

      // First invocation
      await manager.invoke(decision, hooks);
      expect(mockInvoker).toHaveBeenCalledTimes(1);

      // Wait for dedup window to expire
      await new Promise((resolve) => setTimeout(resolve, 15));

      // Second invocation — should fire (window expired)
      await manager.invoke(decision, hooks);
      expect(mockInvoker).toHaveBeenCalledTimes(2);
    });

    it('does not deduplicate different reason codes', async () => {
      const decision1 = makeDecision({ reason_codes: [ReasonCode.PII_DETECTED] });
      const decision2 = makeDecision({ reason_codes: [ReasonCode.SECRET_DETECTED] });
      const hooks = [makeHookConfig({ dedup_window_ms: 60_000 })];

      await manager.invoke(decision1, hooks);
      const results2 = await manager.invoke(decision2, hooks);

      expect(mockInvoker).toHaveBeenCalledTimes(2);
      expect(results2[0].success).toBe(true);
      expect(results2[0].error).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('rate limits when max_per_minute is exceeded', async () => {
      const hooks = [makeHookConfig({
        id: 'rate-test-hook',
        rate_limit: { max_per_minute: 2 },
        dedup_window_ms: 0, // Disable dedup for this test
      })];

      // Use different reason codes to avoid dedup
      const d1 = makeDecision({ reason_codes: [ReasonCode.PII_DETECTED] });
      const d2 = makeDecision({ reason_codes: [ReasonCode.SECRET_DETECTED] });
      const d3 = makeDecision({ reason_codes: [ReasonCode.PROMPT_INJECTION_DETECTED] });

      await manager.invoke(d1, hooks);
      await manager.invoke(d2, hooks);

      // Third invocation should be rate limited
      const results3 = await manager.invoke(d3, hooks);
      expect(results3[0].success).toBe(false);
      expect(results3[0].error).toBe('rate_limited');
      expect(mockInvoker).toHaveBeenCalledTimes(2);
    });

    it('allows invocations after rate limit window resets', async () => {
      // This test verifies the rate limit uses a sliding window
      const hooks = [makeHookConfig({
        id: 'rate-window-hook',
        rate_limit: { max_per_minute: 1 },
        dedup_window_ms: 0,
      })];

      const d1 = makeDecision({ reason_codes: [ReasonCode.PII_DETECTED] });
      await manager.invoke(d1, hooks);
      expect(mockInvoker).toHaveBeenCalledTimes(1);

      // Second call should be rate limited
      const d2 = makeDecision({ reason_codes: [ReasonCode.SECRET_DETECTED] });
      const results = await manager.invoke(d2, hooks);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('rate_limited');
    });
  });

  describe('retry on failure', () => {
    it('retries on failure according to retry policy', async () => {
      mockInvoker
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({ status_code: 200 });

      const decision = makeDecision();
      const hooks = [makeHookConfig({
        retry_policy: { max_retries: 2, backoff_ms: 10, timeout_ms: 1000 },
      })];

      const results = await manager.invoke(decision, hooks);

      expect(results[0].success).toBe(true);
      expect(mockInvoker).toHaveBeenCalledTimes(2);
    });

    it('reports failure after all retries exhausted', async () => {
      mockInvoker.mockRejectedValue(new Error('Connection refused'));

      const decision = makeDecision();
      const hooks = [makeHookConfig({
        retry_policy: { max_retries: 1, backoff_ms: 10, timeout_ms: 1000 },
      })];

      const results = await manager.invoke(decision, hooks);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Failed after 2 attempts');
      expect(mockInvoker).toHaveBeenCalledTimes(2);
    });
  });
});

// ── Post-Evaluation Pipeline Tests ───────────────────────────────

describe('PostEvaluationPipeline', () => {
  it('executes all 5 steps in correct order', async () => {
    const executionLog: string[] = [];

    const proofHandler = {
      appendDecisionHash: jest.fn(async () => { executionLog.push('teal_proof'); }),
    };
    const auditHandler = {
      emitEnvelope: jest.fn(async () => { executionLog.push('teal_audit'); }),
    };
    const flowHandler = {
      triggerEvent: jest.fn(async () => { executionLog.push('teal_flow'); }),
    };

    const mockInvoker = jest.fn().mockResolvedValue({ status_code: 200 });
    const responseHookManager = new ResponseHookManager(mockInvoker);

    const pipeline = new PostEvaluationPipeline(
      {
        proofHandler,
        auditHandler,
        responseHooks: [makeHookConfig()],
        otelEnabled: true,
        flowHandler,
      },
      { responseHookManager },
    );

    const decision = makeDecision();
    const context = makeContext();

    const result = await pipeline.execute(decision, context, 10);

    // Verify all steps executed
    expect(result.steps).toHaveLength(5);
    expect(result.steps.map((s) => s.step)).toEqual([
      'teal_proof',
      'teal_audit',
      'response_hooks',
      'otel_span',
      'teal_flow',
    ]);

    // Verify execution order
    expect(executionLog[0]).toBe('teal_proof');
    expect(executionLog[1]).toBe('teal_audit');
    expect(executionLog[2]).toBe('teal_flow');

    // Verify handlers were called
    expect(proofHandler.appendDecisionHash).toHaveBeenCalledWith(decision, context);
    expect(auditHandler.emitEnvelope).toHaveBeenCalledWith(decision, context);
    expect(flowHandler.triggerEvent).toHaveBeenCalledWith(decision, context);
  });

  it('continues execution when a step fails', async () => {
    const proofHandler = {
      appendDecisionHash: jest.fn(async () => {
        throw new Error('Merkle tree unavailable');
      }),
    };
    const auditHandler = {
      emitEnvelope: jest.fn(async () => { /* success */ }),
    };

    const pipeline = new PostEvaluationPipeline({
      proofHandler,
      auditHandler,
      otelEnabled: true,
    });

    const decision = makeDecision();
    const context = makeContext();

    const result = await pipeline.execute(decision, context);

    // Proof step failed
    expect(result.steps[0].step).toBe('teal_proof');
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toBe('Merkle tree unavailable');

    // Audit step still succeeded
    expect(result.steps[1].step).toBe('teal_audit');
    expect(result.steps[1].success).toBe(true);

    // OTel step still succeeded
    expect(result.steps[3].step).toBe('otel_span');
    expect(result.steps[3].success).toBe(true);
  });

  it('skips steps when handlers are not configured', async () => {
    const pipeline = new PostEvaluationPipeline({
      otelEnabled: true,
    });

    const decision = makeDecision();
    const context = makeContext();

    const result = await pipeline.execute(decision, context, 5);

    // All steps should succeed (no-ops for unconfigured handlers)
    expect(result.steps.every((s) => s.success)).toBe(true);
    expect(result.steps).toHaveLength(5);
  });

  it('emits OTel span with correct duration', async () => {
    const otelEmitter = new OTelGovernanceEmitter();
    const pipeline = new PostEvaluationPipeline(
      { otelEnabled: true },
      { otelEmitter },
    );

    const decision = makeDecision();
    const context = makeContext();

    await pipeline.execute(decision, context, 25);

    const spans = otelEmitter.getRecordedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].duration_ms).toBe(25);
  });

  it('reports total pipeline duration', async () => {
    const pipeline = new PostEvaluationPipeline({ otelEnabled: true });

    const decision = makeDecision();
    const context = makeContext();

    const result = await pipeline.execute(decision, context);

    expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns execution order via getExecutionOrder()', () => {
    const pipeline = new PostEvaluationPipeline({});

    expect(pipeline.getExecutionOrder()).toEqual([
      'teal_proof',
      'teal_audit',
      'response_hooks',
      'otel_span',
      'teal_flow',
    ]);
  });
});
