/**
 * TealEngine v1.2 — Error Hierarchy
 *
 * Extends the v1.1 InvalidConfigurationError with a structured error
 * hierarchy for configuration, schema, runtime, and adapter failures.
 *
 * @module core/engine/v1.2/errors
 */

/**
 * Base error for all TealTiger v1.2 errors.
 */
export class TealError extends Error {
  readonly code: string;
  readonly module?: string | undefined;
  readonly correlation_id?: string | undefined;

  constructor(
    message: string,
    code: string,
    options?: { module?: string; correlation_id?: string },
  ) {
    super(message);
    this.name = 'TealError';
    this.code = code;
    this.module = options?.module;
    this.correlation_id = options?.correlation_id;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TealError);
    }
  }
}

/**
 * Configuration error — thrown when policy or module config is invalid.
 */
export class TealConfigError extends TealError {
  readonly config_key?: string | undefined;
  readonly expected?: string | undefined;
  readonly received?: string | undefined;

  constructor(
    message: string,
    code: string,
    options?: {
      module?: string;
      correlation_id?: string;
      config_key?: string;
      expected?: string;
      received?: string;
    },
  ) {
    super(message, code, options);
    this.name = 'TealConfigError';
    this.config_key = options?.config_key;
    this.expected = options?.expected;
    this.received = options?.received;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TealConfigError);
    }
  }
}

/**
 * Schema validation error — thrown when a policy or registry document
 * fails structural validation.
 */
export class TealSchemaError extends TealConfigError {
  readonly schema_path?: string | undefined;
  readonly validation_errors: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    code: string,
    options?: {
      module?: string;
      correlation_id?: string;
      config_key?: string;
      expected?: string;
      received?: string;
      schema_path?: string;
      validation_errors?: Array<{ path: string; message: string }>;
    },
  ) {
    super(message, code, options);
    this.name = 'TealSchemaError';
    this.schema_path = options?.schema_path;
    this.validation_errors = options?.validation_errors ?? [];

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TealSchemaError);
    }
  }
}

/**
 * Runtime error — thrown for recoverable or non-recoverable runtime failures.
 */
export class TealRuntimeError extends TealError {
  readonly recoverable: boolean;

  constructor(
    message: string,
    code: string,
    options?: {
      module?: string;
      correlation_id?: string;
      recoverable?: boolean;
    },
  ) {
    super(message, code, options);
    this.name = 'TealRuntimeError';
    this.recoverable = options?.recoverable ?? false;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TealRuntimeError);
    }
  }
}

/**
 * Adapter error — thrown when a storage-agnostic adapter (e.g. MemoryAdapter)
 * encounters a failure.
 */
export class TealAdapterError extends TealRuntimeError {
  readonly adapter: string;
  readonly operation: string;

  constructor(
    message: string,
    code: string,
    options: {
      adapter: string;
      operation: string;
      module?: string;
      correlation_id?: string;
      recoverable?: boolean;
    },
  ) {
    super(message, code, options);
    this.name = 'TealAdapterError';
    this.adapter = options.adapter;
    this.operation = options.operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TealAdapterError);
    }
  }
}
