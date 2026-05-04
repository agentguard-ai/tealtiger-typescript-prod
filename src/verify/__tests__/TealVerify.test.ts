/**
 * TealVerify Module — Tests
 *
 * Covers SARIF export, JUnit XML, JSON summary, golden test runner,
 * red-team harness, and TEEC validation runner.
 */

import { SARIFExporter } from '../SARIFExporter';
import { JUnitExporter } from '../JUnitExporter';
import { JSONExporter } from '../JSONExporter';
import { GoldenTestRunner } from '../GoldenTestRunner';
import { RedTeamHarness } from '../RedTeamHarness';
import { TEECValidationRunner } from '../TEECValidationRunner';
import { TEECValidator } from '../../core/engine/v1.2/TEECValidator';
import { TEECRegistryLoader } from '../../core/engine/v1.2/TEECRegistryLoader';
import type { SecretFinding, Decision } from '../../core/engine/v1.2/types';
import { DecisionAction, ReasonCode } from '../../core/engine/types';
import type {
  GoldenTestCase,
  GoldenTestReport,
  PolicyTestReport,
} from '../types';

// ── Helpers ──────────────────────────────────────────────────────

function makeFinding(overrides?: Partial<SecretFinding>): SecretFinding {
  return {
    finding_id: 'f-001',
    type: 'aws-access-key-id',
    category: 'cloud',
    confidence: 0.95,
    severity: 'CRITICAL',
    fingerprint: 'abc123',
    ...overrides,
  };
}

function makeDecision(overrides?: Record<string, unknown>): Decision {
  return {
    action: DecisionAction.DENY,
    reason_codes: [ReasonCode.SECRET_DETECTED],
    correlation_id: 'corr-1',
    policy_id: 'pol-1',
    policy_version: '1.0.0',
    ...overrides,
  } as Decision;
}

// ── SARIF Exporter ───────────────────────────────────────────────

describe('SARIFExporter', () => {
  const exporter = new SARIFExporter();

  it('produces valid JSON with correct schema and version', () => {
    const findings = [makeFinding()];
    const log = exporter.export(findings, {});

    expect(log.$schema).toBe(
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    );
    expect(log.version).toBe('2.1.0');
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].tool.driver.name).toBe('TealTiger');

    // Verify it serializes to valid JSON
    expect(() => JSON.parse(JSON.stringify(log))).not.toThrow();
  });

  it('has stable rule IDs for known secret types', () => {
    const findings = [
      makeFinding({ type: 'aws-access-key-id' }),
      makeFinding({ finding_id: 'f-002', type: 'github-token' }),
    ];
    const log = exporter.export(findings, {});

    const ruleIds = log.runs[0].tool.driver.rules.map((r) => r.id);
    expect(ruleIds).toContain('TT-SEC-001');
    expect(ruleIds).toContain('TT-SEC-003');
  });

  it('generates stable fingerprints for identical findings', () => {
    const findings = [makeFinding()];
    const log1 = exporter.export(findings, {});
    const log2 = exporter.export(findings, {});

    const fp1 = log1.runs[0].results[0].fingerprints?.['0'];
    const fp2 = log2.runs[0].results[0].fingerprints?.['0'];
    expect(fp1).toBeDefined();
    expect(fp1).toBe(fp2);
  });

  it('does not contain raw secret values', () => {
    const findings = [makeFinding()];
    const log = exporter.export(findings, {});

    // The fingerprint 'abc123' from the finding should not leak as a raw value
    // in the message text. The SARIF message should only contain type/severity/confidence.
    for (const result of log.runs[0].results) {
      expect(result.message.text).not.toContain('AKIA');
      expect(result.message.text).not.toContain('sk-');
    }
  });

  it('uses tealsecrets://runtime/input as artifact URI', () => {
    const findings = [makeFinding()];
    const log = exporter.export(findings, {});
    const loc = log.runs[0].results[0].locations?.[0];
    expect(loc?.physicalLocation.artifactLocation.uri).toBe(
      'tealsecrets://runtime/input',
    );
  });

  it('maps severity to correct SARIF levels', () => {
    const critical = exporter.export([makeFinding({ severity: 'CRITICAL' })], {});
    const medium = exporter.export([makeFinding({ severity: 'MEDIUM' })], {});
    const low = exporter.export([makeFinding({ severity: 'LOW' })], {});

    expect(critical.runs[0].results[0].level).toBe('error');
    expect(medium.runs[0].results[0].level).toBe('warning');
    expect(low.runs[0].results[0].level).toBe('note');
  });
});

