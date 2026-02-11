/**
 * Cost Calculator
 * 
 * Utility for comparing costs across providers and generating optimization recommendations
 */

import { ModelProvider, TokenUsage } from './types';
import { getModelPricing } from './pricing';

/**
 * Cost comparison result for a single provider
 */
export interface ProviderCostComparison {
  provider: ModelProvider;
  model: string;
  estimatedCost: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    imageCost?: number;
    audioCost?: number;
  };
}

/**
 * Cost comparison across multiple providers
 */
export interface MultiProviderCostComparison {
  tokenUsage: TokenUsage;
  providers: ProviderCostComparison[];
  cheapest: ProviderCostComparison;
  mostExpensive: ProviderCostComparison;
  savings: {
    amount: number;
    percentage: number;
  };
  timestamp: string;
}

/**
 * Cost projection for a provider
 */
export interface CostProjection {
  provider: ModelProvider;
  model: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  requestsPerPeriod: number;
  avgTokensPerRequest: TokenUsage;
  projectedCost: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    imageCost?: number;
    audioCost?: number;
  };
}

/**
 * Cost optimization recommendation
 */
export interface CostOptimizationRecommendation {
  currentProvider: ModelProvider;
  currentModel: string;
  currentCost: number;
  recommendedProvider: ModelProvider;
  recommendedModel: string;
  recommendedCost: number;
  savings: {
    amount: number;
    percentage: number;
  };
  reason: string;
  considerations: string[];
}

/**
 * Cost alert threshold
 */
export interface CostAlertThreshold {
  provider: ModelProvider;
  model: string;
  threshold: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  currentCost: number;
  exceeded: boolean;
  percentageUsed: number;
}

/**
 * CostCalculator class for cost comparison and optimization
 */
