/**
 * TealSecrets Module — Secret Detection Engine
 *
 * Implements the TealModule interface for runtime secret detection,
 * confidence scoring, caching, and policy enforcement.
 *
 * @module secrets/TealSecrets
 */

import { createHash } from 'crypto';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
  SecretFinding,
} from '../core/engine/v1.2/types';
import { DecisionAction } from '../core/engine/types';
import {
  SecretPattern,
  SecretFindingFull,
  ContentLocation,
  TealSecretsPolicy,
  CredentialMetadata,
} from './types';
import { builtInDetectors } from './detectors';
import { ConfidenceScorer } from './ConfidenceScorer';
import { DetectionCache } from './DetectionCache';
import { CredentialTTLChecker } from './CredentialTTL';

const DEFAULT_PERF_BUDGET_MS = 50;

export class TealSecrets implements TealModule {
  readonly name = 'TealSecrets';
  readonly version = '1.2.0';

  private detectors: SecretPattern[];
  private readonly scorer: ConfidenceScorer;
  private readonly cache: DetectionCache;
  private readonly ttlChecker: CredentialTTLChecker;

  constructor(cacheOptions?: { enabled?: boolean; maxEntries?: number; ttlMs?: number }) {
    this.detectors = [...builtInDetectors];
    this.scorer = new ConfidenceScorer();
    this.cache = new DetectionCache(cacheOptions);
    this.ttlChecker = new CredentialTTLChecker();
  }

  async init(_config: unknown): Promise<void> {
    // No async init needed — detectors are loaded synchronously
  }

  async destroy(): Promise<void> {
    this.cache.invalidate();
  }

