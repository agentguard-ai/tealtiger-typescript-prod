/**
 * TealState — Context and State Governance Module
 *
 * Tracks context entries per agent with provenance metadata and enforces
 * configurable maximum context window size limits. Supports mutation
 * governance to log/block unauthorized state changes.
 *
 * Actions on exceed:
 * - truncate: remove oldest entries until within limit
 * - deny: reject new entry
 * - alert: allow but emit warning event
 *
 * Emits reason code: CONTEXT_SIZE_EXCEEDED
 *
 * @module modules/tealstate/TealState
 * @requirements 18.1, 18.2, 18.3, 18.4
 */

import type {
  StateConfig,
  ContextEntry,
} from '../../core/engine/v1.3/module-types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
} from '../../core/engine/v1.2/types';

// ── Constants ────────────────────────────────────────────────────

const MODULE_NAME = 'TealState';
const MODULE_VERSION = '1.3.0';
const REASON_CODE_EXCEEDED = 'CONTEXT_SIZE_EXCEEDED';
const REASON_CODE_MUTATION = 'UNAUTHORIZED_STATE_MUTATION';
const EVENT_TYPE_EXCEEDED = 'governance.state.context_exceeded';
const EVENT_TYPE_MUTATION = 'governance.state.unauthorized_mutation';

// ── Default configuration ────────────────────────────────────────

const DEFAULT_CONFIG: StateConfig = {
  max_context_size: 128000, // 128K tokens/bytes
  on_exceed: 'deny',
  track_provenance: true,
  mutation_governance: false,
};

// ── Internal types ───────────────────────────────────────────────

interface TrackedEntry {
  entry: ContextEntry;
  size: number;
  added_at: number;
}

interface AgentContext {
  agent_id: string;
  entries: TrackedEntry[];
  total_size: number;
  mutation_log: MutationRecord[];
}

interface MutationRecord {
  timestamp: number;
  action: 'add' | 'remove' | 'modify';
  source: string;
  authorized: boolean;
  entry_summary: string;
}

// ── TealStateModule ──────────────────────────────────────────────

export class TealStateModule implements TealModule {
  readonly name = MODULE_NAME;
  readonly version = MODULE_VERSION;

  private config: StateConfig;
  private contexts: Map<string, AgentContext> = new Map();
  private events: Array<{ type: string; data: Record<string, unknown> }> = [];

  constructor(config?: Partial<StateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // No async initialization required
  }

  async destroy(): Promise<void> {
    this.contexts.clear();
    this.events = [];
  }

  /**
   * Adds a context entry for the given agent.
   * Enforces max_context_size and takes the configured action on exceed.
   *
   * Returns whether the entry was allowed and any reason code.
   */
  addContext(
    agent_id: string,
    entry: ContextEntry,
  ): { allowed: boolean; reason_code?: string } {
    const agentCtx = this.getOrCreateAgentContext(agent_id);
    const entrySize = this.computeEntrySize(entry);
    const newTotalSize = agentCtx.total_size + entrySize;

    // Check if adding this entry would exceed the limit
    if (newTotalSize > this.config.max_context_size) {
      this.emitEvent(EVENT_TYPE_EXCEEDED, {
        agent_id,
        current_size: agentCtx.total_size,
        entry_size: entrySize,
        max_size: this.config.max_context_size,
      });

      switch (this.config.on_exceed) {
        case 'deny':
          return { allowed: false, reason_code: REASON_CODE_EXCEEDED };

        case 'truncate':
          this.truncateOldest(agentCtx, entrySize);
          break;

        case 'alert':
          // Allow but emit event (already emitted above)
          break;
      }
    }

    // Add the entry
    const tracked: TrackedEntry = {
      entry,
      size: entrySize,
      added_at: Date.now(),
    };
    agentCtx.entries.push(tracked);
    agentCtx.total_size += entrySize;

    // Log mutation if governance enabled
    if (this.config.mutation_governance) {
      agentCtx.mutation_log.push({
        timestamp: Date.now(),
        action: 'add',
        source: entry.source,
        authorized: true,
        entry_summary: entry.content.substring(0, 100),
      });
    }

    return { allowed: true };
  }

  /**
   * Gets the current context entries for an agent.
   */
  getContext(agent_id: string): ContextEntry[] {
    const agentCtx = this.contexts.get(agent_id);
    if (!agentCtx) return [];
    return agentCtx.entries.map((t) => t.entry);
  }

