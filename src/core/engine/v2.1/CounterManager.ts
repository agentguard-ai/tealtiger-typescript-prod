/**
 * TealEngine v2.1 — Counter Manager
 *
 * Manages per-agent sequence counters, a global running count, and
 * per-agent receipt_ref tracking for hash-chain linking.
 *
 * Counters are in-process only (no persistence required for v2.1).
 *
 * @module core/engine/v2.1/CounterManager
 */

import { GENESIS_RECEIPT_REF } from './types';

/**
 * Manages monotonically increasing sequence counters and receipt chain
 * references for the TEEC v2.1 Governance Contract.
 *
 * - Per-agent `seq` counters start at 1 and increment by 1.
 * - A single global `running_count` starts at 1 and increments by 1.
 * - Per-agent `receipt_ref` stores the last receipt hash for chain linking.
 */
export class CounterManager {
  /** Per-agent sequence counters (agent_id → current seq value) */
  private seqCounters: Map<string, number> = new Map();

  /** Global running count shared across all agents */
  private runningCount: number = 0;

  /** Per-agent last receipt_ref for chain linking (agent_id → receipt_ref) */
  private receiptRefs: Map<string, string> = new Map();

  /**
   * Get the next sequence number for the given agent.
   * Starts at 1 for the first call, increments by 1 thereafter.
   *
   * @param agentId - Identity of the agent requesting a sequence number
   * @returns The next seq value (monotonically increasing per agent)
   */
  nextSeq(agentId: string): number {
    const current = this.seqCounters.get(agentId) ?? 0;
    const next = current + 1;
    this.seqCounters.set(agentId, next);
    return next;
  }

  /**
   * Get the next global running count.
   * Starts at 1 for the first call, increments by 1 thereafter.
   * Shared across all agents within this engine instance.
   *
   * @returns The next running_count value (monotonically increasing globally)
   */
  nextRunningCount(): number {
    this.runningCount += 1;
    return this.runningCount;
  }

  /**
   * Get the current sequence number for an agent without incrementing.
   * Returns 0 if the agent has never been assigned a seq.
   *
   * @param agentId - Identity of the agent to query
   * @returns The last assigned seq value, or 0 if never incremented
   */
  currentSeq(agentId: string): number {
    return this.seqCounters.get(agentId) ?? 0;
  }

  /**
   * Get the current global running count without incrementing.
   * Returns 0 if no decisions have been produced yet.
   *
   * @returns The last assigned running_count value, or 0 if never incremented
   */
  currentRunningCount(): number {
    return this.runningCount;
  }

  /**
   * Get the last receipt_ref stored for a given agent.
   * Returns `GENESIS_RECEIPT_REF` (64 zero characters) if no receipt_ref
   * has been stored for this agent — used as the "previous" hash for the
   * first decision in an agent's chain.
   *
   * @param agentId - Identity of the agent to query
   * @returns The last stored receipt_ref, or GENESIS_RECEIPT_REF if none
   */
  getLastReceiptRef(agentId: string): string {
    return this.receiptRefs.get(agentId) ?? GENESIS_RECEIPT_REF;
  }

  /**
   * Store the receipt_ref after a decision is produced for chain linking.
   * The stored value becomes the "previous receipt_ref" for the next decision
   * produced by this agent.
   *
   * @param agentId - Identity of the agent that produced the decision
   * @param receiptRef - The receipt_ref of the produced decision
   */
  setLastReceiptRef(agentId: string, receiptRef: string): void {
    this.receiptRefs.set(agentId, receiptRef);
  }

  /**
   * Reset all counters and receipt references to initial state.
   * Intended for testing — clears per-agent seq, global running_count,
   * and all stored receipt_refs.
   */
  reset(): void {
    this.seqCounters.clear();
    this.runningCount = 0;
    this.receiptRefs.clear();
  }
}