// ── JUnit XML Exporter ───────────────────────────────────────────

describe('JUnitExporter', () => {
  const junitExporter = new JUnitExporter();

  it('produces well-formed XML with correct pass/fail counts', () => {
    const report: GoldenTestReport = {
      total: 3,
      passed: 2,
      failed: 1,
      duration_ms: 100,
      results: [
        { name: 'test-1', passed: true, expected: { action: 'DENY', reason_codes: ['SECRET_DETECTED'] }, duration_ms: 30 },
        { name: 'test-2', passed: true, expected: { action: 'ALLOW', reason_codes: [] }, duration_ms: 30 },
        {
          name: 'test-3',
          passed: false,
          actual: { action: 'ALLOW', reason_codes: [] },
          expected: { action: 'DENY', reason_codes: ['SECRET_DETECTED'] },
          failure_reason: 'Action mismatch',
          duration_ms: 40,
        },
      ],
    };

    const xml = junitExporter.export(report);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('<testcase name="test-1"');
    expect(xml).toContain('<testcase name="test-3"');
    expect(xml).toContain('<failure');
    // Count self-closing testcases (passed) vs testcases with failure children
    const passedCases = (xml.match(/<testcase [^>]*\/>/g) || []).length;
    expect(passedCases).toBe(2);
  });

  it('exports red-team results as JUnit XML', () => {
    const report: PolicyTestReport = {
      total_tests: 2,
      bypasses_found: 1,
      weak_policies: 0,
      results: [
        { id: 'rt-1', category: 'boundary', bypassed: true, severity: 'high', decision_action: 'ALLOW', reason_codes: ['REDTEAM_BYPASS_FOUND'] },
        { id: 'rt-2', category: 'bypass', bypassed: false, severity: 'info', decision_action: 'DENY', reason_codes: ['TOOL_NOT_ALLOWED'] },
      ],
      severity_summary: { high: 1, info: 1 },
    };

    const xml = junitExporter.exportRedTeam(report);
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('RedTeamTests');
  });

  it('escapes XML special characters in test names', () => {
    const report: GoldenTestReport = {
      total: 1,
      passed: 1,
      failed: 0,
      duration_ms: 10,
      results: [
        { name: 'test <with> "special" & \'chars\'', passed: true, expected: { action: 'ALLOW', reason_codes: [] }, duration_ms: 10 },
      ],
    };

    const xml = junitExporter.export(report);
    expect(xml).toContain('&lt;with&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('<with>');
  });
});

// ── JSON Summary Exporter ────────────────────────────────────────

describe('JSONExporter', () => {
  const jsonExporter = new JSONExporter();

  it('contains correlation_id in golden test export', () => {
    const report: GoldenTestReport = {
      total: 1,
      passed: 1,
      failed: 0,
      duration_ms: 50,
      results: [
        { name: 'test-1', passed: true, expected: { action: 'ALLOW', reason_codes: [] }, duration_ms: 50 },
      ],
    };

    const json = jsonExporter.export(report);
    const parsed = JSON.parse(json);

    expect(parsed.results[0].correlation_id).toBeDefined();
    expect(typeof parsed.results[0].correlation_id).toBe('string');
    expect(parsed.results[0].correlation_id.length).toBeGreaterThan(0);
    expect(parsed.results[0].policy_id).toBe('golden-test');
  });

  it('contains correlation_id in red-team export', () => {
    const report: PolicyTestReport = {
      total_tests: 1,
      bypasses_found: 0,
      weak_policies: 0,
      results: [
        { id: 'rt-1', category: 'boundary', bypassed: false, severity: 'info', decision_action: 'DENY', reason_codes: [] },
      ],
      severity_summary: { info: 1 },
    };

    const json = jsonExporter.exportRedTeam(report);
    const parsed = JSON.parse(json);

    expect(parsed.results[0].correlation_id).toBeDefined();
    expect(parsed.results[0].policy_id).toBe('red-team');
  });
});

// ── Golden Test Runner ───────────────────────────────────────────

describe('GoldenTestRunner', () => {
  it('reports PASS when action and reason_codes match', async () => {
    const evaluateFn = async (_input: Record<string, unknown>, _ctx: Record<string, unknown>) => ({
      action: 'DENY',
      reason_codes: ['SECRET_DETECTED', 'CREDENTIAL_LEAKAGE'],
    });

    const runner = new GoldenTestRunner(evaluateFn);
    const testCases: GoldenTestCase[] = [
      {
        name: 'detect-secret',
        input: { content: 'AKIAIOSFODNN7EXAMPLE' },
        expected: { action: 'DENY', reason_codes: ['SECRET_DETECTED'] },
      },
    ];

    const report = await runner.run(testCases);
    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.results[0].passed).toBe(true);
  });

  it('reports FAIL when action does not match', async () => {
    const evaluateFn = async () => ({
      action: 'ALLOW',
      reason_codes: ['POLICY_COMPLIANT'],
    });

    const runner = new GoldenTestRunner(evaluateFn);
    const testCases: GoldenTestCase[] = [
      {
        name: 'should-deny',
        input: { content: 'secret' },
        expected: { action: 'DENY', reason_codes: ['SECRET_DETECTED'] },
      },
    ];

    const report = await runner.run(testCases);
    expect(report.total).toBe(1);
    expect(report.passed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].failure_reason).toContain('Action mismatch');
  });

  it('reports FAIL when reason_codes are missing', async () => {
    const evaluateFn = async () => ({
      action: 'DENY',
      reason_codes: ['POLICY_VIOLATION'],
    });

    const runner = new GoldenTestRunner(evaluateFn);
    const testCases: GoldenTestCase[] = [
      {
        name: 'missing-codes',
        input: { content: 'secret' },
        expected: { action: 'DENY', reason_codes: ['SECRET_DETECTED', 'CREDENTIAL_LEAKAGE'] },
      },
    ];

    const report = await runner.run(testCases);
    expect(report.failed).toBe(1);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].failure_reason).toContain('Missing reason_codes');
  });

  it('measures duration per test case', async () => {
    const evaluateFn = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { action: 'ALLOW', reason_codes: [] };
    };

    const runner = new GoldenTestRunner(evaluateFn);
    const report = await runner.run([
      { name: 'timed', input: {}, expected: { action: 'ALLOW', reason_codes: [] } },
    ]);

    expect(report.results[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('handles evaluation errors gracefully', async () => {
    const evaluateFn = async () => {
      throw new Error('Engine crashed');
    };

    const runner = new GoldenTestRunner(evaluateFn);
    const report = await runner.run([
      { name: 'error-case', input: {}, expected: { action: 'DENY', reason_codes: [] } },
    ]);

    expect(report.failed).toBe(1);
    expect(report.results[0].failure_reason).toContain('Evaluation error');
  });

  it('parses and runs from JSON string', async () => {
    const evaluateFn = async () => ({ action: 'ALLOW', reason_codes: [] });
    const runner = new GoldenTestRunner(evaluateFn);

    const json = JSON.stringify([
      { name: 'json-test', input: {}, expected: { action: 'ALLOW', reason_codes: [] } },
    ]);

    const report = await runner.runFromJSON(json);
    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
  });
});

// ── Red-Team Harness ─────────────────────────────────────────────

describe('RedTeamHarness', () => {
  const denyAll = async (_input: Record<string, unknown>) => ({
    action: 'DENY',
    reason_codes: ['POLICY_VIOLATION'],
  });

  const allowAll = async (_input: Record<string, unknown>) => ({
    action: 'ALLOW',
    reason_codes: [],
  });

  it('generates cases for all 5 attack categories', () => {
    const harness = new RedTeamHarness(denyAll, {
      targetPolicies: ['default'],
      seed: 12345,
    });

    const cases = harness.generate();
    const categories = new Set(cases.map((c) => c.category));

    expect(categories.has('boundary')).toBe(true);
    expect(categories.has('bypass')).toBe(true);
    expect(categories.has('encoding')).toBe(true);
    expect(categories.has('empty')).toBe(true);
    expect(categories.has('overflow')).toBe(true);
    expect(categories.size).toBe(5);
  });

  it('produces identical cases with same seed', () => {
    const h1 = new RedTeamHarness(denyAll, { targetPolicies: ['p1'], seed: 999 });
    const h2 = new RedTeamHarness(denyAll, { targetPolicies: ['p1'], seed: 999 });

    const cases1 = h1.generate();
    const cases2 = h2.generate();

    expect(cases1.map((c) => c.id)).toEqual(cases2.map((c) => c.id));
    expect(cases1.map((c) => c.description)).toEqual(cases2.map((c) => c.description));
  });

  it('produces different cases with different seeds', () => {
    const h1 = new RedTeamHarness(denyAll, { targetPolicies: ['p1'], seed: 111 });
    const h2 = new RedTeamHarness(denyAll, { targetPolicies: ['p1'], seed: 222 });

    const ids1 = h1.generate().map((c) => c.id);
    const ids2 = h2.generate().map((c) => c.id);

    // IDs contain random suffixes, so they should differ
    expect(ids1).not.toEqual(ids2);
  });

  it('detects bypasses when policy allows everything', async () => {
    const harness = new RedTeamHarness(allowAll, {
      targetPolicies: ['permissive'],
      seed: 42,
    });

    const report = await harness.run();
    expect(report.bypasses_found).toBeGreaterThan(0);
    expect(report.results.some((r) => r.bypassed)).toBe(true);
    expect(
      report.results.some((r) => r.reason_codes.includes('REDTEAM_BYPASS_FOUND')),
    ).toBe(true);
  });

  it('reports zero bypasses when policy denies everything', async () => {
    const harness = new RedTeamHarness(denyAll, {
      targetPolicies: ['strict'],
      seed: 42,
    });

    const report = await harness.run();
    expect(report.bypasses_found).toBe(0);
    expect(report.results.every((r) => !r.bypassed)).toBe(true);
  });

  it('exports valid JUnit XML from report', async () => {
    const harness = new RedTeamHarness(denyAll, {
      targetPolicies: ['p1'],
      seed: 42,
    });

    const report = await harness.run();
    const xml = harness.exportJUnit(report);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('RedTeamTests');
    expect(xml).toContain(`tests="${report.total_tests}"`);
  });

  it('exports valid JSON from report', async () => {
    const harness = new RedTeamHarness(denyAll, {
      targetPolicies: ['p1'],
      seed: 42,
    });

    const report = await harness.run();
    const json = harness.exportJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.total_tests).toBe(report.total_tests);
    expect(parsed.results).toHaveLength(report.results.length);
    expect(parsed.results[0].correlation_id).toBeDefined();
  });
});

