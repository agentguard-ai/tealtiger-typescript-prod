/**
 * Unit tests for CostReconciliationModule.
 *
 * Validates: Requirements 7.5, 7.6, 7.7
 *
 * Covers:
 * - MONITOR with COST_OVERRUN when actual tokens exceed estimate by > tolerance
 * - ALLOW when actual tokens are within tolerance
 * - ALLOW when estimates or actuals are missing
 * - Custom tolerance_pct configuration
 * - Metadata includes overrun details
 * - Token extraction from _execution_metadata and _response.usage
 * - TealModule interface compliance
 */

import { CostReconciliationModule } from '../CostReconciliationModule';
import type { ModuleContext, ModuleEvaluationRequest } from '../../../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-cost-recon-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
});

const makeRequest = (
  overrides: Partial<ModuleEvaluationRequest> = {},
): ModuleEvaluationRequest => ({
  content: 'test content',
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe('CostReconciliationModule', () => {
  describe('TealModule interface', () => {
    it('should have correct name and version', () => {
      const module = new CostReconciliationModule();
      expect(module.name).toBe('CostReconciliationModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should implement evaluate as an async function', () => {
      const module = new CostReconciliationModule();
      expect(typeof module.evaluate).toBe('function');
    });

    it('should return a valid ModuleResult structure', async () => {
      const module = new CostReconciliationModule();

      const result = await module.evaluate(makeRequest(), makeCtx(), undefined);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason_codes');
      expect(result).toHaveProperty('event_type');
      expect(result.event_type).toBe('pipeline.cost_reconciliation');
    });
  });

  describe('MONITOR when cost exceeds tolerance', () => {
    it('should return MONITOR when actual tokens exceed estimate by > 20% (default)', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 125 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('COST_OVERRUN');
      expect(result.event_type).toBe('pipeline.cost_reconciliation');
    });

    it('should return MONITOR when actual is exactly 21% over estimate', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 1000,
        _execution_metadata: { usage: { total_tokens: 1210 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('COST_OVERRUN');
    });

    it('should return MONITOR for large overruns (200% over)', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 500,
        _execution_metadata: { usage: { total_tokens: 1500 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('COST_OVERRUN');
      expect((result.metadata as any).overrun_pct).toBe(2.0);
    });

    it('should include overrun metadata on MONITOR', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 150 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('MONITOR');
      expect(result.metadata).toMatchObject({
        module: 'CostReconciliationModule',
        actual_tokens: 150,
        estimated_tokens: 100,
        overrun_pct: 0.5,
        tolerance_pct: 0.2,
        reconciliation_possible: true,
      });
    });
  });

  describe('ALLOW when within tolerance', () => {
    it('should return ALLOW when actual equals estimate (0% overrun)', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 100 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when actual is below estimate', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 200,
        _execution_metadata: { usage: { total_tokens: 150 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when exactly at 20% overrun (not exceeding)', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 120 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when 19% over (within tolerance)', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 1000,
        _execution_metadata: { usage: { total_tokens: 1190 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should include metadata on ALLOW when reconciliation is possible', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 110 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.metadata).toMatchObject({
        module: 'CostReconciliationModule',
        actual_tokens: 110,
        estimated_tokens: 100,
        overrun_pct: 0.1,
        tolerance_pct: 0.2,
        reconciliation_possible: true,
      });
    });
  });

  describe('ALLOW when data is missing', () => {
    it('should return ALLOW when no estimated_tokens provided', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _execution_metadata: { usage: { total_tokens: 150 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect((result.metadata as any).reconciliation_possible).toBe(false);
    });

    it('should return ALLOW when no execution_metadata provided', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect((result.metadata as any).reconciliation_possible).toBe(false);
    });

    it('should return ALLOW when both estimated and actual are missing', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({});

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect((result.metadata as any).reconciliation_possible).toBe(false);
    });

    it('should return ALLOW when estimated_tokens is zero', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 0,
        _execution_metadata: { usage: { total_tokens: 150 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect((result.metadata as any).reconciliation_possible).toBe(false);
    });

    it('should return ALLOW when estimated_tokens is negative', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: -50,
        _execution_metadata: { usage: { total_tokens: 150 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect((result.metadata as any).reconciliation_possible).toBe(false);
    });
  });

  describe('custom tolerance configuration', () => {
    it('should use custom tolerance_pct (10%)', async () => {
      const module = new CostReconciliationModule({ tolerance_pct: 0.1 });
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 115 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      // 15% overrun > 10% tolerance → MONITOR
      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('COST_OVERRUN');
      expect((result.metadata as any).tolerance_pct).toBe(0.1);
    });

    it('should use custom tolerance_pct (50%)', async () => {
      const module = new CostReconciliationModule({ tolerance_pct: 0.5 });
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 140 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      // 40% overrun <= 50% tolerance → ALLOW
      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return MONITOR with zero tolerance when any overrun occurs', async () => {
      const module = new CostReconciliationModule({ tolerance_pct: 0 });
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 101 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      // 1% overrun > 0% tolerance → MONITOR
      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('COST_OVERRUN');
    });
  });

  describe('token extraction from _response.usage', () => {
    it('should extract actual tokens from _response.usage as fallback', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _response: { usage: { total_tokens: 150 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      // 50% overrun > 20% tolerance → MONITOR
      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('COST_OVERRUN');
      expect((result.metadata as any).actual_tokens).toBe(150);
    });

    it('should prefer _execution_metadata over _response.usage', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 100,
        _execution_metadata: { usage: { total_tokens: 110 } },
        _response: { usage: { total_tokens: 200 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      // Should use 110 from _execution_metadata (10% overrun, within 20% tolerance)
      expect(result.action).toBe('ALLOW');
      expect((result.metadata as any).actual_tokens).toBe(110);
    });
  });

  describe('never returns DENY', () => {
    it('should return MONITOR (not DENY) even for extreme overruns', async () => {
      const module = new CostReconciliationModule();
      const request = makeRequest({
        _estimated_tokens: 10,
        _execution_metadata: { usage: { total_tokens: 10000 } },
      });

      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('MONITOR');
      expect(result.action).not.toBe('DENY');
      expect(result.reason_codes).toContain('COST_OVERRUN');
    });
  });
});
