/**
 * RemediationHandler — Unit Tests
 *
 * Tests action selection (RESAMPLE > REDACT > DENY_RESPONSE),
 * resample loop with budget enforcement, and redaction delegation.
 *
 * @requirements 4.4, 4.5, 4.6, 4.7
 */

import { RemediationHandler } from '../RemediationHandler';
import type { ExecutionStageInterface, StageEvaluatorInterface } from '../RemediationHandler';
import { RemediationAction } from '../types';
import type { ModuleEvalDetail } from '../types';

// ── Helpers ──────────────────────────────────────────────────────

const makeDetail = (
  action: string,
  metadata?: Record<string, unknown>,
): ModuleEvalDetail => {
  const detail: ModuleEvalDetail = {
    name: 'test-module',
    version: '1.0.0',
    latency_ms: 10,
    action,
    reason_codes: ['TEST_REASON'],
  };
  if (metadata !== undefined) {
    detail.metadata = metadata;
  }
  return detail;
};

const mockExecutionStage = (responses: Array<{ success: boolean; response: any }>): ExecutionStageInterface => {
  let callIndex = 0;
  return {
    execute: jest.fn().mockImplementation(async () => {
      const result = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return { ...result, metadata: null };
    }),
  };
};

const mockEvaluator = (results: Array<{ action: string; reason_codes?: string[] }>): StageEvaluatorInterface => {
  let callIndex = 0;
  return {
    evaluate: jest.fn().mockImplementation(async () => {
      const result = results[callIndex] ?? results[results.length - 1];
      callIndex++;
      return {
        action: result.action,
        reason_codes: result.reason_codes ?? [],
        module_details: [],
        latency_ms: 5,
      };
    }),
  };
};

// ── selectAction Tests ───────────────────────────────────────────

