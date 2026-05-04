/**
 * TealVerify — Red-Team Harness
 *
 * Generates adversarial test cases across 5 attack categories and
 * runs them against a policy evaluate function. Uses a seeded PRNG
 * (xorshift32) for deterministic, reproducible generation.
 *
 * @module verify/RedTeamHarness
 */

import type {
  AttackCategory,
  PolicyTestCase,
  PolicyTestResult,
  PolicyTestReport,
  RedTeamConfig,
} from './types';
import { JUnitExporter } from './JUnitExporter';
import { JSONExporter } from './JSONExporter';

// ── Seeded PRNG (xorshift32) ────────────────────────────────────

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed === 0 ? 1 : seed | 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 4294967296;
  }

  /** Pick a random element from an array. */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Generate a random string of given length. */
  randomString(len: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[Math.floor(this.next() * chars.length)];
    }
    return result;
  }
}

// ── Attack corpus generators ────────────────────────────────────

// All attack categories covered by the generator
export const ATTACK_CATEGORIES: readonly AttackCategory[] = [
  'boundary',
  'bypass',
  'encoding',
  'empty',
  'overflow',
] as const;

function generateBoundaryCases(rng: SeededRNG, _policies: string[]): PolicyTestCase[] {
  return [
    {
      id: `boundary-empty-string-${rng.randomString(4)}`,
      category: 'boundary',
      input: { tool: '', content: '' },
      description: 'Empty string inputs',
    },
    {
      id: `boundary-null-values-${rng.randomString(4)}`,
      category: 'boundary',
      input: { tool: null as unknown as string, content: null as unknown as string },
      description: 'Null value inputs',
    },
    {
      id: `boundary-undefined-${rng.randomString(4)}`,
      category: 'boundary',
      input: { tool: undefined as unknown as string },
      description: 'Undefined value inputs',
    },
    {
      id: `boundary-max-length-${rng.randomString(4)}`,
      category: 'boundary',
      input: { tool: rng.randomString(10000), content: rng.randomString(10000) },
      description: 'Maximum length string inputs',
    },
  ];
}

function generateBypassCases(rng: SeededRNG, _policies: string[]): PolicyTestCase[] {
  return [
    {
      id: `bypass-special-chars-${rng.randomString(4)}`,
      category: 'bypass',
      input: { tool: `tool_${rng.randomString(3)}; DROP TABLE`, content: 'normal' },
      description: 'Tool name with special characters',
    },
    {
      id: `bypass-sql-injection-${rng.randomString(4)}`,
      category: 'bypass',
      input: { tool: 'safe_tool', toolParams: { query: "'; DROP TABLE users; --" } },
      description: 'SQL injection in tool params',
    },
    {
      id: `bypass-path-traversal-${rng.randomString(4)}`,
      category: 'bypass',
      input: { tool: 'file_reader', toolParams: { path: '../../../etc/passwd' } },
      description: 'Path traversal in tool params',
    },
    {
      id: `bypass-command-injection-${rng.randomString(4)}`,
      category: 'bypass',
      input: { tool: 'shell', toolParams: { cmd: `echo ${rng.randomString(3)} && cat /etc/shadow` } },
      description: 'Command injection in tool params',
    },
  ];
}

function generateEncodingCases(rng: SeededRNG, _policies: string[]): PolicyTestCase[] {
  return [
    {
      id: `encoding-unicode-${rng.randomString(4)}`,
      category: 'encoding',
      input: { tool: 'tool_\u200B\u200C\u200D', content: '\u0000\uFEFF' },
      description: 'Unicode zero-width and BOM characters',
    },
    {
      id: `encoding-base64-secret-${rng.randomString(4)}`,
      category: 'encoding',
      input: { content: Buffer.from(`AKIA${rng.randomString(16)}`).toString('base64') },
      description: 'Base64-encoded secret',
    },
    {
      id: `encoding-url-encoded-${rng.randomString(4)}`,
      category: 'encoding',
      input: { tool: 'api_call', toolParams: { url: `https://evil.com/%2e%2e/%2e%2e/etc/passwd` } },
      description: 'URL-encoded path traversal',
    },
  ];
}

function generateEmptyCases(rng: SeededRNG, _policies: string[]): PolicyTestCase[] {
  return [
    {
      id: `empty-object-${rng.randomString(4)}`,
      category: 'empty',
      input: {},
      description: 'Completely empty input object',
    },
    {
      id: `empty-missing-fields-${rng.randomString(4)}`,
      category: 'empty',
      input: { tool: undefined as unknown as string, content: undefined as unknown as string, model: undefined as unknown as string },
      description: 'All required fields missing',
    },
  ];
}

