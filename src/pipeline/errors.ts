/**
 * Multi-Stage Defense Pipeline — Error Hierarchy
 *
 * Pipeline-specific error classes for construction-time validation,
 * runtime module failures, and remediation budget exhaustion.
 *
 * @module pipeline/errors
 */

/**
 * Base class for all pipeline errors.
 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PipelineError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PipelineError);
    }
  }
}

/**
 * Thrown at construction when a module doesn't implement the TealModule interface.
 */
export class ModuleValidationError extends PipelineError {
  constructor(
    public readonly moduleName: string,
    public readonly missingFields: string[],
  ) {
    super(
      `Module '${moduleName}' does not implement TealModule interface. Missing: ${missingFields.join(', ')}`,
      'MODULE_VALIDATION_FAILED',
    );
    this.name = 'ModuleValidationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModuleValidationError);
    }
  }
}

/**
 * Thrown when neither observeProxy nor providerClient is provided,
 * or when other pipeline configuration is invalid.
 */
export class PipelineConfigError extends PipelineError {
  constructor(message: string) {
    super(message, 'PIPELINE_CONFIG_INVALID');
    this.name = 'PipelineConfigError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PipelineConfigError);
    }
  }
}

/**
 * Thrown when a module exceeds its evaluation timeout.
 */
export class ModuleTimeoutError extends PipelineError {
  constructor(
    public readonly moduleName: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Module '${moduleName}' exceeded evaluation timeout of ${timeoutMs}ms`,
      'MODULE_TIMEOUT',
    );
    this.name = 'ModuleTimeoutError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModuleTimeoutError);
    }
  }
}

/**
 * Thrown internally when the resample budget is exhausted (not exposed to caller).
 */
export class ResampleBudgetExhaustedError extends PipelineError {
  constructor(
    public readonly budget: number,
    public readonly attempts: number,
  ) {
    super(
      `Resample budget exhausted: ${attempts}/${budget} attempts used`,
      'RESAMPLE_BUDGET_EXHAUSTED',
    );
    this.name = 'ResampleBudgetExhaustedError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ResampleBudgetExhaustedError);
    }
  }
}
