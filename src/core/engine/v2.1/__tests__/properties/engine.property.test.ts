/**
 * Property-based tests for GovernanceEngineV21 — TEEC v2.1 governance pipeline.
 *
 * Uses fast-check to verify universal correctness properties across arbitrary inputs.
 *
 * Properties tested:
 * - Property 2: Intent Ref Binding
 * - Property 6: Receipt Chain Integrity
 * - Property 7: Validate Round-Trip (manual seal verification)
 *
 * @module core/engine/v2.1/__tests__/properties/engine.property.test
 */

import * as fc from 'fast-check';
import { GovernanceEngineV21 } from '../../GovernanceEngineV21';
import { CryptoService } from '../../CryptoService';
import { GENESIS_RECEIPT_REF } from '../../types';

// ── Helpers ────────────────────────────────────────────────────────

/** Minimal engine config for property tests */
function createEngine(sealSecret = 'test-secret', agentId = 'test-agent') {
  return new GovernanceEngineV21({
    policy: {},
    seal_secret: sealSecret,
    agent_id: agentId,
  });
}

/** Arbitrary for generating request payloads with string/number values */
const requestPayloadArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer({ min: -1000000, max: 1000000 }),
  ),
  { minKeys: 1, maxKeys: 8 },
);

// ── Property 2: Intent Ref Binding ─────────────────────────────────

/**
 * **Validates: Requirements 3.1, 3.2, 3.3**
 *
 * Property 2: Intent Ref Binding — for any request payload P, the intent_ref
 * stored in the resulting Decision SHALL equal the SHA-256 hash that an
 * independent verifier computes from the same serialized payload P.
 */
