/**
 * TealTiger SDK v1.1.x - Policy Testing Examples
 * 
 * Demonstrates how to use the policy testing framework:
 * - Defining test suites with test cases
 * - Running tests with PolicyTester class
 * - Using starter test corpora from TestCorpora
 * - Exporting test reports to JSON and JUnit XML formats
 * - CLI usage examples for CI/CD integration
 * - Test assertions (action, reason_codes, risk_score_range, mode)
 * - Coverage calculation and reporting
 * 
 * Policy testing enables shift-left security by validating policy behavior
 * before production deployment, preventing regressions, and ensuring compliance.
 */

import { TealEngine } from '../src/core/engine/TealEngine';
import { PolicyTester } from '../src/core/engine/PolicyTester';
import { TestCorpora } from '../src/core/testing/TestCorpora';
import { ContextManager } from '../src/core/context/ContextManager';
import { PolicyMode, DecisionAction, ReasonCode } from '../src/core/engine/types';
import type { PolicyTestCase, PolicyTestSuite, PolicyTestReport } from '../src/core/testing/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Example 1: Define Test Suite with Test Cases
 * 
 * Shows how to manually define a test suite with multiple test cases
 * for validating specific policy behavior.
 * 
 * Use case: Testing custom policies for your application
 */
async function example1_DefineTestSuite() {
  console.log('\n=== Example 1: Define Test Suite with Test Cases ===\n');

  // Define a test suite for customer support agent policies
  const testSuite: PolicyTestSuite = {
    name: 'Customer Support Agent Policy Tests',
    description: 'Validates policies for customer support agents',
    
    // Policy configuration to test
    policy: {
      tools: {
        'file_delete': { allowed: false },
        'database_write': { allowed: false },
        'customer_data_read': { allowed: true },
        'send_email': { allowed: true, rateLimit: { max: 100, window: '1h' } }
      },
      identity: {
        agentId: 'support-agent-001',
        role: 'customer-support',
        permissions: ['read:customer_data', 'send:email']
      },
      behavioral: {
        costLimit: {
          daily: 50.00,
          hourly: 10.00
        }
      }
    },
    
    // Mode configuration
    mode: {
      default: PolicyMode.ENFORCE
    },
    
    // Test cases
    tests: [
      // Test 1: Block disallowed tool
      {
        name: 'Block file deletion',
        description: 'Should deny file_delete tool usage',
        context: {
          agentId: 'support-agent-001',
          action: 'tool.execute',
          tool: 'file_delete',
          toolParams: { path: '/data/customer.db' },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
          risk_score_range: { min: 70, max: 100 }
        },
        tags: ['security', 'tools', 'critical']
      },
      
      // Test 2: Allow permitted tool
      {
        name: 'Allow customer data read',
        description: 'Should allow customer_data_read tool',
        context: {
          agentId: 'support-agent-001',
          action: 'tool.execute',
          tool: 'customer_data_read',
          toolParams: { customerId: '12345' },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW,
          reason_codes: [ReasonCode.POLICY_COMPLIANT],
          risk_score_range: { min: 0, max: 30 }
        },
        tags: ['security', 'tools', 'allowed']
      },
      
      // Test 3: Cost limit enforcement
      {
        name: 'Block excessive cost',
        description: 'Should deny request exceeding cost limit',
        context: {
          agentId: 'support-agent-001',
          action: 'chat.create',
          model: 'gpt-4',
          content: 'Generate very long response',
          cost: 15.00,
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.COST_BUDGET_EXCEEDED],
          risk_score_range: { min: 60, max: 90 }
        },
        tags: ['cost', 'budget']
      }
    ]
  };

  console.log('Test Suite Defined:');
  console.log(`  Name: ${testSuite.name}`);
  console.log(`  Description: ${testSuite.description}`);
  console.log(`  Total Tests: ${testSuite.tests.length}`);
  console.log(`  Mode: ${testSuite.mode?.default}\n`);

  console.log('Test Cases:');
  testSuite.tests.forEach((test, index) => {
    console.log(`  ${index + 1}. ${test.name}`);
    console.log(`     Expected: ${test.expected.action}`);
    console.log(`     Tags: ${test.tags?.join(', ')}`);
  });

  console.log('\n✅ Test Suite Definition Complete!');
  console.log('   - 3 test cases defined');
  console.log('   - Covers tools, permissions, and cost policies');
  console.log('   - Ready to execute with PolicyTester');
  
  return testSuite;
}


/**
 * Example 2: Run Tests with PolicyTester
 * 
 * Shows how to execute test suites using the PolicyTester class
 * and interpret test results.
 * 
 * Use case: Running policy tests in development or CI/CD
 */
