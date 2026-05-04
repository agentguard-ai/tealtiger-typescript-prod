/**
 * TealVerify — Golden Test Runner
 *
 * Runs golden test cases against an evaluate function and produces
 * a GoldenTestReport. PASS iff action matches AND actual reason_codes
 * contain all expected reason_codes.
 *
 * @module verify/GoldenTestRunner
 */

import type {
  GoldenTestCase,
  GoldenTestReport,
  GoldenTestResult,
} from './types';

export type EvaluateFn = (
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => Promise<{ action: string; reason_codes: string[] }>;

export class GoldenTestRunner {
  private readonly evaluateFn: EvaluateFn;

  constructor(evaluateFn: EvaluateFn) {
    this.evaluateFn = evaluateFn;
  }

  /**
   * Run an array of golden test cases and return a report.
   */
  async run(testCases: GoldenTestCase[]): Promise<GoldenTestReport> {
    const overallStart = Date.now();
    const results: GoldenTestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
      const start = Date.now();
      let actual: { action: string; reason_codes: string[] } | undefined;
      let testPassed = false;
      let failureReason: string | undefined;

      try {
        actual = await this.evaluateFn(tc.input, tc.context ?? {});

        const actionMatch = actual.action === tc.expected.action;
        const codesMatch = tc.expected.reason_codes.every((code) =>
          actual!.reason_codes.includes(code),
        );

        if (actionMatch && codesMatch) {
          testPassed = true;
        } else if (!actionMatch) {
          failureReason = `Action mismatch: expected ${tc.expected.action}, got ${actual.action}`;
        } else {
          const missing = tc.expected.reason_codes.filter(
            (code) => !actual!.reason_codes.includes(code),
          );
          failureReason = `Missing reason_codes: [${missing.join(', ')}]`;
        }
      } catch (err: unknown) {
        failureReason = `Evaluation error: ${err instanceof Error ? err.message : String(err)}`;
      }

      const durationMs = Date.now() - start;

      if (testPassed) {
        passed++;
      } else {
        failed++;
      }

      results.push({
        name: tc.name,
        passed: testPassed,
        actual,
        expected: tc.expected,
        failure_reason: failureReason,
        duration_ms: durationMs,
      });
    }

    return {
      total: testCases.length,
      passed,
      failed,
      results,
      duration_ms: Date.now() - overallStart,
    };
  }

  /**
   * Parse JSON string as GoldenTestCase[] and run.
   */
  async runFromJSON(json: string): Promise<GoldenTestReport> {
    const testCases: GoldenTestCase[] = JSON.parse(json);
    return this.run(testCases);
  }
}
