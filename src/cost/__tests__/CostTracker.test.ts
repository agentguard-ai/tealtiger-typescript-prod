/**
 * Cost Tracker Tests
 */

import { CostTracker } from '../CostTracker';
import { TokenUsage } from '../types';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('estimateCost', () => {
    it('should estimate cost for GPT-4', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      expect(estimate.model).toBe('gpt-4');
      expect(estimate.provider).toBe('openai');
      expect(estimate.estimatedCost).toBe(0.06); // (1000/1000 * 0.03) + (500/1000 * 0.06)
      expect(estimate.breakdown.inputCost).toBe(0.03);
      expect(estimate.breakdown.outputCost).toBe(0.03);
    });

    it('should estimate cost for GPT-3.5 Turbo', () => {
      const tokens: TokenUsage = {
        inputTokens: 2000,
        outputTokens: 1000,
        totalTokens: 3000,
      };

      const estimate = tracker.estimateCost('gpt-3.5-turbo', tokens);

      expect(estimate.model).toBe('gpt-3.5-turbo');
      expect(estimate.estimatedCost).toBe(0.0025); // (2000/1000 * 0.0005) + (1000/1000 * 0.0015)
    });

    it('should estimate cost for GPT-4 Turbo preview', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const estimate = tracker.estimateCost('gpt-4-turbo-preview', tokens, 'openai');

      expect(estimate.model).toBe('gpt-4-turbo-preview');
      expect(estimate.provider).toBe('openai');
      expect(estimate.estimatedCost).toBe(0.025); // (1000/1000 * 0.01) + (500/1000 * 0.03)
      expect(estimate.breakdown.inputCost).toBe(0.01);
      expect(estimate.breakdown.outputCost).toBe(0.015);
    });

    it('should prefer GPT-4 Turbo pricing over GPT-4 pricing for versioned models', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('gpt-4-turbo-2024-04-09', tokens, 'openai');

      expect(estimate.model).toBe('gpt-4-turbo');
      expect(estimate.estimatedCost).toBe(0.04); // GPT-4 Turbo, not GPT-4 at 0.09
    });

    it('should estimate cost for Claude 3 Opus', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('claude-3-opus-20240229', tokens, 'anthropic');

      expect(estimate.model).toBe('claude-3-opus-20240229');
      expect(estimate.provider).toBe('anthropic');
      expect(estimate.estimatedCost).toBe(0.09); // (1000/1000 * 0.015) + (1000/1000 * 0.075)
    });

    it('should handle vision models with images', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        images: 2,
      };

      const estimate = tracker.estimateCost('gpt-4-vision-preview', tokens);

      // (1000/1000 * 0.01) + (500/1000 * 0.03) + (2 * 0.00765) = 0.01 + 0.015 + 0.0153 = 0.0403
      expect(estimate.estimatedCost).toBeCloseTo(0.0403, 4);
      expect(estimate.breakdown.imageCost).toBe(0.0153);
    });

    it('should return zero cost for unknown model', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const estimate = tracker.estimateCost('unknown-model', tokens);

      expect(estimate.estimatedCost).toBe(0);
      expect(estimate.model).toBe('unknown-model');
    });

    it('should handle zero tokens', () => {
      const tokens: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      expect(estimate.estimatedCost).toBe(0);
    });
  });

  describe('calculateActualCost', () => {
    it('should calculate actual cost for GPT-4', () => {
      const tokens: TokenUsage = {
        inputTokens: 1500,
        outputTokens: 750,
        totalTokens: 2250,
      };

      const record = tracker.calculateActualCost(
        'req-123',
        'agent-456',
        'gpt-4',
        tokens
      );

      expect(record.requestId).toBe('req-123');
      expect(record.agentId).toBe('agent-456');
      expect(record.model).toBe('gpt-4');
      expect(record.actualCost).toBe(0.09); // (1500/1000 * 0.03) + (750/1000 * 0.06)
      expect(record.actualTokens).toEqual(tokens);
    });

    it('should include metadata when provided', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const metadata = {
        userId: 'user-789',
        sessionId: 'session-abc',
      };

      const record = tracker.calculateActualCost(
        'req-123',
        'agent-456',
        'gpt-4',
        tokens,
        'openai',
        metadata
      );

      expect(record.metadata).toEqual(metadata);
    });

    it('should generate unique IDs for each record', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const record1 = tracker.calculateActualCost('req-1', 'agent-1', 'gpt-4', tokens);
      const record2 = tracker.calculateActualCost('req-2', 'agent-2', 'gpt-4', tokens);

      expect(record1.id).not.toBe(record2.id);
    });
  });

  describe('custom pricing', () => {
    it('should add custom pricing for a model', () => {
      tracker.addCustomPricing('custom-model', {
        provider: 'custom',
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.02,
      });

      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('custom-model', tokens);

      expect(estimate.estimatedCost).toBe(0.03); // (1000/1000 * 0.01) + (1000/1000 * 0.02)
      expect(estimate.provider).toBe('custom');
    });

    it('should override default pricing with custom pricing', () => {
      tracker.addCustomPricing('gpt-4', {
        inputCostPer1K: 0.01, // Override default 0.03
        outputCostPer1K: 0.02, // Override default 0.06
      });

      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      expect(estimate.estimatedCost).toBe(0.03); // Custom pricing
    });

    it('should remove custom pricing', () => {
      tracker.addCustomPricing('gpt-4', {
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.02,
      });

      tracker.removeCustomPricing('gpt-4');

      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      expect(estimate.estimatedCost).toBe(0.09); // Back to default pricing
    });

    it('should get pricing for a model', () => {
      const pricing = tracker.getPricing('gpt-4');

      expect(pricing).toBeDefined();
      expect(pricing?.model).toBe('gpt-4');
      expect(pricing?.inputCostPer1K).toBe(0.03);
      expect(pricing?.outputCostPer1K).toBe(0.06);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      tracker.updateConfig({
        enabled: false,
        persistRecords: false,
      });

      const config = tracker.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.persistRecords).toBe(false);
    });

    it('should return zero cost when disabled', () => {
      tracker.updateConfig({ enabled: false });

      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      expect(estimate.estimatedCost).toBe(0);
    });
  });

  describe('cost accuracy', () => {
    it('should calculate costs with high precision', () => {
      const tokens: TokenUsage = {
        inputTokens: 1234,
        outputTokens: 567,
        totalTokens: 1801,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      // (1234/1000 * 0.03) + (567/1000 * 0.06) = 0.03702 + 0.03402 = 0.07104
      expect(estimate.estimatedCost).toBeCloseTo(0.07104, 5);
    });

    it('should handle fractional tokens correctly', () => {
      const tokens: TokenUsage = {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens);

      // (1/1000 * 0.03) + (1/1000 * 0.06) = 0.00003 + 0.00006 = 0.00009
      expect(estimate.estimatedCost).toBeCloseTo(0.00009, 5);
    });
  });

  describe('multiple providers', () => {
    it('should handle OpenAI models', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('gpt-4', tokens, 'openai');

      expect(estimate.provider).toBe('openai');
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });

    it('should handle Anthropic models', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('claude-3-opus-20240229', tokens, 'anthropic');

      expect(estimate.provider).toBe('anthropic');
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });

    it('should handle Google models', () => {
      const tokens: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 1000,
        totalTokens: 2000,
      };

      const estimate = tracker.estimateCost('gemini-pro', tokens, 'google');

      expect(estimate.provider).toBe('google');
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });
  });
});
