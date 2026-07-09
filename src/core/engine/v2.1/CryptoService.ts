/**
 * TealEngine v2.1 — CryptoService
 *
 * Provides all cryptographic primitives for the TEEC v2.1 Governance Contract.
 * Pure, stateless functions with no side effects.
 *
 * - SHA-256 hashing
 * - HMAC-SHA256 signing
 * - Deterministic JSON serialization (lexicographic key ordering)
 * - Payload normalization (sort, trim, lowercase, serialize)
 *
 * @module core/engine/v2.1/CryptoService
 */

import { createHash, createHmac } from 'crypto';

/**
 * CryptoService — static cryptographic utility methods for TEEC v2.1.
 *
 * All methods are pure functions: given the same inputs, they always
 * produce the same output. No internal state is maintained.
 */
export class CryptoService {
  /**
   * Compute the SHA-256 hash of the given data string.
   *
   * @param data - The input string to hash (UTF-8 encoded)
   * @returns Hex-encoded SHA-256 digest (64 lowercase hex characters)
   *
   * @example
   * ```typescript
   * CryptoService.sha256('hello'); // => 2cf24dba5fb0a30e...
   * ```
   */
  static sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Compute the HMAC-SHA256 of data using the provided key.
   *
   * @param key - The HMAC secret key (UTF-8 encoded)
   * @param data - The input data to authenticate (UTF-8 encoded)
   * @returns Hex-encoded HMAC-SHA256 value (64 lowercase hex characters)
   *
   * @example
   * ```typescript
   * CryptoService.hmacSha256('secret', 'message'); // => hex string
   * ```
   */
  static hmacSha256(key: string, data: string): string {
    return createHmac('sha256', key).update(data, 'utf8').digest('hex');
  }

  /**
   * Deterministic JSON serialization with recursive lexicographic key sorting.
   *
   * Ensures that objects with identical logical content always produce the
   * same JSON string regardless of the original key insertion order.
   * Arrays are preserved in their original order.
   *
   * @param obj - The value to serialize (typically a Record, but handles any JSON-compatible value)
   * @returns A JSON string with all object keys sorted lexicographically at every nesting level
   *
   * @example
   * ```typescript
   * CryptoService.deterministicSerialize({ b: 1, a: 2 });
   * // => '{"a":2,"b":1}'
   *
   * CryptoService.deterministicSerialize({ z: { b: 1, a: 2 }, a: 3 });
   * // => '{"a":3,"z":{"a":2,"b":1}}'
   * ```
   */
  static deterministicSerialize(obj: unknown): string {
    return JSON.stringify(obj, (_key: string, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value).sort()) {
          sorted[k] = (value as Record<string, unknown>)[k];
        }
        return sorted;
      }
      return value;
    });
  }

  /**
   * Normalize a payload for canonical comparison and deduplication.
   *
   * Normalization steps:
   * 1. Recursively sort all object keys lexicographically
   * 2. Trim leading/trailing whitespace from all string values
   * 3. Lowercase all string values
   * 4. Serialize the normalized structure to JSON
   *
   * Two payloads that differ only in key ordering, string casing, or
   * surrounding whitespace will produce identical normalized output.
   *
   * @param payload - The request payload to normalize
   * @returns A canonical JSON string representing the normalized payload
   *
   * @example
   * ```typescript
   * CryptoService.normalizePayload({ B: ' Hello ', A: 'WORLD' });
   * // => '{"a":"world","b":"hello"}'
   * ```
   */
  static normalizePayload(payload: Record<string, unknown>): string {
    function normalize(value: unknown): unknown {
      if (typeof value === 'string') {
        return value.trim().toLowerCase();
      }
      if (Array.isArray(value)) {
        return value.map(normalize);
      }
      if (value && typeof value === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
          sorted[k] = normalize((value as Record<string, unknown>)[k]);
        }
        return sorted;
      }
      return value;
    }
    return JSON.stringify(normalize(payload));
  }
}
