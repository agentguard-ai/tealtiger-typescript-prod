/**
 * TealVerify — JSON Summary Exporter
 *
 * Generates JSON summaries from GoldenTestReport and PolicyTestReport
 * with correlation_id and policy_id per entry.
 *
 * @module verify/JSONExporter
 */

import type { GoldenTestReport, PolicyTestReport } from './types';

/** Generate a deterministic correlation ID from a test name. */
function correlationId(name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(name).digest('hex').slice(0, 32);
}

export class JSONExporter {
  /**
   * Export a GoldenTestReport as JSON string with correlation_id per entry.
   */
  export(report: GoldenTestReport): string {
    const entries = report.results.map((r) => ({
      name: r.name,
      passed: r.passed,
      correlation_id: correlationId(r.name),
      policy_id: 'golden-test',
      expected: r.expected,
      actual: r.actual,
      failure_reason: r.failure_reason,
      duration_ms: r.duration_ms,
    }));

    return JSON.stringify(
      {
        total: report.total,
        passed: report.passed,
        failed: report.failed,
        duration_ms: report.duration_ms,
        results: entries,
      },
      null,
      2,
    );
  }

  /**
   * Export a PolicyTestReport as JSON string.
   */
  exportRedTeam(report: PolicyTestReport): string {
    const entries = report.results.map((r) => ({
      id: r.id,
      category: r.category,
      bypassed: r.bypassed,
      severity: r.severity,
      decision_action: r.decision_action,
      reason_codes: r.reason_codes,
      correlation_id: correlationId(r.id),
      policy_id: 'red-team',
    }));

    return JSON.stringify(
      {
        total_tests: report.total_tests,
        bypasses_found: report.bypasses_found,
        weak_policies: report.weak_policies,
        severity_summary: report.severity_summary,
        results: entries,
      },
      null,
      2,
    );
  }
}
