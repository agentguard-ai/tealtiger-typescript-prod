/**
 * FreezeRegistry — Global in-memory singleton that tracks frozen agent IDs.
 *
 * Provides the kill switch mechanism: freeze() immediately blocks all
 * subsequent requests for a given agent (or all agents with '*').
 * unfreeze() restores normal operation.
 *
 * - In-memory only (persists for process lifetime, resets on restart)
 * - No external service or database dependency
 * - Idempotent: freeze(id) called N times ≡ called once
 * - No-error: unfreeze(id) on non-frozen agent is a no-op
 */

/**
 * Singleton registry tracking which agents are frozen.
 */
export class FreezeRegistry {
  private static instance: FreezeRegistry | null = null;
  private readonly frozenAgents: Set<string> = new Set();
  private wildcardFrozen = false;

  private constructor() {}

  /**
   * Get the singleton FreezeRegistry instance.
   */
  static getInstance(): FreezeRegistry {
    if (!FreezeRegistry.instance) {
      FreezeRegistry.instance = new FreezeRegistry();
    }
    return FreezeRegistry.instance;
  }

  /**
   * Register an agent as frozen. Idempotent.
   * Use '*' to freeze all agents globally.
   */
  freeze(agentId: string): void {
    if (agentId === '*') {
      this.wildcardFrozen = true;
    } else {
      this.frozenAgents.add(agentId);
    }
  }

  /**
   * Remove an agent from frozen state. No-op if not frozen.
   * Use '*' to unfreeze the global wildcard.
   */
  unfreeze(agentId: string): void {
    if (agentId === '*') {
      this.wildcardFrozen = false;
    } else {
      this.frozenAgents.delete(agentId);
    }
  }

  /**
   * Check if a specific agent is frozen.
   * Returns true if the agent is individually frozen OR wildcard is active.
   */
  isFrozen(agentId: string): boolean {
    return this.wildcardFrozen || this.frozenAgents.has(agentId);
  }

  /**
   * Check whether the current freeze state includes a wildcard freeze.
   */
  isWildcardFreeze(): boolean {
    return this.wildcardFrozen;
  }

  /**
   * Reset registry state. Used for testing only.
   * @internal
   */
  _reset(): void {
    this.frozenAgents.clear();
    this.wildcardFrozen = false;
  }
}

// --- Top-level convenience exports ---

/**
 * Immediately freeze an agent, blocking all subsequent requests.
 * Use '*' to freeze all agents globally.
 *
 * @example
 * ```ts
 * import { freeze } from 'tealtiger';
 * freeze('research-agent');  // blocks this agent
 * freeze('*');               // blocks ALL agents
 * ```
 */
export function freeze(agentId: string): void {
  FreezeRegistry.getInstance().freeze(agentId);
}

/**
 * Unfreeze an agent, restoring normal operation.
 * No-op if the agent is not currently frozen.
 *
 * @example
 * ```ts
 * import { unfreeze } from 'tealtiger';
 * unfreeze('research-agent');  // restores this agent
 * unfreeze('*');               // removes global freeze
 * ```
 */
export function unfreeze(agentId: string): void {
  FreezeRegistry.getInstance().unfreeze(agentId);
}
