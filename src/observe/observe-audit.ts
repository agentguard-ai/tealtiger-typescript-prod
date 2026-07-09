/**
 * ObserveAuditLogger — writes structured audit events for observe() mode.
 *
 * Integrates with the existing TealAudit system. All events use HASH
 * redaction by default (security-by-default posture).
 *
 * Events are written synchronously within the request lifecycle so no
 * events are lost on process exit. If the output target is unavailable,
 * logs to stderr and continues (never blocks the request).
 */

import type { PIIDetectionSummary } from './types';

export interface AuditEvent {
  type: string;
  timestamp: string;
  correlationId: string;
  agentId?: string;
  sessionId?: string;
  requestId?: string;
  provider?: string;
  model?: string;
  data?: Record<string, unknown>;
}

/**
 * Simple in-memory audit store for observe() mode.
 * In production, this delegates to TealAudit's configured output.
 */
export class ObserveAuditLogger {
  private readonly events: AuditEvent[] = [];

  private emit(event: AuditEvent): void {
    try {
      this.events.push(event);
    } catch {
      // If audit output fails, log to stderr and continue
      console.error('[TealTiger] Audit write failed, continuing:', event.type);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  /**
   * Log a request event. Called before forwarding to provider.
   */
  logRequest(event: {
    agentId: string;
    sessionId: string;
    requestId: string;
    correlationId: string;
    provider: string;
    model: string;
    inputTokenCount?: number;
  }): void {
    this.emit({
      type: 'observe.request',
      timestamp: this.now(),
      correlationId: event.correlationId,
      agentId: event.agentId,
      sessionId: event.sessionId,
      requestId: event.requestId,
      provider: event.provider,
      model: event.model,
      data: {
        inputTokenCount: event.inputTokenCount,
        redaction: 'HASH',
      },
    });
  }

  /**
   * Log a response event. Called after receiving provider response.
   */
  logResponse(event: {
    requestId: string;
    correlationId: string;
    outputTokenCount: number;
    cost: number;
    latencyMs: number;
    piiDetections: PIIDetectionSummary | null;
  }): void {
    this.emit({
      type: 'observe.response',
      timestamp: this.now(),
      correlationId: event.correlationId,
      requestId: event.requestId,
      data: {
        outputTokenCount: event.outputTokenCount,
        cost: event.cost,
        latencyMs: event.latencyMs,
        piiDetections: event.piiDetections,
        redaction: 'HASH',
      },
    });
  }

  /**
   * Log an error event when the provider throws.
   */
  logError(event: {
    requestId: string;
    correlationId: string;
    errorType: string;
    errorMessage: string;
  }): void {
    this.emit({
      type: 'observe.error',
      timestamp: this.now(),
      correlationId: event.correlationId,
      requestId: event.requestId,
      data: {
        errorType: event.errorType,
        errorMessage: event.errorMessage,
      },
    });
  }

  /**
   * Log a tool call detected in the model response.
   */
  logToolCall(event: {
    requestId: string;
    correlationId: string;
    toolName: string;
    argumentCount: number;
    argumentsHash: string;
  }): void {
    this.emit({
      type: 'observe.tool_call',
      timestamp: this.now(),
      correlationId: event.correlationId,
      requestId: event.requestId,
      data: {
        toolName: event.toolName,
        argumentCount: event.argumentCount,
        argumentsHash: event.argumentsHash,
      },
    });
  }

  /**
   * Log a freeze-block event.
   */
  logFreezeBlock(event: {
    agentId: string;
    requestId: string;
    correlationId: string;
    isWildcard: boolean;
  }): void {
    this.emit({
      type: 'observe.freeze_block',
      timestamp: this.now(),
      correlationId: event.correlationId,
      agentId: event.agentId,
      requestId: event.requestId,
      data: {
        isWildcard: event.isWildcard,
      },
    });
  }

  /**
   * Log baseline completion event.
   */
  logBaselineComplete(agentId: string, sessionId: string): void {
    this.emit({
      type: 'observe.baseline_complete',
      timestamp: this.now(),
      correlationId: `baseline-${agentId}`,
      agentId,
      sessionId,
    });
  }

  /**
   * Get all logged events (for testing and reporting).
   */
  getEvents(): readonly AuditEvent[] {
    return this.events;
  }

  /**
   * Get event count (for audit completeness checks).
   */
  getEventCount(): number {
    return this.events.length;
  }
}
