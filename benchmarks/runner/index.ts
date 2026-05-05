/**
 * Benchmark Runner - Core infrastructure for executing red team benchmarks.
 *
 * This module provides the runner framework, suite registry, and evaluate
 * endpoint abstractions used by all benchmark suites.
 */

// Core types and interfaces
export type {
  BaselineThresholds,
  BenchmarkSuite,
  CategoryResult,
  ClassificationMetrics,
  DatasetLoadResult,
  EvaluateEndpoint,
  EvaluateRequest,
  EvaluateResponse,
  ExecutionOptions,
  FormattedResult,
  RegressionReport,
  ReportOptions,
  RunnerOptions,
  RunnerResult,
  SuiteResult,
  ValidationResult,
} from './types';

// Suite registry
export { SuiteRegistry } from './SuiteRegistry';

// Evaluate endpoint implementations
export {
  EvaluateEndpointError,
  HttpEvaluateEndpoint,
  InProcessEvaluateEndpoint,
} from './EvaluateEndpoint';
export type { EvaluateErrorType } from './EvaluateEndpoint';

// Benchmark runner
export { BenchmarkRunner } from './BenchmarkRunner';

// Report generator
export { ReportGenerator } from './ReportGenerator';
export type { BenchmarkResultsJSON } from './ReportGenerator';

// Metrics computation utilities
export {
  computeDetectionRate,
  computeClassificationMetrics,
  classifySample,
} from './metrics';
export type { ClassificationResult } from './metrics';
