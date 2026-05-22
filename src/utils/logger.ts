/**
 * TealTiger SDK - Logging Utilities
 *
 * Provides a configurable logger with sensitive-value redaction by default.
 */

export interface Logger {
  log(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LoggerConfig {
  sink?: Pick<Logger, 'log' | 'warn' | 'error' | 'info' | 'debug'>;
  debugEnabled?: boolean;
  redact?: boolean;
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|credential|api[_-]?key|authorization|bearer|x-api-key)/i;
const SECRET_STRING_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, '[REDACTED]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED]'],
  [/\bSG\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]'],
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]'],
  [/(?:[?&](?:api[_-]?key|token|secret|credential)=)([^&\s]+)/gi, '$1[REDACTED]'],
  [/(?:\b(?:api[_-]?key|token|secret|credential)\b\s*[:=]\s*)(["']?)([^\s"'&]+)\1/gi, '$1[REDACTED]$1'],
];

let defaultLogger: Logger;

function getSinkMethod(
  sink: Pick<Logger, 'log' | 'warn' | 'error' | 'info' | 'debug'>,
  level: 'debug' | 'info' | 'warn' | 'error'
): (...args: unknown[]) => void {
  if (level === 'warn') {
    return sink.warn ?? sink.log;
  }

  if (level === 'error') {
    return sink.error ?? sink.warn ?? sink.log;
  }

  return sink.log ?? sink.info ?? sink.debug ?? sink.warn ?? sink.error;
}

function redactString(value: string): string {
  let redacted = value;

  for (const [pattern, replacement] of SECRET_STRING_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}

function redactObject(value: Record<string, unknown>, seen: WeakSet<object>): Record<string, unknown> {
  if (seen.has(value)) {
    return { value: '[Circular]' };
  }

  seen.add(value);

  const redacted: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }

    redacted[key] = redactLogValueInternal(nestedValue, seen);
  }

  return redacted;
}

function redactArray(value: unknown[], seen: WeakSet<object>): unknown[] {
  if (seen.has(value)) {
    return ['[Circular]'];
  }

  seen.add(value);
  return value.map((item) => redactLogValueInternal(item, seen));
}

function redactLogValueInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return '[Function]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (value instanceof Error) {
    const error: Record<string, unknown> = {
      name: value.name,
      message: redactString(value.message),
    };

    if (value.stack) {
      error.stack = redactString(value.stack);
    }

    for (const [key, nestedValue] of Object.entries(value as unknown as Record<string, unknown>)) {
      if (!(key in error)) {
        error[key] = redactLogValueInternal(nestedValue, seen);
      }
    }

    return error;
  }

  if (Array.isArray(value)) {
    return redactArray(value, seen);
  }

  if (typeof value === 'object') {
    return redactObject(value as Record<string, unknown>, seen);
  }

  return value;
}

/**
 * Redact sensitive values from a value before logging.
 */
export function redactLogValue(value: unknown): unknown {
  return redactLogValueInternal(value, new WeakSet<object>());
}

/**
 * Create a logger that redacts sensitive values by default.
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const sink = config.sink ?? console;
  const debugEnabled = config.debugEnabled ?? false;
  const shouldRedact = config.redact !== false;

  const emit = (
    level: 'debug' | 'info' | 'warn' | 'error',
    args: unknown[]
  ): void => {
    if (level === 'debug' && !debugEnabled) {
      return;
    }

    const method = getSinkMethod(sink, level);
    const payload = shouldRedact ? args.map((arg) => redactLogValue(arg)) : args;
    method.apply(sink, payload as never[]);
  };

  return {
    log: (...args: unknown[]) => emit('info', args),
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
  };
}

/**
 * Set the default logger used by modules that do not receive one explicitly.
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * Get the default logger used by modules that do not receive one explicitly.
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }

  return defaultLogger;
}
