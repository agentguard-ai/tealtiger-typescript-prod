import { BudgetManager } from '../BudgetManager';
import { InMemoryCostStorage } from '../CostStorage';
import { BudgetConfig, CostRecord } from '../types';

describe('BudgetManager alert thresholds', () => {
  let manager: BudgetManager;
  let storage: InMemoryCostStorage;

  beforeEach(() => {
    storage = new InMemoryCostStorage();
    manager = new BudgetManager(storage);
  });

  const createBudget = (
    overrides: Partial<Omit<BudgetConfig, 'id' | 'createdAt' | 'updatedAt'>> = {},
  ): BudgetConfig =>
    manager.createBudget({
      name: 'Alert Budget',
      limit: 100,
      period: 'daily',
      alertThresholds: [50, 75, 90],
      action: 'alert',
      enabled: true,
      ...overrides,
    });

  const createCostRecord = (actualCost: number, overrides: Partial<CostRecord> = {}): CostRecord => ({
    id: `record-${actualCost}-${overrides.agentId ?? 'agent-1'}-${Date.now()}`,
    requestId: 'request-1',
    agentId: 'agent-1',
    model: 'gpt-4',
    provider: 'openai',
    actualTokens: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    actualCost,
    breakdown: {
      inputCost: actualCost / 2,
      outputCost: actualCost / 2,
    },
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  const storeSpending = async (actualCost: number): Promise<void> => {
    await storage.store(createCostRecord(actualCost));
  };

  it.each([
    [50, 49, 1],
    [75, 74, 1],
    [90, 89, 1],
  ])('fires when projected spending reaches exactly %i%%', async (threshold, currentSpend, nextCost) => {
    createBudget({ alertThresholds: [threshold] });
    await storeSpending(currentSpend);

    const result = await manager.checkBudget('agent-1', nextCost);

    expect(result.allowed).toBe(true);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      threshold,
      currentSpending: currentSpend + nextCost,
      limit: 100,
    });
  });

  it.each([
    [50, 49.99],
    [75, 74.99],
    [90, 89.99],
  ])('does not fire below the %i%% threshold', async (threshold, projectedSpend) => {
    createBudget({ alertThresholds: [threshold] });

    const result = await manager.checkBudget('agent-1', projectedSpend);

    expect(result.allowed).toBe(true);
    expect(result.alerts).toEqual([]);
    expect(manager.getAlerts(manager.getAllBudgets()[0].id)).toEqual([]);
  });

  it('fires each threshold only once across repeated budget checks', async () => {
    const budget = createBudget({ alertThresholds: [50] });
    await storeSpending(49);

    const first = await manager.checkBudget('agent-1', 1);
    const second = await manager.checkBudget('agent-1', 1);

    expect(first.alerts).toHaveLength(1);
    expect(second.alerts).toEqual([]);
    expect(manager.getAlerts(budget.id).map(alert => alert.threshold)).toEqual([50]);
  });

  it('fires only newly crossed thresholds when prior thresholds already alerted', async () => {
    const budget = createBudget({ alertThresholds: [50, 75, 90] });
    await storeSpending(49);

    await manager.checkBudget('agent-1', 1);
    await storeSpending(25);

    const result = await manager.checkBudget('agent-1', 1);

    expect(result.alerts.map(alert => alert.threshold)).toEqual([75]);
    expect(manager.getAlerts(budget.id).map(alert => alert.threshold)).toEqual([50, 75]);
  });

  it('does not create duplicate alerts when recordCost is called repeatedly for the same threshold', async () => {
    const budget = createBudget({ alertThresholds: [50] });
    const record = createCostRecord(60);

    await storage.store(record);
    await manager.recordCost(record);
    await manager.recordCost(record);

    expect(manager.getAlerts(budget.id).map(alert => alert.threshold)).toEqual([50]);
  });

  it('handles a zero-dollar budget without generating threshold alerts', async () => {
    const budget = createBudget({ limit: 0, alertThresholds: [50, 75, 90], action: 'block' });

    const result = await manager.checkBudget('agent-1', 0);
    const status = await manager.getBudgetStatus(budget.id);

    expect(result.allowed).toBe(true);
    expect(result.alerts).toEqual([]);
    expect(status?.percentageUsed).toBe(0);
    expect(status?.activeAlerts).toEqual([]);
  });
});
