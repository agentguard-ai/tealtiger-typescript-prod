/**
 * TealEngine v1.3 — OpenTelemetry Governance Emitter
 *
 * Emits OpenTelemetry spans for each governance evaluation with attributes
 * conforming to the TealTiger span convention.
 *
 * This is a placeholder implementation — actual OTel SDK integration would
 * require the @opentelemetry/api dependency. The class captures span data
 * in a structured format that can be forwarded to a real OTel tracer.
 *
 * @module core/engine/v1.3/otel-emitter
 * @requirements 5.2, 21.7, 21.8
 */

import type { DecisionV13, GovernanceContext } from './types';
import type { OTelSpanAttributes, OTelSpanConvention } from './soc-types';

// ── Span Record ──────────────────────────────────────────────────

/**
 * A recorded governance span, capturing all convention-defined attributes
 * and timing information.
 */
export interface GovernanceSpanRecord {
  /** Fixed span name per convention */
  span_name: 'tealtiger.governance.evaluate';
  /** Start time in Unix ms */
  start_time_ms: number;
  /** End time in Unix ms */
  end_time_ms: number;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Span attributes following the TealTiger convention */
  attributes: OTelSpanAttributes;
  /** Span status (OK or ERROR) */
  status: 'OK' | 'ERROR';
}

// ── OTelGovernanceEmitter ────────────────────────────────────────

/**
 * Emits OpenTelemetry-compatible governance spans.
 *
 * Span name: `tealtiger.governance.evaluate`
 * Attributes: decision.action, decision.risk_score, policy.version,
 *             agent.id, correlation_id, modules.evaluated, reason_codes
 *
 * This is a placeholder implementation that records spans internally.
 * In production, this would delegate to @opentelemetry/api's Tracer.
 */
export class OTelGovernanceEmitter {
  /** Recorded spans (for testing and local inspection) */
  private readonly spans: GovernanceSpanRecord[] = [];

  /** Optional external span handler (for forwarding to real OTel SDK) */
  private spanHandler?: (span: GovernanceSpanRecord) => void;

  /**
   * Register an external span handler.
   * When set, emitted spans are forwarded to this handler in addition
   * to being recorded internally.
   */
  setSpanHandler(handler: (span: GovernanceSpanRecord) => void): void {
    this.spanHandler = handler;
  }

  /**
   * Emit a governance evaluation span.
   *
   * @param decision - The v1.3 governance decision
   * @param context - The governance context
   * @param duration_ms - Evaluation duration in milliseconds
   */
  emitSpan(
    decision: DecisionV13,
    context: GovernanceContext,
    duration_ms: number,
  ): void {
    const now = Date.now();
    const attributes = this.buildAttributes(decision, context);

    const span: GovernanceSpanRecord = {
      span_name: 'tealtiger.governance.evaluate',
      start_time_ms: now - duration_ms,
      end_time_ms: now,
      duration_ms,
      attributes,
      status: decision.action === 'DENY' ? 'ERROR' : 'OK',
    };

    this.spans.push(span);

    // Forward to external handler if registered
    if (this.spanHandler) {
      this.spanHandler(span);
    }
  }

  /**
   * Get all recorded spans (for testing/inspection).
   */
  getRecordedSpans(): ReadonlyArray<GovernanceSpanRecord> {
    return this.spans;
  }

  /**
   * Clear all recorded spans.
   */
  clearSpans(): void {
    this.spans.length = 0;
  }

  /**
   * Build the OTel span convention object for a decision.
   * Useful for external integrations that need the convention structure.
   */
  buildConvention(
    decision: DecisionV13,
    context: GovernanceContext,
  ): OTelSpanConvention {
    return {
      span_name: 'tealtiger.governance.evaluate',
      attributes: this.buildAttributes(decision, context),
    };
  }

  // ── Private ──────────────────────────────────────────────────

  private buildAttributes(
    decision: DecisionV13,
    context: GovernanceContext,
  ): OTelSpanAttributes {
    return {
      'decision.action': decision.action,
      'decision.risk_score': decision.risk_score ?? 0,
      'policy.version': decision.policy_version ?? context.policy_version ?? 'unknown',
      'agent.id': context.agent_id ?? context.nhi_identity?.agent_id ?? 'unknown',
      'correlation_id': context.correlation_id ?? 'unknown',
      'modules.evaluated': this.extractModulesEvaluated(decision),
      'reason_codes': decision.reason_codes ?? [],
    };
  }

  /**
   * Extract the list of modules that participated in evaluation.
   * Uses the decision's module field and metadata if available.
   */
  private extractModulesEvaluated(decision: DecisionV13): string[] {
    const modules: string[] = [];

    // Primary module
    if (decision.module) {
      modules.push(decision.module);
    }

    // Check metadata for additional modules
    const metadata = decision.metadata as Record<string, unknown> | undefined;
    if (metadata?.modules_evaluated && Array.isArray(metadata.modules_evaluated)) {
      modules.push(...(metadata.modules_evaluated as string[]));
    }

    return modules.length > 0 ? modules : ['TealEngineV13'];
  }
}
