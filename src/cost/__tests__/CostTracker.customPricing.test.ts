import { CostTracker } from '../CostTracker';
import { TokenUsage } from '../types';

describe('CostTracker custom pricing', () => {
  const tokens: TokenUsage = {
    inputTokens: 2000,
    outputTokens: 1000,
    totalTokens: 3000,
  };

  it('overrides default model pricing registered with addCustomPricing', () => {
    const tracker = new CostTracker();

    tracker.addCustomPricing('gpt-4', {
      inputCostPer1K: 0.002,
      outputCostPer1K: 0.004,
    });

    const pricing = tracker.getPricing('gpt-4');

    expect(pricing).toBeDefined();
    expect(pricing?.model).toBe('gpt-4');
    expect(pricing?.provider).toBe('openai');
    expect(pricing?.inputCostPer1K).toBe(0.002);
    expect(pricing?.outputCostPer1K).toBe(0.004);
  });

  it('uses custom pricing for cost estimation', () => {
    const tracker = new CostTracker();

    tracker.addCustomPricing('custom-estimate-model', {
      provider: 'custom',
      inputCostPer1K: 0.01,
      outputCostPer1K: 0.02,
    });

    const estimate = tracker.estimateCost('custom-estimate-model', tokens);

    expect(estimate.model).toBe('custom-estimate-model');
    expect(estimate.provider).toBe('custom');
    expect(estimate.breakdown.inputCost).toBe(0.02);
    expect(estimate.breakdown.outputCost).toBe(0.02);
    expect(estimate.estimatedCost).toBe(0.04);
  });

  it('uses custom pricing for actual cost calculation', () => {
    const tracker = new CostTracker();

    tracker.addCustomPricing('custom-actual-model', {
      provider: 'custom',
      inputCostPer1K: 0.03,
      outputCostPer1K: 0.05,
    });

    const record = tracker.calculateActualCost(
      'req-custom-pricing',
      'agent-custom-pricing',
      'custom-actual-model',
      tokens,
    );

    expect(record.requestId).toBe('req-custom-pricing');
    expect(record.agentId).toBe('agent-custom-pricing');
    expect(record.model).toBe('custom-actual-model');
    expect(record.provider).toBe('custom');
    expect(record.breakdown.inputCost).toBe(0.06);
    expect(record.breakdown.outputCost).toBe(0.05);
    expect(record.actualCost).toBe(0.11);
  });

  it('falls back to default pricing after custom pricing is removed', () => {
    const tracker = new CostTracker();

    tracker.addCustomPricing('gpt-4', {
      inputCostPer1K: 0.002,
      outputCostPer1K: 0.004,
    });

    expect(tracker.estimateCost('gpt-4', tokens).estimatedCost).toBe(0.008);

    tracker.removeCustomPricing('gpt-4');

    const estimate = tracker.estimateCost('gpt-4', tokens);

    expect(estimate.provider).toBe('openai');
    expect(estimate.estimatedCost).toBe(0.12);
    expect(estimate.breakdown.inputCost).toBe(0.06);
    expect(estimate.breakdown.outputCost).toBe(0.06);
  });

  it('supports zero-dollar custom pricing rates', () => {
    const tracker = new CostTracker();

    tracker.addCustomPricing('free-custom-model', {
      provider: 'custom',
      inputCostPer1K: 0,
      outputCostPer1K: 0,
    });

    const estimate = tracker.estimateCost('free-custom-model', tokens);
    const record = tracker.calculateActualCost(
      'req-free-custom-pricing',
      'agent-free-custom-pricing',
      'free-custom-model',
      tokens,
    );

    expect(estimate.provider).toBe('custom');
    expect(estimate.estimatedCost).toBe(0);
    expect(estimate.breakdown.inputCost).toBe(0);
    expect(estimate.breakdown.outputCost).toBe(0);
    expect(record.provider).toBe('custom');
    expect(record.actualCost).toBe(0);
    expect(record.breakdown.inputCost).toBe(0);
    expect(record.breakdown.outputCost).toBe(0);
  });
});
