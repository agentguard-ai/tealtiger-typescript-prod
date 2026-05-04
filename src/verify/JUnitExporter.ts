/**
 * TealVerify — JUnit XML Exporter
 *
 * Generates JUnit XML from GoldenTestReport and PolicyTestReport.
 * No external XML library — hand-built well-formed XML.
 *
 * @module verify/JUnitExporter
 */

import type { GoldenTestReport, PolicyTestReport } from './types';

/** Escape XML special characters. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class JUnitExporter {
  /**
   * Export a GoldenTestReport as JUnit XML.
   */
  export(report: GoldenTestReport): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites tests="${report.total}" failures="${report.failed}" time="${(report.duration_ms / 1000).toFixed(3)}">`,
    );
    lines.push(
      `  <testsuite name="GoldenTests" tests="${report.total}" failures="${report.failed}" time="${(report.duration_ms / 1000).toFixed(3)}">`,
    );

    for (const r of report.results) {
      const timeAttr = ` time="${(r.duration_ms / 1000).toFixed(3)}"`;
      if (r.passed) {
        lines.push(`    <testcase name="${escapeXml(r.name)}"${timeAttr} />`);
      } else {
        lines.push(`    <testcase name="${escapeXml(r.name)}"${timeAttr}>`);
        const expectedStr = `action=${r.expected.action}, reason_codes=[${r.expected.reason_codes.join(',')}]`;
        const actualStr = r.actual
          ? `action=${r.actual.action}, reason_codes=[${r.actual.reason_codes.join(',')}]`
          : 'no result';
        const failMsg = r.failure_reason ?? `Expected: ${expectedStr}; Actual: ${actualStr}`;
        lines.push(`      <failure message="${escapeXml(failMsg)}">${escapeXml(failMsg)}</failure>`);
        lines.push('    </testcase>');
      }
    }

    lines.push('  </testsuite>');
    lines.push('</testsuites>');
    return lines.join('\n');
  }

  /**
   * Export a PolicyTestReport as JUnit XML.
   */
  exportRedTeam(report: PolicyTestReport): string {
    const failures = report.bypasses_found + report.weak_policies;
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites tests="${report.total_tests}" failures="${failures}">`,
    );
    lines.push(
      `  <testsuite name="RedTeamTests" tests="${report.total_tests}" failures="${failures}">`,
    );

    for (const r of report.results) {
      const isFail = r.bypassed || r.severity === 'weak';
      if (!isFail) {
        lines.push(`    <testcase name="${escapeXml(r.id)}" classname="${escapeXml(r.category)}" />`);
      } else {
        lines.push(`    <testcase name="${escapeXml(r.id)}" classname="${escapeXml(r.category)}">`);
        const msg = r.bypassed
          ? `Policy bypassed: action=${r.decision_action}`
          : `Weak policy: action=${r.decision_action}`;
        lines.push(`      <failure message="${escapeXml(msg)}">${escapeXml(msg)}</failure>`);
        lines.push('    </testcase>');
      }
    }

    lines.push('  </testsuite>');
    lines.push('</testsuites>');
    return lines.join('\n');
  }
}
