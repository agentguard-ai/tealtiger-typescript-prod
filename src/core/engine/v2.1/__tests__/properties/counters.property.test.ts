/**
 * Property-based tests for CounterManager — TEEC v2.1.
 *
 * Property 4: Sequence Monotonicity
 * Property 5: Running Count Global Monotonicity
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
 *
 * @module core/engine/v2.1/__tests__/properties/counters.property.test
 */

import fc from 'fast-check';
import { CounterManager } from '../../CounterManager';

describe('CounterManager Property Tests', () => {
  // ── Property 4: Sequence Monotonicity ─────────────────────────────

  describe('Property 4: Sequence Monotonicity', () => {
    /**
     * **Validates: Requirements 4.1, 4.3, 4.5**
     *
     * For any single agent and any number N of calls to nextSeq(agentId),
     * the returned values SHALL form the sequence [1, 2, 3, ..., N]
     * with no gaps or duplicates.
     */
    it('single agent seq values form [1..N] with no gaps', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (n, agentId) => {
            const cm = new CounterManager();
            const results: number[] = [];

            for (let i = 0; i < n; i++) {
              results.push(cm.nextSeq(agentId));
            }

            // Assert results form [1, 2, 3, ..., N]
            const expected = Array.from({ length: n }, (_, i) => i + 1);
            expect(results).toEqual(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1, 4.3, 4.5**
     *
     * For K agents each receiving N decisions, each agent's seq values
     * SHALL independently form [1..N].
     */
    it('multiple agents each have independent seq [1..N]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),   // K agents
          fc.integer({ min: 1, max: 50 }),   // N decisions each
          (k, n) => {
            const cm = new CounterManager();
            const agents = Array.from({ length: k }, (_, i) => `agent-${i}`);
            const results: Map<string, number[]> = new Map();

            for (const agent of agents) {
              results.set(agent, []);
            }

            // Interleave calls across agents in round-robin fashion
            for (let round = 0; round < n; round++) {
              for (const agent of agents) {
                results.get(agent)!.push(cm.nextSeq(agent));
              }
            }

            // Each agent's seq values should form [1..N]
            const expected = Array.from({ length: n }, (_, i) => i + 1);
            for (const agent of agents) {
              expect(results.get(agent)).toEqual(expected);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Incrementing agent A's seq SHALL NOT affect agent B's seq.
     */
    it('per-agent seq is independent across agents', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          (nA, nB) => {
            const cm = new CounterManager();
            const agentA = 'agent-A';
            const agentB = 'agent-B';

            // Increment agent A some number of times
            for (let i = 0; i < nA; i++) {
              cm.nextSeq(agentA);
            }

            // Agent B's first seq should still be 1, unaffected by agent A
            expect(cm.nextSeq(agentB)).toBe(1);

            // Agent A's next should continue from where it left off
            expect(cm.nextSeq(agentA)).toBe(nA + 1);

            // Continue agent B
            for (let i = 0; i < nB - 1; i++) {
              cm.nextSeq(agentB);
            }

            // Agent B should be at nB
            expect(cm.currentSeq(agentB)).toBe(nB);
            // Agent A should still be at nA + 1
            expect(cm.currentSeq(agentA)).toBe(nA + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 5: Running Count Global Monotonicity ─────────────────

  describe('Property 5: Running Count Global Monotonicity', () => {
    /**
     * **Validates: Requirements 4.2, 4.4, 4.6**
     *
     * For any sequence of M calls to nextRunningCount() across all agents,
     * the returned values SHALL form [1, 2, 3, ..., M] with no gaps.
     */
    it('running_count forms [1..M] globally with no gaps', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (m) => {
            const cm = new CounterManager();
            const results: number[] = [];

            for (let i = 0; i < m; i++) {
              results.push(cm.nextRunningCount());
            }

            const expected = Array.from({ length: m }, (_, i) => i + 1);
            expect(results).toEqual(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2, 4.4, 4.6**
     *
     * Interleaving nextRunningCount() with nextSeq() calls for random agents
     * SHALL still produce running_count values [1..M] globally.
     */
    it('running_count forms [1..M] when interleaved with random agent seq calls', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 }),
            { minLength: 1, maxLength: 100 }
          ),
          (agentSequence) => {
            const cm = new CounterManager();
            const m = agentSequence.length;
            const runningCounts: number[] = [];

            for (const agentId of agentSequence) {
              // Interleave: call nextSeq for the agent, then nextRunningCount
              cm.nextSeq(agentId);
              runningCounts.push(cm.nextRunningCount());
            }

            const expected = Array.from({ length: m }, (_, i) => i + 1);
            expect(runningCounts).toEqual(expected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Additional: Reset behavior ────────────────────────────────────

  describe('Reset behavior', () => {
    /**
     * **Validates: Requirements 4.1, 4.2**
     *
     * After arbitrary operations, calling reset() then nextSeq returns 1
     * and nextRunningCount returns 1 again.
     */
    it('reset() restores initial state for all counters', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              agentId: fc.string({ minLength: 1, maxLength: 10 }),
              seqCalls: fc.integer({ min: 1, max: 20 }),
              runningCalls: fc.integer({ min: 1, max: 20 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (operations) => {
            const cm = new CounterManager();

            // Perform arbitrary operations
            for (const op of operations) {
              for (let i = 0; i < op.seqCalls; i++) {
                cm.nextSeq(op.agentId);
              }
              for (let i = 0; i < op.runningCalls; i++) {
                cm.nextRunningCount();
              }
            }

            // Reset
            cm.reset();

            // After reset, nextSeq for any agent should return 1
            const testAgent = operations[0].agentId;
            expect(cm.nextSeq(testAgent)).toBe(1);

            // After reset, nextRunningCount should return 1
            expect(cm.nextRunningCount()).toBe(1);

            // currentSeq for a fresh agent should be 0
            expect(cm.currentSeq('never-seen-agent')).toBe(0);
            expect(cm.currentRunningCount()).toBe(1); // we just called nextRunningCount
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