async function example2_RunTestsWithPolicyTester() {
  console.log('\n=== Example 2: Run Tests with PolicyTester ===\n');

  // Define a simple test suite
  const testSuite: PolicyTestSuite = {
    name: 'Basic Policy Tests',
    description: 'Simple tests for demonstration',
    policy: {
      tools: {
        'file_delete': { allowed: false },
        'customer_data_read': { allowed: true }
      },
      identity: {
        agentId: 'test-agent',
        role: 'tester',
        permissions: ['read:customer_data']
      }
    },
    mode: {
      default: PolicyMode.ENFORCE
    },
    tests: [
      {
        name: 'Deny file deletion',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED]
        },
        tags: ['security']
      },
      {
        name: 'Allow data read',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'customer_data_read',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW,
          reason_codes: [ReasonCode.POLICY_COMPLIANT]
        },
        tags: ['security']
      }
    ]
  };

  console.log('Initializing PolicyTester...');
  
  // Initialize TealEngine with test policy
  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  
  // Create PolicyTester instance
  const tester = new PolicyTester(engine);

  console.log('Running test suite...\n');

  // Run the test suite
  const startTime = Date.now();
  const report: PolicyTestReport = tester.runSuite(testSuite);
  const duration = Date.now() - startTime;

  console.log('Test Results:');
  console.log(`  Total Tests: ${report.total}`);
  console.log(`  Passed: ${report.passed} ✅`);
  console.log(`  Failed: ${report.failed} ${report.failed > 0 ? '❌' : ''}`);
  console.log(`  Success Rate: ${(report.success_rate * 100).toFixed(1)}%`);
  console.log(`  Execution Time: ${duration}ms\n`);

  // Display individual test results
  console.log('Individual Test Results:');
  report.results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${index + 1}. ${result.name}: ${status}`);
    console.log(`     Actual: ${result.actual.action}`);
    console.log(`     Expected: ${result.expected.action}`);
    if (!result.passed && result.failure_reason) {
      console.log(`     Failure: ${result.failure_reason}`);
    }
    console.log(`     Time: ${result.execution_time}ms`);
  });

  // Display coverage information
  if (report.coverage) {
    console.log('\nPolicy Coverage:');
    console.log(`  Total Policies: ${report.coverage.total_policies}`);
    console.log(`  Tested Policies: ${report.coverage.tested_policies}`);
    console.log(`  Coverage: ${report.coverage.coverage_percentage.toFixed(1)}%`);
    if (report.coverage.untested_policies.length > 0) {
      console.log(`  Untested: ${report.coverage.untested_policies.join(', ')}`);
    }
  }

  console.log('\n✅ PolicyTester Execution Complete!');
  console.log('   - All tests executed successfully');
  console.log('   - Results include pass/fail status');
  console.log('   - Coverage metrics calculated');
  
  return report;
}


/**
 * Example 3: Use Starter Test Corpora
 * 
 * Shows how to use pre-built test suites from TestCorpora for
 * common security scenarios.
 * 
 * Use case: Quick security validation with comprehensive test coverage
 */
async function example3_UseStarterTestCorpora() {
  console.log('\n=== Example 3: Use Starter Test Corpora ===\n');

  console.log('Available Test Corpora:');
  console.log('  1. Prompt Injection Detection (20+ attack vectors)');
  console.log('  2. PII Detection (SSN, credit cards, emails, phones)');
  console.log('  3. Unsafe Code Detection (eval, exec, system commands)');
  console.log('  4. Tool Misuse Detection (unauthorized access, injection)');
  console.log('  5. Cost Limits (budget enforcement, rate limits)\n');

  // Example 3.1: Prompt Injection Tests
  console.log('━━━ Running Prompt Injection Tests ━━━\n');
  
  const promptInjectionSuite = TestCorpora.promptInjection();
  console.log(`Suite: ${promptInjectionSuite.name}`);
  console.log(`Description: ${promptInjectionSuite.description}`);
  console.log(`Total Tests: ${promptInjectionSuite.tests.length}\n`);

  const engine1 = new TealEngine(promptInjectionSuite.policy, promptInjectionSuite.mode);
  const tester1 = new PolicyTester(engine1);
  const report1 = tester1.runSuite(promptInjectionSuite);

  console.log(`Results: ${report1.passed}/${report1.total} passed (${(report1.success_rate * 100).toFixed(1)}%)`);
  console.log(`Failed Tests: ${report1.failed}`);
  
  // Show sample failed tests
  const failedTests = report1.results.filter(r => !r.passed).slice(0, 3);
  if (failedTests.length > 0) {
    console.log('\nSample Failed Tests:');
    failedTests.forEach(test => {
      console.log(`  - ${test.name}`);
      console.log(`    Reason: ${test.failure_reason}`);
    });
  }

  // Example 3.2: PII Detection Tests
  console.log('\n━━━ Running PII Detection Tests ━━━\n');
  
  const piiSuite = TestCorpora.piiDetection();
  console.log(`Suite: ${piiSuite.name}`);
  console.log(`Description: ${piiSuite.description}`);
  console.log(`Total Tests: ${piiSuite.tests.length}\n`);

  const engine2 = new TealEngine(piiSuite.policy, piiSuite.mode);
  const tester2 = new PolicyTester(engine2);
  const report2 = tester2.runSuite(piiSuite);

  console.log(`Results: ${report2.passed}/${report2.total} passed (${(report2.success_rate * 100).toFixed(1)}%)`);

  // Example 3.3: Unsafe Code Tests
  console.log('\n━━━ Running Unsafe Code Detection Tests ━━━\n');
  
  const unsafeCodeSuite = TestCorpora.unsafeCode();
  console.log(`Suite: ${unsafeCodeSuite.name}`);
  console.log(`Description: ${unsafeCodeSuite.description}`);
  console.log(`Total Tests: ${unsafeCodeSuite.tests.length}\n`);

  const engine3 = new TealEngine(unsafeCodeSuite.policy, unsafeCodeSuite.mode);
  const tester3 = new PolicyTester(engine3);
  const report3 = tester3.runSuite(unsafeCodeSuite);

  console.log(`Results: ${report3.passed}/${report3.total} passed (${(report3.success_rate * 100).toFixed(1)}%)`);

  // Example 3.4: Tool Misuse Tests
  console.log('\n━━━ Running Tool Misuse Detection Tests ━━━\n');
  
  const toolMisuseSuite = TestCorpora.toolMisuse();
  console.log(`Suite: ${toolMisuseSuite.name}`);
  console.log(`Description: ${toolMisuseSuite.description}`);
  console.log(`Total Tests: ${toolMisuseSuite.tests.length}\n`);

  const engine4 = new TealEngine(toolMisuseSuite.policy, toolMisuseSuite.mode);
  const tester4 = new PolicyTester(engine4);
  const report4 = tester4.runSuite(toolMisuseSuite);

  console.log(`Results: ${report4.passed}/${report4.total} passed (${(report4.success_rate * 100).toFixed(1)}%)`);

  // Example 3.5: Cost Limits Tests
  console.log('\n━━━ Running Cost Limits Tests ━━━\n');
  
  const costLimitsSuite = TestCorpora.costLimits();
  console.log(`Suite: ${costLimitsSuite.name}`);
  console.log(`Description: ${costLimitsSuite.description}`);
  console.log(`Total Tests: ${costLimitsSuite.tests.length}\n`);

  const engine5 = new TealEngine(costLimitsSuite.policy, costLimitsSuite.mode);
  const tester5 = new PolicyTester(engine5);
  const report5 = tester5.runSuite(costLimitsSuite);

  console.log(`Results: ${report5.passed}/${report5.total} passed (${(report5.success_rate * 100).toFixed(1)}%)`);

  // Summary
  console.log('\n✅ Test Corpora Summary:');
  console.log(`   - Prompt Injection: ${report1.passed}/${report1.total} passed`);
  console.log(`   - PII Detection: ${report2.passed}/${report2.total} passed`);
  console.log(`   - Unsafe Code: ${report3.passed}/${report3.total} passed`);
  console.log(`   - Tool Misuse: ${report4.passed}/${report4.total} passed`);
  console.log(`   - Cost Limits: ${report5.passed}/${report5.total} passed`);
  console.log(`   - Total: ${report1.total + report2.total + report3.total + report4.total + report5.total} tests`);
}


/**
 * Example 4: Export Test Reports
 * 
 * Shows how to export test reports in different formats:
 * - JSON format for programmatic processing
 * - JUnit XML format for CI/CD integration
 * 
 * Use case: Integrating test results with CI/CD pipelines
 */
async function example4_ExportTestReports() {
  console.log('\n=== Example 4: Export Test Reports ===\n');

  // Run a test suite
  const testSuite: PolicyTestSuite = {
    name: 'Export Demo Tests',
    description: 'Tests for demonstrating report export',
    policy: {
      tools: {
        'file_delete': { allowed: false },
        'customer_data_read': { allowed: true }
      }
    },
    mode: {
      default: PolicyMode.ENFORCE
    },
    tests: [
      {
        name: 'Test 1',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY
        }
      },
      {
        name: 'Test 2',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'customer_data_read',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW
        }
      }
    ]
  };

  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  const tester = new PolicyTester(engine);
  const report = tester.runSuite(testSuite);

  console.log('Test execution complete. Exporting reports...\n');

  // Export 1: JSON Format
  console.log('━━━ JSON Format Export ━━━\n');
  
  const jsonReport = JSON.stringify(report, null, 2);
  const jsonPath = path.join(__dirname, '../test-results/policy-tests.json');
  
  // Ensure directory exists
  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(jsonPath, jsonReport);
  
  console.log('JSON Report Structure:');
  console.log('  {');
  console.log('    "timestamp": "2024-02-19T10:30:00.000Z",');
  console.log('    "suite_name": "Export Demo Tests",');
  console.log('    "total": 2,');
  console.log('    "passed": 2,');
  console.log('    "failed": 0,');
  console.log('    "success_rate": 1.0,');
  console.log('    "results": [...]');
  console.log('  }');
  console.log(`\n✅ JSON report saved to: ${jsonPath}\n`);

  // Export 2: JUnit XML Format
  console.log('━━━ JUnit XML Format Export ━━━\n');
  
  const junitXml = generateJUnitXML(report);
  const xmlPath = path.join(__dirname, '../test-results/policy-tests.xml');
  
  fs.writeFileSync(xmlPath, junitXml);
  
  console.log('JUnit XML Report Structure:');
  console.log('  <?xml version="1.0" encoding="UTF-8"?>');
  console.log('  <testsuites>');
  console.log('    <testsuite name="..." tests="2" failures="0" time="0.123">');
  console.log('      <testcase name="Test 1" classname="..." time="0.050"/>');
  console.log('      <testcase name="Test 2" classname="..." time="0.073"/>');
  console.log('    </testsuite>');
  console.log('  </testsuites>');
  console.log(`\n✅ JUnit XML report saved to: ${xmlPath}\n`);

  console.log('✅ Report Export Complete!');
  console.log('   - JSON format: For programmatic processing');
  console.log('   - JUnit XML: For CI/CD integration (Jenkins, GitHub Actions, etc.)');
  console.log('   - Both formats include full test results and metadata');
}

/**
 * Helper function to generate JUnit XML format
 */
function generateJUnitXML(report: PolicyTestReport): string {
  const totalTime = (report.total_time / 1000).toFixed(3);
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<testsuites>\n';
  xml += `  <testsuite name="${escapeXml(report.suite_name)}" `;
  xml += `tests="${report.total}" `;
  xml += `failures="${report.failed}" `;
  xml += `skipped="${report.skipped}" `;
  xml += `time="${totalTime}" `;
  xml += `timestamp="${report.timestamp}">\n`;

  for (const result of report.results) {
    const testTime = (result.execution_time / 1000).toFixed(3);
    xml += `    <testcase name="${escapeXml(result.name)}" `;
    xml += `classname="${escapeXml(report.suite_name)}" `;
    xml += `time="${testTime}">\n`;

    if (!result.passed) {
      xml += `      <failure message="${escapeXml(result.failure_reason || 'Test failed')}">\n`;
      xml += `Expected: ${escapeXml(JSON.stringify(result.expected))}\n`;
      xml += `Actual: ${escapeXml(JSON.stringify(result.actual))}\n`;
      xml += `      </failure>\n`;
    }

    xml += `    </testcase>\n`;
  }

  xml += '  </testsuite>\n';
  xml += '</testsuites>\n';

  return xml;
}

/**
 * Helper function to escape XML special characters
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
 * Example 5: CLI Usage for CI/CD Integration
 * 
 * Shows how to use the TealTiger CLI for running policy tests
 * in CI/CD pipelines.
 * 
 * Use case: Automated policy testing in continuous integration
 */
async function example5_CLIUsageForCICD() {
  console.log('\n=== Example 5: CLI Usage for CI/CD Integration ===\n');

  console.log('TealTiger CLI - Policy Testing Commands\n');

  console.log('━━━ Basic Usage ━━━\n');
  console.log('# Run tests from a single file');
  console.log('$ npx tealtiger test ./policies/customer-support.test.json\n');
  
  console.log('# Run tests from multiple files');
  console.log('$ npx tealtiger test ./policies/*.test.json\n');
  
  console.log('# Run tests from a directory');
  console.log('$ npx tealtiger test ./policies/\n');

  console.log('━━━ Output Formats ━━━\n');
  console.log('# Export to JSON');
  console.log('$ npx tealtiger test ./policies/*.test.json --format=json --output=./results.json\n');
  
  console.log('# Export to JUnit XML (for CI/CD)');
  console.log('$ npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml\n');

  console.log('━━━ Filtering Tests ━━━\n');
  console.log('# Run only tests with specific tags');
  console.log('$ npx tealtiger test ./policies/*.test.json --tags=security,critical\n');
  
  console.log('# Run tests matching a pattern');
  console.log('$ npx tealtiger test ./policies/*.test.json --grep="file deletion"\n');

  console.log('━━━ Coverage Reports ━━━\n');
  console.log('# Generate coverage report');
  console.log('$ npx tealtiger test ./policies/*.test.json --coverage\n');
  
  console.log('# Set minimum coverage threshold (fail if below)');
  console.log('$ npx tealtiger test ./policies/*.test.json --coverage --min-coverage=80\n');

  console.log('━━━ Watch Mode ━━━\n');
  console.log('# Watch for changes and re-run tests');
  console.log('$ npx tealtiger test ./policies/*.test.json --watch\n');

  console.log('━━━ CI/CD Integration Examples ━━━\n');

  // GitHub Actions Example
  console.log('1. GitHub Actions (.github/workflows/policy-tests.yml):\n');
  console.log('```yaml');
  console.log('name: Policy Tests');
  console.log('on: [push, pull_request]');
  console.log('');
  console.log('jobs:');
  console.log('  test:');
  console.log('    runs-on: ubuntu-latest');
  console.log('    steps:');
  console.log('      - uses: actions/checkout@v3');
  console.log('      - uses: actions/setup-node@v3');
  console.log('        with:');
  console.log('          node-version: 18');
  console.log('      - run: npm install');
  console.log('      - run: npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml');
  console.log('      - uses: actions/upload-artifact@v3');
  console.log('        if: always()');
  console.log('        with:');
  console.log('          name: test-results');
  console.log('          path: results.xml');
  console.log('```\n');

  // Jenkins Example
  console.log('2. Jenkins (Jenkinsfile):\n');
  console.log('```groovy');
  console.log('pipeline {');
  console.log('  agent any');
  console.log('  stages {');
  console.log('    stage(\'Policy Tests\') {');
  console.log('      steps {');
  console.log('        sh \'npm install\'');
  console.log('        sh \'npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml\'');
  console.log('      }');
  console.log('    }');
  console.log('  }');
  console.log('  post {');
  console.log('    always {');
  console.log('      junit \'results.xml\'');
  console.log('    }');
  console.log('  }');
  console.log('}');
  console.log('```\n');

  // GitLab CI Example
  console.log('3. GitLab CI (.gitlab-ci.yml):\n');
  console.log('```yaml');
  console.log('policy-tests:');
  console.log('  stage: test');
  console.log('  image: node:18');
  console.log('  script:');
  console.log('    - npm install');
  console.log('    - npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml');
  console.log('  artifacts:');
  console.log('    when: always');
  console.log('    reports:');
  console.log('      junit: results.xml');
  console.log('```\n');

  // npm scripts Example
  console.log('4. npm scripts (package.json):\n');
  console.log('```json');
  console.log('{');
  console.log('  "scripts": {');
  console.log('    "test:policies": "tealtiger test ./policies/*.test.json",');
  console.log('    "test:policies:ci": "tealtiger test ./policies/*.test.json --format=junit --output=./results.xml",');
  console.log('    "test:policies:watch": "tealtiger test ./policies/*.test.json --watch",');
  console.log('    "test:policies:coverage": "tealtiger test ./policies/*.test.json --coverage --min-coverage=80"');
  console.log('  }');
  console.log('}');
  console.log('```\n');

  console.log('✅ CLI Integration Benefits:');
  console.log('   - Zero-config policy testing');
  console.log('   - Standard exit codes (0 = pass, 1 = fail)');
  console.log('   - JUnit XML for CI/CD integration');
  console.log('   - Coverage enforcement');
  console.log('   - Watch mode for development');
}


