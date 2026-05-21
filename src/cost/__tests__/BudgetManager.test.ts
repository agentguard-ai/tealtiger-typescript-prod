/**
 * Budget Manager Tests
 */

import { BudgetManager } from '../BudgetManager';
import { InMemoryCostStorage } from '../CostStorage';
import { CostRecord } from '../types';

describe('BudgetManager', () => {
  let manager: BudgetManager;
  let storage: InMemoryCostStorage;

  beforeEach(() => {
    storage = new InMemoryCostStorage();
    manager = new BudgetManager(storage);
  });

  const createMockRecord = (overrides: Partial<CostRecord> = {}): CostRecord => ({
    id: `record-${Date.now()}-${Math.random()}`,
    requestId: 'req-123',
    agentId: 'agent-456',
    model: 'gpt-4',
    provider: 'openai',
    actualTokens: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    },
    actualCost: 0.06,
    breakdown: {
      inputCost: 0.03,
      outputCost: 0.03,
    },
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  describe('createBudget', () => {
    it('should create a new budget', () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      expect(budget.id).toBeDefined();
      expect(budget.name).toBe('Test Budget');
      expect(budget.limit).toBe(10.0);
      expect(budget.period).toBe('daily');
      expect(budget.createdAt).toBeDefined();
      expect(budget.updatedAt).toBeDefined();
    });

    it('should reject zero budget limit with actionable message', () => {
      expect(() => manager.createBudget({
        name: 'Zero Budget',
        limit: 0,
        period: 'daily',
        alertThresholds: [100],
        action: 'block',
        enabled: true,
      })).toThrow(
        "TealTiger: Budget limit must be > 0. Got 0 for 'maxCostPerRequest'."
      );
    });

    it('should create budget with scope', () => {
      const budget = manager.createBudget({
        name: 'Agent Budget',
        limit: 5.0,
        period: 'monthly',
        alertThresholds: [80, 100],
        action: 'block',
        scope: {
          type: 'agent',
          id: 'agent-123',
        },
        enabled: true,
      });

      expect(budget.scope).toEqual({
        type: 'agent',
        id: 'agent-123',
      });
    });
  });

  describe('updateBudget', () => {
    it('should update an existing budget', () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      const updated = manager.updateBudget(budget.id, {
        limit: 20.0,
        action: 'block',
      });

      expect(updated).toBeDefined();
      expect(updated?.limit).toBe(20.0);
      expect(updated?.action).toBe('block');
      expect(updated?.name).toBe('Test Budget'); // Unchanged
    });

    it('should return undefined for non-existent budget', () => {
      const updated = manager.updateBudget('non-existent', {
        limit: 20.0,
      });

      expect(updated).toBeUndefined();
    });
  });

  describe('deleteBudget', () => {
    it('should delete a budget', () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      const deleted = manager.deleteBudget(budget.id);

      expect(deleted).toBe(true);
      expect(manager.getBudget(budget.id)).toBeUndefined();
    });

    it('should return false for non-existent budget', () => {
      const deleted = manager.deleteBudget('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('getBudget', () => {
    it('should retrieve a budget by ID', () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      const retrieved = manager.getBudget(budget.id);

      expect(retrieved).toEqual(budget);
    });

    it('should return undefined for non-existent budget', () => {
      const retrieved = manager.getBudget('non-existent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllBudgets', () => {
    it('should return all budgets', () => {
      manager.createBudget({
        name: 'Budget 1',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        enabled: true,
      });

      manager.createBudget({
        name: 'Budget 2',
        limit: 20.0,
        period: 'monthly',
        alertThresholds: [100],
        action: 'block',
        enabled: true,
      });

      const budgets = manager.getAllBudgets();

      expect(budgets).toHaveLength(2);
    });

    it('should return empty array when no budgets exist', () => {
      const budgets = manager.getAllBudgets();

      expect(budgets).toEqual([]);
    });
  });

  describe('getBudgetsByScope', () => {
    it('should filter budgets by scope', () => {
      manager.createBudget({
        name: 'Agent Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        scope: {
          type: 'agent',
          id: 'agent-1',
        },
        enabled: true,
      });

      manager.createBudget({
        name: 'Another Agent Budget',
        limit: 20.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        scope: {
          type: 'agent',
          id: 'agent-2',
        },
        enabled: true,
      });

      const budgets = manager.getBudgetsByScope('agent', 'agent-1');

      expect(budgets).toHaveLength(1);
      expect(budgets[0].scope?.id).toBe('agent-1');
    });
  });

  describe('checkBudget', () => {
    it('should allow request when under budget', async () => {
      manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'block',
        enabled: true,
      });

      const result = await manager.checkBudget('agent-123', 0.05);

      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    it('should block request when over budget', async () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'block',
        enabled: true,
      });

      // Add some existing spending
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 0.95,
      }));

      const result = await manager.checkBudget('agent-123', 0.10);

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toEqual(budget);
    });

    it('should generate alerts at thresholds', async () => {
      manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      // Add spending to reach 50% threshold
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 0.45,
      }));

      const result = await manager.checkBudget('agent-123', 0.10);

      expect(result.allowed).toBe(true);
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].threshold).toBe(50);
    });

    it('should not block when action is alert', async () => {
      manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        enabled: true,
      });

      // Add spending over budget
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 0.95,
      }));

      const result = await manager.checkBudget('agent-123', 0.10);

      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    it('should respect agent-scoped budgets', async () => {
      manager.createBudget({
        name: 'Agent 1 Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'block',
        scope: {
          type: 'agent',
          id: 'agent-1',
        },
        enabled: true,
      });

      // Add spending for agent-1
      await storage.store(createMockRecord({
        agentId: 'agent-1',
        actualCost: 0.95,
      }));

      // Check budget for agent-2 (should be allowed)
      const result = await manager.checkBudget('agent-2', 0.10);

      expect(result.allowed).toBe(true);
    });

    it('should skip disabled budgets', async () => {
      manager.createBudget({
        name: 'Disabled Budget',
        limit: 0.01,
        period: 'daily',
        alertThresholds: [100],
        action: 'block',
        enabled: false,
      });

      const result = await manager.checkBudget('agent-123', 1.0);

      expect(result.allowed).toBe(true);
    });
  });

  describe('getBudgetStatus', () => {
    it('should calculate budget status', async () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      // Add some spending
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 3.0,
      }));

      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 2.0,
      }));

      const status = await manager.getBudgetStatus(budget.id);

      expect(status).toBeDefined();
      expect(status?.currentSpending).toBe(5.0);
      expect(status?.remaining).toBe(5.0);
      expect(status?.percentageUsed).toBe(50);
      expect(status?.isExceeded).toBe(false);
      expect(status?.activeAlerts).toEqual([50]);
    });

    it('should show exceeded status', async () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        enabled: true,
      });

      // Add spending over budget
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 1.5,
      }));

      const status = await manager.getBudgetStatus(budget.id);

      expect(status?.isExceeded).toBe(true);
      expect(status?.remaining).toBe(0);
      expect(status?.percentageUsed).toBe(150);
    });

    it('should filter by agent scope', async () => {
      const budget = manager.createBudget({
        name: 'Agent Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        scope: {
          type: 'agent',
          id: 'agent-1',
        },
        enabled: true,
      });

      // Add spending for different agents
      await storage.store(createMockRecord({
        agentId: 'agent-1',
        actualCost: 3.0,
      }));

      await storage.store(createMockRecord({
        agentId: 'agent-2',
        actualCost: 5.0,
      }));

      const status = await manager.getBudgetStatus(budget.id);

      expect(status?.currentSpending).toBe(3.0); // Only agent-1
    });

    it('should return undefined for non-existent budget', async () => {
      const status = await manager.getBudgetStatus('non-existent');

      expect(status).toBeUndefined();
    });
  });

  describe('recordCost', () => {
    it('should generate alerts when recording costs', async () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      // Record cost that crosses 50% threshold
      const record = createMockRecord({
        agentId: 'agent-123',
        actualCost: 0.6,
      });

      await storage.store(record);
      await manager.recordCost(record);

      const alerts = manager.getAlerts(budget.id);

      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('alerts', () => {
    it('should get alerts for a budget', () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      const alerts = manager.getAlerts(budget.id);

      expect(alerts).toEqual([]);
    });

    it('should acknowledge an alert', async () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [50],
        action: 'alert',
        enabled: true,
      });

      // Trigger alert
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 0.45,
      }));

      const result = await manager.checkBudget('agent-123', 0.10);
      const alertId = result.alerts[0]?.id;

      expect(alertId).toBeDefined();

      const acknowledged = manager.acknowledgeAlert(alertId);

      expect(acknowledged).toBe(true);

      const alerts = manager.getAlerts(budget.id);
      const alert = alerts.find(a => a.id === alertId);

      expect(alert?.acknowledged).toBe(true);
    });

    it('should clear alerts for a budget', async () => {
      const budget = manager.createBudget({
        name: 'Test Budget',
        limit: 1.0,
        period: 'daily',
        alertThresholds: [50],
        action: 'alert',
        enabled: true,
      });

      // Trigger alert
      await storage.store(createMockRecord({
        agentId: 'agent-123',
        actualCost: 0.45,
      }));

      await manager.checkBudget('agent-123', 0.10);

      manager.clearAlerts(budget.id);

      const alerts = manager.getAlerts(budget.id);

      expect(alerts).toEqual([]);
    });
  });

  describe('period calculations', () => {
    it('should calculate daily period correctly', async () => {
      const budget = manager.createBudget({
        name: 'Daily Budget',
        limit: 10.0,
        period: 'daily',
        alertThresholds: [100],
        action: 'alert',
        enabled: true,
      });

      const status = await manager.getBudgetStatus(budget.id);

      expect(status).toBeDefined();
      expect(status?.periodStart).toBeDefined();
      expect(status?.periodEnd).toBeDefined();

      const start = new Date(status!.periodStart);
      const end = new Date(status!.periodEnd);

      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    });

    it('should calculate monthly period correctly', async () => {
      const budget = manager.createBudget({
        name: 'Monthly Budget',
        limit: 100.0,
        period: 'monthly',
        alertThresholds: [100],
        action: 'alert',
        enabled: true,
      });

      const status = await manager.getBudgetStatus(budget.id);

      expect(status).toBeDefined();

      const start = new Date(status!.periodStart);

      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
    });
  });
});