  /**
   * TealModule.evaluate — Run detection + scoring + policy enforcement.
   */
  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResult> {
    const secretsPolicy = policy as TealSecretsPolicy | undefined;
    const content = request.content ?? '';
    const perfBudget = secretsPolicy?.perfBudgetMs ?? DEFAULT_PERF_BUDGET_MS;
    const threshold = secretsPolicy?.confidence_threshold ?? 0.5;
    const policyAction = secretsPolicy?.action ?? 'DENY';

    if (!content) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'secret_scan',
      };
    }

    // Performance budget check
    const start = performance.now();
    const findings = this.scan(content);
    const elapsed = performance.now() - start;

    if (elapsed > perfBudget) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: ['SECRET_SCAN_SKIPPED_PERF_BUDGET'],
        event_type: 'secret_scan_skipped',
        metadata: { elapsed_ms: elapsed, budget_ms: perfBudget },
      };
    }

    // Filter by confidence threshold
    const enforceableFindings = findings.filter((f) => f.confidence >= threshold);

    if (enforceableFindings.length === 0) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'secret_scan',
        findings: this.toCoreFinding(findings),
      };
    }

    // Map policy action
    const action = this.mapAction(policyAction);
    const reasonCodes = this.buildReasonCodes(enforceableFindings);

    return {
      action,
      reason_codes: reasonCodes,
      event_type: 'secret_detected',
      findings: this.toCoreFinding(enforceableFindings),
      metadata: { total_findings: findings.length, enforced_findings: enforceableFindings.length },
    };
  }

  /**
   * Scan content for secrets. Returns deterministic findings.
   */
  scan(content: string): SecretFindingFull[] {
    // Check cache first
    const cached = this.cache.get(content);
    if (cached) return cached;

    const findings: SecretFindingFull[] = [];

    for (const detector of this.detectors) {
      // Use a fresh regex each time to avoid lastIndex issues
      const regex = new RegExp(detector.regex.source, detector.regex.flags.includes('g') ? detector.regex.flags : detector.regex.flags + 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const matchStr = match[0];
        const offset = match.index;
        const location = this.computeLocation(content, offset, matchStr.length);

        // Get surrounding context (100 chars each side)
        const ctxStart = Math.max(0, offset - 100);
        const ctxEnd = Math.min(content.length, offset + matchStr.length + 100);
        const context = content.slice(ctxStart, ctxEnd);

        const { confidence, signals, severity } = this.scorer.score(matchStr, context, detector.id);

        const findingId = this.generateFindingId(detector.id, matchStr);
        const fingerprint = this.generateFingerprint(detector.id, matchStr);

        findings.push({
          finding_id: findingId,
          type: detector.id,
          category: detector.category,
          confidence,
          severity,
          fingerprint,
          evidence_signals: signals,
          location,
        });

        // Prevent infinite loops on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }

    // Deduplicate by fingerprint
    const deduped = this.deduplicateFindings(findings);

    // Cache results
    this.cache.set(content, deduped);

    return deduped;
  }

  /**
   * Register a custom detection pattern.
   * Invalidates cache to ensure new pattern is applied.
   */
  registerPattern(pattern: SecretPattern): void {
    this.detectors.push(pattern);
    this.cache.invalidate();
  }

  /**
   * Check credential TTL against policy.
   */
  checkCredentialTTL(credential: CredentialMetadata): {
    action: string;
    reason_code: string;
    metadata: { type: string; age_ms: number; policy_max_ttl_ms: number };
  } {
    return this.ttlChecker.check(credential);
  }

  /** Get cache statistics */
  getCacheStats(): { hits: number; misses: number; size: number } {
    return this.cache.getStats();
  }

  /** Get total detector count */
  getDetectorCount(): number {
    return this.detectors.length;
  }

  // ── Private helpers ────────────────────────────────────────────

  private computeLocation(content: string, offset: number, length: number): ContentLocation {
    let line = 1;
    let column = 1;
    for (let i = 0; i < offset; i++) {
      if (content[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { offset, length, line, column };
  }

  /** Deterministic finding ID: SHA-256(type + matchContent) */
  private generateFindingId(type: string, matchContent: string): string {
    return createHash('sha256')
      .update(type + ':' + matchContent)
      .digest('hex');
  }

  /** Deterministic fingerprint for deduplication */
  private generateFingerprint(type: string, matchContent: string): string {
    return createHash('sha256')
      .update('fp:' + type + ':' + matchContent)
      .digest('hex')
      .slice(0, 16);
  }

  /** Deduplicate findings by fingerprint, keeping first occurrence */
  private deduplicateFindings(findings: SecretFindingFull[]): SecretFindingFull[] {
    const seen = new Set<string>();
    const result: SecretFindingFull[] = [];
    for (const f of findings) {
      if (!seen.has(f.fingerprint)) {
        seen.add(f.fingerprint);
        result.push(f);
      }
    }
    return result;
  }

  /** Map policy action string to DecisionAction enum */
  private mapAction(action: string): DecisionAction {
    switch (action) {
      case 'DENY': return DecisionAction.DENY;
      case 'REDACT': return DecisionAction.REDACT;
      case 'REQUIRE_APPROVAL': return DecisionAction.REQUIRE_APPROVAL;
      case 'MONITOR': return DecisionAction.ALLOW;
      default: return DecisionAction.DENY;
    }
  }

  /** Build reason codes from findings — never include raw secret values */
  private buildReasonCodes(findings: SecretFindingFull[]): string[] {
    const codes = new Set<string>();
    codes.add('SECRET_DETECTED');
    for (const f of findings) {
      if (f.category === 'cloud' || f.category === 'database' || f.category === 'payments') {
        codes.add('CREDENTIAL_LEAKAGE');
      }
    }
    return Array.from(codes);
  }

  /** Convert full findings to core SecretFinding (no raw values) */
  private toCoreFinding(findings: SecretFindingFull[]): SecretFinding[] {
    return findings.map((f) => ({
      finding_id: f.finding_id,
      type: f.type,
      category: f.category,
      confidence: f.confidence,
      severity: f.severity,
      fingerprint: f.fingerprint,
    }));
  }
}
