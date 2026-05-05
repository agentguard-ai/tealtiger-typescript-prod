/**
 * Property-based tests for metrics computation utilities.
 *
 * Uses fast-check to verify correctness properties across all valid inputs.
 */

import * as fc from 'fast-check';
import {
  computeDetectionRate,
  computeClassificationMetrics,
  classifySample,
} from '../runner/metrics';

describe('Feature: red-team-benchmarks, Property 1: Detection rate computation is correct', () => {
  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * For any blocked >= 0 and allowed >= 0 where blocked + allowed > 0,
   * detectionRate === blocked / (blocked + allowed).
   * When blocked + allowed === 0, detectionRate === 0.
   */
  it('should compute detection rate as blocked / (blocked + allowed) for non-empty sets', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 10000 }),
        (blocked, allowed) => {
          fc.pre(blocked + allowed > 0);
          const rate = computeDetectionRate(blocked, allowed);
          const expected = blocked / (blocked + allowed);
          expect(rate).toBeCloseTo(expected, 10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should return 0 when blocked + allowed === 0', () => {
    fc.assert(
      fc.property(fc.constant(0), fc.constant(0), (blocked, allowed) => {
        const rate = computeDetectionRate(blocked, allowed);
        expect(rate).toBe(0);
      }),
      { numRuns: 1 },
    );
  });

  it('should always return a value in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 10000 }),
        (blocked, allowed) => {
          const rate = computeDetectionRate(blocked, allowed);
          expect(rate).toBeGreaterThanOrEqual(0);
          expect(rate).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Feature: red-team-benchmarks, Property 2: Classification metrics are mathematically correct', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any (TP, FP, TN, FN) counts where at least one sample exists:
   * - accuracy = (TP + TN) / (TP + TN + FP + FN)
   * - precision = TP / (TP + FP)
   * - recall = TP / (TP + FN)
   * - F1 = 2 * (precision * recall) / (precision + recall)
   */
  it('should compute accuracy correctly', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (tp, fp, tn, fn) => {
          const total = tp + fp + tn + fn;
          fc.pre(total > 0);
          const metrics = computeClassificationMetrics(tp, fp, tn, fn);
          const expectedAccuracy = (tp + tn) / total;
          expect(metrics.accuracy).toBeCloseTo(expectedAccuracy, 10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should compute precision correctly', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (tp, fp, tn, fn) => {
          const metrics = computeClassificationMetrics(tp, fp, tn, fn);
          const precisionDenom = tp + fp;
          const expectedPrecision = precisionDenom === 0 ? 0 : tp / precisionDenom;
          expect(metrics.precision).toBeCloseTo(expectedPrecision, 10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should compute recall correctly', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (tp, fp, tn, fn) => {
          const metrics = computeClassificationMetrics(tp, fp, tn, fn);
          const recallDenom = tp + fn;
          const expectedRecall = recallDenom === 0 ? 0 : tp / recallDenom;
          expect(metrics.recall).toBeCloseTo(expectedRecall, 10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should compute F1 correctly', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (tp, fp, tn, fn) => {
          const metrics = computeClassificationMetrics(tp, fp, tn, fn);
          const precisionDenom = tp + fp;
          const precision = precisionDenom === 0 ? 0 : tp / precisionDenom;
          const recallDenom = tp + fn;
          const recall = recallDenom === 0 ? 0 : tp / recallDenom;
          const f1Denom = precision + recall;
          const expectedF1 = f1Denom === 0 ? 0 : (2 * precision * recall) / f1Denom;
          expect(metrics.f1Score).toBeCloseTo(expectedF1, 10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should return 0 for all metrics when all counts are 0', () => {
    const metrics = computeClassificationMetrics(0, 0, 0, 0);
    expect(metrics.accuracy).toBe(0);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1Score).toBe(0);
  });

  it('should handle division by zero gracefully (precision when TP+FP=0)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (tn, fn) => {
          // tp=0, fp=0 means precision denominator is 0
          const metrics = computeClassificationMetrics(0, 0, tn, fn);
          expect(metrics.precision).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle division by zero gracefully (recall when TP+FN=0)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (fp, tn) => {
          // tp=0, fn=0 means recall denominator is 0
          const metrics = computeClassificationMetrics(0, fp, tn, 0);
          expect(metrics.recall).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: red-team-benchmarks, Property 3: Sample classification against ground truth is correct', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any sample with ground truth label and decision:
   * - label=true + DENY = TP
   * - label=false + DENY = FP
   * - label=false + ALLOW = TN
   * - label=true + ALLOW = FN
   * - MONITOR is treated as negative detection (same as ALLOW)
   */
  it('should classify label=true + DENY as TP', () => {
    fc.assert(
      fc.property(fc.constant(true), fc.constant('DENY' as const), (label, decision) => {
        expect(classifySample(label, decision)).toBe('TP');
      }),
      { numRuns: 1 },
    );
  });

  it('should classify label=false + DENY as FP', () => {
    fc.assert(
      fc.property(fc.constant(false), fc.constant('DENY' as const), (label, decision) => {
        expect(classifySample(label, decision)).toBe('FP');
      }),
      { numRuns: 1 },
    );
  });

  it('should classify label=false + ALLOW as TN', () => {
    fc.assert(
      fc.property(fc.constant(false), fc.constant('ALLOW' as const), (label, decision) => {
        expect(classifySample(label, decision)).toBe('TN');
      }),
      { numRuns: 1 },
    );
  });

  it('should classify label=true + ALLOW as FN', () => {
    fc.assert(
      fc.property(fc.constant(true), fc.constant('ALLOW' as const), (label, decision) => {
        expect(classifySample(label, decision)).toBe('FN');
      }),
      { numRuns: 1 },
    );
  });

  it('should treat MONITOR as negative detection (same as ALLOW)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constant('MONITOR' as const),
        (label, decision) => {
          const result = classifySample(label, decision);
          if (label) {
            expect(result).toBe('FN');
          } else {
            expect(result).toBe('TN');
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it('should correctly classify for any combination of label and decision', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.oneof(
          fc.constant('ALLOW' as const),
          fc.constant('DENY' as const),
          fc.constant('MONITOR' as const),
        ),
        (label, decision) => {
          const result = classifySample(label, decision);
          const isPositive = decision === 'DENY';

          if (label && isPositive) {
            expect(result).toBe('TP');
          } else if (!label && isPositive) {
            expect(result).toBe('FP');
          } else if (!label && !isPositive) {
            expect(result).toBe('TN');
          } else {
            expect(result).toBe('FN');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
