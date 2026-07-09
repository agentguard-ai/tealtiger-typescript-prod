/**
 * PIIScanner — REPORT_ONLY mode PII detection for observe().
 *
 * Scans request/response payloads for PII patterns (email, phone, SSN,
 * credit card). Reports findings to audit log but NEVER blocks, delays,
 * or modifies traffic.
 *
 * On any internal error: fails silently, returns null. The scan is
 * best-effort and must never interfere with the request lifecycle.
 */

import type { PIIDetectionSummary } from './types';

// Pre-compiled regex patterns for each PII type
const PII_PATTERNS: Record<string, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
};

/**
 * Extract text content from a payload for scanning.
 * Handles strings, objects (JSON.stringify), and arrays.
 */
function extractText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload == null) return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export class ObservePIIScanner {
  /**
   * Scan a payload for PII patterns.
   * Returns detection summary or null on any error.
   * NEVER throws — all errors are swallowed silently.
   */
  scan(payload: unknown, phase: 'request' | 'response'): PIIDetectionSummary | null {
    try {
      const text = extractText(payload);
      if (!text) return null;

      const detectedTypes: string[] = [];
      let totalCount = 0;

      for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          detectedTypes.push(type);
          totalCount += matches.length;
        }
      }

      if (totalCount === 0) return null;

      return {
        count: totalCount,
        types: detectedTypes,
        phase,
      };
    } catch {
      // Fail silently — PII detection is best-effort
      return null;
    }
  }
}