/**
 * Example 6: Test Assertions
 * 
 * Shows different types of test assertions:
 * - Action assertions (ALLOW, DENY, etc.)
 * - Reason code assertions
 * - Risk score range assertions
 * - Mode assertions
 * 
 * Use case: Comprehensive policy validation
 */
async function example6_TestAssertions() {
  console.log('\n=== Example 6: Test Assertions ===\n');

  const testSuite: PolicyTestSuite = {
    name: 'Assertion Examples',
    description: 'Demonstrates different assertion types',
    policy: {
      tools: {
        'file_delete': { allowed: false },
        'customer_data_read': { allowed: true }
      },
      content: {
        pii: {
          enabled: true,
          blockedTypes: ['ssn', 'credit_card'],
          redactInLogs: true
        }
      }
    },
    mode: {
      default: PolicyMode.ENFORCE
    },
    tests: [
      // Assertion 1: Action only
      {
        name: 'Assert action only',
        description: 'Only checks the decision action',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY
          // No reason_codes or risk_score_range specified
        },
        tags: ['assertion', 'action']
      },

      // Assertion 2: Action + Reason Codes
      {
        name: 'Assert action and reason codes',
        description: 'Checks action and specific reason codes',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED]
        },
        tags: ['assertion', 'action', 'reason-codes']
      },

      // Assertion 3: Action + Risk Score Range
      {
        name: 'Assert action and risk score range',
        description: 'Checks action and risk score within range',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          risk_score_range: { min: 70, max: 100 }
        },
        tags: ['assertion', 'action', 'risk-score']
      },

      // Assertion 4: Action + Reason Codes + Risk Score
      {
        name: 'Assert action, reason codes, and risk score',
        description: 'Comprehensive assertion with all fields',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
          risk_score_range: { min: 70, max: 100 }
        },
        tags: ['assertion', 'comprehensive']
      },

      // Assertion 5: Mode Assertion
      {
        name: 'Assert evaluation mode',
        description: 'Checks that correct mode was used',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'customer_data_read',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW,
          mode: PolicyMode.ENFORCE
        },
        tags: ['assertion', 'mode']
      },

      // Assertion 6: Multiple Reason Codes
      {
        name: 'Assert multiple reason codes',
        description: 'Checks for multiple expected reason codes',
        context: {
          agentId: 'test-agent',
          action: 'chat.create',
          content: 'My SSN is 123-45-6789 and credit card is 4532-1234-5678-9010',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.PII_DETECTED]
        },
        tags: ['assertion', 'multiple-reasons']
      }
    ]
  };

  console.log('Running assertion tests...\n');

  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  const tester = new PolicyTester(engine);
  const report = tester.runSuite(testSuite);

  console.log('Assertion Test Results:\n');

  report.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.name}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Expected Action: ${result.expected.action}`);
    console.log(`   Actual Action: ${result.actual.action}`);
    
    if (result.expected.reason_codes) {
      console.log(`   Expected Reason Codes: ${result.expected.reason_codes.join(', ')}`);
      console.log(`   Actual Reason Codes: ${result.actual.reason_codes?.join(', ') || 'none'}`);
    }
    
    if (result.expected.risk_score_range) {
      console.log(`   Expected Risk Score: ${result.expected.risk_score_range.min}-${result.expected.risk_score_range.max}`);
      console.log(`   Actual Risk Score: ${result.actual.risk_score}`);
    }
    
    if (result.expected.mode) {
      console.log(`   Expected Mode: ${result.expected.mode}`);
      console.log(`   Actual Mode: ${result.actual.mode}`);
    }
    
    if (!result.passed) {
      console.log(`   ❌ Failure: ${result.failure_reason}`);
    }
    console.log('');
  });

  console.log('✅ Assertion Types Demonstrated:');
  console.log('   - Action-only assertions (simplest)');
  console.log('   - Action + reason codes (specific violations)');
  console.log('   - Action + risk score range (risk-based)');
  console.log('   - Comprehensive assertions (all fields)');
  console.log('   - Mode assertions (verify enforcement level)');
  console.log('   - Multiple reason codes (complex scenarios)');
}


/**
 * Example 7: Coverage Calculation and Reporting
 * 
 * Shows how to track and report policy coverage to ensure
 * all policies are tested.
 * 
 * Use case: Ensuring comprehensive test coverage
 */
async function example7_CoverageCalculation() {
  console.log('\n=== Example 7: Coverage Calculation and Reporting ===\n');

  // Define a policy with multiple rules
  const comprehensivePolicy = {
    tools: {
      'file_delete': { allowed: false },
      'file_read': { allowed: true },
      'database_write': { allowed: false },
      'database_read': { allowed: true },
      'api_call': { allowed: true, rateLimit: { max: 100, window: '1h' } }
    },
    identity: {
      agentId: 'test-agent',
      role: 'developer',
      permissions: ['read:data', 'write:logs']
    },
    codeExecution: {
      allowedLanguages: ['python', 'javascript'],
      blockedFunctions: ['eval', 'exec'],
      maxLength: 10000,
      requireSandbox: true
    },
    behavioral: {
      costLimit: {
        daily: 100.00,
        hourly: 10.00
      },
      rateLimit: {
        requests: 1000,
        window: '1h'
      }
    },
    content: {
      pii: {
        enabled: true,
        blockedTypes: ['ssn', 'credit_card'],
        redactInLogs: true
      }
    }
  };

  // Test suite with partial coverage
  const testSuite: PolicyTestSuite = {
    name: 'Coverage Demo Tests',
    description: 'Tests demonstrating coverage tracking',
    policy: comprehensivePolicy,
    mode: {
      default: PolicyMode.ENFORCE
    },
    tests: [
      // Only testing some policies
      {
        name: 'Test file_delete',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_delete',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY
        }
      },
      {
        name: 'Test file_read',
        context: {
          agentId: 'test-agent',
          action: 'tool.execute',
          tool: 'file_read',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW
        }
      },
      {
        name: 'Test PII detection',
        context: {
          agentId: 'test-agent',
          action: 'chat.create',
          content: 'SSN: 123-45-6789',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.PII_DETECTED]
        }
      }
      // Note: Not testing database_write, database_read, api_call, codeExecution, behavioral
    ]
  };

  console.log('Running tests with coverage tracking...\n');

  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  const tester = new PolicyTester(engine);
  const report = tester.runSuite(testSuite);

  console.log('Test Results:');
  console.log(`  Total Tests: ${report.total}`);
  console.log(`  Passed: ${report.passed}`);
  console.log(`  Failed: ${report.failed}\n`);

  // Display coverage information
  if (report.coverage) {
    console.log('━━━ Policy Coverage Report ━━━\n');
    
    console.log('Coverage Summary:');
    console.log(`  Total Policies: ${report.coverage.total_policies}`);
    console.log(`  Tested Policies: ${report.coverage.tested_policies}`);
    console.log(`  Coverage Percentage: ${report.coverage.coverage_percentage.toFixed(1)}%\n`);

    // Coverage visualization
    const coverageBar = generateCoverageBar(report.coverage.coverage_percentage);
    console.log(`  ${coverageBar}\n`);

    // Tested policies
    console.log('✅ Tested Policies:');
    const testedPolicies = [
      'tools.file_delete',
      'tools.file_read',
      'content.pii'
    ];
    testedPolicies.forEach(policy => {
      console.log(`   - ${policy}`);
    });

    // Untested policies
    if (report.coverage.untested_policies.length > 0) {
      console.log('\n⚠️  Untested Policies:');
      report.coverage.untested_policies.forEach(policy => {
        console.log(`   - ${policy}`);
      });
    }

    // Coverage recommendations
    console.log('\n📊 Coverage Recommendations:');
    if (report.coverage.coverage_percentage < 50) {
      console.log('   ❌ Coverage is LOW (< 50%)');
      console.log('   → Add tests for untested policies');
      console.log('   → Aim for at least 80% coverage');
    } else if (report.coverage.coverage_percentage < 80) {
      console.log('   ⚠️  Coverage is MODERATE (50-80%)');
      console.log('   → Add tests for critical untested policies');
      console.log('   → Target 80%+ for production readiness');
    } else {
      console.log('   ✅ Coverage is GOOD (80%+)');
      console.log('   → Maintain coverage with new tests');
      console.log('   → Consider edge case testing');
    }
  }

  console.log('\n✅ Coverage Tracking Benefits:');
  console.log('   - Identifies untested policies');
  console.log('   - Ensures comprehensive validation');
  console.log('   - Prevents policy blind spots');
  console.log('   - Supports compliance requirements');
}

/**
 * Helper function to generate coverage bar visualization
 */
function generateCoverageBar(percentage: number): string {
  const barLength = 40;
  const filled = Math.round((percentage / 100) * barLength);
  const empty = barLength - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = percentage >= 80 ? '✅' : percentage >= 50 ? '⚠️' : '❌';
  
  return `${color} [${bar}] ${percentage.toFixed(1)}%`;
}


/**
 * Example 8: Complete Integration Example
 * 
 * Shows a complete end-to-end policy testing workflow:
 * - Define custom policies
 * - Create test suite
 * - Run tests
 * - Export reports
 * - Integrate with CI/CD
 * 
 * Use case: Production-ready policy testing setup
 */
async function example8_CompleteIntegration() {
  console.log('\n=== Example 8: Complete Integration Example ===\n');

  console.log('Setting up complete policy testing workflow...\n');

  // Step 1: Define production policies
  console.log('━━━ Step 1: Define Production Policies ━━━\n');
  
  const productionPolicy = {
    tools: {
      'file_delete': { allowed: false },
      'database_write': { allowed: false },
      'customer_data_read': { allowed: true, maxRows: 100 },
      'send_email': { allowed: true, rateLimit: { max: 50, window: '1h' } }
    },
    identity: {
      agentId: 'prod-agent-001',
      role: 'customer-support',
      permissions: ['read:customer_data', 'send:email']
    },
    content: {
      pii: {
        enabled: true,
        blockedTypes: ['ssn', 'credit_card', 'email'],
        redactInLogs: true
      },
      moderation: {
        enabled: true,
        threshold: 0.8,
        categories: ['hate', 'violence', 'sexual']
      }
    },
    behavioral: {
      costLimit: {
        daily: 100.00,
        hourly: 10.00
      },
      rateLimit: {
        requests: 1000,
        window: '1h'
      }
    }
  };

  console.log('✅ Production policies defined');
  console.log('   - Tool restrictions');
  console.log('   - Identity and permissions');
  console.log('   - Content moderation and PII detection');
  console.log('   - Cost and rate limits\n');

  // Step 2: Create comprehensive test suite
  console.log('━━━ Step 2: Create Test Suite ━━━\n');
  
  const testSuite: PolicyTestSuite = {
    name: 'Production Policy Validation',
    description: 'Comprehensive tests for production policies',
    policy: productionPolicy,
    mode: {
      default: PolicyMode.ENFORCE
    },
    tests: [
      // Critical security tests
      {
        name: 'Block file deletion',
        description: 'Critical: Prevent data loss',
        context: {
          agentId: 'prod-agent-001',
          action: 'tool.execute',
          tool: 'file_delete',
          toolParams: { path: '/data/customer.db' },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
          risk_score_range: { min: 80, max: 100 }
        },
        tags: ['security', 'critical', 'tools']
      },
      {
        name: 'Block database writes',
        description: 'Critical: Prevent unauthorized data modification',
        context: {
          agentId: 'prod-agent-001',
          action: 'tool.execute',
          tool: 'database_write',
          toolParams: { table: 'customers', data: {} },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
          risk_score_range: { min: 80, max: 100 }
        },
        tags: ['security', 'critical', 'database']
      },
      // PII detection tests
      {
        name: 'Detect SSN in content',
        description: 'PII: Block SSN disclosure',
        context: {
          agentId: 'prod-agent-001',
          action: 'chat.create',
          content: 'Customer SSN: 123-45-6789',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.PII_DETECTED],
          risk_score_range: { min: 75, max: 100 }
        },
        tags: ['security', 'pii', 'critical']
      },
      // Allowed operations
      {
        name: 'Allow customer data read',
        description: 'Normal: Permit authorized data access',
        context: {
          agentId: 'prod-agent-001',
          action: 'tool.execute',
          tool: 'customer_data_read',
          toolParams: { customerId: '12345' },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW,
          reason_codes: [ReasonCode.POLICY_COMPLIANT],
          risk_score_range: { min: 0, max: 30 }
        },
        tags: ['security', 'tools', 'allowed']
      },
      // Cost limit tests
      {
        name: 'Block excessive cost',
        description: 'Cost: Prevent budget overrun',
        context: {
          agentId: 'prod-agent-001',
          action: 'chat.create',
          model: 'gpt-4',
          content: 'Very long prompt...',
          cost: 15.00,
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.COST_BUDGET_EXCEEDED],
          risk_score_range: { min: 60, max: 90 }
        },
        tags: ['cost', 'budget']
      }
    ]
  };

  console.log('✅ Test suite created');
  console.log(`   - ${testSuite.tests.length} test cases`);
  console.log('   - Covers critical security scenarios');
  console.log('   - Includes PII, tools, and cost tests\n');

  // Step 3: Run tests
  console.log('━━━ Step 3: Run Tests ━━━\n');
  
  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  const tester = new PolicyTester(engine);
  
  const startTime = Date.now();
  const report = tester.runSuite(testSuite);
  const duration = Date.now() - startTime;

  console.log('Test Execution Results:');
  console.log(`  Total: ${report.total}`);
  console.log(`  Passed: ${report.passed} ✅`);
  console.log(`  Failed: ${report.failed} ${report.failed > 0 ? '❌' : ''}`);
  console.log(`  Success Rate: ${(report.success_rate * 100).toFixed(1)}%`);
  console.log(`  Duration: ${duration}ms\n`);

  // Step 4: Export reports
  console.log('━━━ Step 4: Export Reports ━━━\n');
  
  // Create output directory
  const outputDir = path.join(__dirname, '../test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Export JSON
  const jsonPath = path.join(outputDir, 'production-policy-tests.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`✅ JSON report: ${jsonPath}`);

  // Export JUnit XML
  const xmlPath = path.join(outputDir, 'production-policy-tests.xml');
  fs.writeFileSync(xmlPath, generateJUnitXML(report));
  console.log(`✅ JUnit XML report: ${xmlPath}\n`);

  // Step 5: Coverage analysis
  console.log('━━━ Step 5: Coverage Analysis ━━━\n');
  
  if (report.coverage) {
    console.log(`Coverage: ${report.coverage.coverage_percentage.toFixed(1)}%`);
    console.log(`Tested: ${report.coverage.tested_policies}/${report.coverage.total_policies} policies\n`);
  }

  // Step 6: CI/CD integration
  console.log('━━━ Step 6: CI/CD Integration ━━━\n');
  
  console.log('Add to package.json:');
  console.log('{');
  console.log('  "scripts": {');
  console.log('    "test:policies": "tealtiger test ./policies/*.test.json --format=junit --output=./results.xml"');
  console.log('  }');
  console.log('}\n');

  console.log('Add to CI pipeline:');
  console.log('- npm run test:policies');
  console.log('- Upload results.xml as test artifact\n');

  // Final summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Complete Integration Workflow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('Summary:');
  console.log(`  ✅ Policies defined and validated`);
  console.log(`  ✅ ${report.total} tests executed`);
  console.log(`  ✅ ${report.passed} tests passed`);
  console.log(`  ✅ Reports exported (JSON + JUnit XML)`);
  console.log(`  ✅ Coverage tracked: ${report.coverage?.coverage_percentage.toFixed(1)}%`);
  console.log(`  ✅ Ready for CI/CD integration\n`);

  console.log('Next Steps:');
  console.log('  1. Add test suite to version control');
  console.log('  2. Integrate with CI/CD pipeline');
  console.log('  3. Set coverage thresholds (e.g., 80%)');
  console.log('  4. Run tests on every commit');
  console.log('  5. Monitor test results in CI dashboard');
}


/**
 * Best Practices Summary
 */
function printBestPractices() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Policy Testing - Best Practices                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('1. Test Early and Often');
  console.log('   - Write tests before deploying policies');
  console.log('   - Run tests on every policy change');
  console.log('   - Use watch mode during development');
  console.log('   - Integrate with pre-commit hooks\n');

  console.log('2. Use Starter Test Corpora');
  console.log('   - Start with TestCorpora for common scenarios');
  console.log('   - Covers 100+ security test cases out of the box');
  console.log('   - Includes prompt injection, PII, unsafe code, etc.');
  console.log('   - Customize and extend for your use case\n');

  console.log('3. Comprehensive Assertions');
  console.log('   - Assert action (ALLOW, DENY, etc.)');
  console.log('   - Assert reason codes for specificity');
  console.log('   - Assert risk score ranges for risk-based policies');
  console.log('   - Assert mode for rollout validation\n');

  console.log('4. Track Coverage');
  console.log('   - Aim for 80%+ policy coverage');
  console.log('   - Identify untested policies');
  console.log('   - Set minimum coverage thresholds in CI');
  console.log('   - Review coverage reports regularly\n');

  console.log('5. Organize Tests with Tags');
  console.log('   - Tag tests by category (security, cost, tools)');
  console.log('   - Tag by priority (critical, high, medium, low)');
  console.log('   - Filter tests by tags in CI/CD');
  console.log('   - Run critical tests first\n');

  console.log('6. Export Reports for CI/CD');
  console.log('   - Use JUnit XML for CI/CD integration');
  console.log('   - Upload test artifacts for visibility');
  console.log('   - Track test trends over time');
  console.log('   - Set up notifications for failures\n');

  console.log('7. Test in Multiple Modes');
  console.log('   - Test ENFORCE mode for production validation');
  console.log('   - Test MONITOR mode for rollout simulation');
  console.log('   - Test REPORT_ONLY mode for impact analysis');
  console.log('   - Validate mode-specific behavior\n');

  console.log('8. Version Control Test Suites');
  console.log('   - Store test suites in version control');
  console.log('   - Review test changes in pull requests');
  console.log('   - Maintain test history alongside policies');
  console.log('   - Document test rationale\n');

  console.log('9. Fail Fast in CI/CD');
  console.log('   - Run policy tests before deployment');
  console.log('   - Block merges on test failures');
  console.log('   - Require coverage thresholds');
  console.log('   - Automate policy validation\n');

  console.log('10. Regular Test Maintenance');
  console.log('   - Review and update tests quarterly');
  console.log('   - Remove obsolete tests');
  console.log('   - Add tests for new attack vectors');
  console.log('   - Keep test corpora up to date\n');
}

/**
 * Common Pitfalls and Solutions
 */
function printCommonPitfalls() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Common Pitfalls and Solutions                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('❌ Pitfall 1: Testing Only Happy Paths');
  console.log('   ✅ Solution: Test both allowed and denied scenarios');
  console.log('   - Include edge cases and boundary conditions');
  console.log('   - Test malicious inputs and attack vectors');
  console.log('   - Use TestCorpora for comprehensive coverage\n');

  console.log('❌ Pitfall 2: Ignoring Risk Scores');
  console.log('   ✅ Solution: Assert risk score ranges in tests');
  console.log('   - Validate risk-based routing logic');
  console.log('   - Ensure high-risk operations are flagged');
  console.log('   - Test risk score calculation accuracy\n');

  console.log('❌ Pitfall 3: Not Testing Mode Behavior');
  console.log('   ✅ Solution: Test all three modes (ENFORCE, MONITOR, REPORT_ONLY)');
  console.log('   - Verify ENFORCE blocks violations');
  console.log('   - Verify MONITOR logs but allows');
  console.log('   - Verify REPORT_ONLY always allows\n');

  console.log('❌ Pitfall 4: Low Test Coverage');
  console.log('   ✅ Solution: Track and enforce coverage thresholds');
  console.log('   - Set minimum 80% coverage requirement');
  console.log('   - Review untested policies regularly');
  console.log('   - Add tests for new policies immediately\n');

  console.log('❌ Pitfall 5: Manual Test Execution');
  console.log('   ✅ Solution: Automate tests in CI/CD pipeline');
  console.log('   - Run tests on every commit');
  console.log('   - Block deployments on test failures');
  console.log('   - Use JUnit XML for CI integration\n');

  console.log('❌ Pitfall 6: Vague Test Names');
  console.log('   ✅ Solution: Use descriptive, specific test names');
  console.log('   - Good: "Block file deletion for customer data"');
  console.log('   - Bad: "Test 1"');
  console.log('   - Include expected behavior in name\n');

  console.log('❌ Pitfall 7: Not Testing Reason Codes');
  console.log('   ✅ Solution: Assert specific reason codes');
  console.log('   - Verify correct violation detection');
  console.log('   - Ensure actionable error messages');
  console.log('   - Test multiple reason codes when applicable\n');

  console.log('❌ Pitfall 8: Ignoring Test Execution Time');
  console.log('   ✅ Solution: Monitor and optimize test performance');
  console.log('   - Target < 100ms per test');
  console.log('   - Parallelize test execution');
  console.log('   - Optimize policy evaluation logic\n');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TealTiger SDK v1.1.x - Policy Testing Examples               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    await example1_DefineTestSuite();
    await example2_RunTestsWithPolicyTester();
    await example3_UseStarterTestCorpora();
    await example4_ExportTestReports();
    await example5_CLIUsageForCICD();
    await example6_TestAssertions();
    await example7_CoverageCalculation();
    await example8_CompleteIntegration();
    
    printBestPractices();
    printCommonPitfalls();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  All Examples Completed Successfully! ✅                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('Next Steps:');
    console.log('  1. Review the examples above');
    console.log('  2. Create your own test suites');
    console.log('  3. Run tests with: npx tealtiger test ./policies/*.test.json');
    console.log('  4. Integrate with your CI/CD pipeline');
    console.log('  5. Set coverage thresholds (80%+ recommended)');
    console.log('  6. Monitor test results and maintain tests\n');

    console.log('Resources:');
    console.log('  - Documentation: https://docs.tealtiger.ai/testing');
    console.log('  - Test Corpora: TestCorpora.promptInjection(), .piiDetection(), etc.');
    console.log('  - CLI Reference: npx tealtiger test --help');
    console.log('  - GitHub: https://github.com/tealtiger/tealtiger\n');

  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export examples for use in other files
export {
  example1_DefineTestSuite,
  example2_RunTestsWithPolicyTester,
  example3_UseStarterTestCorpora,
  example4_ExportTestReports,
  example5_CLIUsageForCICD,
  example6_TestAssertions,
  example7_CoverageCalculation,
  example8_CompleteIntegration,
  generateJUnitXML,
  escapeXml
};