function generateOverflowCases(rng: SeededRNG, _policies: string[]): PolicyTestCase[] {
  const longStr = rng.randomString(100000);
  const deepObj: Record<string, unknown> = {};
  let current = deepObj;
  for (let i = 0; i < 50; i++) {
    const next: Record<string, unknown> = {};
    (current as Record<string, unknown>)['nested'] = next;
    current = next;
  }
  current['value'] = 'deep';

  const bigArray = Array.from({ length: 10000 }, (_, i) => `item_${i}`);

  return [
    {
      id: `overflow-long-string-${rng.randomString(4)}`,
      category: 'overflow',
      input: { content: longStr },
      description: 'Very long string input (100K chars)',
    },
    {
      id: `overflow-deep-nesting-${rng.randomString(4)}`,
      category: 'overflow',
      input: { toolParams: deepObj },
      description: 'Deeply nested object (50 levels)',
    },
    {
      id: `overflow-large-array-${rng.randomString(4)}`,
      category: 'overflow',
      input: { toolParams: { items: bigArray } },
      description: 'Large array (10K elements)',
    },
  ];
}

type EvaluateFn = (
  input: Record<string, unknown>,
) => Promise<{ action: string; reason_codes: string[] }>;

export class RedTeamHarness {
  private readonly evaluateFn: EvaluateFn;
  private readonly config: RedTeamConfig;

  constructor(evaluateFn: EvaluateFn, config: RedTeamConfig) {
    this.evaluateFn = evaluateFn;
    this.config = config;
  }

  /**
   * Generate adversarial test cases covering all 5 attack categories.
   */
  generate(): PolicyTestCase[] {
    // Reset RNG for determinism
    const rng = new SeededRNG(this.config.seed ?? 42);
    const policies = this.config.targetPolicies;

    const cases: PolicyTestCase[] = [
      ...generateBoundaryCases(rng, policies),
      ...generateBypassCases(rng, policies),
      ...generateEncodingCases(rng, policies),
      ...generateEmptyCases(rng, policies),
      ...generateOverflowCases(rng, policies),
    ];

    return cases;
  }

  /**
   * Run all generated cases against the evaluate function.
   */
  async run(): Promise<PolicyTestReport> {
    const cases = this.generate();
    const results: PolicyTestResult[] = [];
    let bypassesFound = 0;
    let weakPolicies = 0;
    const severitySummary: Record<string, number> = {};

    for (const tc of cases) {
      let decisionAction = 'ERROR';
      let reasonCodes: string[] = [];
      let bypassed = false;
      let severity = 'info';

      try {
        const result = await this.evaluateFn(tc.input);
        decisionAction = result.action;
        reasonCodes = result.reason_codes;

        // A bypass = policy returned ALLOW when it should have denied
        if (decisionAction === 'ALLOW') {
          bypassed = true;
          bypassesFound++;
          severity = 'high';
          reasonCodes = [...reasonCodes, 'REDTEAM_BYPASS_FOUND'];
        }

        // A weak policy = ALLOW with risk indicators
        const hasRiskIndicator = reasonCodes.some(
          (c) =>
            c.includes('DETECTED') ||
            c.includes('VIOLATION') ||
            c.includes('INJECTION'),
        );
        if (decisionAction === 'ALLOW' && hasRiskIndicator) {
          weakPolicies++;
          severity = 'medium';
          if (!reasonCodes.includes('REDTEAM_POLICY_WEAK')) {
            reasonCodes = [...reasonCodes, 'REDTEAM_POLICY_WEAK'];
          }
        }
      } catch (_err: unknown) {
        // Errors during evaluation are not bypasses
        severity = 'info';
        reasonCodes = ['EVALUATION_ERROR'];
      }

      severitySummary[severity] = (severitySummary[severity] ?? 0) + 1;

      results.push({
        id: tc.id,
        category: tc.category,
        bypassed,
        severity,
        decision_action: decisionAction,
        reason_codes: reasonCodes,
      });
    }

    return {
      total_tests: cases.length,
      bypasses_found: bypassesFound,
      weak_policies: weakPolicies,
      results,
      severity_summary: severitySummary,
    };
  }

  /**
   * Export a PolicyTestReport as JUnit XML.
   */
  exportJUnit(report: PolicyTestReport): string {
    return new JUnitExporter().exportRedTeam(report);
  }

  /**
   * Export a PolicyTestReport as JSON.
   */
  exportJSON(report: PolicyTestReport): string {
    return new JSONExporter().exportRedTeam(report);
  }
}
