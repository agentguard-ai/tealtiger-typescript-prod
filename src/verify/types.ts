/**
 * TealVerify Module — Types
 *
 * SARIF v2.1.0 types, golden test types, red-team types,
 * and export option interfaces for the TealVerify evidence module.
 *
 * @module verify/types
 */

// ── SARIF v2.1.0 types (subset) ─────────────────────────────────

export interface SARIFLog {
  $schema: string;
  version: '2.1.0';
  runs: SARIFRun[];
}

export interface SARIFRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri?: string;
      rules: SARIFRule[];
    };
  };
  results: SARIFResult[];
}

export interface SARIFRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  helpUri?: string;
  properties?: {
    tags?: string[];
    'security-severity'?: string;
  };
}

export interface SARIFResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  fingerprints?: Record<string, string>;
  partialFingerprints?: Record<string, string>;
  locations?: SARIFLocation[];
}

export interface SARIFLocation {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId?: string };
    region?: { startLine?: number; startColumn?: number; endColumn?: number };
  };
}

export interface SARIFSecretFinding {
  finding_id: string;
  type: string;
  category: string;
  confidence: number;
  severity: string;
  fingerprint: string;
  location?: {
    line: number;
    column: number;
    length?: number;
  };
}

export interface SARIFSecretSource {
  uri: string;
  findings: SARIFSecretFinding[];
}

// ── Golden test types ────────────────────────────────────────────

export interface GoldenTestCase {
  name: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
  expected: { action: string; reason_codes: string[] };
}

export interface GoldenTestResult {
  name: string;
  passed: boolean;
  actual?: { action: string; reason_codes: string[] } | undefined;
  expected: { action: string; reason_codes: string[] };
  failure_reason?: string | undefined;
  duration_ms: number;
}

export interface GoldenTestReport {
  total: number;
  passed: number;
  failed: number;
  results: GoldenTestResult[];
  duration_ms: number;
}

// ── Red-team types ───────────────────────────────────────────────

export type AttackCategory = 'boundary' | 'bypass' | 'encoding' | 'empty' | 'overflow';

export interface PolicyTestCase {
  id: string;
  category: AttackCategory;
  input: Record<string, unknown>;
  description: string;
}

export interface PolicyTestResult {
  id: string;
  category: AttackCategory;
  bypassed: boolean;
  severity: string;
  decision_action: string;
  reason_codes: string[];
}

export interface PolicyTestReport {
  total_tests: number;
  bypasses_found: number;
  weak_policies: number;
  results: PolicyTestResult[];
  severity_summary: Record<string, number>;
}

export interface RedTeamConfig {
  attackCorpus?: 'default' | 'extended' | string[];
  targetPolicies: string[];
  iterations?: number;
  seed?: number;
}

export interface SARIFExportOptions {
  toolName?: string;
  toolVersion?: string;
  redactSecrets?: boolean;
}
