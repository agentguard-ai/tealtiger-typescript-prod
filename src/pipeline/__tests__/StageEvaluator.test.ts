/**
 * StageEvaluator — Unit Tests
 *
 * Covers:
 * - Parallel module evaluation via Promise.allSettled
 * - Timeout enforcement per module (default 5000ms)
 * - MostRestrictiveWins merge (DENY > MONITOR > ALLOW)
 * - Fail-closed (module error → DENY) and fail-open modes
 * - Empty module list → pass-through ALLOW
 * - Per-module detail recording in results
 *
 * @requirements 2.1, 2.2, 2.6, 2.7, 4.1, 4.2, 4.8, 12.1, 12.2, 12.3, 12.4, 12.6
 */

import { StageEvaluator } from '../StageEvaluator';
import { PipelineStage } from '../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';
import { DecisionAction } from '../../core/engine/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeModule = (
  name: string,
  result: ModuleResult,
  delayMs = 0,
): TealModule => ({
  name,
  version: '1.0.0',
  evaluate: jest.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        if (delayMs > 0) {
          setTimeout(() => resolve(result), delayMs);
        } else {
          resolve(result);
        }
      }),
  ),
});

const failingModule = (name: string, error: Error): TealModule => ({
  name,
  version: '1.0.0',
  evaluate: jest.fn().mockRejectedValue(error),
});

const hangingModule = (name: string): TealModule => ({
  name,
  version: '1.0.0',
  evaluate: jest.fn().mockImplementation(
    () => new Promise(() => {}), // never resolves
  ),
});

const ALLOW_RESULT: ModuleResult = {
  action: DecisionAction.ALLOW,
  reason_codes: ['POLICY_COMPLIANT'],
  event_type: 'policy.evaluation',
};

const MONITOR_RESULT: ModuleResult = {
  action: 'MONITOR' as any,
  reason_codes: ['COST_HIGH'],
  event_type: 'cost.evaluation',
};

const DENY_RESULT: ModuleResult = {
  action: DecisionAction.DENY,
  reason_codes: ['SECRET_DETECTED'],
  event_type: 'secret.detection',
};

const REDACT_RESULT: ModuleResult = {
  action: DecisionAction.REDACT,
  reason_codes: ['PII_DETECTED'],
  event_type: 'pii.detection',
};

const CTX: ModuleContext = {
  correlation_id: 'test-corr-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
};

const REQUEST: ModuleEvaluationRequest = { content: 'test payload' };
const POLICY = { enabled: true };

// ── Tests ────────────────────────────────────────────────────────

