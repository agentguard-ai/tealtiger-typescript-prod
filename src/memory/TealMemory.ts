/**
 * TealMemory Module — Memory Governance
 *
 * Implements write/read/forget governance for agentic memory operations.
 * Storage-agnostic via MemoryAdapter interface. Fail-closed on adapter errors.
 * Raw memory values never appear in evidence.
 *
 * @module memory/TealMemory
 */

import { createHash } from 'crypto';
import { DecisionAction, ReasonCode } from '../core/engine/types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
  Decision,
} from '../core/engine/v1.2/types';
import type {
  MemoryRecord,
  MemoryQuery,
  MemoryDelete,
  MemoryOperationContext,
  TealMemoryOptions,
  TealMemoryPolicy,
  Classification,
} from './types';

// ── Lightweight secret/PII patterns (no TealSecrets dependency) ──

const SECRET_PATTERNS = [
  /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/i,                    // AWS key
  /ghp_[A-Za-z0-9]{36}/,                                       // GitHub PAT
  /sk_live_[A-Za-z0-9]{24,}/,                                  // Stripe
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,             // Private key
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S{8,}/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,                           // Bearer token
];

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,          // Email
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,                            // SSN
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone
];

// ── Classification hierarchy ─────────────────────────────────────

const CLASSIFICATION_LEVEL: Record<Classification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

// ── TealMemory ───────────────────────────────────────────────────

export class TealMemory implements TealModule {
  readonly name = 'TealMemory';
  readonly version = '1.2.0';

  private readonly adapter: TealMemoryOptions['adapter'];
  private readonly evidenceConfig: TealMemoryOptions['evidence'];

  constructor(options: TealMemoryOptions) {
    this.adapter = options.adapter;
    this.evidenceConfig = options.evidence ?? { emit: true, redaction: 'HASH' };
  }

  // ── TealModule interface ─────────────────────────────────────────

