/**
 * Cross-SDK Consistency Tests — TEEC v2.1
 *
 * Property 10: Cross-SDK HMAC Consistency
 * Verifies that TypeScript CryptoService outputs match precomputed vectors
 * from the shared JSON file. These same vectors are tested in the Python SDK
 * to guarantee byte-identical outputs across both implementations.
 *
 * **Validates: Requirements 7.5, 7.6, 7.8**
 *
 * @module core/engine/v2.1/__tests__/cross-sdk-vectors.test
 */

import { CryptoService } from '../CryptoService';
import vectors from './cross-sdk-vectors.json';

interface TestVector {
  id: string;
  description: string;
  inputs: {
    request_payload: Record<string, unknown>;
    seal_secret: string;
    agent_id: string;
    timestamp: number;
  };
  expected: {
    deterministic_serialize: string;
    intent_ref: string;
    normalize_payload: string;
    normalization_id: string;
    hmac_input: string;
    hmac: string;
  };
}

const testVectors: TestVector[] = vectors.vectors as TestVector[];

describe('Cross-SDK HMAC Consistency (Property 10)', () => {
  describe.each(testVectors)('Vector: $id — $description', (vector) => {
    const { inputs, expected } = vector;

    it('deterministicSerialize matches expected output', () => {
      const serialized = CryptoService.deterministicSerialize(inputs.request_payload);
      expect(serialized).toBe(expected.deterministic_serialize);
    });

    it('sha256(serialized) matches expected intent_ref', () => {
      const serialized = CryptoService.deterministicSerialize(inputs.request_payload);
      const intentRef = CryptoService.sha256(serialized);
      expect(intentRef).toBe(expected.intent_ref);
    });

    it('normalizePayload matches expected output', () => {
      const normalized = CryptoService.normalizePayload(inputs.request_payload);
      expect(normalized).toBe(expected.normalize_payload);
    });

    it('sha256(normalized) matches expected normalization_id', () => {
      const normalized = CryptoService.normalizePayload(inputs.request_payload);
      const normalizationId = CryptoService.sha256(normalized);
      expect(normalizationId).toBe(expected.normalization_id);
    });

    it('HMAC input construction matches expected', () => {
      const serialized = CryptoService.deterministicSerialize(inputs.request_payload);
      const hmacInput = serialized + String(inputs.timestamp) + inputs.agent_id;
      expect(hmacInput).toBe(expected.hmac_input);
    });

    it('hmacSha256 matches expected HMAC', () => {
      const serialized = CryptoService.deterministicSerialize(inputs.request_payload);
      const hmacInput = serialized + String(inputs.timestamp) + inputs.agent_id;
      const hmac = CryptoService.hmacSha256(inputs.seal_secret, hmacInput);
      expect(hmac).toBe(expected.hmac);
    });
  });
});
