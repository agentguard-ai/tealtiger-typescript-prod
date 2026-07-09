/**
 * Property-based tests for verifyContiguity — TEEC v2.1 chain verification.
 *
 * Uses fast-check to verify that honestly-produced decision chains always
 * pass contiguity verification.
 *
 * Properties tested:
 * - Property 8: Verify Contiguity Accepts Valid Chains
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**
 *
 * @module core/engine/v2.1/__tests__/properties/contiguity.property.test
 */

import * as fc from 'fast-check';
import { GovernanceEngineV21 } from '../../GovernanceEngineV21';
import { verifyContiguity } from '../../verifyContiguity';

// ── Helpers ────────────────────────────────────────────────────────

/** Arbitrary for generating request payloads with string/number values */
const requestPayloadArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer({ min: -1000000, max: 1000000 }),
  ),
  { minKeys: 1, maxKeys: 8 },
);

// ── Property 8: Verify Contiguity Accepts Valid Chains ─────────────

/**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**
 *
 * Property 8: Verify Contiguity Accepts Valid Chains — for any sequence
 * of N decisions produced by a single GovernanceEngine instance for a single
 * agent in order, verify_contiguity() SHALL return success with valid: true
 * and count: N.
 */
describe('Property 8: Verify Contiguity Accepts Valid Chains', () => {
  it('honestly-produced single-agent chains always pass contiguity verification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        fc.array(requestPayloadArb, { minLength: 20, maxLength: 20 }),
        async (n, payloads) => {
          const engine = new GovernanceEngineV21({
            policy: {},
            seal_secret: 'test',
            agent_id: 'agent',
          });

          // Produce N decisions sequentially
          const decisions: Record<string, unknown>[] = [];
          for (let i = 0; i < n; i++) {
            const decision = await engine.evaluate(payloads[i], {
              correlation_id: `contiguity-${i}`,
            });
            decisions.push(decision as unknown as Record<string, unknown>);
          }

          // Verify contiguity
          const result = verifyContiguity(decisions);

          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.count).toBe(n);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('multi-agent scenario: per-agent contiguity passes with agent_id filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        fc.array(requestPayloadArb, { minLength: 20, maxLength: 20 }),
        async (n, payloads) => {
          const engine = new GovernanceEngineV21({
            policy: {},
            seal_secret: 'test',
          });

          // Produce decisions for agent-a and agent-b alternately
          const allDecisions: Record<string, unknown>[] = [];
          for (let i = 0; i < n * 2; i++) {
            const agentId = i % 2 === 0 ? 'agent-a' : 'agent-b';
            const decision = await engine.evaluate(payloads[i], {
              correlation_id: `multi-agent-${i}`,
              agent_id: agentId,
            } as any);
            allDecisions.push(decision as unknown as Record<string, unknown>);
          }

          // Verify contiguity for agent-a
          const resultA = verifyContiguity(allDecisions, { agent_id: 'agent-a' });
          expect(resultA.valid).toBe(true);
          if (resultA.valid) {
            expect(resultA.count).toBe(n);
          }

          // Verify contiguity for agent-b
          const resultB = verifyContiguity(allDecisions, { agent_id: 'agent-b' });
          expect(resultB.valid).toBe(true);
          if (resultB.valid) {
            expect(resultB.count).toBe(n);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
