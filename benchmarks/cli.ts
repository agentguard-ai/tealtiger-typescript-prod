#!/usr/bin/env ts-node
/**
 * TealTiger Benchmark Runner CLI
 *
 * Executes red team benchmark suites against TealTiger's governance stack
 * and generates JSON + Markdown reports.
 *
 * Usage:
 *   ts-node benchmarks/cli.ts [options]
 *
 * Options:
 *   --suite <name>      Run a specific suite (garak, pint, agent, guardbench) or "all" (default: all)
 *   --output <dir>      Output directory for results (default: ./benchmark-results)
 *   --endpoint <url>    Sidecar endpoint URL (default: http://localhost:8080)
 *   --help              Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';

import { BenchmarkRunner } from './runner/BenchmarkRunner';
import { HttpEvaluateEndpoint } from './runner/EvaluateEndpoint';
import { ReportGenerator } from './runner/ReportGenerator';
import { SuiteRegistry } from './runner/SuiteRegistry';
import type { BaselineThresholds, ReportOptions } from './runner/types';
import { AgentSuite } from './suites/AgentSuite';
import { GarakSuite } from './suites/GarakSuite';
import { GuardBenchSuite } from './suites/GuardBenchSuite';
import { PINTSuite } from './suites/PINTSuite';

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

interface CLIOptions {
  suite: string;
  output: string;
  endpoint: string;
  help: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    suite: 'all',
    output: './benchmark-results',
    endpoint: 'http://localhost:8080',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--suite':
        options.suite = args[++i] ?? 'all';
        break;
      case '--output':
        options.output = args[++i] ?? './benchmark-results';
        break;
      case '--endpoint':
        options.endpoint = args[++i] ?? 'http://localhost:8080';
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
TealTiger Benchmark Runner

Usage:
  ts-node benchmarks/cli.ts [options]

Options:
  --suite <name>      Run a specific suite or "all" (default: all)
                      Available: garak, pint, agent, guardbench, all
  --output <dir>      Output directory for results (default: ./benchmark-results)
  --endpoint <url>    Sidecar endpoint URL (default: http://localhost:8080)
  --help, -h          Show this help message

Examples:
  # Run all suites against local sidecar
  ts-node benchmarks/cli.ts

  # Run only PINT suite
  ts-node benchmarks/cli.ts --suite pint

  # Run against custom endpoint with custom output
  ts-node benchmarks/cli.ts --endpoint http://staging:8080 --output ./results
`);
}

// ─── Main Execution ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('🐯 TealTiger Benchmark Runner');
  console.log('─'.repeat(50));
  console.log(`Suite:    ${options.suite}`);
  console.log(`Endpoint: ${options.endpoint}`);
  console.log(`Output:   ${options.output}`);
  console.log('─'.repeat(50));
  console.log('');

  // Set up registry with all suites
  const registry = new SuiteRegistry();
  registry.register(new GarakSuite());
  registry.register(new PINTSuite());
  registry.register(new AgentSuite());
  registry.register(new GuardBenchSuite());

  // Set up endpoint
  const endpoint = new HttpEvaluateEndpoint(options.endpoint, 5000);

  // Set up runner
  const runner = new BenchmarkRunner(registry, endpoint, {
    suiteTimeout: 300000,
    callTimeout: 5000,
    concurrency: 10,
    outputDir: options.output,
  });

  // Execute benchmarks
  console.log('⏳ Running benchmarks...\n');

  let results;
  try {
    if (options.suite === 'all') {
      results = await runner.runAll();
    } else {
      const suiteResult = await runner.runSuite(options.suite);
      results = {
        timestamp: new Date().toISOString(),
        tealtigerVersion: suiteResult.tealtigerVersion,
        suiteResults: [suiteResult],
        totalDuration: suiteResult.executionDuration,
        overallDetectionRate: computeOverallRate(suiteResult),
      };
    }
  } catch (err) {
    console.error(`❌ Benchmark execution failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // Load baseline thresholds
  const baselinePath = path.resolve(__dirname, 'baselines', 'thresholds.json');
  let baseline: BaselineThresholds = {};
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  } catch {
    console.warn('⚠️  No baseline thresholds found, skipping regression check');
  }

  // Compare against baseline
  const regressionReport = runner.compareBaseline(results, baseline);

  // Generate reports
  const reportGenerator = new ReportGenerator();

  const reportOptions: ReportOptions = {
    includeLeaderboardComparison: true,
    knownLimitations: [
      'TealTiger v1.2.0 uses regex-based pattern matching — no ML inference in governance path',
      'Low recall (40%) on PINT reflects pattern library gaps, not architectural limitation',
      'Data leakage detection focuses on input-side patterns; output-side leakage requires separate tooling',
      'Encoding-based attacks (base64, rot13) have partial coverage — expanding in v1.2.1',
      'Agent scenarios test governance decision points, not full agent trajectory analysis',
    ],
    outOfScope: [
      { category: 'model_alignment', rationale: 'Requires output content quality analysis — outside input-side governance' },
      { category: 'hallucination_detection', rationale: 'Requires factual accuracy verification of LLM output' },
      { category: 'output_toxicity', rationale: 'Requires ML-based output toxicity classification' },
      { category: 'bias_detection', rationale: 'Requires NLU-based bias detection in generated content' },
      { category: 'misinformation', rationale: 'Requires factual verification via NLU' },
    ],
  };

  const jsonReport = reportGenerator.generateJSON(results, regressionReport);
  const markdownReport = reportGenerator.generateMarkdown(results, regressionReport, reportOptions);

  // Write output files
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  const jsonPath = path.join(options.output, 'results.json');
  const mdPath = path.join(options.output, 'BENCHMARKS.md');

  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  fs.writeFileSync(mdPath, markdownReport, 'utf-8');

  // Print summary
  console.log('✅ Benchmark execution complete\n');
  console.log(`Overall Detection Rate: ${(results.overallDetectionRate * 100).toFixed(1)}%`);
  console.log(`Baseline: ${regressionReport.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (!regressionReport.passed) {
    console.log('\nRegressions detected:');
    for (const reg of regressionReport.regressions) {
      console.log(
        `  ❌ ${reg.suite}/${reg.category}: ${(reg.actual * 100).toFixed(1)}% < ${(reg.baseline * 100).toFixed(1)}% threshold`,
      );
    }
  }

  console.log(`\nResults written to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);

  // Exit with error code if baseline failed
  if (!regressionReport.passed) {
    process.exit(1);
  }
}

function computeOverallRate(suite: { categories: Array<{ blocked: number; allowed: number }> }): number {
  let totalBlocked = 0;
  let totalAllowed = 0;
  for (const cat of suite.categories) {
    totalBlocked += cat.blocked;
    totalAllowed += cat.allowed;
  }
  const denom = totalBlocked + totalAllowed;
  return denom === 0 ? 0 : totalBlocked / denom;
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
