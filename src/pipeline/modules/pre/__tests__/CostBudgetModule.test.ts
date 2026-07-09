/**
 * Unit tests for CostBudgetModule.
 *
 * Validates: Requirements 6.4, 6.6, 6.7
 */

import { CostBudgetModule } from '../CostBudgetModule';
import type { ModuleContext, ModuleEvaluationRequest } from '../../../../core/engine/v1.2/types';

describe('CostBudgetModule', () => {
  const defaultCtx: ModuleContext = {
    correlation_id: 'test-corr-id',
    policy_version: '1.0.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };

  describe('TealModule interface', () => {
    it('should have correct name and version', () => {
      const module = new CostBudgetModule({});
      expect(module.name).toBe('CostBudgetModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should implement evaluate as an async function', () => {
      const module = new CostBudgetModule({});
      expect(typeof module.evaluate).toBe('function');
    });
  });

  describe('ALLOW when within budgets', () => {
    it('should return ALLOW when no budgets are configured', async () => {
      const module = new CostBudgetModule({});
      const request: ModuleEvaluationRequest = { content: 'hello world' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect(result.event_type).toBe('pipeline.cost_budget');
    });

    it('should return ALLOW when estimated cost is within session budget', async () => {
      const module = new CostBudgetModule({
        session_budget: 1.0,
        cost_per_token: 0.001,
      });
      // 12 chars → ~3 tokens → $0.003
      const request: ModuleEvaluationRequest = { content: 'short text!!' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });

    it('should return ALLOW when estimated cost is within daily budget', async () => {
      const module = new CostBudgetModule({
        daily_budget: 10.0,
        cost_per_token: 0.0001,
      });
      const request: ModuleEvaluationRequest = { content: 'hello' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });

    it('should return ALLOW when estimated cost is within agent budget', async () => {
      const module = new CostBudgetModule({
        agent_budget: 5.0,
        cost_per_token: 0.0001,
      });
      const request: ModuleEvaluationRequest = { content: 'hello' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('DENY when budget exceeded', () => {
    it('should return DENY with BUDGET_EXCEEDED when session budget would be exceeded', async () => {
      const module = new CostBudgetModule({
        session_budget: 0.0001,
        cost_per_token: 0.001,
      });
      // 400 chars → ~100 tokens → $0.1 > $0.0001
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(400) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('BUDGET_EXCEEDED');
      expect(result.event_type).toBe('pipeline.cost_budget');
    });

    it('should return DENY when daily budget would be exceeded', async () => {
      const module = new CostBudgetModule({
        daily_budget: 0.0001,
        cost_per_token: 0.001,
      });
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(400) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('BUDGET_EXCEEDED');
    });

    it('should return DENY when agent budget would be exceeded', async () => {
      const module = new CostBudgetModule({
        agent_budget: 0.0001,
        cost_per_token: 0.001,
      });
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(400) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('BUDGET_EXCEEDED');
    });

    it('should deny when accumulated cost plus estimated cost exceeds session budget', async () => {
      const module = new CostBudgetModule({
        session_budget: 0.05,
        cost_per_token: 0.001,
      });
      // Add $0.04 of existing cost
      module.addCost(0.04);

      // 100 chars → ~25 tokens → $0.025 — total $0.065 > $0.05
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(100) };
      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('BUDGET_EXCEEDED');
    });
  });

  describe('token estimation', () => {
    it('should use max_tokens field from request when present', async () => {
      const module = new CostBudgetModule({
        session_budget: 0.001,
        cost_per_token: 0.001,
      });
      // max_tokens=100 → $0.1 > $0.001
      const request: ModuleEvaluationRequest = {
        content: 'short',
        max_tokens: 100,
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
    });

    it('should use maxTokens field from request when present', async () => {
      const module = new CostBudgetModule({
        session_budget: 0.001,
        cost_per_token: 0.001,
      });
      const request: ModuleEvaluationRequest = {
        content: 'short',
        maxTokens: 100,
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
    });

    it('should estimate tokens from content length when no explicit token fields', async () => {
      const module = new CostBudgetModule({
        session_budget: 10.0,
        cost_per_token: 0.001,
      });
      // 100 chars → ceil(100/4) = 25 tokens → $0.025
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(100) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect((result.metadata as any).estimated_cost).toBeCloseTo(0.025, 5);
    });

    it('should default cost_per_token to 0.00003', async () => {
      const module = new CostBudgetModule({
        session_budget: 10.0,
      });
      // 400 chars → 100 tokens → 100 * 0.00003 = $0.003
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(400) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect((result.metadata as any).estimated_cost).toBeCloseTo(0.003, 5);
    });
  });

  describe('addCost() external tracking', () => {
    it('should accumulate costs via addCost()', () => {
      const module = new CostBudgetModule({ session_budget: 1.0 });

      module.addCost(0.1);
      module.addCost(0.2);

      const spent = module.getSpent();
      expect(spent.session).toBeCloseTo(0.3, 10);
      expect(spent.daily).toBeCloseTo(0.3, 10);
      expect(spent.agent).toBeCloseTo(0.3, 10);
    });

    it('should affect subsequent evaluate calls', async () => {
      const module = new CostBudgetModule({
        session_budget: 0.05,
        cost_per_token: 0.001,
      });

      // First request passes: 20 chars → 5 tokens → $0.005
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(20) };
      let result = await module.evaluate(request, defaultCtx, null);
      expect(result.action).toBe('ALLOW');

      // Add cost that nearly fills the budget
      module.addCost(0.045);

      // Same request now exceeds: $0.045 + $0.005 = $0.05 — just at the limit is fine
      // Actually 0.05 > 0.05 is false, so $0.045 + $0.005 = $0.05 exactly — should allow
      result = await module.evaluate(request, defaultCtx, null);
      expect(result.action).toBe('ALLOW');

      // A slightly bigger one should fail
      module.addCost(0.001);
      result = await module.evaluate(request, defaultCtx, null);
      expect(result.action).toBe('DENY');
    });
  });

  describe('resetSession()', () => {
    it('should reset session spent to zero', async () => {
      const module = new CostBudgetModule({ session_budget: 0.01 });
      module.addCost(0.009);

      module.resetSession();

      const spent = module.getSpent();
      expect(spent.session).toBe(0);
      // Daily and agent should remain
      expect(spent.daily).toBeCloseTo(0.009, 10);
      expect(spent.agent).toBeCloseTo(0.009, 10);
    });
  });

  describe('metadata', () => {
    it('should include estimated_cost and spent amounts in metadata on ALLOW', async () => {
      const module = new CostBudgetModule({
        session_budget: 10.0,
        cost_per_token: 0.001,
      });
      module.addCost(0.5);
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(40) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.metadata).toBeDefined();
      expect((result.metadata as any).estimated_cost).toBeGreaterThan(0);
      expect((result.metadata as any).session_spent).toBe(0.5);
      expect((result.metadata as any).daily_spent).toBe(0.5);
      expect((result.metadata as any).agent_spent).toBe(0.5);
    });

    it('should include exceeded_budgets list in metadata on DENY', async () => {
      const module = new CostBudgetModule({
        session_budget: 0.0001,
        daily_budget: 0.0001,
        cost_per_token: 0.01,
      });
      const request: ModuleEvaluationRequest = { content: 'a'.repeat(100) };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect((result.metadata as any).exceeded_budgets).toBeDefined();
      expect((result.metadata as any).exceeded_budgets.length).toBeGreaterThan(0);
    });
  });

  describe('empty content', () => {
    it('should handle empty content gracefully', async () => {
      const module = new CostBudgetModule({
        session_budget: 1.0,
        cost_per_token: 0.001,
      });
      const request: ModuleEvaluationRequest = { content: '' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect((result.metadata as any).estimated_cost).toBe(0);
    });

    it('should handle undefined content gracefully', async () => {
      const module = new CostBudgetModule({
        session_budget: 1.0,
        cost_per_token: 0.001,
      });
      const request: ModuleEvaluationRequest = {};

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect((result.metadata as any).estimated_cost).toBe(0);
    });
  });
});
