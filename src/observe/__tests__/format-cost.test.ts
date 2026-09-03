import { formatCost } from '../format-cost';
import type { ObserveCostSummary } from '../types';

function summary(overrides: Partial<ObserveCostSummary> = {}): ObserveCostSummary {
  return {
    totalCost: 0,
    requestCount: 0,
    hasPricingGaps: false,
    breakdown: {
      inputCost: 0,
      outputCost: 0,
      imageCost: 0,
      audioCost: 0,
    },
    ...overrides,
  };
}

describe('formatCost', () => {
  it('formats an empty summary without a redundant breakdown', () => {
    expect(formatCost(summary())).toBe('$0.00 (0 requests)');
  });

  it('formats total, request count, and input/output costs', () => {
    expect(
      formatCost(
        summary({
          totalCost: 0.0023,
          requestCount: 2,
          breakdown: {
            inputCost: 0.0018,
            outputCost: 0.0005,
            imageCost: 0,
            audioCost: 0,
          },
        })
      )
    ).toBe('$0.0023 (2 requests) | Input: $0.0018 | Output: $0.0005');
  });

  it('uses the singular request label', () => {
    expect(formatCost(summary({ totalCost: 0.01, requestCount: 1 }))).toContain(
      '(1 request)'
    );
  });

  it('marks summaries with pricing gaps as estimated', () => {
    expect(
      formatCost(summary({ totalCost: 0.01, requestCount: 1, hasPricingGaps: true }))
    ).toBe('$0.0100 (1 request) | Input: $0.0000 | Output: $0.0000 (estimated)');
  });
});
