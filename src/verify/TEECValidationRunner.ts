/**
 * TealVerify — TEEC Validation Runner
 *
 * Validates batches of Decision objects against TEEC registries.
 * Used in CI pipelines to assert all outputs are TEEC-compliant.
 *
 * @module verify/TEECValidationRunner
 */

import type { Decision } from '../core/engine/v1.2/types';
import type { TEECValidationResult } from '../core/engine/v1.2/TEECValidator';
import { TEECValidator } from '../core/engine/v1.2/TEECValidator';

export interface TEECBatchValidationResult {
  total: number;
  valid: number;
  invalid: number;
  errors: TEECValidationResult[];
}

export class TEECValidationRunner {
  private readonly validator: TEECValidator;

  constructor(validator: TEECValidator) {
    this.validator = validator;
  }

  /**
   * Validate an array of Decision objects against TEEC registries.
   * Returns aggregate counts and all invalid validation results.
   */
  validateDecisions(decisions: Decision[]): TEECBatchValidationResult {
    const allErrors: TEECValidationResult[] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const decision of decisions) {
      const results = this.validator.validateDecision(decision);
      const hasError = results.some((r) => !r.valid);

      if (hasError) {
        invalidCount++;
        for (const r of results) {
          if (!r.valid) {
            allErrors.push(r);
          }
        }
      } else {
        validCount++;
      }
    }

    return {
      total: decisions.length,
      valid: validCount,
      invalid: invalidCount,
      errors: allErrors,
    };
  }
}
