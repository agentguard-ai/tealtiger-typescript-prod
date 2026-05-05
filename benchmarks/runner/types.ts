/**
 * Core type definitions and interfaces for the TealTiger Benchmark Runner.
 * All benchmark suites and runner components share these types.
 */

// ─── Evaluate Endpoint Types ────────────────────────────────────────────────

/**
 * Request payload for the governance evaluation endpoint.
 */
export interface EvaluateRequest {
  content: string;
  action?: string;
  tool?: string;
  agent_id?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from the governance evaluation endpoint.
 */
export interface EvaluateResponse {
  correlation_id: string;
  decision: {
    action: 'ALLOW' | 'DENY' | 'MONITOR';
    risk_score: number;
    reason_codes: string[];
    evidence?: Record<string, unknown>;
  };
}

/**
 * Abstraction over the sidecar's POST /evaluate endpoint.
 * Allows testing with a real sidecar or an in-process implementation.
 */
export interface EvaluateEndpoint {
  evaluate(request: EvaluateRequest): Promise<EvaluateResponse>;
}

// ─── Dataset & Execution Types ──────────────────────────────────────────────

/**
 * Result of loading and validating a benchmark dataset.
 */
export interface DatasetLoadResult {
  sampleCount: number;
  categories: string[];
  schemaValid: boolean;
  errors?: string[];
}

/**
 * Options controlling benchmark suite execution.
 */
export interface ExecutionOptions {
  /** Timeout per individual evaluation call (ms) */
  perCallTimeout: number;
  /** Overall suite timeout (ms) */
  suiteTimeout: number;
  /** Maximum concurrent evaluation calls */
  concurrency: number;
}

// ─── Suite Result Types ─────────────────────────────────────────────────────

/**
 * Classification metrics for binary classification benchmarks (e.g., PINT).
 */
export interface ClassificationMetrics {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Results for a single probe category within a benchmark suite.
 */
export interface CategoryResult {
  category: string;
  totalProbes: number;
  blocked: number;
  allowed: number;
  errors: number;
  notApplicable: number;
  detectionRate: number;
  /** For PINT: classification metrics */
  metrics?: ClassificationMetrics;
}

/**
 * Complete results from executing a single benchmark suite.
 */
export interface SuiteResult {
  suiteName: string;
  datasetVersion: string;
  tealtigerVersion: string;
  executionDuration: number;
  totalSamples: number;
  errorCount: number;
  categories: CategoryResult[];
  timedOut: boolean;
}

/**
 * Formatted result output from a suite's formatResults method.
 */
export interface FormattedResult {
  suiteName: string;
  markdown: string;
  json: Record<string, unknown>;
}

// ─── Suite Interface ────────────────────────────────────────────────────────

/**
 * Common interface all benchmark suites must implement.
 * Registered with SuiteRegistry for unified execution.
 */
export interface BenchmarkSuite {
  /** Unique identifier for this suite */
  readonly name: string;

  /** Semantic version of the benchmark dataset */
  readonly datasetVersion: string;

  /** Load and validate the dataset. Throws on schema mismatch. */
  loadDataset(): Promise<DatasetLoadResult>;

  /** Execute the benchmark against the evaluate endpoint */
  execute(endpoint: EvaluateEndpoint, options: ExecutionOptions): Promise<SuiteResult>;

  /** Format results for the specific benchmark's reporting conventions */
  formatResults(result: SuiteResult): FormattedResult;
}

// ─── Registry Types ─────────────────────────────────────────────────────────

/**
 * Result of validating a benchmark suite before registration.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Runner Types ───────────────────────────────────────────────────────────

/**
 * Configuration options for the BenchmarkRunner.
 */
export interface RunnerOptions {
  /** Per-suite timeout in ms (default: 300000 = 5 min) */
  suiteTimeout: number;
  /** Per-call timeout in ms (default: 5000) */
  callTimeout: number;
  /** Max concurrent calls (default: 10) */
  concurrency: number;
  /** Output directory for results */
  outputDir: string;
}

/**
 * Aggregated results from running all benchmark suites.
 */
export interface RunnerResult {
  timestamp: string;
  tealtigerVersion: string;
  suiteResults: SuiteResult[];
  totalDuration: number;
  overallDetectionRate: number;
}

// ─── Baseline & Regression Types ────────────────────────────────────────────

/**
 * Baseline detection rate thresholds per suite and category.
 */
export interface BaselineThresholds {
  [suiteName: string]: {
    [category: string]: number; // minimum detection rate (0-1)
  };
}

/**
 * Report comparing current results against baseline thresholds.
 */
export interface RegressionReport {
  passed: boolean;
  regressions: Array<{
    suite: string;
    category: string;
    baseline: number;
    actual: number;
    delta: number;
  }>;
}

// ─── Report Types ───────────────────────────────────────────────────────────

/**
 * Options for report generation.
 */
export interface ReportOptions {
  /** Include comparison against published leaderboard scores */
  includeLeaderboardComparison: boolean;
  /** Historical results for trend display */
  historicalResults?: RunnerResult[];
  /** Known limitations text */
  knownLimitations: string[];
  /** Out-of-scope categories with rationale */
  outOfScope: Array<{ category: string; rationale: string }>;
}
