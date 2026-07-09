/**
 * Unit tests for CryptoService — TEEC v2.1 cryptographic primitives.
 *
 * @module core/engine/v2.1/__tests__/CryptoService.test
 */

import { CryptoService } from '../CryptoService';
import { createHash, createHmac } from 'crypto';

describe('CryptoService', () => {
  describe('sha256', () => {
    it('should produce correct hex-encoded SHA-256 for known input', () => {
      // Well-known SHA-256 of empty string
      const expected = createHash('sha256').update('', 'utf8').digest('hex');
      expect(CryptoService.sha256('')).toBe(expected);
    });

    it('should produce 64-character hex string', () => {
      const result = CryptoService.sha256('hello world');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic — same input yields same output', () => {
      const a = CryptoService.sha256('test-data');
      const b = CryptoService.sha256('test-data');
      expect(a).toBe(b);
    });

    it('should produce different hashes for different inputs', () => {
      const a = CryptoService.sha256('hello');
      const b = CryptoService.sha256('world');
      expect(a).not.toBe(b);
    });
  });

  describe('hmacSha256', () => {
    it('should produce correct HMAC-SHA256 for known inputs', () => {
      const expected = createHmac('sha256', 'key').update('data', 'utf8').digest('hex');
      expect(CryptoService.hmacSha256('key', 'data')).toBe(expected);
    });

    it('should produce 64-character hex string', () => {
      const result = CryptoService.hmacSha256('secret', 'message');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic — same inputs yield same output', () => {
      const a = CryptoService.hmacSha256('secret', 'payload');
      const b = CryptoService.hmacSha256('secret', 'payload');
      expect(a).toBe(b);
    });

    it('should produce different HMACs for different keys', () => {
      const a = CryptoService.hmacSha256('key1', 'data');
      const b = CryptoService.hmacSha256('key2', 'data');
      expect(a).not.toBe(b);
    });

    it('should produce different HMACs for different data', () => {
      const a = CryptoService.hmacSha256('key', 'data1');
      const b = CryptoService.hmacSha256('key', 'data2');
      expect(a).not.toBe(b);
    });
  });

  describe('deterministicSerialize', () => {
    it('should sort top-level keys lexicographically', () => {
      const result = CryptoService.deterministicSerialize({ c: 3, a: 1, b: 2 });
      expect(result).toBe('{"a":1,"b":2,"c":3}');
    });

    it('should sort nested object keys recursively', () => {
      const result = CryptoService.deterministicSerialize({
        z: { b: 1, a: 2 },
        a: 3,
      });
      expect(result).toBe('{"a":3,"z":{"a":2,"b":1}}');
    });

    it('should preserve array order', () => {
      const result = CryptoService.deterministicSerialize({ items: [3, 1, 2] });
      expect(result).toBe('{"items":[3,1,2]}');
    });

    it('should handle deeply nested objects', () => {
      const result = CryptoService.deterministicSerialize({
        b: { d: { f: 1, e: 2 }, c: 3 },
        a: 4,
      });
      expect(result).toBe('{"a":4,"b":{"c":3,"d":{"e":2,"f":1}}}');
    });

    it('should handle objects within arrays', () => {
      const result = CryptoService.deterministicSerialize({
        items: [{ b: 2, a: 1 }, { d: 4, c: 3 }],
      });
      expect(result).toBe('{"items":[{"a":1,"b":2},{"c":3,"d":4}]}');
    });

    it('should handle empty objects', () => {
      expect(CryptoService.deterministicSerialize({})).toBe('{}');
    });

    it('should handle null values', () => {
      const result = CryptoService.deterministicSerialize({ b: null, a: 1 });
      expect(result).toBe('{"a":1,"b":null}');
    });

    it('should produce identical output for same logical object with different key order', () => {
      const a = CryptoService.deterministicSerialize({ x: 1, y: 2, z: 3 });
      const b = CryptoService.deterministicSerialize({ z: 3, x: 1, y: 2 });
      expect(a).toBe(b);
    });
  });

  describe('normalizePayload', () => {
    it('should sort keys lexicographically', () => {
      const result = CryptoService.normalizePayload({ b: 'x', a: 'y' });
      expect(result).toBe('{"a":"y","b":"x"}');
    });

    it('should trim whitespace from string values', () => {
      const result = CryptoService.normalizePayload({ name: '  hello  ' });
      expect(result).toBe('{"name":"hello"}');
    });

    it('should lowercase string values', () => {
      const result = CryptoService.normalizePayload({ name: 'Hello World' });
      expect(result).toBe('{"name":"hello world"}');
    });

    it('should combine trim + lowercase', () => {
      const result = CryptoService.normalizePayload({ msg: '  HELLO  ' });
      expect(result).toBe('{"msg":"hello"}');
    });

    it('should normalize nested objects', () => {
      const result = CryptoService.normalizePayload({
        b: { d: ' FOO ', c: 'BAR' },
        a: 'BAZ',
      });
      expect(result).toBe('{"a":"baz","b":{"c":"bar","d":"foo"}}');
    });

    it('should normalize arrays', () => {
      const result = CryptoService.normalizePayload({
        items: [' A ', 'B', ' c '],
      });
      expect(result).toBe('{"items":["a","b","c"]}');
    });

    it('should preserve non-string values unchanged', () => {
      const result = CryptoService.normalizePayload({
        num: 42,
        bool: true,
        nothing: null,
      });
      expect(result).toBe('{"bool":true,"nothing":null,"num":42}');
    });

    it('should produce identical output for semantically equivalent payloads', () => {
      const a = CryptoService.normalizePayload({ B: ' Hello ', A: 'WORLD' });
      const b = CryptoService.normalizePayload({ A: '  world  ', B: 'hello' });
      expect(a).toBe(b);
    });
  });
});
