#!/usr/bin/env node

/**
 * TealTiger SDK v1.1.x - Enterprise Adoption Features
 * P0.5: Policy Test Harness - CLI Test Runner
 * 
 * Command-line interface for running policy tests
 * 
 * Usage:
 *   tealtiger test <test-file> [options]
 * 
 * Options:
 *   --tags <tags>         Filter tests by tags (comma-separated)
 *   --watch              Watch mode for continuous testing
 *   --coverage           Show coverage report
 *   --format <format>    Output format: json, junit (default: console)
 *   --output <path>      Output file path for report
 *   --mode <mode>        Policy mode: ENFORCE, MONITOR, REPORT_ONLY
 *   --verbose            Verbose output
 *   --help               Show help
 * 
 * Examples:
 *   tealtiger test tests/policies.json
 *   tealtiger test tests/policies.json --tags security,pii
 *   tealtiger test tests/policies.json --coverage --format junit --output report.xml
 *   tealtiger test tests/policies.json --watch
 * 
 * @module cli/test
 * @version 1.1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { TealEngine } from '../core/engine/TealEngine';
import { PolicyMode } from '../core/engine/types';
import type { PolicyTestSuite, PolicyTestReport, PolicyTestCase, PolicyTestResult } from '../core/testing/types';

/**
 * CLI options
 */
interface CLIOptions {
  /** Test file path(s) */
  files: string[];
  /** Filter by tags */
  tags?: string[];
  /** Watch mode */
  watch?: boolean;
  /** Show coverage */
  coverage?: boolean;
  /** Output format */
  format?: 'console' | 'json' | 'junit';
  /** Output file path */
  output?: string;
  /** Policy mode override */
  mode?: PolicyMode;
  /** Verbose output */
  verbose?: boolean;
  /** Show help */
  help?: boolean;
}

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    files: [],
    format: 'console',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--tags':
        options.tags = args[++i]?.split(',').map(t => t.trim());
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--format':
        const format = args[++i];
        if (format === 'json' || format === 'junit' || format === 'console') {
          options.format = format;
        } else {
          console.error(`${colors.red}Error: Invalid format "${format}". Use: json, junit, console${colors.reset}`);
          process.exit(1);
        }
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--mode':
        const mode = args[++i];
        if (mode === 'ENFORCE' || mode === 'MONITOR' || mode === 'REPORT_ONLY') {
          options.mode = mode as PolicyMode;
        } else {
          console.error(`${colors.red}Error: Invalid mode "${mode}". Use: ENFORCE, MONITOR, REPORT_ONLY${colors.reset}`);
          process.exit(1);
        }
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!arg.startsWith('--')) {
          options.files.push(arg);
        }
        break;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
${colors.bright}TealTiger Policy Test Runner${colors.reset}

${colors.bright}USAGE:${colors.reset}
  tealtiger test <test-file> [options]

${colors.bright}OPTIONS:${colors.reset}
  --tags <tags>         Filter tests by tags (comma-separated)
  --watch              Watch mode for continuous testing
  --coverage           Show coverage report
  --format <format>    Output format: json, junit (default: console)
  --output <path>      Output file path for report
  --mode <mode>        Policy mode: ENFORCE, MONITOR, REPORT_ONLY
  --verbose            Verbose output
  --help, -h           Show this help message

${colors.bright}EXAMPLES:${colors.reset}
  ${colors.dim}# Run tests from a file${colors.reset}
  tealtiger test tests/policies.json

  ${colors.dim}# Filter by tags${colors.reset}
  tealtiger test tests/policies.json --tags security,pii

  ${colors.dim}# Generate JUnit XML report${colors.reset}
  tealtiger test tests/policies.json --coverage --format junit --output report.xml

  ${colors.dim}# Watch mode for development${colors.reset}
  tealtiger test tests/policies.json --watch

  ${colors.dim}# Override policy mode${colors.reset}
  tealtiger test tests/policies.json --mode MONITOR

${colors.bright}TEST FILE FORMAT:${colors.reset}
  Test files should be JSON with the following structure:
  {
    "name": "Test Suite Name",
    "description": "Description",
    "policy": { /* TealPolicy configuration */ },
    "mode": { "default": "ENFORCE" },
    "tests": [
      {
        "name": "Test case name",
        "context": { /* RequestContext */ },
        "expected": { /* Expected decision */ },
        "tags": ["tag1", "tag2"]
      }
    ]
  }