  async evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult> {
    const memPolicy = policy as TealMemoryPolicy;
    if (!memPolicy?.enabled) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'memory.evaluate',
      };
    }

    const opCtx: MemoryOperationContext = {
      correlation_id: ctx.correlation_id,
      ...(ctx.tenant_id !== undefined ? { tenant_id: ctx.tenant_id } : {}),
      ...(ctx.user_id !== undefined ? { user_id: ctx.user_id } : {}),
      ...(ctx.session_id !== undefined ? { session_id: ctx.session_id } : {}),
    };

    // Route based on request content
    if (request.content !== undefined) {
      const record: MemoryRecord = {
        scope: (request as any).scope ?? 'SESSION',
        classification: (request as any).classification ?? 'PUBLIC',
        ttlMs: (request as any).ttlMs,
        value: request.content ?? '',
        tags: (request as any).tags,
        source: (request as any).source,
      };
      const decision = await this.write(record, opCtx, memPolicy);
      return {
        action: decision.action,
        reason_codes: decision.reason_codes.map(String),
        event_type: 'memory.write',
        metadata: decision.metadata ?? {},
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'memory.evaluate',
    };
  }

  // ── Write Governance ───────────────────────────────────────────

  async write(
    record: MemoryRecord,
    ctx: MemoryOperationContext,
    policy?: TealMemoryPolicy,
  ): Promise<Decision> {
    const p = policy ?? { enabled: true } as TealMemoryPolicy;
    const writePolicy = p.write;
    const retentionPolicy = p.retention;

    // 1. Scope check
    if (writePolicy?.allowed_scopes && !writePolicy.allowed_scopes.includes(record.scope)) {
      return this.makeDecision(
        DecisionAction.DENY_WRITE,
        [ReasonCode.MEMORY_SCOPE_VIOLATION],
        ctx,
        record,
        'Write denied: scope not allowed',
      );
    }

    // 2. TTL validation (Task 5.7)
    if (retentionPolicy) {
      const ttlCheck = this.checkTTL(record, retentionPolicy);
      if (ttlCheck) {
        return this.makeDecision(
          DecisionAction.DENY_WRITE,
          [ttlCheck],
          ctx,
          record,
          `Write denied: ${ttlCheck}`,
        );
      }
    }

    // 3. Secret scan
    if (writePolicy?.deny_if?.secrets) {
      const hasSecret = this.containsSecret(record.value);
      if (hasSecret) {
        const action = writePolicy.on_detect?.secrets ?? 'DENY';
        if (action === 'DENY') {
          return this.makeDecision(
            DecisionAction.DENY_WRITE,
            [ReasonCode.MEMORY_WRITE_DENIED_SECRET],
            ctx,
            record,
            'Write denied: secret detected',
          );
        }
        if (action === 'REDACT') {
          return this.makeDecision(
            DecisionAction.REDACT_AND_WRITE,
            [ReasonCode.MEMORY_WRITE_REDACTED],
            ctx,
            record,
            'Write redacted: secret detected',
          );
        }
        if (action === 'SUMMARY_ONLY') {
          return this.makeDecision(
            DecisionAction.STORE_SUMMARY_ONLY,
            [ReasonCode.MEMORY_WRITE_SUMMARY_ONLY],
            ctx,
            record,
            'Write summary only: secret detected',
          );
        }
      }
    }

    // 4. PII scan
    if (writePolicy?.deny_if?.pii) {
      const hasPII = this.containsPII(record.value);
      if (hasPII) {
        const action = writePolicy.on_detect?.pii ?? 'DENY';
        if (action === 'DENY') {
          return this.makeDecision(
            DecisionAction.DENY_WRITE,
            [ReasonCode.MEMORY_WRITE_DENIED_PII],
            ctx,
            record,
            'Write denied: PII detected',
          );
        }
        if (action === 'REDACT') {
          return this.makeDecision(
            DecisionAction.REDACT_AND_WRITE,
            [ReasonCode.MEMORY_WRITE_REDACTED],
            ctx,
            record,
            'Write redacted: PII detected',
          );
        }
      }
    }

    // 5. All checks pass → delegate to adapter
    try {
      await this.adapter.put(record, ctx);
      return this.makeDecision(
        DecisionAction.ALLOW_WRITE,
        [ReasonCode.MEMORY_WRITE_ALLOWED],
        ctx,
        record,
        'Write allowed',
      );
    } catch (_err) {
      return this.makeDecision(
        DecisionAction.DENY_WRITE,
        [ReasonCode.MEMORY_ADAPTER_UNAVAILABLE],
        ctx,
        record,
        'Write denied: adapter unavailable',
      );
    }
  }

  // ── Read Governance ────────────────────────────────────────────

  async read(
    query: MemoryQuery,
    ctx: MemoryOperationContext,
    policy?: TealMemoryPolicy,
  ): Promise<{ decision: Decision; records: MemoryRecord[] }> {
    const p = policy ?? { enabled: true } as TealMemoryPolicy;
    const readPolicy = p.read;

    // 1. Scope check
    if (readPolicy?.allowed_scopes && !readPolicy.allowed_scopes.includes(query.scope)) {
      return {
        decision: this.makeDecision(
          DecisionAction.DENY_READ,
          [ReasonCode.MEMORY_READ_DENIED_SCOPE],
          ctx,
          undefined,
          'Read denied: scope not allowed',
        ),
        records: [],
      };
    }

    // 2. Delegate to adapter, then check classification
    try {
      const records = await this.adapter.get(query, ctx);

      // Classification clearance check
      if (readPolicy?.enforce_classification) {
        const ctxClassification = this.getContextClassification(ctx);
        const ctxLevel = CLASSIFICATION_LEVEL[ctxClassification];
        const denied = records.some(
          (r) => CLASSIFICATION_LEVEL[r.classification] > ctxLevel,
        );
        if (denied) {
          return {
            decision: this.makeDecision(
              DecisionAction.DENY_READ,
              [ReasonCode.MEMORY_READ_DENIED_CLASSIFICATION],
              ctx,
              undefined,
              'Read denied: classification exceeds clearance',
            ),
            records: [],
          };
        }
      }

      // Apply max_results
      const limited = readPolicy?.max_results
        ? records.slice(0, readPolicy.max_results)
        : records;

      return {
        decision: this.makeDecision(
          DecisionAction.ALLOW,
          [ReasonCode.MEMORY_READ_ALLOWED],
          ctx,
          undefined,
          'Read allowed',
        ),
        records: limited,
      };
    } catch (_err) {
      return {
        decision: this.makeDecision(
          DecisionAction.DENY_READ,
          [ReasonCode.MEMORY_ADAPTER_UNAVAILABLE],
          ctx,
          undefined,
          'Read denied: adapter unavailable',
        ),
        records: [],
      };
    }
  }

  // ── Forget (Delete) Governance ─────────────────────────────────

  async forget(
    selector: MemoryDelete,
    ctx: MemoryOperationContext,
    policy?: TealMemoryPolicy,
  ): Promise<Decision> {
    const p = policy ?? { enabled: true } as TealMemoryPolicy;
    const writePolicy = p.write;

    // Scope check for delete
    if (writePolicy?.allowed_scopes && !writePolicy.allowed_scopes.includes(selector.scope)) {
      return this.makeDecision(
        DecisionAction.DENY_WRITE,
        [ReasonCode.MEMORY_SCOPE_VIOLATION],
        ctx,
        undefined,
        'Forget denied: scope not allowed',
      );
    }

    try {
      await this.adapter.delete(selector, ctx);
      return this.makeDecision(
        DecisionAction.ALLOW_WRITE,
        [ReasonCode.MEMORY_WRITE_ALLOWED],
        ctx,
        undefined,
        'Forget completed',
      );
    } catch (_err) {
      return this.makeDecision(
        DecisionAction.DENY_WRITE,
        [ReasonCode.MEMORY_ADAPTER_UNAVAILABLE],
        ctx,
        undefined,
        'Forget denied: adapter unavailable',
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private containsSecret(value: string): boolean {
    return SECRET_PATTERNS.some((p) => p.test(value));
  }

  private containsPII(value: string): boolean {
    return PII_PATTERNS.some((p) => p.test(value));
  }

  private checkTTL(
    record: MemoryRecord,
    retention: NonNullable<TealMemoryPolicy['retention']>,
  ): ReasonCode | null {
    // TTL required for certain classifications
    if (retention.ttl_required_for?.includes(record.classification)) {
      if (record.ttlMs === undefined || record.ttlMs === null || record.ttlMs <= 0) {
        return ReasonCode.MEMORY_TTL_REQUIRED;
      }
    }

    // TTL exceeds max
    if (
      retention.max_ttl_ms !== undefined &&
      record.ttlMs !== undefined &&
      record.ttlMs > retention.max_ttl_ms
    ) {
      return ReasonCode.MEMORY_TTL_EXCEEDED;
    }

    return null;
  }

  private getContextClassification(ctx: MemoryOperationContext): Classification {
    // Default clearance: SESSION-level contexts get INTERNAL,
    // tenant-level get CONFIDENTIAL, otherwise PUBLIC
    if (ctx.tenant_id) return 'CONFIDENTIAL';
    if (ctx.session_id) return 'INTERNAL';
    return 'PUBLIC';
  }

  private redactValue(value: string): string {
    const mode = this.evidenceConfig?.redaction ?? 'HASH';
    switch (mode) {
      case 'HASH':
        return createHash('sha256').update(value).digest('hex');
      case 'SIZE_ONLY':
        return `[${value.length} bytes]`;
      case 'CATEGORY_ONLY':
        return '[REDACTED]';
      case 'FULL':
        return value;
      default:
        return createHash('sha256').update(value).digest('hex');
    }
  }

  private makeDecision(
    action: DecisionAction,
    reason_codes: ReasonCode[],
    ctx: MemoryOperationContext,
    record: MemoryRecord | undefined,
    reason: string,
  ): Decision {
    const metadata: Record<string, unknown> = {
      module: this.name,
      version: this.version,
    };

    // Evidence: never include raw values
    if (record && this.evidenceConfig?.emit !== false) {
      metadata.scope = record.scope;
      metadata.classification = record.classification;
      metadata.value_evidence = this.redactValue(record.value);
      if (record.tags) {
        metadata.tags = record.tags;
      }
    }

    return {
      action,
      reason_codes,
      risk_score: action === DecisionAction.ALLOW_WRITE || action === DecisionAction.ALLOW ? 0 : 80,
      mode: 'ENFORCE' as any,
      policy_id: 'memory-governance',
      policy_version: '1.2.0',
      component_versions: { sdk: '1.2.0', engine: '1.2.0' },
      correlation_id: ctx.correlation_id,
      reason,
      metadata,
      event_type: 'memory.governance',
      teec_version: '0.1.0',
      timestamp: Date.now(),
      module: this.name,
    } as Decision;
  }
}
