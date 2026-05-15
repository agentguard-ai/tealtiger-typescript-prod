/**
 * TealClassifier — Ensemble Mode Evaluator
 *
 * Combines regex detection results and ML classifier results according to
 * the configured ensemble mode. Handles ML unavailability gracefully by
 * falling back to regex_only regardless of configured mode.
 *
 * Ensemble Modes:
 * - regex_only: use only regex result, ignore ML (v1.2 backward compat)
 * - ml_only: use only ML classifier output
 * - ensemble_union: block if EITHER regex OR ml detects (higher recall)
 * - ensemble_intersection: block only if BOTH detect (higher precision)
 *
 * Detection pipeline order:
 * 1. Regex runs first
 * 2. ML runs (if configured and available)
 * 3. Ensemble combines both signals
 *
 * @module modules/tealclassifier/ensemble
 * @requirements 10.2, 10.3, 10.4, 10.5, 10.6
 */

import type {
  ClassifierResult,
  EnsembleMode,
} from '../../core/engine/v1.3/module-types';

// ── Types ────────────────────────────────────────────────────────

/**
 * Result of ensemble evaluation combining regex and ML signals.
 */
export interface EnsembleResult {
  /** Whether the content was detected as a threat. */
  detected: boolean;
  /** Which signal source determined the outcome. */
  source: 'regex' | 'ml' | 'ensemble';
  /** Confidence score in [0.0, 1.0]. */
  confidence: number;
}

// ── EnsembleEvaluator ────────────────────────────────────────────

export class EnsembleEvaluator {
  /**
   * Evaluate the combined detection result from regex and ML signals.
   *
   * @param regexResult - Whether the regex layer detected a threat (true = detected)
   * @param mlResult - The ML classifier result, or null if ML is unavailable
   * @param mode - The configured ensemble mode
   * @returns Combined detection result with source attribution and confidence
   */
  evaluate(
    regexResult: boolean,
    mlResult: ClassifierResult | null,
    mode: EnsembleMode,
  ): EnsembleResult {
    // When ML is unavailable (null result), fall back to regex_only
    // regardless of configured mode
    if (mlResult === null && mode !== 'regex_only') {
      return {
        detected: regexResult,
        source: 'regex',
        confidence: regexResult ? 1.0 : 0.0,
      };
    }

    switch (mode) {
      case 'regex_only':
        return this.evaluateRegexOnly(regexResult);

      case 'ml_only':
        return this.evaluateMlOnly(mlResult!);

      case 'ensemble_union':
        return this.evaluateUnion(regexResult, mlResult!);

      case 'ensemble_intersection':
        return this.evaluateIntersection(regexResult, mlResult!);

      default:
        // Unknown mode — default to regex_only for safety
        return this.evaluateRegexOnly(regexResult);
    }
  }

  // ── Private mode evaluators ──────────────────────────────────

  /**
   * regex_only: v1.2 backward-compatible behavior.
   * Uses only the regex result, ignores ML entirely.
   */
  private evaluateRegexOnly(regexResult: boolean): EnsembleResult {
    return {
      detected: regexResult,
      source: 'regex',
      confidence: regexResult ? 1.0 : 0.0,
    };
  }

  /**
   * ml_only: uses only the ML classifier output.
   * Ignores the regex result entirely.
   */
  private evaluateMlOnly(mlResult: ClassifierResult): EnsembleResult {
    return {
      detected: mlResult.detected,
      source: 'ml',
      confidence: mlResult.confidence,
    };
  }

  /**
   * ensemble_union: block if EITHER regex OR ml detects.
   * Higher recall — catches more threats but may have more false positives.
   */
  private evaluateUnion(regexResult: boolean, mlResult: ClassifierResult): EnsembleResult {
    const detected = regexResult || mlResult.detected;

    // Confidence: take the maximum confidence from whichever signal fired
    let confidence: number;
    if (regexResult && mlResult.detected) {
      // Both detected — take max confidence
      confidence = Math.max(1.0, mlResult.confidence);
    } else if (regexResult) {
      confidence = 1.0; // Regex is binary, confidence = 1.0 when detected
    } else if (mlResult.detected) {
      confidence = mlResult.confidence;
    } else {
      // Neither detected — use ML confidence (closer to 0)
      confidence = mlResult.confidence;
    }

    // Determine source attribution
    let source: 'regex' | 'ml' | 'ensemble';
    if (regexResult && mlResult.detected) {
      source = 'ensemble';
    } else if (regexResult) {
      source = 'regex';
    } else if (mlResult.detected) {
      source = 'ml';
    } else {
      source = 'ensemble';
    }

    return { detected, source, confidence };
  }

  /**
   * ensemble_intersection: block only if BOTH regex AND ml detect.
   * Higher precision — fewer false positives but may miss some threats.
   */
  private evaluateIntersection(regexResult: boolean, mlResult: ClassifierResult): EnsembleResult {
    const detected = regexResult && mlResult.detected;

    // Confidence: when both detect, use ML confidence (more granular than binary regex)
    let confidence: number;
    if (detected) {
      confidence = mlResult.confidence;
    } else if (regexResult && !mlResult.detected) {
      // Regex detected but ML didn't — use ML confidence (low, indicating no threat)
      confidence = mlResult.confidence;
    } else if (!regexResult && mlResult.detected) {
      // ML detected but regex didn't — not blocked, confidence reflects ML
      confidence = mlResult.confidence;
    } else {
      // Neither detected
      confidence = mlResult.confidence;
    }

    // Source attribution
    let source: 'regex' | 'ml' | 'ensemble';
    if (detected) {
      source = 'ensemble';
    } else if (!regexResult && !mlResult.detected) {
      source = 'ensemble';
    } else if (regexResult) {
      source = 'regex';
    } else {
      source = 'ml';
    }

    return { detected, source, confidence };
  }
}
