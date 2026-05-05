import { SuiteRegistry } from './SuiteRegistry';
import {
  BaselineThresholds,
  EvaluateEndpoint,
  ExecutionOptions,
  RegressionReport,
  RunnerOptions,
  RunnerResult,
  SuiteResult,
} from './types';

/**
 * Default runner options.
 */
const DEFAULT_OPTIONS: RunnerOptions = {
  suiteTimeout: 300000, // 5 minutes
  callTimeout: 5000,    // 5 seconds
  concurrency: 10,
  outputDir: './benchmark-results',
};

/**
 * Orchestrates benchmark execution across registered suites.
 * Handles timeouts, error aggregation, and result collection.
 */
export class BenchmarkRunner {
  private readonly registry: SuiteRegistry;
  private readonly endpoint: EvaluateEndpoint;
  private readonly options: RunnerOptions;

  constructor(
    registry: SuiteRegistry,
    endpoint: EvaluateEndpoint,
    options?: Partial<RunnerOptions>
  ) {
    this.registry = registry;
    this.endpoint = endpoint;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Run all registered suites sequentially.
   * Each suite is subject to the configured suite timeout.
   */
  async runAll(): Promise<RunnerResult> {
    const startTime = Date.now();
    const suites = this.registry.getAll();

    if (suites.length === 0) {
      throw new Error('No benchmark suites registered');
    }

    const suiteResults: SuiteResult[] = [];

    for (const suite of suites) {
      const result = await this.executeSuiteWithTimeout(suite.name);
      suiteResults.push(result);
    }

    const totalDuration = Date.now() - startTime;
    const overallDetectionRate = this.computeOverallDetectionRate(suiteResults);

    return {
      timestamp: new Date().toISOString(),
      tealtigerVersion: this.getTealtigerVersion(),
      suiteResults,
      totalDuration,
      overallDetectionRate,
    };
  }

  /**
   * Run a specific suite by name.
   * Throws if the suite is not registered.
   */
  async runSuite(name: string): Promise<SuiteResult> {
    const suite = this.registry.get(name);
    if (!suite) {
      throw new Error(`Suite "${name}" is not registered`);
    }

    return this.executeSuiteWithTimeout(name);
  }

  /**
   * Compare results against baseline thresholds.
   * Returns a regression report indicating pass/fail and any regressions.
   */
  compareBaseline(results: RunnerResult, baseline: BaselineThresholds): RegressionReport {
    const regressions: RegressionReport['regressions'] = [];

    for (const suiteResult of results.suiteResults) {
      const suiteBaseline = baseline[suiteResult.suiteName];
      if (!suiteBaseline) {
        continue; // No baseline defined for this suite
      }

      for (const categoryResult of suiteResult.categories) {
        const threshold = suiteBaseline[categoryResult.category];
        if (threshold === undefined) {
          continue; // No baseline defined for this category
        }

        if (categoryResult.detectionRate < threshold) {
          regressions.push({
            suite: suiteResult.suiteName,
            category: categoryResult.category,
            baseline: threshold,
            actual: categoryResult.detectionRate,
            delta: categoryResult.detectionRate - threshold,
          });
        }
      }
    }

    return {
      passed: regressions.length === 0,
      regressions,
    };
  }

  /**
   * Execute a suite with timeout enforcement.
   * If the suite exceeds the configured timeout, returns partial results
   * with timedOut: true.
   */
  private async executeSuiteWithTimeout(name: string): Promise<SuiteResult> {
    const suite = this.registry.get(name);
    if (!suite) {
      throw new Error(`Suite "${name}" is not registered`);
    }

    const executionOptions: ExecutionOptions = {
      perCallTimeout: this.options.callTimeout,
      suiteTimeout: this.options.suiteTimeout,
      concurrency: this.options.concurrency,
    };

    // Load dataset first (not subject to suite timeout)
    const loadResult = await suite.loadDataset();
    if (!loadResult.schemaValid) {
      throw new Error(
        `Dataset schema validation failed for suite "${name}": ${(loadResult.errors ?? []).join('; ')}`
      );
    }

    // Execute with timeout
    const timeoutPromise = new Promise<SuiteResult>((resolve) => {
      setTimeout(() => {
        resolve({
          suiteName: name,
          datasetVersion: suite.datasetVersion,
          tealtigerVersion: this.getTealtigerVersion(),
          executionDuration: this.options.suiteTimeout,
          totalSamples: loadResult.sampleCount,
          errorCount: 0,
          categories: [],
          timedOut: true,
        });
      }, this.options.suiteTimeout);
    });

    const executionPromise = suite.execute(this.endpoint, executionOptions);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Compute overall detection rate across all suites.
   * Aggregates blocked and allowed counts, excluding errors and not-applicable.
   */
  private computeOverallDetectionRate(suiteResults: SuiteResult[]): number {
    let totalBlocked = 0;
    let totalAllowed = 0;

    for (const suite of suiteResults) {
      for (const category of suite.categories) {
        totalBlocked += category.blocked;
        totalAllowed += category.allowed;
      }
    }

    const denominator = totalBlocked + totalAllowed;
    if (denominator === 0) {
      return 0;
    }

    return totalBlocked / denominator;
  }

  /**
   * Get the current TealTiger version from package.json.
   * Falls back to 'unknown' if not available.
   */
  private getTealtigerVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('../../package.json') as { version: string };
      return pkg.version;
    } catch {
      return 'unknown';
    }
  }
}