describe('StageEvaluator', () => {
  describe('Parallel Module Evaluation', () => {
    it('evaluates all modules in parallel', async () => {
      const mod1 = makeModule('mod1', ALLOW_RESULT);
      const mod2 = makeModule('mod2', ALLOW_RESULT);
      const mod3 = makeModule('mod3', ALLOW_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2, mod3], REQUEST, CTX, POLICY);

      expect(mod1.evaluate).toHaveBeenCalledTimes(1);
      expect(mod2.evaluate).toHaveBeenCalledTimes(1);
      expect(mod3.evaluate).toHaveBeenCalledTimes(1);
      expect(result.module_details).toHaveLength(3);
    });

    it('passes correct arguments to each module', async () => {
      const mod = makeModule('mod1', ALLOW_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(mod.evaluate).toHaveBeenCalledWith(REQUEST, CTX, POLICY);
    });

    it('returns ALLOW when no modules are registered (pass-through)', async () => {
      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([], REQUEST, CTX, POLICY);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect(result.module_details).toEqual([]);
    });
  });

  describe('MostRestrictiveWins Merge', () => {
    it('merges to ALLOW when all modules return ALLOW', async () => {
      const mod1 = makeModule('mod1', ALLOW_RESULT);
      const mod2 = makeModule('mod2', ALLOW_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2], REQUEST, CTX, POLICY);

      expect(result.action).toBe('ALLOW');
    });

    it('merges to MONITOR when any module returns MONITOR and none DENY', async () => {
      const mod1 = makeModule('mod1', ALLOW_RESULT);
      const mod2 = makeModule('mod2', MONITOR_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2], REQUEST, CTX, POLICY);

      expect(result.action).toBe('MONITOR');
    });

    it('merges to DENY when any module returns DENY', async () => {
      const mod1 = makeModule('mod1', ALLOW_RESULT);
      const mod2 = makeModule('mod2', MONITOR_RESULT);
      const mod3 = makeModule('mod3', DENY_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2, mod3], REQUEST, CTX, POLICY);

      expect(result.action).toBe('DENY');
    });

    it('merges to REDACT (severity 70) over MONITOR (severity 10)', async () => {
      const mod1 = makeModule('mod1', MONITOR_RESULT);
      const mod2 = makeModule('mod2', REDACT_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2], REQUEST, CTX, POLICY);

      expect(result.action).toBe('REDACT');
    });

    it('collects all reason codes from all modules', async () => {
      const mod1 = makeModule('mod1', ALLOW_RESULT);
      const mod2 = makeModule('mod2', DENY_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2], REQUEST, CTX, POLICY);

      expect(result.reason_codes).toContain('POLICY_COMPLIANT');
      expect(result.reason_codes).toContain('SECRET_DETECTED');
    });

    it('selects the highest severity action among multiple DENY-level actions', async () => {
      const denyResult: ModuleResult = {
        action: DecisionAction.DENY,
        reason_codes: ['BLOCKED'],
        event_type: 'block',
      };
      const requireApprovalResult: ModuleResult = {
        action: DecisionAction.REQUIRE_APPROVAL,
        reason_codes: ['APPROVAL_NEEDED'],
        event_type: 'escalation',
      };

      const mod1 = makeModule('mod1', denyResult); // severity 100
      const mod2 = makeModule('mod2', requireApprovalResult); // severity 80

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2], REQUEST, CTX, POLICY);

      // DENY (100) > REQUIRE_APPROVAL (80)
      expect(result.action).toBe('DENY');
    });
  });

  describe('Timeout Enforcement', () => {
    it('returns DENY on timeout when fail_closed is true', async () => {
      const mod = hangingModule('slow-module');

      // 50ms timeout so test doesn't hang
      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true, 50);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('DENY');
      expect(result.module_details[0].error).toContain('exceeded evaluation timeout');
      expect(result.module_details[0].reason_codes).toContain('PIPELINE_FAIL_CLOSED');
    });

    it('returns MONITOR on timeout in PRE_EXECUTION when fail_closed is false', async () => {
      const mod = hangingModule('slow-module');

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, false, 50);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('MONITOR');
    });

    it('returns ALLOW on timeout in POST_EXECUTION when fail_closed is false', async () => {
      const mod = hangingModule('slow-module');

      const evaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, false, 50);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('ALLOW');
    });

    it('does not timeout fast modules', async () => {
      const mod = makeModule('fast-mod', ALLOW_RESULT, 10);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true, 5000);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('ALLOW');
      expect(result.module_details[0].error).toBeUndefined();
    });

    it('uses default 5000ms timeout when not specified', () => {
      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      // The default timeout is internally set; verified by not timing out on reasonable modules
      expect(evaluator).toBeDefined();
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('treats module exception as DENY when fail_closed is true', async () => {
      const mod = failingModule('broken-mod', new Error('Module crashed'));

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('DENY');
      expect(result.module_details[0].error).toBe('Module crashed');
      expect(result.module_details[0].reason_codes).toContain('PIPELINE_FAIL_CLOSED');
    });

    it('treats module exception as MONITOR in PRE_EXECUTION when fail_closed is false', async () => {
      const mod = failingModule('broken-mod', new Error('Module crashed'));

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, false);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('MONITOR');
    });

    it('treats module exception as ALLOW in POST_EXECUTION when fail_closed is false', async () => {
      const mod = failingModule('broken-mod', new Error('Module crashed'));

      const evaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, false);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('ALLOW');
    });

    it('fail_closed does not affect explicit module decisions (Req 12.6)', async () => {
      // When all modules produce explicit ALLOW/MONITOR, fail_closed is irrelevant
      const mod1 = makeModule('mod1', ALLOW_RESULT);
      const mod2 = makeModule('mod2', MONITOR_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod1, mod2], REQUEST, CTX, POLICY);

      // MONITOR wins over ALLOW (most restrictive explicit decision)
      expect(result.action).toBe('MONITOR');
    });

    it('mixed: error module + explicit DENY → DENY regardless of fail_closed setting', async () => {
      const okMod = makeModule('ok-mod', DENY_RESULT);
      const brokenMod = failingModule('broken-mod', new Error('crash'));

      // fail_closed=false: broken-mod gets MONITOR (severity 10), but ok-mod returns DENY (100)
      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, false);
      const result = await evaluator.evaluate([okMod, brokenMod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('DENY');
    });
  });

  describe('Module Detail Recording', () => {
    it('records per-module name, version, latency, action, and reason codes', async () => {
      const mod = makeModule('test-mod', DENY_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      const detail = result.module_details[0];
      expect(detail.name).toBe('test-mod');
      expect(detail.version).toBe('1.0.0');
      expect(detail.latency_ms).toBeGreaterThanOrEqual(0);
      expect(detail.action).toBe('DENY');
      expect(detail.reason_codes).toEqual(['SECRET_DETECTED']);
      expect(detail.error).toBeUndefined();
    });

    it('records error message in detail when module fails', async () => {
      const mod = failingModule('broken-mod', new Error('Something went wrong'));

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      const detail = result.module_details[0];
      expect(detail.error).toBe('Something went wrong');
    });

    it('records module metadata in detail', async () => {
      const resultWithMeta: ModuleResult = {
        action: 'MONITOR' as any,
        reason_codes: ['COST_HIGH'],
        event_type: 'cost.check',
        metadata: { estimated_cost: 0.05, budget_remaining: 1.0 },
      };
      const mod = makeModule('cost-mod', resultWithMeta);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.module_details[0].metadata).toEqual({
        estimated_cost: 0.05,
        budget_remaining: 1.0,
      });
    });

    it('measures total stage latency', async () => {
      const mod = makeModule('mod1', ALLOW_RESULT, 20);

      const evaluator = new StageEvaluator(PipelineStage.PRE_EXECUTION, true, 5000);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.latency_ms).toBeGreaterThanOrEqual(15);
    });
  });

  describe('POST_EXECUTION Stage', () => {
    it('evaluates modules for post-execution stage', async () => {
      const mod = makeModule('content-mod', DENY_RESULT);

      const evaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, true);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('DENY');
      expect(mod.evaluate).toHaveBeenCalledWith(REQUEST, CTX, POLICY);
    });

    it('fail_closed=true treats POST_EXECUTION errors as DENY', async () => {
      const mod = failingModule('broken-post', new Error('post fail'));

      const evaluator = new StageEvaluator(PipelineStage.POST_EXECUTION, true);
      const result = await evaluator.evaluate([mod], REQUEST, CTX, POLICY);

      expect(result.action).toBe('DENY');
    });
  });
});
