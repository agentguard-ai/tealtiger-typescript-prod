/**
 * Metrics computation utilities for benchmark result analysis.
 *
 * Provides functions for computing detection rates, classification metrics
 * (accuracy, precision, recall, F1), and sample classification against
 * ground truth labels.
 */

import type { ClassificationMetrics } from './types';

/**
 * Classification result for a single sample.
 */
export type ClassificationResult = 'TP' | 'FP' | 'TN' | 'FN';

/**
 * Computes the detection rate from blocked and allowed counts.
 * Errors and not-applicable probes are excluded from the denominator
 * (they are not passed to this function).
 *
 * @param blocked - Number of probes that were blocked (DENY)
 * @param allowed - Number of probes that were allowed (ALLOW/MONITOR)
 * @returns Detection rate in [0, 1], or 0 if both counts are 0
 */
export function computeDetectionRate(blocked: number, allowed: number): number {
  const denominator = blocked + allowed;
  if (denominator === 0) {
    return 0;
  }
  return blocked / denominator;
}

/**
 * Computes binary classification metrics from confusion matrix counts.
 *
 * Handles division by zero by returning 0 for any metric where the
 * denominator would be zero.
 *
 * @param tp - True positives
 * @param fp - False positives
 * @param tn - True negatives
 * @param fn - False negatives
 * @returns Full ClassificationMetrics object
 */
export function computeClassificationMetrics(
  tp: number,
  fp: number,
  tn: number,
  fn: number,
): ClassificationMetrics {
  const total = tp + fp + tn + fn;
  const accuracy = total === 0 ? 0 : (tp + tn) / total;

  const precisionDenom = tp + fp;
  const precision = precisionDenom === 0 ? 0 : tp / precisionDenom;

  const recallDenom = tp + fn;
  const recall = recallDenom === 0 ? 0 : tp / recallDenom;

  const f1Denom = precision + recall;
  const f1Score = f1Denom === 0 ? 0 : (2 * precision * recall) / f1Denom;

  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    accuracy,
    precision,
    recall,
    f1Score,
  };
}

/**
 * Classifies a single sample against ground truth.
 *
 * Mapping:
 * - label=true (malicious) + DENY = True Positive (correctly blocked)
 * - label=false (benign) + DENY = False Positive (incorrectly blocked)
 * - label=false (benign) + ALLOW/MONITOR = True Negative (correctly allowed)
 * - label=true (malicious) + ALLOW/MONITOR = False Negative (missed attack)
 *
 * @param label - Ground truth: true = malicious/injection, false = benign
 * @param decision - TealTiger governance decision
 * @returns Classification result (TP, FP, TN, or FN)
 */
export function classifySample(
  label: boolean,
  decision: 'ALLOW' | 'DENY' | 'MONITOR',
): ClassificationResult {
  const isPositiveDetection = decision === 'DENY';

  if (label && isPositiveDetection) {
    return 'TP';
  }
  if (!label && isPositiveDetection) {
    return 'FP';
  }
  if (!label && !isPositiveDetection) {
    return 'TN';
  }
  // label === true && !isPositiveDetection
  return 'FN';
}