`);
}

/**
 * Load test suite from JSON file
 */
function loadTestSuite(filePath: string): PolicyTestSuite {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const suite = JSON.parse(content) as PolicyTestSuite;
    
    // Validate required fields
    if (!suite.name || !suite.policy || !suite.tests) {
      throw new Error('Invalid test suite: missing required fields (name, policy, tests)');
    }
    
    return suite;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load test suite from ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Filter tests by tags
 */
function filterTestsByTags(tests: PolicyTestCase[], tags: string[]): PolicyTestCase[] {
  if (!tags || tags.length === 0) {
    return tests;
  }
  
  return tests.filter(test => {
    if (!test.tags || test.tags.length === 0) {
      return false;
    }
    return tags.some(tag => test.tags!.includes(tag));
  });
}

/**
 * Run a single test case
 */
function runTest(engine: TealEngine, testCase: PolicyTestCase, verbose: boolean): PolicyTestResult {
  const startTime = Date.now();
  
  try {
    // Execute policy evaluation
    const actual = engine.evaluate(testCase.context);
    const executionTime = Date.now() - startTime;
    
    // Compare with expected
    const passed = compareDecision(actual, testCase.expected);
    const failureReason = passed ? undefined : generateFailureReason(actual, testCase.expected);
    
    if (verbose) {
      console.log(`  ${colors.dim}Actual: ${JSON.stringify(actual, null, 2)}${colors.reset}`);
    }
    
    return {
      name: testCase.name,
      passed,
      actual,
      expected: testCase.expected,
      failure_reason: failureReason,
      execution_time: executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    throw new Error(`Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Compare actual decision with expected
 */
function compareDecision(actual: any, expected: any): boolean {
  // Check action
  if (expected.action && actual.action !== expected.action) {
    return false;
  }
  
  // Check reason codes (all expected codes must be present)
  if (expected.reason_codes && expected.reason_codes.length > 0) {
    const actualCodes = actual.reason_codes || [];
    const allPresent = expected.reason_codes.every((code: string) => actualCodes.includes(code));
    if (!allPresent) {
      return false;
    }
  }
  
  // Check risk score range
  if (expected.risk_score_range) {
    const { min, max } = expected.risk_score_range;
    if (actual.risk_score < min || actual.risk_score > max) {
      return false;
    }
  }
  
  // Check mode
  if (expected.mode && actual.mode !== expected.mode) {
    return false;
  }
  
  return true;
}

/**
 * Generate failure reason message
 */
function generateFailureReason(actual: any, expected: any): string {
  const reasons: string[] = [];
  
  if (expected.action && actual.action !== expected.action) {
    reasons.push(`Expected action ${expected.action}, got ${actual.action}`);
  }
  
  if (expected.reason_codes && expected.reason_codes.length > 0) {
    const actualCodes = actual.reason_codes || [];
    const missing = expected.reason_codes.filter((code: string) => !actualCodes.includes(code));
    if (missing.length > 0) {
      reasons.push(`Missing reason codes: ${missing.join(', ')}`);
    }
  }
  
  if (expected.risk_score_range) {
    const { min, max } = expected.risk_score_range;
    if (actual.risk_score < min || actual.risk_score > max) {
      reasons.push(`Risk score ${actual.risk_score} outside expected range [${min}, ${max}]`);
    }
  }
  
  if (expected.mode && actual.mode !== expected.mode) {
    reasons.push(`Expected mode ${expected.mode}, got ${actual.mode}`);
  }
  
  return reasons.join('; ');
}

/**
 * Run test suite
 */
