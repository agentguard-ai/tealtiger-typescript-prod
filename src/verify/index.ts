/**
 * TealVerify Module — Public API
 *
 * Evidence outputs: SARIF, JUnit XML, JSON summary,
 * golden test runner, red-team harness, and TEEC validation.
 *
 * @module verify
 */

export { SARIFExporter } from './SARIFExporter';
export { JUnitExporter } from './JUnitExporter';
export { JSONExporter } from './JSONExporter';
export { GoldenTestRunner } from './GoldenTestRunner';
export { RedTeamHarness, ATTACK_CATEGORIES } from './RedTeamHarness';
export { TEECValidationRunner } from './TEECValidationRunner';

export type { EvaluateFn } from './GoldenTestRunner';
export type { TEECBatchValidationResult } from './TEECValidationRunner';

export type {
  SARIFLog,
  SARIFRun,
  SARIFRule,
  SARIFResult,
  SARIFLocation,
  SARIFExportOptions,
  GoldenTestCase,
  GoldenTestResult,
  GoldenTestReport,
  AttackCategory,
  PolicyTestCase,
  PolicyTestResult,
  PolicyTestReport,
  RedTeamConfig,
} from './types';