  /**
   * Gets the current context size for an agent.
   */
  getContextSize(agent_id: string): number {
    const agentCtx = this.contexts.get(agent_id);
    return agentCtx?.total_size ?? 0;
  }

  /**
   * Removes a context entry by index. Logs as mutation if governance enabled.
   * Returns whether the removal was authorized.
   */
  removeContext(
    agent_id: string,
    index: number,
    source: string,
    authorized: boolean = true,
  ): { allowed: boolean; reason_code?: string } {
    const agentCtx = this.contexts.get(agent_id);
    if (!agentCtx || index < 0 || index >= agentCtx.entries.length) {
      return { allowed: false, reason_code: 'INVALID_INDEX' };
    }

    if (this.config.mutation_governance && !authorized) {
      agentCtx.mutation_log.push({
        timestamp: Date.now(),
        action: 'remove',
        source,
        authorized: false,
        entry_summary: agentCtx.entries[index].entry.content.substring(0, 100),
      });
      this.emitEvent(EVENT_TYPE_MUTATION, {
        agent_id,
        action: 'remove',
        source,
        index,
      });
      return { allowed: false, reason_code: REASON_CODE_MUTATION };
    }

    const removed = agentCtx.entries.splice(index, 1)[0];
    agentCtx.total_size -= removed.size;

    if (this.config.mutation_governance) {
      agentCtx.mutation_log.push({
        timestamp: Date.now(),
        action: 'remove',
        source,
        authorized: true,
        entry_summary: removed.entry.content.substring(0, 100),
      });
    }

    return { allowed: true };
  }

  /**
   * Gets the mutation log for an agent (if mutation_governance is enabled).
   */
  getMutationLog(agent_id: string): MutationRecord[] {
    const agentCtx = this.contexts.get(agent_id);
    return agentCtx?.mutation_log ?? [];
  }

  /**
   * Gets emitted events (for testing and integration).
   */
  getEvents(): Array<{ type: string; data: Record<string, unknown> }> {
    return [...this.events];
  }

  /**
   * Clears all context for an agent.
   */
  clearContext(agent_id: string): void {
    this.contexts.delete(agent_id);
  }

  /**
   * TealModule evaluate interface.
   */
  async evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
  ): Promise<ModuleResult> {
    const agent_id = ctx.agent_id || 'unknown';
    const entry = request['context_entry'] as ContextEntry | undefined;

    if (!entry) {
      return {
        action: 'ALLOW' as any,
        reason_codes: [],
        event_type: 'governance.state.none',
      };
    }

    const result = this.addContext(agent_id, entry);

    if (!result.allowed) {
      return {
        action: 'DENY' as any,
        reason_codes: [result.reason_code!],
        event_type: EVENT_TYPE_EXCEEDED,
        metadata: {
          agent_id,
          current_size: this.getContextSize(agent_id),
          max_size: this.config.max_context_size,
        },
      };
    }

    return {
      action: 'ALLOW' as any,
      reason_codes: [],
      event_type: 'governance.state.allowed',
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private getOrCreateAgentContext(agent_id: string): AgentContext {
    let agentCtx = this.contexts.get(agent_id);
    if (!agentCtx) {
      agentCtx = {
        agent_id,
        entries: [],
        total_size: 0,
        mutation_log: [],
      };
      this.contexts.set(agent_id, agentCtx);
    }
    return agentCtx;
  }

  private computeEntrySize(entry: ContextEntry): number {
    // Approximate size as byte length of content
    return Buffer.byteLength(entry.content, 'utf-8');
  }

  private truncateOldest(agentCtx: AgentContext, neededSpace: number): void {
    // Remove oldest entries until we have enough space
    const targetSize = this.config.max_context_size - neededSpace;
    while (agentCtx.entries.length > 0 && agentCtx.total_size > targetSize) {
      const removed = agentCtx.entries.shift()!;
      agentCtx.total_size -= removed.size;

      if (this.config.mutation_governance) {
        agentCtx.mutation_log.push({
          timestamp: Date.now(),
          action: 'remove',
          source: 'system:truncation',
          authorized: true,
          entry_summary: removed.entry.content.substring(0, 100),
        });
      }
    }
  }

  private emitEvent(type: string, data: Record<string, unknown>): void {
    this.events.push({ type, data });
  }
}