function runTestSuite(suite: PolicyTestSuite, options: CLIOptions): PolicyTestReport {
  const startTime = Date.now();
  
  // Apply mode override if specified
  const modeConfig = options.mode 
    ? { ...suite.mode, default: options.mode }
    : suite.mode;
  
  // Create TealEngine with correct constructor signature
  const engine = new TealEngine(suite.policy, {
    mode: modeConfig,
  });
  
  // Filter tests by tags
  let tests = suite.tests;
  if (options.tags && options.tags.length > 0) {
    tests = filterTestsByTags(tests, options.tags);
    if (options.verbose) {
      console.log(`${colors.dim}Filtered to ${tests.length} tests matching tags: ${options.tags.join(', ')}${colors.reset}\n`);
    }
  }
  
  // Run tests
  const results: PolicyTestResult[] = [];
  for (const test of tests) {
    const result = runTest(engine, test, options.verbose || false);
    results.push(result);
  }
  
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  // Calculate coverage if requested
  let coverage;
  if (options.coverage) {
    coverage = calculateCoverage(suite.policy, tests);
  }
  
  return {
    timestamp: new Date().toISOString(),
    suite_name: suite.name,
    total: results.length,
    passed,
    failed,
    skipped: 0,
    success_rate: results.length > 0 ? passed / results.length : 0,
    total_time: totalTime,
    results,
    coverage,
  };
}


/**
 * Calculate test coverage
 */
function calculateCoverage(policy: any, tests: PolicyTestCase[]): any {
  // Extract policy IDs from policy configuration
  const policyIds = new Set<string>();
  
  // Recursively extract policy identifiers
  function extractPolicyIds(obj: any, prefix = ''): void {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        policyIds.add(fullKey);
        extractPolicyIds(obj[key], fullKey);
      }
    }
  }
  
  extractPolicyIds(policy);
  
  // Extract tested policy IDs from test contexts
  const testedPolicyIds = new Set<string>();
  for (const test of tests) {
    // Extract from test context (simplified - would need more sophisticated analysis)
    if (test.context.action) {
      testedPolicyIds.add(test.context.action);
    }
  }
  
  const totalPolicies = policyIds.size;
  const testedPolicies = testedPolicyIds.size;
  const coveragePercentage = totalPolicies > 0 ? (testedPolicies / totalPolicies) * 100 : 0;
  
  const untestedPolicies = Array.from(policyIds).filter(id => !testedPolicyIds.has(id));
  
  return {
    total_policies: totalPolicies,
    tested_policies: testedPolicies,
    coverage_percentage: coveragePercentage,
    untested_policies: untestedPolicies,
  };
}

/**
 * Display test report in console
 */
function displayConsoleReport(report: PolicyTestReport, verbose: boolean): void {
  console.log(`\n${colors.bright}${report.suite_name}${colors.reset}`);
  console.log(`${colors.dim}${'='.repeat(report.suite_name.length)}${colors.reset}\n`);
  
  // Display individual test results
  for (const result of report.results) {
    const icon = result.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    const time = `${colors.dim}(${result.execution_time}ms)${colors.reset}`;
    console.log(`${icon} ${result.name} ${time}`);
    
    if (!result.passed && result.failure_reason) {
      console.log(`  ${colors.red}${result.failure_reason}${colors.reset}`);
    }
    
    if (verbose && !result.passed) {
      console.log(`  ${colors.dim}Expected: ${JSON.stringify(result.expected, null, 2)}${colors.reset}`);
      console.log(`  ${colors.dim}Actual: ${JSON.stringify(result.actual, null, 2)}${colors.reset}`);
    }
  }
  
  // Display summary
  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  console.log(`  Total:   ${report.total}`);
  console.log(`  ${colors.green}Passed:  ${report.passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed:  ${report.failed}${colors.reset}`);
  console.log(`  Success: ${(report.success_rate * 100).toFixed(1)}%`);
  console.log(`  Time:    ${report.total_time}ms`);
  
  // Display coverage if available
  if (report.coverage) {
    console.log(`\n${colors.bright}Coverage:${colors.reset}`);
    console.log(`  Total policies:  ${report.coverage.total_policies}`);
    console.log(`  Tested policies: ${report.coverage.tested_policies}`);
    console.log(`  Coverage:        ${report.coverage.coverage_percentage.toFixed(1)}%`);
    
    if (report.coverage.untested_policies.length > 0) {
      console.log(`\n  ${colors.yellow}Untested policies:${colors.reset}`);
      for (const policy of report.coverage.untested_policies) {
        console.log(`    - ${policy}`);
      }
    }
  }
  
  console.log();
}

/**
 * Export report as JSON
 */
