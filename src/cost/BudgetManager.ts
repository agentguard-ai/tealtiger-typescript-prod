/**
 * Budget Manager
 * 
 * Manages budgets, alerts, and enforcement for cost control
 */

import {
  BudgetConfig,
  BudgetStatus,
  CostAlert,
  CostRecord,
} from './types';
import { ICostStorage } from './CostStorage';
import { generateId } from './utils';

/**
 * Budget enforcement action result
 */
export interface BudgetEnforcementResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Budget that triggered the block (if any) */
  blockedBy?: BudgetConfig | undefined;
  /** Active alerts */
  alerts: CostAlert[];
  /** Current budget status */
  status?: BudgetStatus | undefined;
}

/**
 * Budget Manager class for cost control
 */
export class BudgetManager {
  private budgets: Map<string, BudgetConfig>;
  private alerts: Map<string, CostAlert[]>;
  private storage: ICostStorage;

  constructor(storage: ICostStorage) {
    this.budgets = new Map();
    this.alerts = new Map();
    this.storage = storage;
  }

  /**
   * Create a new budget
   * @param config Budget configuration
   * @returns Created budget
   */
  createBudget(config: Omit<BudgetConfig, 'id' | 'createdAt' | 'updatedAt'>): BudgetConfig {
    if (!Number.isFinite(config.limit) || config.limit <= 0) {
      throw new Error(
        `TealTiger: Budget limit must be > 0. Got ${config.limit} for 'maxCostPerRequest'.`
      );
    }

    const budget: BudgetConfig = {
      ...config,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.budgets.set(budget.id, budget);
    this.alerts.set(budget.id, []);

    return budget;
  }

  /**
   * Update an existing budget
   * @param id Budget ID
   * @param updates Budget updates
   * @returns Updated budget or undefined
   */
  updateBudget(
    id: string,
    updates: Partial<Omit<BudgetConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): BudgetConfig | undefined {
    const budget = this.budgets.get(id);
    if (!budget) {
      return undefined;
    }

    const updated: BudgetConfig = {
      ...budget,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.budgets.set(id, updated);
    return updated;
  }

  /**
   * Delete a budget
   * @param id Budget ID
   * @returns True if deleted
   */
  deleteBudget(id: string): boolean {
    this.alerts.delete(id);
    return this.budgets.delete(id);
  }

  /**
   * Get a budget by ID
   * @param id Budget ID
   * @returns Budget or undefined
   */
  getBudget(id: string): BudgetConfig | undefined {
    return this.budgets.get(id);
  }

  /**
   * Get all budgets
   * @returns Array of budgets
   */
  getAllBudgets(): BudgetConfig[] {
    return Array.from(this.budgets.values());
  }

  /**
   * Get budgets for a specific scope
   * @param scopeType Scope type
   * @param scopeId Scope ID
   * @returns Array of budgets
   */
  getBudgetsByScope(scopeType: 'agent' | 'project' | 'organization', scopeId: string): BudgetConfig[] {
    return Array.from(this.budgets.values()).filter(
      b => b.scope?.type === scopeType && b.scope?.id === scopeId
    );
  }

  /**
   * Check if a cost record would exceed any budgets
   * @param agentId Agent ID
   * @param estimatedCost Estimated cost
   * @returns Enforcement result
   */
  async checkBudget(agentId: string, estimatedCost: number): Promise<BudgetEnforcementResult> {
    const relevantBudgets = this.getRelevantBudgets(agentId);
    const alerts: CostAlert[] = [];
    let blockedBy: BudgetConfig | undefined;

    for (const budget of relevantBudgets) {
      if (!budget.enabled) {
        continue;
      }

      const status = await this.getBudgetStatus(budget.id);
      if (!status) {
        continue;
      }

      // Check if adding this cost would exceed the budget
      const projectedSpending = status.currentSpending + estimatedCost;
      const projectedPercentage = (projectedSpending / budget.limit) * 100;

      // Check for threshold alerts
      for (const threshold of budget.alertThresholds) {
        if (projectedPercentage >= threshold && status.percentageUsed < threshold) {
          const alert = this.createAlert(budget, threshold, projectedSpending);
          alerts.push(alert);
          this.addAlert(budget.id, alert);
        }
      }

      // Check if budget would be exceeded
      if (projectedSpending > budget.limit) {
        if (budget.action === 'block') {
          blockedBy = budget;
          break;
        }
      }
    }

    return {
      allowed: !blockedBy,
      blockedBy,
      alerts,
      status: blockedBy ? await this.getBudgetStatus(blockedBy.id) : undefined,
    };
  }

  /**
   * Record a cost and update budget tracking
   * @param record Cost record
   */
  async recordCost(record: CostRecord): Promise<void> {
    const relevantBudgets = this.getRelevantBudgets(record.agentId);

    for (const budget of relevantBudgets) {
      if (!budget.enabled) {
        continue;
      }

      const status = await this.getBudgetStatus(budget.id);
      if (!status) {
        continue;
      }

      // Check for threshold alerts - generate alerts for any active thresholds
      // that don't already have alerts
      const existingAlerts = this.getAlerts(budget.id);
      const existingThresholds = new Set(existingAlerts.map(a => a.threshold));
      
      for (const threshold of budget.alertThresholds) {
        // Generate alert if we've crossed this threshold and don't have an alert for it yet
        if (status.percentageUsed >= threshold && !existingThresholds.has(threshold)) {
          const alert = this.createAlert(budget, threshold, status.currentSpending);
          this.addAlert(budget.id, alert);
        }
      }
    }
  }

  /**
   * Get budget status
   * @param budgetId Budget ID
   * @returns Budget status or undefined
   */
  async getBudgetStatus(budgetId: string): Promise<BudgetStatus | undefined> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      return undefined;
    }

    const { start, end } = this.getPeriodDates(budget.period);
    
    // Get spending for the period
    let records = await this.storage.getByDateRange(start, end);

    // Filter by scope if applicable
    if (budget.scope) {
      if (budget.scope.type === 'agent') {
        records = records.filter(r => r.agentId === budget.scope!.id);
      }
      // TODO: Add project and organization filtering when those concepts are implemented
    }

    const currentSpending = records.reduce((sum, r) => sum + r.actualCost, 0);
    const remaining = Math.max(0, budget.limit - currentSpending);
    const percentageUsed = (currentSpending / budget.limit) * 100;
    const isExceeded = currentSpending > budget.limit;

    // Get active alerts
    const activeAlerts = budget.alertThresholds.filter(t => percentageUsed >= t);

    return {
      budget,
      currentSpending,
      remaining,
      percentageUsed,
      isExceeded,
      activeAlerts,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get all alerts for a budget
   * @param budgetId Budget ID
   * @returns Array of alerts
   */
  getAlerts(budgetId: string): CostAlert[] {
    return this.alerts.get(budgetId) || [];
  }

  /**
   * Acknowledge an alert
   * @param alertId Alert ID
   * @returns True if acknowledged
   */
  acknowledgeAlert(alertId: string): boolean {
    for (const alerts of this.alerts.values()) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all alerts for a budget
   * @param budgetId Budget ID
   */
  clearAlerts(budgetId: string): void {
    this.alerts.set(budgetId, []);
  }

  /**
   * Get relevant budgets for an agent
   */
  private getRelevantBudgets(agentId: string): BudgetConfig[] {
    return Array.from(this.budgets.values()).filter(b => {
      if (!b.enabled) {
        return false;
      }

      // No scope = applies to all
      if (!b.scope) {
        return true;
      }

      // Agent-specific budget
      if (b.scope.type === 'agent' && b.scope.id === agentId) {
        return true;
      }

      // TODO: Add project and organization scope checking

      return false;
    });
  }

  /**
   * Get period start and end dates
   */
  private getPeriodDates(period: BudgetConfig['period']): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);

    let start: Date;

    switch (period) {
      case 'hourly':
        start = new Date(now);
        start.setMinutes(0, 0, 0);
        break;

      case 'daily':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;

      case 'weekly':
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;

      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;

      case 'total':
        start = new Date(0); // Beginning of time
        break;
    }

    return { start, end };
  }

  /**
   * Create an alert
   */
  private createAlert(
    budget: BudgetConfig,
    threshold: number,
    currentSpending: number
  ): CostAlert {
    const severity: CostAlert['severity'] =
      threshold >= 100 ? 'critical' :
      threshold >= 90 ? 'warning' :
      'info';

    return {
      id: generateId(),
      budgetId: budget.id,
      threshold,
      currentSpending,
      limit: budget.limit,
      message: `Budget "${budget.name}" has reached ${threshold}% (${currentSpending.toFixed(4)} / ${budget.limit} USD)`,
      severity,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };
  }

  /**
   * Add an alert to the budget
   */
  private addAlert(budgetId: string, alert: CostAlert): void {
    const alerts = this.alerts.get(budgetId) || [];
    alerts.push(alert);
    this.alerts.set(budgetId, alerts);
  }
}
