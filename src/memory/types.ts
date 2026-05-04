/**
 * TealMemory Module — Types
 *
 * All TealMemory-specific types for memory governance, adapters,
 * scope enforcement, classification clearance, and retention policies.
 *
 * @module memory/types
 */

// ── Memory Scope ─────────────────────────────────────────────────

export type MemoryScope = 'SESSION' | 'USER' | 'TENANT' | 'ORG' | 'GLOBAL';

// ── Classification ───────────────────────────────────────────────

export type Classification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

// ── Memory Record ────────────────────────────────────────────────

export interface MemoryRecord {
  id?: string;
  scope: MemoryScope;
  classification: Classification;
  ttlMs?: number;
  value: string;
  tags?: string[];
  source?: 'USER' | 'MODEL' | 'TOOL';
}

// ── Memory Query ─────────────────────────────────────────────────

export interface MemoryQuery {
  scope: MemoryScope;
  selector?: { tags?: string[]; prefix?: string; contains?: string };
  maxResults?: number;
}

// ── Memory Delete ────────────────────────────────────────────────

export interface MemoryDelete {
  scope: MemoryScope;
  selector?: { id?: string; tags?: string[] };
}

// ── Memory Operation Context ─────────────────────────────────────

export interface MemoryOperationContext {
  correlation_id: string;
  tenant_id?: string;
  user_id?: string;
  session_id?: string;
}

// ── Memory Adapter ───────────────────────────────────────────────

export interface MemoryAdapter {
  put(record: MemoryRecord, ctx: MemoryOperationContext): Promise<{ id: string }>;
  get(query: MemoryQuery, ctx: MemoryOperationContext): Promise<MemoryRecord[]>;
  delete(selector: MemoryDelete, ctx: MemoryOperationContext): Promise<void>;
}

// ── TealMemory Options ───────────────────────────────────────────

export interface TealMemoryOptions {
  adapter: MemoryAdapter;
  defaultScope?: MemoryScope;
  defaultTtlMs?: number;
  evidence?: {
    emit?: boolean;
    redaction?: 'HASH' | 'SIZE_ONLY' | 'CATEGORY_ONLY' | 'FULL';
  };
}

// ── TealMemory Policy ────────────────────────────────────────────

export interface TealMemoryPolicy {
  enabled: boolean;
  write?: {
    allowed_scopes?: MemoryScope[];
    max_value_bytes?: number;
    deny_if?: { secrets?: boolean; pii?: boolean };
    on_detect?: {
      secrets?: 'DENY' | 'REDACT' | 'SUMMARY_ONLY';
      pii?: 'DENY' | 'REDACT';
    };
  };
  read?: {
    allowed_scopes?: MemoryScope[];
    max_results?: number;
    deny_cross_tenant?: boolean;
    enforce_classification?: boolean;
  };
  retention?: {
    ttl_required_for?: Classification[];
    max_ttl_ms?: number;
    default_ttl_ms?: number;
  };
}