function exportJSON(report: PolicyTestReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Export report as JUnit XML
 */
function exportJUnit(report: PolicyTestReport): string {
  const xml: string[] = [];
  
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push(`<testsuites name="${escapeXml(report.suite_name)}" tests="${report.total}" failures="${report.failed}" time="${report.total_time / 1000}">`);
  xml.push(`  <testsuite name="${escapeXml(report.suite_name)}" tests="${report.total}" failures="${report.failed}" time="${report.total_time / 1000}" timestamp="${report.timestamp}">`);
  
  for (const result of report.results) {
    xml.push(`    <testcase name="${escapeXml(result.name)}" time="${result.execution_time / 1000}">`);
    
    if (!result.passed && result.failure_reason) {
      xml.push(`      <failure message="${escapeXml(result.failure_reason)}">`);
      xml.push(`Expected: ${escapeXml(JSON.stringify(result.expected))}`);
      xml.push(`Actual: ${escapeXml(JSON.stringify(result.actual))}`);
      xml.push(`      </failure>`);
    }
    
    xml.push(`    </testcase>`);
  }
  
  xml.push('  </testsuite>');
  xml.push('</testsuites>');
  
  return xml.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Watch files for changes
 */
function watchFiles(files: string[], options: CLIOptions): void {
  console.log(`${colors.cyan}Watching for changes...${colors.reset}\n`);
  
  // Initial run
  runTests(files, options);
  
  // Watch for changes (simplified - would use chokidar in production)
  const watchedFiles = new Set(files);
  
  // Poll for changes every 1 second
  const checkInterval = 1000;
  const fileStats = new Map<string, number>();
  
  // Initialize file stats
  for (const file of files) {
    try {
      const stats = fs.statSync(file);
      fileStats.set(file, stats.mtimeMs);
    } catch (error) {
      // File doesn't exist yet
    }
  }
  
  setInterval(() => {
    let changed = false;
    
    for (const file of watchedFiles) {
      try {
        const stats = fs.statSync(file);
        const lastMtime = fileStats.get(file) || 0;
        
        if (stats.mtimeMs > lastMtime) {
          fileStats.set(file, stats.mtimeMs);
          changed = true;
        }
      } catch (error) {
        // File doesn't exist
      }
    }
    
    if (changed) {
      console.clear();
      console.log(`${colors.cyan}File changed, re-running tests...${colors.reset}\n`);
      runTests(files, options);
      console.log(`\n${colors.cyan}Watching for changes...${colors.reset}`);
    }
  }, checkInterval);
}

/**
 * Run tests from files
 */
function runTests(files: string[], options: CLIOptions): number {
  let totalFailed = 0;
  
  for (const file of files) {
    try {
      // Load test suite
      const suite = loadTestSuite(file);
      
      // Run tests
      const report = runTestSuite(suite, options);
      
      // Display or export results
      if (options.format === 'console') {
        displayConsoleReport(report, options.verbose || false);
      } else {
        let output: string;
        if (options.format === 'json') {
          output = exportJSON(report);
        } else {
          output = exportJUnit(report);
        }
        
        if (options.output) {
          fs.writeFileSync(options.output, output, 'utf-8');
          console.log(`${colors.green}Report written to ${options.output}${colors.reset}`);
        } else {
          console.log(output);
        }
      }
      
      totalFailed += report.failed;
    } catch (error) {
      console.error(`${colors.red}Error processing ${file}:${colors.reset}`);
      console.error(error instanceof Error ? error.message : String(error));
      totalFailed++;
    }
  }
  
  return totalFailed;
}

/**
 * Main CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  // Show help
  if (options.help || args.length === 0) {
    showHelp();
    process.exit(0);
  }
  
  // Validate files
  if (options.files.length === 0) {
    console.error(`${colors.red}Error: No test files specified${colors.reset}`);
    console.error(`Run 'tealtiger test --help' for usage information`);
    process.exit(1);
  }
  
  // Check if files exist
  for (const file of options.files) {
    if (!fs.existsSync(file)) {
      console.error(`${colors.red}Error: Test file not found: ${file}${colors.reset}`);
      process.exit(1);
    }
  }
  
  // Watch mode
  if (options.watch) {
    watchFiles(options.files, options);
    // Keep process alive
    return;
  }
  
  // Run tests
  const failedCount = runTests(options.files, options);
  
  // Exit with non-zero status if tests failed (CI/CD integration)
  process.exit(failedCount > 0 ? 1 : 0);
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Export for testing
export { main, parseArgs, loadTestSuite, runTestSuite, displayConsoleReport, exportJSON, exportJUnit };