describe('Property 2: Intent Ref Binding', () => {
  it('intent_ref equals SHA-256 of deterministicSerialize(request) for arbitrary payloads', async () => {
    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine();

        const decision = await engine.evaluate(request, {
          correlation_id: 'prop2-test',
        });

        // Independently compute the expected intent_ref
        const serialized = CryptoService.deterministicSerialize(request);
        const expectedIntentRef = CryptoService.sha256(serialized);

        expect(decision.intent_ref).toBe(expectedIntentRef);
      }),
      { numRuns: 50 },
    );
  });

  it('intent_ref is always a 64-character hex string', async () => {
    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine();

        const decision = await engine.evaluate(request, {
          correlation_id: 'prop2-hex-test',
        });

        expect(decision.intent_ref).toHaveLength(64);
        expect(decision.intent_ref).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 6: Receipt Chain Integrity ────────────────────────────

/**
 * **Validates: Requirements 10.1, 10.2, 10.3**
 *
 * Property 6: Receipt Chain Integrity — for any contiguous sequence of Decisions
 * for a single agent, recomputing receipt_ref for Decision[i] using Decision[i-1]'s
 * receipt_ref (or GENESIS_RECEIPT_REF for i=1) SHALL match the stored receipt_ref.
 */
describe('Property 6: Receipt Chain Integrity', () => {
  /**
   * Helper: recompute the receipt_ref for a decision given the previous receipt_ref.
   * This mirrors the engine's internal logic using the same CryptoService.
   */
  function computeExpectedReceiptRef(
    decision: Record<string, unknown>,
    previousReceiptRef: string,
  ): string {
    // Build the partial decision (exclude receipt_ref and governance_seal)
    const { receipt_ref: _rr, governance_seal: _gs, ...partial } = decision;
    const payload = CryptoService.deterministicSerialize(partial);
    const input = payload + previousReceiptRef;
    return CryptoService.sha256(input);
  }

  it('receipt_ref chain is self-consistent across a sequence of evaluations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        fc.array(requestPayloadArb, { minLength: 20, maxLength: 20 }),
        async (n, payloads) => {
          const engine = createEngine('chain-secret', 'chain-agent');
          const decisions: Record<string, unknown>[] = [];

          // Produce N decisions sequentially
          for (let i = 0; i < n; i++) {
            const decision = await engine.evaluate(payloads[i], {
              correlation_id: `chain-${i}`,
            });
            decisions.push(decision as unknown as Record<string, unknown>);
          }

          // Verify the chain
          for (let i = 0; i < decisions.length; i++) {
            const prevReceiptRef = i === 0
              ? GENESIS_RECEIPT_REF
              : decisions[i - 1].receipt_ref as string;

            const expectedReceiptRef = computeExpectedReceiptRef(decisions[i], prevReceiptRef);
            expect(decisions[i].receipt_ref).toBe(expectedReceiptRef);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('first decision in a chain uses GENESIS_RECEIPT_REF as the previous link', async () => {
    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine('genesis-secret', 'genesis-agent');

        const decision = await engine.evaluate(request, {
          correlation_id: 'genesis-test',
        });

        const decisionObj = decision as unknown as Record<string, unknown>;
        const expectedReceiptRef = computeExpectedReceiptRef(decisionObj, GENESIS_RECEIPT_REF);
        expect(decision.receipt_ref).toBe(expectedReceiptRef);
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 7: Validate Round-Trip ────────────────────────────────

/**
 * **Validates: Requirements 6.2, 6.3, 6.7, 1.7**
 *
 * Property 7: Validate Round-Trip — for any Decision produced by the
 * GovernanceEngine with a known request payload and seal_secret,
 * the GovernanceSeal HMAC should be verifiable by recomputing it independently.
 *
 * NOTE: validateGovernanceDecision isn't implemented yet (task 6.1).
 * We manually verify the seal: serialize decision (without governance_seal),
 * concatenate with timestamp + agent_id, HMAC with seal_secret, and assert match.
 * We also verify intent_ref matches independent computation.
 */
describe('Property 7: Validate Round-Trip', () => {
  it('freshly produced decisions have a verifiable GovernanceSeal HMAC', async () => {
    const sealSecret = 'roundtrip-secret';
    const agentId = 'roundtrip-agent';

    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine(sealSecret, agentId);

        const decision = await engine.evaluate(request, {
          correlation_id: 'roundtrip-test',
        });

        // Recompute the HMAC independently
        // 1. Build the decision payload without governance_seal
        const { governance_seal, ...decisionWithoutSeal } = decision;

        // 2. Serialize deterministically
        const payload = CryptoService.deterministicSerialize(decisionWithoutSeal);

        // 3. Concatenate with timestamp + agent_id
        const hmacInput = payload + String(governance_seal.timestamp) + governance_seal.agent_id;

        // 4. Compute HMAC with seal_secret
        const expectedHmac = CryptoService.hmacSha256(sealSecret, hmacInput);

        // Assert HMAC matches
        expect(decision.governance_seal.hmac).toBe(expectedHmac);
      }),
      { numRuns: 50 },
    );
  });

  it('freshly produced decisions have intent_ref matching independent computation', async () => {
    const sealSecret = 'intent-roundtrip-secret';
    const agentId = 'intent-roundtrip-agent';

    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine(sealSecret, agentId);

        const decision = await engine.evaluate(request, {
          correlation_id: 'intent-roundtrip-test',
        });

        // Independently compute intent_ref
        const serialized = CryptoService.deterministicSerialize(request);
        const expectedIntentRef = CryptoService.sha256(serialized);

        expect(decision.intent_ref).toBe(expectedIntentRef);
      }),
      { numRuns: 50 },
    );
  });

  it('governance_seal contains valid agent_id and a numeric timestamp', async () => {
    const sealSecret = 'meta-secret';
    const agentId = 'meta-agent';

    await fc.assert(
      fc.asyncProperty(requestPayloadArb, async (request) => {
        const engine = createEngine(sealSecret, agentId);

        const decision = await engine.evaluate(request, {
          correlation_id: 'meta-test',
        });

        expect(decision.governance_seal.agent_id).toBe(agentId);
        expect(typeof decision.governance_seal.timestamp).toBe('number');
        expect(decision.governance_seal.timestamp).toBeGreaterThan(0);
        expect(decision.governance_seal.hmac).toHaveLength(64);
        expect(decision.governance_seal.hmac).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 50 },
    );
  });
});
