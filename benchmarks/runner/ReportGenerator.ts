/**
 * ReportGenerator — Generates JSON and Markdown benchmark reports.
 *
 * Produces:
 * - JSON output matching the BenchmarkResultsJSON schema
 * - Markdown BENCHMARKS.md with methodology, per-benchmark results,
 *   comparison context, known limitations, out-of-scope categories,
 *   and version info
 *
 * Includes ALL categories regardless of score (no selective omission).
 */

import type {
  BaselineThresholds,
  CategoryResult,
  RegressionReport,
  ReportOptions,
  RunnerResult,
  SuiteResult,
} from './types';

// ─── JSON Output Schema ─────────────────────────────────────────────────────

/**
 * Machine-readable JSON output matching the design spec schema.
 */
export interface BenchmarkResultsJSON {
  metadata: {
    timestamp: string;
    tealtigerVersion: string;
    runDuration: number;
    runner: 'tealtiger-benchmark-runner';
    runnerVersion: string;
  };
  suites: Array<{
    name: string;
    datasetVersion: string;
    executionDuration: number;
    totalSamples: number;
    errorCount: number;
    timedOut: boolean;
    overallDetectionRate: number;
    categories: Array<{
      name: string;
      totalProbes: number;
      blocked: number;
      allowed: number;
      errors: number;
      notApplicable: number;
      detectionRate: number;
      metrics?: {
        accuracy: number;
        precision: number;
        recall: number;
        f1Score: number;
      };
    }>;
  }>;
  baseline: {
    passed: boolean;
    regressions: Array<{
      suite: string;
      category: string;
      baseline: number;
      actual: number;
    }>;
  };
}

// ─── ReportGenerator Implementation ─────────────────────────────────────────

export class ReportGenerator {
  private readonly runnerVersion = '1.0.0';

  /**
   * Generate machine-readable JSON matching BenchmarkResultsJSON schema.
   */
  generateJSON(
    results: RunnerResult,
    regressionReport: RegressionReport,
  ): BenchmarkResultsJSON {
    return {
      metadata: {
        timestamp: results.timestamp,
        tealtigerVersion: results.tealtigerVersion,
        runDuration: results.totalDuration,
        runner: 'tealtiger-benchmark-runner',
        runnerVersion: this.runnerVersion,
      },
      suites: results.suiteResults.map((suite) => ({
        name: suite.suiteName,
        datasetVersion: suite.datasetVersion,
        executionDuration: suite.executionDuration,
        totalSamples: suite.totalSamples,
        errorCount: suite.errorCount,
        timedOut: suite.timedOut,
        overallDetectionRate: this.computeSuiteDetectionRate(suite),
        categories: suite.categories.map((cat) => ({
          name: cat.category,
          totalProbes: cat.totalProbes,
          blocked: cat.blocked,
          allowed: cat.allowed,
          errors: cat.errors,
          notApplicable: cat.notApplicable,
          detectionRate: cat.detectionRate,
          metrics: cat.metrics
            ? {
                accuracy: cat.metrics.accuracy,
                precision: cat.metrics.precision,
                recall: cat.metrics.recall,
                f1Score: cat.metrics.f1Score,
              }
            : undefined,
        })),
      })),
      baseline: {
        passed: regressionReport.passed,
        regressions: regressionReport.regressions.map((r) => ({
          suite: r.suite,
          category: r.category,
          baseline: r.baseline,
          actual: r.actual,
        })),
      },
    };
  }

