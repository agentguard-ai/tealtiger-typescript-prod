/**
 * TealEngine v1.2 — TEEC Validator
 *
 * Validates reason codes, event types, and decision actions against
 * the frozen TEEC v0.1.0 registries. Used by TealEngine's evaluate()
 * pipeline and by TealVerify for CI assertions.
 *
 * @module core/engine/v1.2/TEECValidator
 */

import type { TEECRegistry, Decision } from './types';

/**
 * Result of a single TEEC validation check.
 */
export interface TEECValidationResult {
  valid: boolean;
  field: string;
  value: string;
  error?: string | undefined;
}

export class TEECValidator {
  private readonly registry: TEECRegistry;

  constructor(registry: TEECRegistry) {
    this.registry = registry;
  }

  /**
   * Validate a single reason code against the registry.
   */
  validateReasonCode(code: string): TEECValidationResult {
    const valid = this.registry.reason_codes.has(code);
    return {
      valid,
      field: 'reason_code',
      value: code,
      error: valid ? undefined : `Unknown reason code: ${code}`,
    };
  }

  /**
   * Validate a single event type against the registry.
   */
  validateEventType(type: string): TEECValidationResult {
    const valid = this.registry.event_types.has(type);
    return {
      valid,
      field: 'event_type',
      value: type,
      error: valid ? undefined : `Unknown event type: ${type}`,
    };
  }

  /**
   * Validate a single decision action against the registry.
   */
  validateDecisionAction(action: string): TEECValidationResult {
    const valid = this.registry.decision_actions.has(action);
    return {
      valid,
      field: 'decision_action',
      value: action,
      error: valid ? undefined : `Unknown decision action: ${action}`,
    };
  }

  /**
   * Validate all TEEC-relevant fields of a Decision object.
   * Returns an array of validation results (one per checked field/value).
   */
  validateDecision(decision: Decision): TEECValidationResult[] {
    const results: TEECValidationResult[] = [];

    // Validate action
    results.push(this.validateDecisionAction(decision.action));

    // Validate reason_codes
    if (Array.isArray(decision.reason_codes)) {
      for (const code of decision.reason_codes) {
        results.push(this.validateReasonCode(String(code)));
      }
    }

    // Validate event_type (v1.2 addition, optional)
    if (decision.event_type !== undefined) {
      results.push(this.validateEventType(decision.event_type));
    }

    // Validate teec_version
    if (decision.teec_version !== undefined) {
      const versionValid = decision.teec_version === this.registry.version;
      results.push({
        valid: versionValid,
        field: 'teec_version',
        value: decision.teec_version,
        error: versionValid
          ? undefined
          : `TEEC version mismatch: expected ${this.registry.version}, got ${decision.teec_version}`,
      });
    }

    return results;
  }
}