export class CostCalculator {
  /**
   * Compare costs across multiple providers for the same token usage
   * @param tokenUsage Token usage to compare
   * @param models Array of model identifiers to compare
   * @returns Multi-provider cost comparison
   */
  compareProviders(
    tokenUsage: TokenUsage,
    models: Array<{ model: string; provider?: ModelProvider }>
  ): MultiProviderCostComparison {
    const providers: ProviderCostComparison[] = [];

    for (const { model, provider } of models) {
      const pricing = getModelPricing(model, provider);
      if (!pricing) {
        console.warn(`[CostCalculator] No pricing found for model: ${model}`);
        continue;
      }

      const inputCost = (tokenUsage.inputTokens / 1000) * pricing.inputCostPer1K;
      const outputCost = (tokenUsage.outputTokens / 1000) * pricing.outputCostPer1K;
      const imageCost = tokenUsage.images && pricing.imageCost
        ? tokenUsage.images * pricing.imageCost
        : 0;
      const audioCost = tokenUsage.audioDuration && pricing.audioCostPerSecond
        ? tokenUsage.audioDuration * pricing.audioCostPerSecond
        : 0;

      const estimatedCost = inputCost + outputCost + imageCost + audioCost;

      providers.push({
        provider: pricing.provider,
        model: pricing.model,
        estimatedCost,
        breakdown: {
          inputCost,
          outputCost,
          ...(imageCost > 0 && { imageCost }),
          ...(audioCost > 0 && { audioCost }),
        },
      });
    }

    if (providers.length === 0) {
      throw new Error('No valid providers found for comparison');
    }

    // Sort by cost (ascending)
    providers.sort((a, b) => a.estimatedCost - b.estimatedCost);

    const cheapest = providers[0];
    const mostExpensive = providers[providers.length - 1];
    const savingsAmount = mostExpensive.estimatedCost - cheapest.estimatedCost;
    const savingsPercentage = (savingsAmount / mostExpensive.estimatedCost) * 100;

    return {
      tokenUsage,
      providers,
      cheapest,
      mostExpensive,
      savings: {
        amount: savingsAmount,
        percentage: savingsPercentage,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Project costs for a provider over a time period
   * @param model Model identifier
   * @param requestsPerPeriod Number of requests per period
   * @param avgTokensPerRequest Average token usage per request
   * @param period Time period for projection
   * @param provider Optional provider override
   * @returns Cost projection
   */
  projectCost(
    model: string,
    requestsPerPeriod: number,
    avgTokensPerRequest: TokenUsage,
    period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly',
    provider?: ModelProvider
  ): CostProjection {
    const pricing = getModelPricing(model, provider);
    if (!pricing) {
      throw new Error(`No pricing found for model: ${model}`);
    }

    const inputCost = (avgTokensPerRequest.inputTokens / 1000) * pricing.inputCostPer1K * requestsPerPeriod;
    const outputCost = (avgTokensPerRequest.outputTokens / 1000) * pricing.outputCostPer1K * requestsPerPeriod;
    const imageCost = avgTokensPerRequest.images && pricing.imageCost
      ? avgTokensPerRequest.images * pricing.imageCost * requestsPerPeriod
      : 0;
    const audioCost = avgTokensPerRequest.audioDuration && pricing.audioCostPerSecond
      ? avgTokensPerRequest.audioDuration * pricing.audioCostPerSecond * requestsPerPeriod
      : 0;

    const projectedCost = inputCost + outputCost + imageCost + audioCost;

    return {
      provider: pricing.provider,
      model: pricing.model,
      period,
      requestsPerPeriod,
      avgTokensPerRequest,
      projectedCost,
      breakdown: {
        inputCost,
        outputCost,
        ...(imageCost > 0 && { imageCost }),
        ...(audioCost > 0 && { audioCost }),
      },
    };
  }

  /**
   * Generate cost optimization recommendations
   * @param currentModel Current model being used
   * @param currentUsage Current token usage
   * @param alternativeModels Alternative models to consider
   * @param currentProvider Optional current provider
   * @returns Array of optimization recommendations
   */
  generateOptimizationRecommendations(
    currentModel: string,
    currentUsage: TokenUsage,
    alternativeModels: Array<{ model: string; provider?: ModelProvider }>,
    currentProvider?: ModelProvider
  ): CostOptimizationRecommendation[] {
    const currentPricing = getModelPricing(currentModel, currentProvider);
    if (!currentPricing) {
      throw new Error(`No pricing found for current model: ${currentModel}`);
    }

    // Calculate current cost
    const currentInputCost = (currentUsage.inputTokens / 1000) * currentPricing.inputCostPer1K;
    const currentOutputCost = (currentUsage.outputTokens / 1000) * currentPricing.outputCostPer1K;
    const currentCost = currentInputCost + currentOutputCost;

    const recommendations: CostOptimizationRecommendation[] = [];

    for (const { model, provider } of alternativeModels) {
      const pricing = getModelPricing(model, provider);
      if (!pricing) {
        continue;
      }

      const inputCost = (currentUsage.inputTokens / 1000) * pricing.inputCostPer1K;
      const outputCost = (currentUsage.outputTokens / 1000) * pricing.outputCostPer1K;
      const recommendedCost = inputCost + outputCost;

      // Only recommend if there are savings
      if (recommendedCost < currentCost) {
        const savingsAmount = currentCost - recommendedCost;
        const savingsPercentage = (savingsAmount / currentCost) * 100;

        recommendations.push({
          currentProvider: currentPricing.provider,
          currentModel: currentPricing.model,
          currentCost,
          recommendedProvider: pricing.provider,
          recommendedModel: pricing.model,
          recommendedCost,
          savings: {
            amount: savingsAmount,
            percentage: savingsPercentage,
          },
          reason: this.generateRecommendationReason(savingsPercentage, pricing.provider),
          considerations: this.generateConsiderations(pricing.provider, pricing.model),
        });
      }
    }

    // Sort by savings (descending)
    recommendations.sort((a, b) => b.savings.amount - a.savings.amount);

    return recommendations;
  }

  /**
   * Check if cost alert thresholds are exceeded
   * @param model Model identifier
   * @param currentCost Current cost for the period
   * @param threshold Alert threshold
   * @param period Time period
   * @param provider Optional provider override
   * @returns Cost alert threshold status
   */
  checkAlertThreshold(
    model: string,
    currentCost: number,
    threshold: number,
    period: 'hourly' | 'daily' | 'weekly' | 'monthly',
    provider?: ModelProvider
  ): CostAlertThreshold {
    const pricing = getModelPricing(model, provider);
    if (!pricing) {
      throw new Error(`No pricing found for model: ${model}`);
    }

    const percentageUsed = (currentCost / threshold) * 100;
    const exceeded = currentCost >= threshold;

    return {
      provider: pricing.provider,
      model: pricing.model,
      threshold,
      period,
      currentCost,
      exceeded,
      percentageUsed,
    };
  }

  /**
   * Generate recommendation reason based on savings
   */
  private generateRecommendationReason(savingsPercentage: number, provider: ModelProvider): string {
    if (savingsPercentage >= 50) {
      return `Switching to ${provider} could save over 50% on costs`;
    } else if (savingsPercentage >= 30) {
      return `Switching to ${provider} could save 30-50% on costs`;
    } else if (savingsPercentage >= 10) {
      return `Switching to ${provider} could save 10-30% on costs`;
    } else {
      return `Switching to ${provider} could provide modest cost savings`;
    }
  }

  /**
   * Generate considerations for provider switch
   */
  private generateConsiderations(provider: ModelProvider, model: string): string[] {
    const considerations: string[] = [];

    // Provider-specific considerations
    switch (provider) {
      case 'openai':
        considerations.push('OpenAI models are widely used and well-documented');
        considerations.push('Consider rate limits and API availability');
        break;
      case 'anthropic':
        considerations.push('Anthropic models excel at safety and instruction following');
        considerations.push('May have different context window limits');
        break;
      case 'google':
        considerations.push('Google models offer strong multimodal capabilities');
        considerations.push('Consider regional availability and data residency');
        break;
      case 'cohere':
        considerations.push('Cohere models are optimized for RAG and embeddings');
        considerations.push('Consider connector and document support');
        break;
      case 'custom':
        considerations.push('Custom models may have unique capabilities');
        considerations.push('Verify pricing accuracy and model availability');
        break;
    }

    // Model-specific considerations
    if (model.includes('gpt-4')) {
      considerations.push('GPT-4 models offer superior reasoning capabilities');
    } else if (model.includes('gpt-3.5')) {
      considerations.push('GPT-3.5 models are faster and more cost-effective');
    } else if (model.includes('claude')) {
      considerations.push('Claude models have large context windows');
    } else if (model.includes('gemini')) {
      considerations.push('Gemini models support multimodal inputs');
    }

    return considerations;
  }
}