  /**
   * Generate human-readable Markdown BENCHMARKS.md content.
   *
   * Includes:
   * - Methodology section
   * - Per-benchmark results tables
   * - Comparison context against published leaderboards
   * - Known limitations
   * - Out-of-scope categories with rationale
   * - Version info
   */
  generateMarkdown(
    results: RunnerResult,
    regressionReport: RegressionReport,
    options: ReportOptions,
  ): string {
    const lines: string[] = [];

    // Header
    lines.push('# TealTiger Red Team Benchmark Results');
    lines.push('');
    lines.push(`> Generated: ${results.timestamp}`);
    lines.push(`> TealTiger Version: ${results.tealtigerVersion}`);
    lines.push(`> Runner Version: ${this.runnerVersion}`);
    lines.push(`> Total Duration: ${results.totalDuration}ms`);
    lines.push('');

    // Methodology
    lines.push('## Methodology');
    lines.push('');
    lines.push('TealTiger benchmarks are executed using a **dataset-driven approach**:');
    lines.push('');
    lines.push('1. Attack prompts from recognized third-party benchmarks are bundled as local YAML fixtures');
    lines.push('2. Each prompt is evaluated through TealTiger\'s `POST /evaluate` governance endpoint');
    lines.push('3. Governance decisions (ALLOW/DENY/MONITOR) are compared against ground truth labels');
    lines.push('4. Detection rates and classification metrics are computed per category');
    lines.push('');
    lines.push('**Key characteristics:**');
    lines.push('- **Deterministic**: TealTiger uses regex-based pattern matching with no LLM in the governance path');
    lines.push('- **Reproducible**: Same version + dataset = identical results');
    lines.push('- **No external dependencies**: No paid API keys or network calls required');
    lines.push('- **Fail-closed**: Infrastructure errors are recorded separately, never counted as passes');
    lines.push('');

    // Overall Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Overall Detection Rate | ${(results.overallDetectionRate * 100).toFixed(1)}% |`);
    lines.push(`| Suites Executed | ${results.suiteResults.length} |`);
    lines.push(`| Baseline Status | ${regressionReport.passed ? '✅ PASSED' : '❌ FAILED'} |`);
    lines.push('');

    // Per-benchmark results
    for (const suite of results.suiteResults) {
      lines.push(...this.formatSuiteSection(suite));
    }

    // Comparison context
    if (options.includeLeaderboardComparison) {
      lines.push(...this.formatComparisonSection());
    }

    // Known limitations
    if (options.knownLimitations.length > 0) {
      lines.push('## Known Limitations');
      lines.push('');
      for (const limitation of options.knownLimitations) {
        lines.push(`- ${limitation}`);
      }
      lines.push('');
    }

    // Out-of-scope categories
    if (options.outOfScope.length > 0) {
      lines.push('## Out-of-Scope Categories');
      lines.push('');
      lines.push('The following categories are outside TealTiger\'s deterministic governance scope:');
      lines.push('');
      lines.push('| Category | Rationale |');
      lines.push('|----------|-----------|');
      for (const item of options.outOfScope) {
        lines.push(`| ${item.category} | ${item.rationale} |`);
      }
      lines.push('');
    }

    // Regression report
    if (!regressionReport.passed) {
      lines.push('## Regressions Detected');
      lines.push('');
      lines.push('| Suite | Category | Baseline | Actual | Delta |');
      lines.push('|-------|----------|----------|--------|-------|');
      for (const reg of regressionReport.regressions) {
        lines.push(
          `| ${reg.suite} | ${reg.category} | ${(reg.baseline * 100).toFixed(1)}% | ${(reg.actual * 100).toFixed(1)}% | ${(reg.delta * 100).toFixed(1)}% |`,
        );
      }
      lines.push('');
    }

    // Historical results
    if (options.historicalResults && options.historicalResults.length > 0) {
      lines.push('## Historical Results');
      lines.push('');
      lines.push('| Version | Date | Overall Detection Rate |');
      lines.push('|---------|------|------------------------|');
      for (const hist of options.historicalResults) {
        lines.push(
          `| ${hist.tealtigerVersion} | ${hist.timestamp.split('T')[0]} | ${(hist.overallDetectionRate * 100).toFixed(1)}% |`,
        );
      }
      lines.push('');
    }

    // Version info
    lines.push('## Version Information');
    lines.push('');
    lines.push('| Component | Version |');
    lines.push('|-----------|---------|');
    lines.push(`| TealTiger | ${results.tealtigerVersion} |`);
    lines.push(`| Benchmark Runner | ${this.runnerVersion} |`);
    for (const suite of results.suiteResults) {
      lines.push(`| ${suite.suiteName} dataset | ${suite.datasetVersion} |`);
    }
    lines.push('');

    return lines.join('\n');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Format a single suite's results as a markdown section.
   * Includes ALL categories regardless of score.
   */
  private formatSuiteSection(suite: SuiteResult): string[] {
    const lines: string[] = [];
    const suiteRate = this.computeSuiteDetectionRate(suite);

    lines.push(`## ${this.formatSuiteName(suite.suiteName)} Results`);
    lines.push('');
    lines.push(`**Dataset Version**: ${suite.datasetVersion}`);
    lines.push(`**Total Samples**: ${suite.totalSamples}`);
    lines.push(`**Errors**: ${suite.errorCount}`);
    lines.push(`**Overall Detection Rate**: ${(suiteRate * 100).toFixed(1)}%`);
    if (suite.timedOut) {
      lines.push(`**⚠️ Suite timed out** — results may be partial`);
    }
    lines.push('');

    // Check if any category has classification metrics
    const hasMetrics = suite.categories.some((c) => c.metrics);

    if (hasMetrics) {
      lines.push('| Category | Total | Blocked | Allowed | N/A | Errors | Detection Rate | Precision | Recall | F1 |');
      lines.push('|----------|-------|---------|---------|-----|--------|----------------|-----------|--------|-----|');
      for (const cat of suite.categories) {
        const m = cat.metrics;
        const precision = m ? `${(m.precision * 100).toFixed(1)}%` : '-';
        const recall = m ? `${(m.recall * 100).toFixed(1)}%` : '-';
        const f1 = m ? `${(m.f1Score * 100).toFixed(1)}%` : '-';
        lines.push(
          `| ${cat.category} | ${cat.totalProbes} | ${cat.blocked} | ${cat.allowed} | ${cat.notApplicable} | ${cat.errors} | ${(cat.detectionRate * 100).toFixed(1)}% | ${precision} | ${recall} | ${f1} |`,
        );
      }
    } else {
      lines.push('| Category | Total | Blocked | Allowed | N/A | Errors | Detection Rate |');
      lines.push('|----------|-------|---------|---------|-----|--------|----------------|');
      for (const cat of suite.categories) {
        lines.push(
          `| ${cat.category} | ${cat.totalProbes} | ${cat.blocked} | ${cat.allowed} | ${cat.notApplicable} | ${cat.errors} | ${(cat.detectionRate * 100).toFixed(1)}% |`,
        );
      }
    }

    lines.push('');
    return lines;
  }

  /**
   * Format comparison context against published leaderboard scores.
   */
  private formatComparisonSection(): string[] {
    const lines: string[] = [];

    lines.push('## Comparison Context');
    lines.push('');
    lines.push('Published leaderboard scores for reference (PINT benchmark):');
    lines.push('');
    lines.push('| Solution | PINT F1 Score | Architecture |');
    lines.push('|----------|---------------|--------------|');
    lines.push('| Lakera Guard | 95.2% | ML-based (proprietary) |');
    lines.push('| Azure AI Prompt Shield | 89.1% | ML-based (cloud) |');
    lines.push('| AWS Bedrock Guardrails | 89.2% | ML-based (cloud) |');
    lines.push('| TealTiger v1.2.0 | See results above | Deterministic (regex) |');
    lines.push('');
    lines.push('> **Note**: TealTiger uses deterministic regex-based pattern matching,');
    lines.push('> not ML inference. This provides high precision (low false positives)');
    lines.push('> but lower recall compared to ML-based solutions. The v1.2.1 roadmap');
    lines.push('> targets 75%+ recall through expanded pattern libraries.');
    lines.push('');

    return lines;
  }

  /**
   * Compute overall detection rate for a single suite.
   */
  private computeSuiteDetectionRate(suite: SuiteResult): number {
    let totalBlocked = 0;
    let totalAllowed = 0;

    for (const cat of suite.categories) {
      totalBlocked += cat.blocked;
      totalAllowed += cat.allowed;
    }

    const denominator = totalBlocked + totalAllowed;
    return denominator === 0 ? 0 : totalBlocked / denominator;
  }

  /**
   * Format suite name for display (capitalize, expand abbreviations).
   */
  private formatSuiteName(name: string): string {
    const nameMap: Record<string, string> = {
      garak: 'Garak (NVIDIA)',
      pint: 'PINT (Lakera)',
      agent: 'Agent Security (AgentDojo/AgentHarm)',
      guardbench: 'GuardBench (EU JRC)',
    };
    return nameMap[name] ?? name;
  }
}
