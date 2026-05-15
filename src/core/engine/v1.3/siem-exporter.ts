/**
 * TealEngine v1.3 — SIEM Exporter
 *
 * Exports governance decisions as SIEM-compatible structured logs in
 * JSON, CEF (Common Event Format), and LEEF (Log Event Extended Format).
 *
 * Supports sinks: stdout, file (append), webhook (HTTP POST).
 *
 * @module core/engine/v1.3/siem-exporter
 * @requirements 5.1, 5.6
 */

import type { DecisionV13, GovernanceContext } from './types';
import type { SIEMExportConfig, SIEMExportFormat } from './soc-types';

// ── SIEM Log Entry ───────────────────────────────────────────────

/**
 * Structured SIEM log entry containing all required governance decision fields.
 */
export interface SIEMLogEntry {
  timestamp: string;
  decision_outcome: string;
  reason_codes: string[];
  policy_version: string;
  agent_id: string;
  action_type: string;
  risk_score: number;
  correlation_id: string;
}

// ── SIEMExporter ─────────────────────────────────────────────────

/**
 * Exports governance decisions as SIEM-compatible structured logs.
 *
 * Supports three output formats:
 * - JSON: Structured JSON (widest compatibility)
 * - CEF: Common Event Format (ArcSight, QRadar)
 * - LEEF: Log Event Extended Format (IBM QRadar)
 *
 * And three sink types:
 * - stdout: Write to process stdout
 * - file: Append to a local file
 * - webhook: HTTP POST to an endpoint
 */
export class SIEMExporter {
  /**
   * Format a governance decision as a SIEM-compatible log string.
   *
   * @param decision - The v1.3 governance decision
   * @param context - The governance context with correlation and agent info
   * @param format - Output format (json, cef, leef). Defaults to 'json'.
   * @returns Formatted log string
   */
  export(
    decision: DecisionV13,
    context: GovernanceContext,
    format: SIEMExportFormat = 'json',
  ): string {
    const entry = this.buildLogEntry(decision, context);

    switch (format) {
      case 'json':
        return this.formatJSON(entry);
      case 'cef':
        return this.formatCEF(entry);
      case 'leef':
        return this.formatLEEF(entry);
      default:
        return this.formatJSON(entry);
    }
  }

  /**
   * Export a formatted log string to the configured sink.
   *
   * @param formatted - The pre-formatted log string
   * @param config - Sink configuration (stdout, file, or webhook)
   */
  async exportToSink(formatted: string, config: SIEMExportConfig): Promise<void> {
    switch (config.sink) {
      case 'stdout':
        this.writeToStdout(formatted);
        break;
      case 'file':
        await this.writeToFile(formatted, config.endpoint);
        break;
      case 'webhook':
        await this.postToWebhook(formatted, config.endpoint);
        break;
    }
  }

  // ── Private: Build log entry ─────────────────────────────────

  private buildLogEntry(
    decision: DecisionV13,
    context: GovernanceContext,
  ): SIEMLogEntry {
    return {
      timestamp: new Date(decision.timestamp ?? Date.now()).toISOString(),
      decision_outcome: decision.action,
      reason_codes: decision.reason_codes ?? [],
      policy_version: decision.policy_version ?? context.policy_version ?? 'unknown',
      agent_id: context.agent_id ?? context.nhi_identity?.agent_id ?? 'unknown',
      action_type: decision.event_type ?? 'governance.decision',
      risk_score: decision.risk_score ?? 0,
      correlation_id: context.correlation_id ?? 'unknown',
    };
  }

  // ── Private: Format methods ──────────────────────────────────

  /**
   * Format as structured JSON.
   */
  private formatJSON(entry: SIEMLogEntry): string {
    return JSON.stringify({
      ...entry,
      source: 'tealtiger',
      schema_version: '1.0.0',
    });
  }

