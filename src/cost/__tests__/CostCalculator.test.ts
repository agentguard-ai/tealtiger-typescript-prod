/**
 * CostCalculator Tests
 */

import { CostCalculator } from '../CostCalculator';
import { TokenUsage } from '../types';

describe('CostCalculator', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  describe('compareProviders()', () => {
    it('should compare costs across multiple providers', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'gpt-4', provider: 'openai' as const },
        { model: 'claude-2', provider: 'anthropic' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      expect(comparison.tokenUsage).toEqual(tokenUsage);
      expect(comparison.providers.length).toBe(3);
      expect(comparison.cheapest).toBeDefined();
      expect(comparison.mostExpensive).toBeDefined();
      expect(comparison.savings.amount).toBeGreaterThanOrEqual(0);
      expect(comparison.savings.percentage).toBeGreaterThanOrEqual(0);
      expect(comparison.timestamp).toBeDefined();
    });

    it('should sort providers by cost (ascending)', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-4', provider: 'openai' as const },
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'claude-2', provider: 'anthropic' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      // Verify sorted by cost
      for (let i = 0; i < comparison.providers.length - 1; i++) {
        expect(comparison.providers[i].estimatedCost).toBeLessThanOrEqual(
          comparison.providers[i + 1].estimatedCost
        );
      }
    });

    it('should identify cheapest and most expensive providers', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'gpt-4', provider: 'openai' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      expect(comparison.cheapest.model).toBe('gpt-3.5-turbo');
      expect(comparison.mostExpensive.model).toBe('gpt-4');
    });

    it('should calculate savings correctly', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'gpt-4', provider: 'openai' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      const expectedSavings = comparison.mostExpensive.estimatedCost - comparison.cheapest.estimatedCost;
      expect(comparison.savings.amount).toBeCloseTo(expectedSavings, 6);

      const expectedPercentage = (expectedSavings / comparison.mostExpensive.estimatedCost) * 100;
      expect(comparison.savings.percentage).toBeCloseTo(expectedPercentage, 2);
    });

    it('should include cost breakdown for each provider', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      expect(comparison.providers[0].breakdown).toBeDefined();
      expect(comparison.providers[0].breakdown.inputCost).toBeGreaterThan(0);
      expect(comparison.providers[0].breakdown.outputCost).toBeGreaterThan(0);
    });

    it('should throw error if no valid providers found', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'invalid-model', provider: 'openai' as const },
      ];

      expect(() => calculator.compareProviders(tokenUsage, models)).toThrow(
        'No valid providers found for comparison'
      );
    });
  });

  describe('projectCost()', () => {
    it('should project costs for hourly period', () => {
      const avgTokensPerRequest: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      };

      const projection = calculator.projectCost(
        'gpt-3.5-turbo',
        100,
        avgTokensPerRequest,
        'hourly',
        'openai'
      );

      expect(projection.provider).toBe('openai');
      expect(projection.model).toBe('gpt-3.5-turbo');
      expect(projection.period).toBe('hourly');
      expect(projection.requestsPerPeriod).toBe(100);
      expect(projection.avgTokensPerRequest).toEqual(avgTokensPerRequest);
      expect(projection.projectedCost).toBeGreaterThan(0);
      expect(projection.breakdown).toBeDefined();
    });

    it('should project costs for daily period', () => {
      const avgTokensPerRequest: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      };

      const projection = calculator.projectCost(
        'gpt-4',
        1000,
        avgTokensPerRequest,
        'daily',
        'openai'
      );

      expect(projection.period).toBe('daily');
      expect(projection.requestsPerPeriod).toBe(1000);
      expect(projection.projectedCost).toBeGreaterThan(0);
    });

    it('should scale costs by number of requests', () => {
      const avgTokensPerRequest: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      };

      const projection100 = calculator.projectCost(
        'gpt-3.5-turbo',
        100,
        avgTokensPerRequest,
        'daily',
        'openai'
      );

      const projection200 = calculator.projectCost(
        'gpt-3.5-turbo',
        200,
        avgTokensPerRequest,
        'daily',
        'openai'
      );

      expect(projection200.projectedCost).toBeCloseTo(projection100.projectedCost * 2, 6);
    });

    it('should throw error for invalid model', () => {
      const avgTokensPerRequest: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      };

      expect(() =>
        calculator.projectCost('invalid-model', 100, avgTokensPerRequest, 'daily', 'openai')
      ).toThrow('No pricing found for model');
    });
  });

  describe('generateOptimizationRecommendations()', () => {
    it('should generate recommendations for cheaper alternatives', () => {
      const currentUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const alternativeModels = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'claude-instant-1', provider: 'anthropic' as const },
      ];

      const recommendations = calculator.generateOptimizationRecommendations(
        'gpt-4',
        currentUsage,
        alternativeModels,
        'openai'
      );

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].currentModel).toBe('gpt-4');
      expect(recommendations[0].savings.amount).toBeGreaterThan(0);
      expect(recommendations[0].savings.percentage).toBeGreaterThan(0);
      expect(recommendations[0].reason).toBeDefined();
      expect(recommendations[0].considerations).toBeDefined();
      expect(recommendations[0].considerations.length).toBeGreaterThan(0);
    });

    it('should sort recommendations by savings (descending)', () => {
      const currentUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const alternativeModels = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'claude-instant-1', provider: 'anthropic' as const },
        { model: 'claude-2', provider: 'anthropic' as const },
      ];

      const recommendations = calculator.generateOptimizationRecommendations(
        'gpt-4',
        currentUsage,
        alternativeModels,
        'openai'
      );

      // Verify sorted by savings (descending)
      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].savings.amount).toBeGreaterThanOrEqual(
          recommendations[i + 1].savings.amount
        );
      }
    });

    it('should not recommend more expensive alternatives', () => {
      const currentUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const alternativeModels = [
        { model: 'gpt-4', provider: 'openai' as const },
      ];

      const recommendations = calculator.generateOptimizationRecommendations(
        'gpt-3.5-turbo',
        currentUsage,
        alternativeModels,
        'openai'
      );

      expect(recommendations.length).toBe(0);
    });

    it('should include provider-specific considerations', () => {
      const currentUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const alternativeModels = [
        { model: 'claude-instant-1', provider: 'anthropic' as const },
      ];

      const recommendations = calculator.generateOptimizationRecommendations(
        'gpt-4',
        currentUsage,
        alternativeModels,
        'openai'
      );

      expect(recommendations[0].considerations.length).toBeGreaterThan(0);
      expect(recommendations[0].considerations.some(c => c.includes('Anthropic'))).toBe(true);
    });

    it('should throw error for invalid current model', () => {
      const currentUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const alternativeModels = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
      ];

      expect(() =>
        calculator.generateOptimizationRecommendations(
          'invalid-model',
          currentUsage,
          alternativeModels,
          'openai'
        )
      ).toThrow('No pricing found for current model');
    });
  });

  describe('checkAlertThreshold()', () => {
    it('should detect when threshold is exceeded', () => {
      const alert = calculator.checkAlertThreshold(
        'gpt-3.5-turbo',
        100,
        50,
        'daily',
        'openai'
      );

      expect(alert.provider).toBe('openai');
      expect(alert.model).toBe('gpt-3.5-turbo');
      expect(alert.threshold).toBe(50);
      expect(alert.period).toBe('daily');
      expect(alert.currentCost).toBe(100);
      expect(alert.exceeded).toBe(true);
      expect(alert.percentageUsed).toBe(200);
    });

    it('should detect when threshold is not exceeded', () => {
      const alert = calculator.checkAlertThreshold(
        'gpt-3.5-turbo',
        25,
        50,
        'daily',
        'openai'
      );

      expect(alert.exceeded).toBe(false);
      expect(alert.percentageUsed).toBe(50);
    });

    it('should handle exact threshold match', () => {
      const alert = calculator.checkAlertThreshold(
        'gpt-3.5-turbo',
        50,
        50,
        'daily',
        'openai'
      );

      expect(alert.exceeded).toBe(true);
      expect(alert.percentageUsed).toBe(100);
    });

    it('should support different time periods', () => {
      const periods: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = [
        'hourly',
        'daily',
        'weekly',
        'monthly',
      ];

      for (const period of periods) {
        const alert = calculator.checkAlertThreshold(
          'gpt-3.5-turbo',
          100,
          200,
          period,
          'openai'
        );

        expect(alert.period).toBe(period);
      }
    });

    it('should throw error for invalid model', () => {
      expect(() =>
        calculator.checkAlertThreshold('invalid-model', 100, 50, 'daily', 'openai')
      ).toThrow('No pricing found for model');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero token usage', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      expect(comparison.cheapest.estimatedCost).toBe(0);
      expect(comparison.mostExpensive.estimatedCost).toBe(0);
      expect(comparison.savings.amount).toBe(0);
    });

    it('should handle very large token counts', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000000,
        outputTokens: 500000,
        totalTokens: 1500000,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      expect(comparison.cheapest.estimatedCost).toBeGreaterThan(0);
      expect(Number.isFinite(comparison.cheapest.estimatedCost)).toBe(true);
    });

    it('should handle single provider comparison', () => {
      const tokenUsage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
      ];

      const comparison = calculator.compareProviders(tokenUsage, models);

      expect(comparison.providers.length).toBe(1);
      expect(comparison.cheapest).toEqual(comparison.mostExpensive);
      expect(comparison.savings.amount).toBe(0);
      expect(comparison.savings.percentage).toBe(0);
    });
  });
});
