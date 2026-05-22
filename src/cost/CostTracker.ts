/**
 * Cost Tracker
 * 
 * Tracks and monitors AI model costs with budget enforcement
 */

import {
  CostTrackerConfig,
  CostEstimate,
  CostRecord,
  TokenUsage,
  ModelProvider,
  ModelPricing,
} from './types';
import { getModelPricing } from './pricing';
import { generateId } from './utils';
import { createLogger, getDefaultLogger, Logger } from '../utils/logger';

/**
 * Default configuration for cost tracker
 */
const DEFAULT_CONFIG: CostTrackerConfig = {
  enabled: true,
  persistRecords: true,
  enableBudgets: true,
  enableAlerts: true,
};

/**
 * CostTracker class for monitoring and tracking AI model costs
 */
export class CostTracker {
  private config: CostTrackerConfig;
  private customPricing: Map<string, ModelPricing>;
  private logger: Logger;

  constructor(config: Partial<CostTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.customPricing = new Map();
    this.logger = createLogger({
      sink: this.config.logger ?? getDefaultLogger(),
      debugEnabled: false,
    });

    // Load custom pricing if provided
    if (config.customPricing) {
      for (const [model, pricing] of Object.entries(config.customPricing)) {
        const basePricing = getModelPricing(model);
        if (basePricing) {
          this.customPricing.set(model, { ...basePricing, ...pricing });
        }
      }
    }
  }

  /**
   * Estimate cost before API call
   * @param model Model identifier
   * @param estimatedTokens Estimated token usage
   * @param provider Optional provider override
   * @returns Cost estimate
   */
  estimateCost(
    model: string,
    estimatedTokens: TokenUsage,
    provider?: ModelProvider
  ): CostEstimate {
    if (!this.config.enabled) {
      return this.createZeroCostEstimate(model, provider || 'openai', estimatedTokens);
    }

    // Get pricing (custom or default)
    const pricing = this.customPricing.get(model) || getModelPricing(model, provider);

    if (!pricing) {
      this.logger.warn(`[CostTracker] No pricing found for model: ${model}`);
      return this.createZeroCostEstimate(model, provider || 'custom', estimatedTokens);
    }

    // Calculate costs
    const inputCost = (estimatedTokens.inputTokens / 1000) * pricing.inputCostPer1K;
    const outputCost = (estimatedTokens.outputTokens / 1000) * pricing.outputCostPer1K;
    const imageCost = estimatedTokens.images && pricing.imageCost
      ? estimatedTokens.images * pricing.imageCost
      : 0;
    const audioCost = estimatedTokens.audioDuration && pricing.audioCostPerSecond
      ? estimatedTokens.audioDuration * pricing.audioCostPerSecond
      : 0;

    const estimatedCost = inputCost + outputCost + imageCost + audioCost;

    return {
      estimatedCost,
      model: pricing.model,
      provider: pricing.provider,
      estimatedTokens,
      breakdown: {
        inputCost,
        outputCost,
        ...(imageCost > 0 && { imageCost }),
        ...(audioCost > 0 && { audioCost }),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate actual cost after API call
   * @param requestId Request identifier
   * @param agentId Agent identifier
   * @param model Model used
   * @param actualTokens Actual token usage
   * @param provider Optional provider override
   * @param metadata Optional additional metadata
   * @returns Cost record
   */
  calculateActualCost(
    requestId: string,
    agentId: string,
    model: string,
    actualTokens: TokenUsage,
    provider?: ModelProvider,
    metadata?: Record<string, any>
  ): CostRecord {
    if (!this.config.enabled) {
      return this.createZeroCostRecord(requestId, agentId, model, provider || 'openai', actualTokens);
    }

    // Get pricing (custom or default)
    const pricing = this.customPricing.get(model) || getModelPricing(model, provider);

    if (!pricing) {
      this.logger.warn(`[CostTracker] No pricing found for model: ${model}`);
      return this.createZeroCostRecord(requestId, agentId, model, provider || 'custom', actualTokens);
    }

    // Calculate costs
    const inputCost = (actualTokens.inputTokens / 1000) * pricing.inputCostPer1K;
    const outputCost = (actualTokens.outputTokens / 1000) * pricing.outputCostPer1K;
    const imageCost = actualTokens.images && pricing.imageCost
      ? actualTokens.images * pricing.imageCost
      : 0;
    const audioCost = actualTokens.audioDuration && pricing.audioCostPerSecond
      ? actualTokens.audioDuration * pricing.audioCostPerSecond
      : 0;

    const actualCost = inputCost + outputCost + imageCost + audioCost;

    const record: CostRecord = {
      id: generateId(),
      requestId,
      agentId,
      model: pricing.model,
      provider: pricing.provider,
      actualTokens,
      actualCost,
      breakdown: {
        inputCost,
        outputCost,
        ...(imageCost > 0 && { imageCost }),
        ...(audioCost > 0 && { audioCost }),
      },
      timestamp: new Date().toISOString(),
      ...(metadata && { metadata }),
    };

    return record;
  }

  /**
   * Add custom pricing for a model
   * @param model Model identifier
   * @param pricing Custom pricing
   */
  addCustomPricing(model: string, pricing: Partial<ModelPricing>): void {
    const basePricing = getModelPricing(model);
    if (basePricing) {
      this.customPricing.set(model, { ...basePricing, ...pricing });
    } else {
      // Create new pricing entry
      this.customPricing.set(model, {
        model,
        provider: pricing.provider || 'custom',
        inputCostPer1K: pricing.inputCostPer1K || 0,
        outputCostPer1K: pricing.outputCostPer1K || 0,
        ...(pricing.imageCost && { imageCost: pricing.imageCost }),
        ...(pricing.audioCostPerSecond && { audioCostPerSecond: pricing.audioCostPerSecond }),
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  /**
   * Remove custom pricing for a model
   * @param model Model identifier
   */
  removeCustomPricing(model: string): void {
    this.customPricing.delete(model);
  }

  /**
   * Get pricing for a model (custom or default)
   * @param model Model identifier
   * @returns Model pricing or undefined
   */
  getPricing(model: string): ModelPricing | undefined {
    return this.customPricing.get(model) || getModelPricing(model);
  }

  /**
   * Update configuration
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<CostTrackerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): CostTrackerConfig {
    return { ...this.config };
  }

  /**
   * Create zero-cost estimate (when tracking disabled or pricing unavailable)
   */
  private createZeroCostEstimate(
    model: string,
    provider: ModelProvider,
    estimatedTokens: TokenUsage
  ): CostEstimate {
    return {
      estimatedCost: 0,
      model,
      provider,
      estimatedTokens,
      breakdown: {
        inputCost: 0,
        outputCost: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create zero-cost record (when tracking disabled or pricing unavailable)
   */
  private createZeroCostRecord(
    requestId: string,
    agentId: string,
    model: string,
    provider: ModelProvider,
    actualTokens: TokenUsage
  ): CostRecord {
    return {
      id: generateId(),
      requestId,
      agentId,
      model,
      provider,
      actualTokens,
      actualCost: 0,
      breakdown: {
        inputCost: 0,
        outputCost: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
