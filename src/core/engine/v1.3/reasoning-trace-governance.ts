/**
 * Reasoning-Trace Governance — PII and Secret Redaction
 *
 * Applies PII detection and secret detection patterns to reasoning traces
 * (chain-of-thought, extended-thinking) before traces reach log sinks.
 *
 * Supports two modes:
 * - 'redact': Replace sensitive content with [REDACTED]
 * - 'hash': Replace sensitive content with SHA-256 hash
 *
 * @module core/engine/v1.3/reasoning-trace-governance
 * @requirements 9.16, 9.17
 */

import { createHash } from 'crypto';

// ── Configuration ────────────────────────────────────────────────

/**
 * Configuration for reasoning-trace redaction.
 */
export interface ReasoningTraceRedactionConfig {
  /** Whether to redact PII patterns */
  redact_pii: boolean;
  /** Whether to redact secret patterns */
  redact_secrets: boolean;
  /** Redaction mode: 'redact' replaces with [REDACTED], 'hash' replaces with SHA-256 */
  mode: 'redact' | 'hash';
}

// ── PII Detection Patterns ──────────────────────────────────────

/**
 * PII patterns for detection in reasoning traces.
 * Each pattern has a name and regex for matching.
 */
const PII_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // Email addresses
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
  // Phone numbers (various formats)
  {
    name: 'phone',
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  },
  // Social Security Numbers (US)
  {
    name: 'ssn',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  },
  // Credit card numbers (basic pattern)
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  },
  // IP addresses (IPv4)
  {
    name: 'ip_address',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  },
  // Date of birth patterns (MM/DD/YYYY, DD-MM-YYYY, etc.)
  {
    name: 'date_of_birth',
    pattern: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g,
  },
];

// ── Secret Detection Patterns ────────────────────────────────────

/**
 * Secret patterns for detection in reasoning traces.
 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // AWS Access Key ID
  {
    name: 'aws_access_key',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  // AWS Secret Access Key
  {
    name: 'aws_secret_key',
    pattern: /\b[A-Za-z0-9\/+=]{40}\b/g,
  },
  // Generic API keys (long hex or alphanumeric strings with prefix)
  {
    name: 'api_key',
    pattern: /\b(?:sk|pk|api|key|token|secret|password)[-_][A-Za-z0-9_\-]{16,}\b/gi,
  },
  // Bearer tokens
  {
    name: 'bearer_token',
    pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
  },
  // GitHub tokens
  {
    name: 'github_token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
  },
  // Generic passwords in key=value format
  {
    name: 'password_assignment',
    pattern: /(?:password|passwd|pwd|secret|token)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  },
  // JWT tokens
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+\/=]+\b/g,
  },
  // Private keys (PEM format markers)
  {
    name: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  },
];

// ── ReasoningTraceGovernor ───────────────────────────────────────

/**
 * ReasoningTraceGovernor — applies PII and secret redaction to reasoning traces.
 *
 * Designed to be applied before reasoning traces (chain-of-thought, extended-thinking)
 * reach log sinks, ensuring sensitive information is not persisted in audit logs.
 *
 * @example
 * ```typescript
 * const governor = new ReasoningTraceGovernor();
 * const redacted = governor.redact(trace, {
 *   redact_pii: true,
 *   redact_secrets: true,
 *   mode: 'redact',
 * });
 * ```
 */
export class ReasoningTraceGovernor {
  /**
   * Redact sensitive content from a reasoning trace.
   *
   * @param trace - The reasoning trace string to process
   * @param config - Redaction configuration (PII, secrets, mode)
   * @returns The trace with sensitive content redacted or hashed
   */
  redact(trace: string, config: ReasoningTraceRedactionConfig): string {
    if (!trace) {
      return trace;
    }

    let result = trace;

    // Apply PII detection and redaction
    if (config.redact_pii) {
      result = this.applyPatterns(result, PII_PATTERNS, config.mode);
    }

    // Apply secret detection and redaction
    if (config.redact_secrets) {
      result = this.applyPatterns(result, SECRET_PATTERNS, config.mode);
    }

    return result;
  }

  /**
   * Apply a set of detection patterns to the input string.
   */
  private applyPatterns(
    input: string,
    patterns: Array<{ name: string; pattern: RegExp }>,
    mode: 'redact' | 'hash',
  ): string {
    let result = input;

    for (const { pattern } of patterns) {
      // Reset regex lastIndex for global patterns
      const regex = new RegExp(pattern.source, pattern.flags);
      result = result.replace(regex, (match) => {
        if (mode === 'hash') {
          return this.hashValue(match);
        }
        return '[REDACTED]';
      });
    }

    return result;
  }

  /**
   * Compute SHA-256 hash of a sensitive value.
   * Returns the hash as a hex string prefixed with [HASH:...].
   */
  private hashValue(value: string): string {
    const hash = createHash('sha256').update(value).digest('hex');
    return `[HASH:${hash}]`;
  }
}