// ── TEEC Validation Runner ───────────────────────────────────────

describe('TEECValidationRunner', () => {
  const registry = TEECRegistryLoader.loadEmbedded();
  const validator = new TEECValidator(registry);
  const runner = new TEECValidationRunner(validator);

  it('validates valid decisions', () => {
    const decisions: Decision[] = [
      makeDecision({ action: DecisionAction.DENY, reason_codes: [ReasonCode.SECRET_DETECTED] }),
      makeDecision({ action: DecisionAction.ALLOW, reason_codes: [ReasonCode.POLICY_COMPLIANT] }),
    ];

    const result = runner.validateDecisions(decisions);
    expect(result.total).toBe(2);
    expect(result.valid).toBe(2);
    expect(result.invalid).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('detects invalid reason codes', () => {
    const decisions: Decision[] = [
      makeDecision({ reason_codes: ['TOTALLY_FAKE_CODE'] }),
    ];

    const result = runner.validateDecisions(decisions);
    expect(result.invalid).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].field).toBe('reason_code');
  });

  it('detects invalid decision actions', () => {
    const decisions: Decision[] = [
      makeDecision({ action: 'INVALID_ACTION' }),
    ];

    const result = runner.validateDecisions(decisions);
    expect(result.invalid).toBe(1);
    expect(result.errors.some((e) => e.field === 'decision_action')).toBe(true);
  });

  it('handles empty decision array', () => {
    const result = runner.validateDecisions([]);
    expect(result.total).toBe(0);
    expect(result.valid).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
