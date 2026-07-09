/**
 * Property-based tests for CryptoService — TEEC v2.1 cryptographic primitives.
 *
 * Uses fast-check to verify universal correctness properties across arbitrary inputs.
 *
 * @module core/engine/v2.1/__tests__/properties/crypto.property.test
 */

import * as fc from 'fast-check';
import { CryptoService } from '../../CryptoService';

/**
 * **Validates: Requirements 2.4, 2.7**
 *
 * Property 1: GovernanceSeal Determinism — verify `hmacSha256` and `sha256`
 * are pure functions of their inputs (same inputs = same output, always).
 */
describe('Property 1: GovernanceSeal Determinism', () => {
  it('hmacSha256 is a pure function — same key + same data always produces identical output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 256 }),
        fc.string({ minLength: 0, maxLength: 1024 }),
        (key, data) => {
          const result1 = CryptoService.hmacSha256(key, data);
          const result2 = CryptoService.hmacSha256(key, data);
          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sha256 is a pure function — same data always produces identical output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1024 }),
        (data) => {
          const result1 = CryptoService.sha256(data);
          const result2 = CryptoService.sha256(data);
          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('hmacSha256 always returns a 64-character lowercase hex string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 256 }),
        fc.string({ minLength: 0, maxLength: 1024 }),
        (key, data) => {
          const result = CryptoService.hmacSha256(key, data);
          expect(result).toHaveLength(64);
          expect(result).toMatch(/^[0-9a-f]{64}$/);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sha256 always returns a 64-character lowercase hex string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1024 }),
        (data) => {
          const result = CryptoService.sha256(data);
          expect(result).toHaveLength(64);
          expect(result).toMatch(/^[0-9a-f]{64}$/);
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * **Validates: Requirements 3.5, 3.6**
 *
 * Property 3: Normalization Equivalence — verify that payloads differing only in
 * key order, string casing, or whitespace produce identical normalization output.
 * Also verify that intent_ref (sha256 of deterministicSerialize) differs from
 * normalization_id for non-canonical payloads.
 */
describe('Property 3: Normalization Equivalence', () => {
  /**
   * Arbitrary for generating a base payload with string values.
   * We use simple alphanumeric keys to ensure valid JSON object keys.
   */
  const payloadArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.integer(),
      fc.boolean(),
    ),
    { minKeys: 1, maxKeys: 8 },
  );

  /**
   * Shuffles the keys of an object to create a new object with different insertion order.
   */
  function shuffleKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const keys = Object.keys(obj);
    // Reverse the keys to guarantee a different order (when more than 1 key)
    const shuffled: Record<string, unknown> = {};
    for (const k of [...keys].reverse()) {
      shuffled[k] = obj[k];
    }
    return shuffled;
  }

  /**
   * Adds whitespace padding and changes casing on string values.
   */
  function addWhitespaceAndCasing(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Add leading/trailing whitespace and uppercase
        result[key] = `  ${value.toUpperCase()}  `;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  it('payloads differing only in key order produce identical normalizePayload output', () => {
    fc.assert(
      fc.property(payloadArb, (basePayload) => {
        const shuffled = shuffleKeys(basePayload);
        const norm1 = CryptoService.normalizePayload(basePayload);
        const norm2 = CryptoService.normalizePayload(shuffled);
        expect(norm1).toBe(norm2);
      }),
      { numRuns: 200 },
    );
  });

  it('payloads differing in whitespace and casing produce identical normalizePayload output', () => {
    fc.assert(
      fc.property(payloadArb, (basePayload) => {
        // Only apply whitespace/casing to payloads that have string values
        const hasStrings = Object.values(basePayload).some(v => typeof v === 'string');
        if (!hasStrings) return; // skip if no strings to transform

        const variant = addWhitespaceAndCasing(basePayload);
        const norm1 = CryptoService.normalizePayload(basePayload);
        const norm2 = CryptoService.normalizePayload(variant);
        expect(norm1).toBe(norm2);
      }),
      { numRuns: 200 },
    );
  });

  it('payloads with shuffled keys AND whitespace/casing differences produce identical normalizePayload output', () => {
    fc.assert(
      fc.property(payloadArb, (basePayload) => {
        const hasStrings = Object.values(basePayload).some(v => typeof v === 'string');
        if (!hasStrings) return;

        const variant = shuffleKeys(addWhitespaceAndCasing(basePayload));
        const norm1 = CryptoService.normalizePayload(basePayload);
        const norm2 = CryptoService.normalizePayload(variant);
        expect(norm1).toBe(norm2);
      }),
      { numRuns: 200 },
    );
  });

  it('intent_ref differs from normalization_id for non-canonical payloads', () => {
    fc.assert(
      fc.property(payloadArb, (basePayload) => {
        const hasStrings = Object.values(basePayload).some(v => typeof v === 'string');
        if (!hasStrings) return;

        // Create a non-canonical version (uppercased strings with whitespace)
        const nonCanonical = addWhitespaceAndCasing(basePayload);

        // intent_ref: SHA-256 of deterministic serialization (preserves exact values)
        const intentRef = CryptoService.sha256(
          CryptoService.deterministicSerialize(nonCanonical),
        );

        // normalization_id: SHA-256 of normalized form (trims, lowercases)
        const normalizationId = CryptoService.sha256(
          CryptoService.normalizePayload(nonCanonical),
        );

        // For non-canonical payloads, these MUST differ
        // (the non-canonical payload has uppercase/whitespace that normalization removes)
        expect(intentRef).not.toBe(normalizationId);
      }),
      { numRuns: 200 },
    );
  });
});
