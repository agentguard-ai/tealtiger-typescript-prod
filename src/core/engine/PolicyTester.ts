/**
 * PolicyTester - Policy Testing Framework
 * 
 * Provides testing utilities for TealEngine policies including:
 * - Test case execution
 * - Test suite management
 * - Coverage tracking
 * - Test result reporting
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 * 
 * @module core/engine/PolicyTester
 */

import {
  PolicyEvaluationResult,
  TestCase,
  CoverageReport,
} from './types';
import { TealEngine } from './TealEngine';

/**
 * Test Result
 * Result of running a single test case
 */
export interface TestResult {
  /** Test case name */
  name: string;
  /** Whether the test passed */
  passed: boolean;
  /** Actual evaluation result */
  actual: PolicyEvaluationResult;
  /** Expected result */
  expected: TestCase['expected'];
  /** Error message if test failed */
  error?: string;
}

/**
 * Test Suite Result
 * Result of running a test suite
 */
export interface TestSuiteResult {
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Individual test results */
  results: TestResult[];
  /** Coverage report */
  coverage?: CoverageReport;
}

/**
 * PolicyTester - Testing framework for policies
 * 
 * Provides utilities for testing TealEngine policies:
 * - Run individual test cases
 * - Run test suites
 * - Track policy coverage
 * - Generate test reports
 * 
 * @example
 * ```typescript
 * const tester = new PolicyTester(engine);
 * 
 * const result = tester.runTest({
 *   name: 'Block file deletion',
 *   context: {
 *     agentId: 'agent-001',
 *     action: 'tool.execute',
 *     tool: 'file_delete'
 *   },
 *   expected: {
 *     allowed: false,
 *     triggeredPolicies: ['tools.file_delete']
 *   }
 * });
 * 
 * console.log(result.passed ? 'PASS' : 'FAIL');
 * ```
 */
export class PolicyTester {
  /** TealEngine instance to test */
  private engine: TealEngine;

  /** Tracked policies (for coverage) */
  private trackedPolicies: Set<string> = new Set();

  /** Tested policies (for coverage) */
  private testedPolicies: Set<string> = new Set();

  /**
   * Creates a new PolicyTester instance
   * 
   * @param engine - TealEngine instance to test
   */
  constructor(engine: TealEngine) {
    this.engine = engine;
    this.initializeTracking();
  }

  /**
   * Runs a single test case
   * 
   * @param testCase - Test case to run
   * @returns Test result
   */
  public runTest(testCase: TestCase): TestResult {
    try {
      // Execute the test
      const actual = this.engine.test(testCase);

      // Track tested policies
      for (const policy of actual.triggeredPolicies) {
        this.testedPolicies.add(policy);
      }

      // Check if result matches expected
      const passed = this.matchesExpected(actual, testCase.expected);

      if (!passed) {
        return {
          name: testCase.name,
          passed: false,
          actual,
          expected: testCase.expected,
          error: this.generateErrorMessage(actual, testCase.expected),
        };
      }

      return {
        name: testCase.name,
        passed: true,
        actual,
        expected: testCase.expected,
      };
    } catch (error) {
      return {
        name: testCase.name,
        passed: false,
        actual: {
          allowed: false,
          triggeredPolicies: [],
          metadata: {
            evaluationTime: 0,
            cacheHit: false,
            engine: 'TealEngine',
          },
        },
        expected: testCase.expected,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Runs a test suite
   * 
   * @param testCases - Array of test cases to run
   * @returns Test suite result
   */
  public runSuite(testCases: TestCase[]): TestSuiteResult {
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      const result = this.runTest(testCase);
      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      total: testCases.length,
      passed,
      failed,
      results,
      coverage: this.getCoverage(),
    };
  }

  /**
   * Gets policy coverage report
   * 
   * @returns Coverage report
   */
  public getCoverage(): CoverageReport {
    const totalPolicies = this.trackedPolicies.size;
    const testedPolicies = this.testedPolicies.size;
    const coverage = totalPolicies > 0 ? testedPolicies / totalPolicies : 0;

    const untested = Array.from(this.trackedPolicies).filter(
      p => !this.testedPolicies.has(p)
    );

    const tested = Array.from(this.testedPolicies);

    return {
      totalPolicies,
      testedPolicies,
      coverage,
      untested,
      tested,
    };
  }

  /**
   * Resets coverage tracking
   */
  public resetCoverage(): void {
    this.testedPolicies.clear();
  }

  /**
   * Initializes policy tracking from engine configuration
   * 
   * @private
   */
  private initializeTracking(): void {
    const policies = this.engine.getPolicies();

    // Track tool policies
    if (policies.tools) {
      for (const toolName of Object.keys(policies.tools)) {
        this.trackedPolicies.add(`tools.${toolName}`);
      }
    }

    // Track identity policy
    if (policies.identity) {
      this.trackedPolicies.add('identity');
      if (policies.identity.forbidden) {
        this.trackedPolicies.add('identity.forbidden');
      }
      if (policies.identity.permissions) {
        this.trackedPolicies.add('identity.permissions');
      }
    }

    // Track code execution policy
    if (policies.codeExecution) {
      this.trackedPolicies.add('codeExecution');
      this.trackedPolicies.add('codeExecution.allowedLanguages');
      this.trackedPolicies.add('codeExecution.blockedFunctions');
      this.trackedPolicies.add('codeExecution.blockedPatterns');
      this.trackedPolicies.add('codeExecution.maxLength');
      this.trackedPolicies.add('codeExecution.requireSandbox');
    }

    // Track behavioral policy
    if (policies.behavioral) {
      this.trackedPolicies.add('behavioral');
      if (policies.behavioral.costLimit) {
        this.trackedPolicies.add('behavioral.costLimit');
      }
      if (policies.behavioral.rateLimit) {
        this.trackedPolicies.add('behavioral.rateLimit');
      }
    }

    // Track memory policy
    if (policies.memory) {
      this.trackedPolicies.add('memory');
    }

    // Track content policy
    if (policies.content) {
      this.trackedPolicies.add('content');
      if (policies.content.pii) {
        this.trackedPolicies.add('content.pii');
      }
      if (policies.content.moderation) {
        this.trackedPolicies.add('content.moderation');
      }
    }
  }

  /**
   * Checks if actual result matches expected result
   * 
   * @private
   */
  private matchesExpected(
    actual: PolicyEvaluationResult,
    expected: TestCase['expected']
  ): boolean {
    // Check allowed field
    if (actual.allowed !== expected.allowed) {
      return false;
    }

    // Check triggered policies if specified
    if (expected.triggeredPolicies) {
      // Check if all expected policies were triggered
      for (const expectedPolicy of expected.triggeredPolicies) {
        if (!actual.triggeredPolicies.includes(expectedPolicy)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Generates error message for failed test
   * 
   * @private
   */
  private generateErrorMessage(
    actual: PolicyEvaluationResult,
    expected: TestCase['expected']
  ): string {
    const errors: string[] = [];

    if (actual.allowed !== expected.allowed) {
      errors.push(
        `Expected allowed=${expected.allowed}, got allowed=${actual.allowed}`
      );
    }

    if (expected.triggeredPolicies) {
      const missing = expected.triggeredPolicies.filter(
        p => !actual.triggeredPolicies.includes(p)
      );

      if (missing.length > 0) {
        errors.push(
          `Missing expected policies: ${missing.join(', ')}`
        );
      }
    }

    if (actual.reason) {
      errors.push(`Reason: ${actual.reason}`);
    }

    return errors.join('; ');
  }
}