  /**
   * Format as CEF (Common Event Format).
   * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
   */
  private formatCEF(entry: SIEMLogEntry): string {
    const version = 0;
    const vendor = 'TealTiger';
    const product = 'GovernanceEngine';
    const deviceVersion = '1.3.0';
    const signatureId = entry.reason_codes[0] ?? 'governance.decision';
    const name = `Governance Decision: ${entry.decision_outcome}`;
    const severity = this.cefSeverity(entry.risk_score);

    // CEF extension key=value pairs
    const extensions = [
      `rt=${entry.timestamp}`,
      `outcome=${entry.decision_outcome}`,
      `cs1=${entry.reason_codes.join(',')}`,
      `cs1Label=ReasonCodes`,
      `cs2=${entry.policy_version}`,
      `cs2Label=PolicyVersion`,
      `duser=${entry.agent_id}`,
      `act=${entry.action_type}`,
      `cn1=${entry.risk_score}`,
      `cn1Label=RiskScore`,
      `externalId=${entry.correlation_id}`,
    ].join(' ');

    return `CEF:${version}|${vendor}|${product}|${deviceVersion}|${signatureId}|${name}|${severity}|${extensions}`;
  }

  /**
   * Format as LEEF (Log Event Extended Format).
   * LEEF:Version|Vendor|Product|Version|EventID|delimiter|key=value pairs
   */
  private formatLEEF(entry: SIEMLogEntry): string {
    const version = '2.0';
    const vendor = 'TealTiger';
    const product = 'GovernanceEngine';
    const productVersion = '1.3.0';
    const eventId = entry.reason_codes[0] ?? 'governance.decision';

    // LEEF uses tab-separated key=value pairs
    const attributes = [
      `devTime=${entry.timestamp}`,
      `outcome=${entry.decision_outcome}`,
      `reasonCodes=${entry.reason_codes.join(',')}`,
      `policyVersion=${entry.policy_version}`,
      `agentId=${entry.agent_id}`,
      `actionType=${entry.action_type}`,
      `riskScore=${entry.risk_score}`,
      `correlationId=${entry.correlation_id}`,
    ].join('\t');

    return `LEEF:${version}|${vendor}|${product}|${productVersion}|${eventId}|\t|${attributes}`;
  }

  /**
   * Map risk score (0-100) to CEF severity (0-10).
   */
  private cefSeverity(riskScore: number): number {
    return Math.round(riskScore / 10);
  }

  // ── Private: Sink methods ────────────────────────────────────

  private writeToStdout(formatted: string): void {
    process.stdout.write(formatted + '\n');
  }

  private async writeToFile(formatted: string, filePath?: string): Promise<void> {
    if (!filePath) {
      throw new Error('SIEMExporter: file sink requires an endpoint (file path)');
    }
    // Dynamic import to avoid bundling fs in browser environments
    const fs = await import('fs');
    const { promisify } = await import('util');
    const appendFile = promisify(fs.appendFile);
    await appendFile(filePath, formatted + '\n', 'utf-8');
  }

  private async postToWebhook(formatted: string, endpoint?: string): Promise<void> {
    if (!endpoint) {
      throw new Error('SIEMExporter: webhook sink requires an endpoint URL');
    }
    // Use native fetch if available, otherwise fall back to http module
    if (typeof globalThis.fetch === 'function') {
      const response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: formatted,
      });
      if (!response.ok) {
        throw new Error(`SIEMExporter: webhook POST failed with status ${response.status}`);
      }
    } else {
      // Fallback for older Node.js without global fetch
      const { default: http } = await import('http');
      const { default: https } = await import('https');
      const url = new URL(endpoint);
      const client = url.protocol === 'https:' ? https : http;

      return new Promise((resolve, reject) => {
        const req = client.request(
          url,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } },
          (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`SIEMExporter: webhook POST failed with status ${res.statusCode}`));
            }
            res.resume();
          },
        );
        req.on('error', reject);
        req.write(formatted);
        req.end();
      });
    }
  }
}
