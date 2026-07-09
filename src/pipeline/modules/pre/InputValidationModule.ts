/**
 * Multi-Stage Defense Pipeline — Input Validation Module
 *
 * Validates request structure against configurable rules: required fields,
 * type checks, and maximum token length. Returns DENY with reason code
 * INPUT_INVALID when any validation fails.
 *
 * @module pipeline/modules/pre/InputValidationModule
 * @requirements 6.2, 6.6, 6.7
 */

import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';
import { DecisionAction } from '../../../core/engine/types';

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration object for InputValidationModule.
 */
export interface InputValidationConfig {
  /** Fields that must be present (and non-undefined) in the request. */
  requiredFields?: string[];
  /** Maximum token estimate. Checks content length using ~4 chars per token heuristic. */
  maxTokens?: number;
  /** Field name → expected typeof string (e.g., { model: 'string', max_tokens: 'number' }). */
  typeChecks?: Record<string, string>;
}

// ── Module Implementation ────────────────────────────────────────

/**
 * Validates request structure (required fields, type checks, max token length).
 * Returns DENY with reason code INPUT_INVALID when any validation check fails.
 * Returns ALLOW when all configured checks pass.
 *
 * Validation rules are composable — only configured checks are enforced:
 * - `requiredFields`: Ensures specified fields exist and are not undefined.
 * - `typeChecks`: Ensures specified fields match the expected JavaScript typeof.
 * - `maxTokens`: Ensures the estimated token count does not exceed the limit.
 */
export class InputValidationModule implements TealModule {
  readonly name = 'InputValidationModule';
  readonly version = '1.0.0';

  private readonly config: InputValidationConfig;

  constructor(config: InputValidationConfig) {
    this.config = config;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    const failures: string[] = [];

    // Check required fields
    if (this.config.requiredFields && this.config.requiredFields.length > 0) {
      for (const field of this.config.requiredFields) {
        if (request[field] === undefined || request[field] === null) {
          failures.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check type constraints
    if (this.config.typeChecks) {
      for (const [field, expectedType] of Object.entries(this.config.typeChecks)) {
        const value = request[field];
        if (value !== undefined && value !== null) {
          const actualType = typeof value;
          if (actualType !== expectedType) {
            failures.push(
              `Type mismatch for field '${field}': expected ${expectedType}, got ${actualType}`,
            );
          }
        }
      }
    }

    // Check max token length
    if (this.config.maxTokens !== undefined) {
      const tokenCount = this.estimateTokenCount(request);
      if (tokenCount > this.config.maxTokens) {
        failures.push(
          `Token limit exceeded: estimated ${tokenCount} tokens > max ${this.config.maxTokens}`,
        );
      }
    }

    // Return result based on failures
    if (failures.length > 0) {
      return {
        action: DecisionAction.DENY,
        reason_codes: ['INPUT_INVALID'],
        event_type: 'pipeline.input_validation',
        metadata: {
          failures,
          failure_count: failures.length,
          module: this.name,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.input_validation',
      metadata: {
        module: this.name,
      },
    };
  }

  /**
   * Estimate the token count from a request.
   * Uses explicit `max_tokens`/`maxTokens` field if present in the request,
   * otherwise estimates based on content length (~4 chars per token heuristic).
   */
  private estimateTokenCount(request: ModuleEvaluationRequest): number {
    // Check for explicit token count fields
    const explicitTokens =
      (request['max_tokens'] as number | undefined) ??
      (request['maxTokens'] as number | undefined);
    if (typeof explicitTokens === 'number') {
      return explicitTokens;
    }

    // Fall back to content-length-based estimation (~4 chars per token)
    const content = request.content ?? '';
    return Math.ceil(content.length / 4);
  }
}