describe('RemediationHandler', () => {
  describe('selectAction()', () => {
    it('should return DENY_RESPONSE when no modules have remediation metadata', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', {}),
        makeDetail('DENY', { some_field: 'value' }),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.DENY_RESPONSE);
    });

    it('should return RESAMPLE when any module metadata specifies "resample"', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'redact' }),
        makeDetail('DENY', { remediation: 'resample' }),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.RESAMPLE);
    });

    it('should return REDACT when module metadata specifies "redact" and none say "resample"', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'redact' }),
        makeDetail('DENY', {}),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.REDACT);
    });

    it('should prioritize RESAMPLE over REDACT', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'redact' }),
        makeDetail('DENY', { remediation: 'resample' }),
        makeDetail('DENY', { remediation: 'redact' }),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.RESAMPLE);
    });

    it('should ignore remediation metadata from non-DENY modules', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('ALLOW', { remediation: 'resample' }),
        makeDetail('MONITOR', { remediation: 'redact' }),
        makeDetail('DENY', {}),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.DENY_RESPONSE);
    });

    it('should treat REDACT-level actions (severity >= 70) as DENY for selection', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('REDACT', { remediation: 'resample' }),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.RESAMPLE);
    });

    it('should be case-insensitive for remediation values', () => {
      const handler = new RemediationHandler(2);
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'RESAMPLE' }),
      ];

      expect(handler.selectAction(details)).toBe(RemediationAction.RESAMPLE);
    });

    it('should return DENY_RESPONSE when moduleDetails array is empty', () => {
      const handler = new RemediationHandler(2);
      expect(handler.selectAction([])).toBe(RemediationAction.DENY_RESPONSE);
    });
  });

  // ── executeResampleLoop Tests ────────────────────────────────────

  describe('executeResampleLoop()', () => {
    const request = { payload: { model: 'gpt-4', messages: [] } };
    const ctx = {
      correlation_id: 'test-123',
      policy_version: '1.0',
      teec_version: '2.1',
      timestamp: Date.now(),
    };

    it('should return success when resampled response passes post-stage', async () => {
      const handler = new RemediationHandler(3);
      const execStage = mockExecutionStage([
        { success: true, response: { text: 'clean response' } },
      ]);
      const evaluator = mockEvaluator([{ action: 'ALLOW' }]);

      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 0,
      );

      expect(result.success).toBe(true);
      expect(result.response).toEqual({ text: 'clean response' });
      expect(result.resampleCount).toBe(1);
      expect(result.exhausted).toBe(false);
    });

    it('should retry until budget is exhausted when post-stage keeps denying', async () => {
      const handler = new RemediationHandler(2);
      const execStage = mockExecutionStage([
        { success: true, response: { text: 'bad 1' } },
        { success: true, response: { text: 'bad 2' } },
      ]);
      const evaluator = mockEvaluator([
        { action: 'DENY' },
        { action: 'DENY' },
      ]);

      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 0,
      );

      expect(result.success).toBe(false);
      expect(result.response).toBeNull();
      expect(result.resampleCount).toBe(2);
      expect(result.exhausted).toBe(true);
    });

    it('should succeed on second resample if first fails post-stage', async () => {
      const handler = new RemediationHandler(3);
      const execStage = mockExecutionStage([
        { success: true, response: { text: 'toxic content' } },
        { success: true, response: { text: 'clean content' } },
      ]);
      const evaluator = mockEvaluator([
        { action: 'DENY' },
        { action: 'ALLOW' },
      ]);

      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 0,
      );

      expect(result.success).toBe(true);
      expect(result.response).toEqual({ text: 'clean content' });
      expect(result.resampleCount).toBe(2);
      expect(result.exhausted).toBe(false);
    });

    it('should respect currentAttempt parameter (resume from previous attempts)', async () => {
      const handler = new RemediationHandler(2);
      const execStage = mockExecutionStage([
        { success: true, response: { text: 'still bad' } },
      ]);
      const evaluator = mockEvaluator([{ action: 'DENY' }]);

      // Starting from attempt 1 with budget of 2 → only 1 more attempt allowed
      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 1,
      );

      expect(result.success).toBe(false);
      expect(result.resampleCount).toBe(2);
      expect(result.exhausted).toBe(true);
      expect(execStage.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle provider errors during resample as failed attempts', async () => {
      const handler = new RemediationHandler(2);
      const execStage = mockExecutionStage([
        { success: false, response: null },
        { success: false, response: null },
      ]);
      const evaluator = mockEvaluator([]);

      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 0,
      );

      expect(result.success).toBe(false);
      expect(result.exhausted).toBe(true);
      expect(result.resampleCount).toBe(2);
    });

    it('should never exceed resampleBudget invocations', async () => {
      const handler = new RemediationHandler(1);
      const execStage = mockExecutionStage([
        { success: true, response: { text: 'bad' } },
        { success: true, response: { text: 'bad 2' } },
      ]);
      const evaluator = mockEvaluator([{ action: 'DENY' }, { action: 'DENY' }]);

      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 0,
      );

      expect(execStage.execute).toHaveBeenCalledTimes(1);
      expect(result.resampleCount).toBe(1);
      expect(result.exhausted).toBe(true);
    });

    it('should return immediately exhausted when budget is 0', async () => {
      const handler = new RemediationHandler(0);
      const execStage = mockExecutionStage([]);
      const evaluator = mockEvaluator([]);

      const result = await handler.executeResampleLoop(
        request, execStage, evaluator, [], ctx, null, 0,
      );

      expect(result.success).toBe(false);
      expect(result.exhausted).toBe(true);
      expect(result.resampleCount).toBe(0);
      expect(execStage.execute).not.toHaveBeenCalled();
    });
  });

  // ── applyRedaction Tests ─────────────────────────────────────────

  describe('applyRedaction()', () => {
    it('should return original response when no redaction function found', async () => {
      const handler = new RemediationHandler(2);
      const response = { text: 'original content' };
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'redact' }),
      ];

      const result = await handler.applyRedaction(response, details);
      expect(result).toEqual(response);
    });

    it('should call metadata.redact function when present', async () => {
      const handler = new RemediationHandler(2);
      const response = { text: 'SSN: 123-45-6789' };
      const redactFn = jest.fn().mockReturnValue({ text: 'SSN: [REDACTED]' });
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'redact', redact: redactFn }),
      ];

      const result = await handler.applyRedaction(response, details);
      expect(redactFn).toHaveBeenCalledWith(response);
      expect(result).toEqual({ text: 'SSN: [REDACTED]' });
    });

    it('should call metadata.redaction_fn when redact is not present', async () => {
      const handler = new RemediationHandler(2);
      const response = { text: 'Email: test@example.com' };
      const redactionFn = jest.fn().mockReturnValue({ text: 'Email: [REDACTED]' });
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { remediation: 'redact', redaction_fn: redactionFn }),
      ];

      const result = await handler.applyRedaction(response, details);
      expect(redactionFn).toHaveBeenCalledWith(response);
      expect(result).toEqual({ text: 'Email: [REDACTED]' });
    });

    it('should chain multiple redaction functions', async () => {
      const handler = new RemediationHandler(2);
      const response = { text: 'SSN: 123 Email: test@ex.com' };
      const redactSSN = jest.fn().mockReturnValue({ text: '[SSN] Email: test@ex.com' });
      const redactEmail = jest.fn().mockReturnValue({ text: '[SSN] Email: [REDACTED]' });

      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { redact: redactSSN }),
        makeDetail('DENY', { redact: redactEmail }),
      ];

      const result = await handler.applyRedaction(response, details);
      expect(redactSSN).toHaveBeenCalledWith(response);
      expect(redactEmail).toHaveBeenCalledWith({ text: '[SSN] Email: test@ex.com' });
      expect(result).toEqual({ text: '[SSN] Email: [REDACTED]' });
    });

    it('should handle async redaction functions', async () => {
      const handler = new RemediationHandler(2);
      const response = { text: 'sensitive data' };
      const asyncRedactFn = jest.fn().mockResolvedValue({ text: '[REDACTED]' });
      const details: ModuleEvalDetail[] = [
        makeDetail('DENY', { redact: asyncRedactFn }),
      ];

      const result = await handler.applyRedaction(response, details);
      expect(result).toEqual({ text: '[REDACTED]' });
    });

    it('should ignore redaction functions from non-DENY modules', async () => {
      const handler = new RemediationHandler(2);
      const response = { text: 'content' };
      const redactFn = jest.fn().mockReturnValue({ text: 'modified' });
      const details: ModuleEvalDetail[] = [
        makeDetail('ALLOW', { redact: redactFn }),
        makeDetail('MONITOR', { redact: redactFn }),
      ];

      const result = await handler.applyRedaction(response, details);
      expect(redactFn).not.toHaveBeenCalled();
      expect(result).toEqual(response);
    });
  });
});
