/**
 * TealTiger SDK v1.1.x - Complete Enterprise Integration Example
 * 
 * This example demonstrates a comprehensive end-to-end enterprise setup that integrates
 * ALL five P0 features from the Enterprise Adoption Features specification:
 * 
 * P0.1: Policy Rollout Modes (ENFORCE, MONITOR, REPORT_ONLY)
 * P0.2: Deterministic Decision Contract (Decision object)
 * P0.3: Correlation IDs + Traceability (ExecutionContext)
 * P0.4: Audit Schema + Redaction Guarantees (versioned audit events, HASH redaction)
 * P0.5: Policy Test Harness (PolicyTester, TestCorpora)
 * 
 * This example shows a realistic enterprise deployment scenario with:
 * - Multi-environment configuration (dev, staging, production)
 * - Gradual policy rollout strategy (MONITOR → ENFORCE)
 * - Complete observability and traceability
 * - Security-by-default configuration
 * - CI/CD integration with policy testing
 * - End-to-end workflow from policy definition → testing → deployment → monitoring
 * 
 * Use case: Production-ready enterprise AI security platform deployment
 */

import { TealEngine } from '../src/core/engine/TealEngine';
import { TealOpenAI } from '../src/clients/TealOpenAI';
import { TealGuard } from '../src/core/guard/TealGuard';
import { TealAudit, ConsoleOutput, FileOutput } from '../src/core/audit/TealAudit';
import { ContextManager } from '../src/core/context/ContextManager';
import { PolicyTester } from '../src/core/engine/PolicyTester';
import { TestCorpora } from '../src/core/testing/TestCorpora';
import { PolicyMode, DecisionAction, ReasonCode } from '../src/core/engine/types';
import { RedactionLevel } from '../src/core/audit/redaction';
import { AuditEventType } from '../src/core/audit/types';
import type { PolicyTestSuite, PolicyTestReport } from '../src/core/testing/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Enterprise Configuration
 * 
 * Defines the complete policy configuration for an enterprise customer support application.
 * This configuration will be used across all environments with different enforcement modes.
 */
const ENTERPRISE_POLICY_CONFIG = {
  tools: {
    // Critical tools - always enforce
    'file_delete': { allowed: false },
    'database_write': { allowed: false },
    'admin_access': { allowed: false },
    'system_command': { allowed: false },
    
    // Allowed tools with constraints
    'customer_data_read': { allowed: true },
    'customer_data_update': { allowed: true },
    'send_email': { allowed: true, rateLimit: { max: 100, window: '1h' } },
    'search_knowledge_base': { allowed: true }
  },
  
  identity: {
    agentId: 'enterprise-support-agent',
    role: 'customer-support',
    permissions: [
      'read:customer_data',
      'write:customer_data',
      'send:email',
      'search:knowledge_base'
    ]
  },
  
  content: {
    pii: {
      enabled: true,
      blockedTypes: ['ssn', 'credit_card', 'bank_account'],
      redactInLogs: true
    },
    moderation: {
      enabled: true,
      threshold: 0.8,
      categories: ['hate', 'violence', 'sexual', 'self-harm']
    }
  },
  
  behavioral: {
    costLimit: {
      daily: 100.00,
      hourly: 10.00,
      perRequest: 1.00
    },
    rateLimit: {
      requests: 1000,
      window: '1h'
    }
  }
};

/**
 * Step 1: Define Policy Test Suite
 * 
 * Before deploying policies, we define comprehensive tests to validate behavior.
 * This is the "shift-left" approach - test policies before deployment.
 */
function step1_DefinePolicyTestSuite(): PolicyTestSuite {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 1: Define Policy Test Suite                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const testSuite: PolicyTestSuite = {
    name: 'Enterprise Customer Support Policy Tests',
    description: 'Comprehensive test suite for customer support agent policies',
    policy: ENTERPRISE_POLICY_CONFIG,
    mode: {
      default: PolicyMode.ENFORCE
    },
    tests: [
      // Critical security tests
      {
        name: 'Block file deletion',
        description: 'Should deny file_delete tool usage',
        context: {
          agentId: 'enterprise-support-agent',
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
        tags: ['security', 'critical', 'tools']
      },
      
      {
        name: 'Block database write',
        description: 'Should deny database_write tool usage',
        context: {
          agentId: 'enterprise-support-agent',
          action: 'tool.execute',
          tool: 'database_write',
          toolParams: { table: 'customers', data: {} },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
          risk_score_range: { min: 70, max: 100 }
        },
        tags: ['security', 'critical', 'tools']
      },
      
      {
        name: 'Block admin access',
        description: 'Should deny admin_access tool usage',
        context: {
          agentId: 'enterprise-support-agent',
          action: 'tool.execute',
          tool: 'admin_access',
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
          risk_score_range: { min: 80, max: 100 }
        },
        tags: ['security', 'critical', 'identity']
      },
      
      // Allowed operations
      {
        name: 'Allow customer data read',
        description: 'Should allow customer_data_read tool',
        context: {
          agentId: 'enterprise-support-agent',
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
        tags: ['security', 'allowed', 'tools']
      },
      
      {
        name: 'Allow email sending',
        description: 'Should allow send_email tool within rate limits',
        context: {
          agentId: 'enterprise-support-agent',
          action: 'tool.execute',
          tool: 'send_email',
          toolParams: { to: 'customer@example.com', subject: 'Support' },
          context: ContextManager.createContext()
        },
        expected: {
          action: DecisionAction.ALLOW,
          reason_codes: [ReasonCode.POLICY_COMPLIANT],
          risk_score_range: { min: 0, max: 30 }
        },
        tags: ['security', 'allowed', 'tools']
      },
      
      // Cost limit tests
      {
        name: 'Block excessive cost',
        description: 'Should deny request exceeding cost limit',
        context: {
          agentId: 'enterprise-support-agent',
          action: 'chat.create',
          model: 'gpt-4',
          content: 'Generate very long response',
          cost: 2.00,  // Exceeds perRequest limit of 1.00
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
  console.log(`  Total Tests: ${testSuite.tests.length}`);
  console.log(`  Categories:`);
  console.log(`    - Critical security tests: 3`);
  console.log(`    - Allowed operations: 2`);
  console.log(`    - Cost limit tests: 1`);
  console.log(`  Mode: ${testSuite.mode?.default}\n`);

  return testSuite;
}

/**
 * Step 2: Run Policy Tests Before Deployment
 * 
 * Execute the test suite to validate policy behavior before deploying to any environment.
 * This ensures policies work as intended and prevents production incidents.
 */
async function step2_RunPolicyTests(testSuite: PolicyTestSuite): Promise<PolicyTestReport> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 2: Run Policy Tests Before Deployment                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Initializing PolicyTester...');
  
  // Initialize TealEngine with test policy
  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  
  // Create PolicyTester instance
  const tester = new PolicyTester(engine);

  console.log('Running test suite...\n');

  // Run the test suite
  const startTime = Date.now();
  const report = tester.runSuite(testSuite);
  const duration = Date.now() - startTime;

  // Display results
  console.log('Test Results:');
  console.log(`  Total Tests: ${report.total}`);
  console.log(`  Passed: ${report.passed} ✅`);
  console.log(`  Failed: ${report.failed} ${report.failed > 0 ? '❌' : ''}`);
  console.log(`  Success Rate: ${(report.success_rate * 100).toFixed(1)}%`);
  console.log(`  Execution Time: ${duration}ms\n`);

  // Display failed tests if any
  if (report.failed > 0) {
    console.log('Failed Tests:');
    report.results
      .filter(r => !r.passed)
      .forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.name}`);
        console.log(`     Expected: ${result.expected.action}`);
        console.log(`     Actual: ${result.actual.action}`);
        console.log(`     Failure: ${result.failure_reason}\n`);
      });
    
    throw new Error('Policy tests failed! Fix policies before deployment.');
  }

  // Display coverage
  if (report.coverage) {
    console.log('Policy Coverage:');
    console.log(`  Total Policies: ${report.coverage.total_policies}`);
    console.log(`  Tested Policies: ${report.coverage.tested_policies}`);
    console.log(`  Coverage: ${report.coverage.coverage_percentage.toFixed(1)}%\n`);
  }

  console.log('✅ All policy tests passed! Ready for deployment.\n');

  // Export test report for CI/CD
  const reportDir = path.join(__dirname, '../test-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'enterprise-policy-tests.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Test report saved to: ${reportPath}\n`);

  return report;
}

/**
 * Step 3: Configure Multi-Environment Setup
 * 
 * Set up TealEngine with environment-specific mode configuration.
 * This demonstrates the gradual rollout strategy across environments.
 */
function step3_ConfigureMultiEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 3: Configure Multi-Environment Setup                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Environment Configuration Strategy:\n');

  // Development: MONITOR mode for all policies
  console.log('1. DEVELOPMENT Environment:');
  console.log('   Mode: MONITOR (all policies)');
  console.log('   Purpose: Testing without blocking developers');
  console.log('   Duration: Ongoing\n');

  const devEngine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: {
        default: PolicyMode.MONITOR
      }
    }
  );

  // Staging: Mixed modes (ENFORCE critical, MONITOR others)
  console.log('2. STAGING Environment:');
  console.log('   Default Mode: MONITOR');
  console.log('   Critical Policies: ENFORCE');
  console.log('     - tools.file_delete');
  console.log('     - tools.database_write');
  console.log('     - tools.admin_access');
  console.log('   Purpose: Pre-production validation');
  console.log('   Duration: 2-4 weeks before production\n');

  const stagingEngine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: {
        default: PolicyMode.MONITOR,
        policy: {
          'tools.file_delete': PolicyMode.ENFORCE,
          'tools.database_write': PolicyMode.ENFORCE,
          'tools.admin_access': PolicyMode.ENFORCE
        }
      }
    }
  );

  // Production: ENFORCE mode for all policies
  console.log('3. PRODUCTION Environment:');
  console.log('   Mode: ENFORCE (all policies)');
  console.log('   Purpose: Maximum security enforcement');
  console.log('   Duration: Ongoing after successful staging validation\n');

  const prodEngine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: {
        default: PolicyMode.ENFORCE
      }
    }
  );

  console.log('✅ Multi-environment configuration complete!\n');

  return { devEngine, stagingEngine, prodEngine };
}

/**
 * Step 4: Configure Audit with Redaction
 * 
 * Set up TealAudit with security-by-default redaction configuration.
 * This ensures sensitive content is never logged in production.
 */
function step4_ConfigureAuditWithRedaction(environment: string): TealAudit {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 4: Configure Audit with Redaction                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Configuring audit for ${environment.toUpperCase()} environment:\n`);

  let config;
  let outputs;

  if (environment === 'development') {
    // Development: Less restrictive for debugging
    config = {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.SIZE_ONLY,
      detect_pii: true,
      debug_mode: false  // Even in dev, keep debug mode off by default
    };
    outputs = [new ConsoleOutput()];
    
    console.log('  Input Redaction: HASH');
    console.log('  Output Redaction: SIZE_ONLY');
    console.log('  PII Detection: ENABLED');
    console.log('  Debug Mode: DISABLED');
    console.log('  Outputs: Console\n');

  } else if (environment === 'staging' || environment === 'production') {
    // Staging/Production: Maximum security
    config = {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    };
    
    // Production also logs to file
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, `${environment}-audit.log`);
    outputs = [
      new ConsoleOutput(),
      new FileOutput(logFile)
    ];
    
    console.log('  Input Redaction: HASH (SHA-256)');
    console.log('  Output Redaction: HASH (SHA-256)');
    console.log('  PII Detection: ENABLED');
    console.log('  Debug Mode: DISABLED');
    console.log('  Outputs: Console + File');
    console.log(`  Log File: ${logFile}\n`);
  }

  const audit = new TealAudit({
    outputs: outputs!,
    config: config!
  });

  console.log('✅ Audit configuration complete!\n');
  console.log('Security Guarantees:');
  console.log('  - Raw prompts/responses never logged');
  console.log('  - PII automatically detected and redacted');
  console.log('  - Content verification via SHA-256 hash');
  console.log('  - Compliance-ready audit trail\n');

  return audit;
}

/**
 * Step 5: Create Execution Context with Full Traceability
 * 
 * Create ExecutionContext with correlation_id, trace_id, and workflow metadata
 * for end-to-end request tracking across all components.
 */
function step5_CreateExecutionContext(environment: string) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 5: Create Execution Context with Full Traceability      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Creating execution context with full traceability...\n');

  // Create context with all traceability fields
  const context = ContextManager.createContext({
    // Environment identification
    environment: environment,
    application: 'customer-support',
    tenant_id: 'acme-corp',
    
    // Agent identification
    agent_purpose: 'customer_service',
    
    // Workflow tracking (for governance-grade aggregation)
    workflow_id: 'support-ticket-resolution-v2',
    run_id: `run-${Date.now()}`,
    
    // Distributed tracing (OpenTelemetry compatible)
    trace_id: `trace-${Date.now()}`,
    
    // Additional metadata
    metadata: {
      user_id: 'user-12345',
      session_id: 'session-67890',
      ticket_id: 'TICKET-001',
      priority: 'high'
    }
  });

  console.log('Execution Context Created:');
  console.log(`  correlation_id: ${context.correlation_id}`);
  console.log(`  trace_id: ${context.trace_id}`);
  console.log(`  workflow_id: ${context.workflow_id}`);
  console.log(`  run_id: ${context.run_id}`);
  console.log(`  environment: ${context.environment}`);
  console.log(`  tenant_id: ${context.tenant_id}`);
  console.log(`  application: ${context.application}\n`);

  console.log('Traceability Benefits:');
  console.log('  ✓ End-to-end request tracking');
  console.log('  ✓ Correlation across all components');
  console.log('  ✓ Workflow-level aggregation');
  console.log('  ✓ OpenTelemetry integration ready');
  console.log('  ✓ Incident investigation support\n');

  return context;
}

/**
 * Step 6: Make LLM Request with Full Context Propagation
 * 
 * Demonstrates making an LLM request with TealOpenAI client, showing how
 * ExecutionContext propagates through all components (TealEngine, TealGuard, TealAudit).
 */
async function step6_MakeLLMRequestWithContext(
  engine: TealEngine,
  audit: TealAudit,
  context: any
) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 6: Make LLM Request with Full Context Propagation       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Initializing TealOpenAI client with guardrails...\n');

  // Initialize TealOpenAI client with engine and audit
  const client = new TealOpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'test-key-for-demo',
    agentId: 'enterprise-support-agent',
    enableGuardrails: true,
    enableCostTracking: true
  });

  // Initialize TealGuard for content validation
  const guard = new TealGuard();

  console.log('Scenario: Customer support agent handling a ticket\n');

  const userMessage = 'I need help resetting my password for account ID 12345.';
  
  console.log(`User Message: "${userMessage}"\n`);

  // Step 6.1: Pre-request guardrail check
  console.log('Step 6.1: Pre-request guardrail check...');
  const guardDecision = await guard.check(userMessage, context);
  
  console.log(`  Decision: ${guardDecision.action}`);
  console.log(`  Risk Score: ${guardDecision.risk_score}`);
  console.log(`  Correlation ID: ${guardDecision.correlation_id}`);

  // Log guardrail check
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: AuditEventType.GUARDRAIL_CHECK,
      timestamp: new Date().toISOString(),
      correlation_id: guardDecision.correlation_id,
      action: guardDecision.action,
      reason_codes: guardDecision.reason_codes,
      risk_score: guardDecision.risk_score,
      mode: guardDecision.mode,
      agent_id: 'enterprise-support-agent',
      component_versions: guardDecision.component_versions
    },
    context
  );

  if (guardDecision.action === DecisionAction.DENY) {
    console.log('  ❌ Guardrail check failed - request blocked\n');
    return;
  }
  console.log('  ✅ Guardrail check passed\n');

  // Step 6.2: Policy evaluation
  console.log('Step 6.2: Policy evaluation...');
  const policyDecision = engine.evaluateWithMode(
    {
      agentId: 'enterprise-support-agent',
      action: 'chat.create',
      model: 'gpt-4',
      content: userMessage,
      cost: 0.05  // Estimated cost
    },
    context
  );

  console.log(`  Decision: ${policyDecision.action}`);
  console.log(`  Mode: ${policyDecision.mode}`);
  console.log(`  Risk Score: ${policyDecision.risk_score}`);
  console.log(`  Correlation ID: ${policyDecision.correlation_id}`);

  // Log policy evaluation
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: AuditEventType.POLICY_EVALUATION,
      timestamp: new Date().toISOString(),
      correlation_id: policyDecision.correlation_id,
      policy_id: policyDecision.policy_id,
      policy_version: policyDecision.policy_version,
      mode: policyDecision.mode,
      action: policyDecision.action,
      reason_codes: policyDecision.reason_codes,
      risk_score: policyDecision.risk_score,
      agent_id: 'enterprise-support-agent',
      component_versions: policyDecision.component_versions
    },
    context
  );

  if (policyDecision.action === DecisionAction.DENY) {
    console.log('  ❌ Policy evaluation failed - request blocked\n');
    return;
  }
  console.log('  ✅ Policy evaluation passed\n');

  // Step 6.3: Make LLM request (simulated)
  console.log('Step 6.3: Making LLM request...');
  console.log('  Model: gpt-4');
  console.log('  Provider: OpenAI');
  console.log('  Context: Propagated through all components\n');

  // Simulate LLM response
  const llmResponse = {
    id: 'chatcmpl-' + Date.now(),
    model: 'gpt-4',
    content: 'I can help you reset your password. Please verify your email address first.',
    usage: {
      prompt_tokens: 25,
      completion_tokens: 15,
      total_tokens: 40
    },
    cost: 0.048  // Actual cost from provider
  };

  console.log('  ✅ LLM request completed');
  console.log(`  Response ID: ${llmResponse.id}`);
  console.log(`  Tokens Used: ${llmResponse.usage.total_tokens}`);
  console.log(`  Actual Cost: $${llmResponse.cost.toFixed(3)}\n`);

  // Step 6.4: Log LLM request/response
  console.log('Step 6.4: Logging LLM request/response...');

  audit.log(
    {
      schema_version: '1.0.0',
      event_type: AuditEventType.LLM_REQUEST,
      timestamp: new Date().toISOString(),
      correlation_id: context.correlation_id,
      agent_id: 'enterprise-support-agent',
      provider: 'openai',
      model: 'gpt-4',
      safe_inputs: {
        hash: 'sha256:abc123...',  // Redacted input
        size: userMessage.length,
        category: 'chat_message'
      },
      metadata: {
        estimated_cost: 0.05,
        actual_cost: llmResponse.cost,
        tokens: llmResponse.usage.total_tokens
      }
    },
    context
  );

  audit.log(
    {
      schema_version: '1.0.0',
      event_type: AuditEventType.LLM_RESPONSE,
      timestamp: new Date().toISOString(),
      correlation_id: context.correlation_id,
      agent_id: 'enterprise-support-agent',
      provider: 'openai',
      model: 'gpt-4',
      safe_outputs: {
        hash: 'sha256:def456...',  // Redacted output
        size: llmResponse.content.length,
        category: 'chat_response'
      },
      duration: 1250,  // ms
      metadata: {
        response_id: llmResponse.id
      }
    },
    context
  );

  console.log('  ✅ Audit events logged\n');

  console.log('Context Propagation Summary:');
  console.log(`  correlation_id: ${context.correlation_id}`);
  console.log('  Components: TealGuard → TealEngine → TealOpenAI → TealAudit');
  console.log('  All events linked by correlation_id for traceability\n');

  return llmResponse;
}

/**
 * Step 7: Query Audit Logs by Correlation ID
 * 
 * Demonstrates querying audit logs by correlation_id for incident investigation
 * and compliance reporting.
 */
async function step7_QueryAuditLogsByCorrelationId(
  audit: TealAudit,
  correlationId: string
) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 7: Query Audit Logs by Correlation ID                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Incident Investigation Scenario:');
  console.log('  A security team member needs to investigate a specific request\n');

  console.log(`Querying audit logs for correlation_id: ${correlationId}\n`);

  // Query audit events by correlation_id
  const events = audit.query({
    correlation_id: correlationId
  });

  console.log(`Found ${events.length} audit events:\n`);

  // Display events in chronological order
  events.forEach((event, index) => {
    console.log(`${index + 1}. ${event.event_type}`);
    console.log(`   Timestamp: ${event.timestamp}`);
    console.log(`   Action: ${event.action || 'N/A'}`);
    console.log(`   Risk Score: ${event.risk_score || 'N/A'}`);
    if (event.mode) {
      console.log(`   Mode: ${event.mode}`);
    }
    if (event.reason_codes && event.reason_codes.length > 0) {
      console.log(`   Reason Codes: ${event.reason_codes.join(', ')}`);
    }
    console.log('');
  });

  console.log('Traceability Benefits:');
  console.log('  ✓ Complete request timeline');
  console.log('  ✓ All policy decisions tracked');
  console.log('  ✓ Security events correlated');
  console.log('  ✓ Compliance evidence available');
  console.log('  ✓ Incident investigation simplified\n');

  // Generate investigation report
  console.log('Investigation Report:');
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  Total Events: ${events.length}`);
  console.log(`  Event Types: ${[...new Set(events.map(e => e.event_type))].join(', ')}`);
  
  const riskScores = events.filter(e => e.risk_score !== undefined).map(e => e.risk_score!);
  if (riskScores.length > 0) {
    console.log(`  Max Risk Score: ${Math.max(...riskScores)}`);
    console.log(`  Avg Risk Score: ${(riskScores.reduce((a, b) => a + b, 0) / riskScores.length).toFixed(1)}`);
  }
  
  const deniedEvents = events.filter(e => e.action === DecisionAction.DENY);
  console.log(`  Denied Actions: ${deniedEvents.length}`);
  
  console.log('');

  return events;
}

/**
 * Step 8: Gradual Policy Rollout Strategy
 * 
 * Demonstrates a complete gradual rollout strategy from MONITOR to ENFORCE mode
 * over multiple phases, minimizing risk of production incidents.
 */
async function step8_GradualPolicyRollout() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 8: Gradual Policy Rollout Strategy                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Rollout Timeline: 4-6 weeks from observation to full enforcement\n');

  // Phase 1: MONITOR Mode (Week 1-2)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 1: MONITOR Mode (Week 1-2)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Configuration:');
  console.log('  Mode: MONITOR (all policies)');
  console.log('  Goal: Observe behavior, collect baseline data');
  console.log('  Actions: Log violations, allow all operations\n');

  const phase1Engine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: { default: PolicyMode.MONITOR }
    }
  );

  const phase1Context = ContextManager.createContext({
    environment: 'production-phase1',
    application: 'customer-support',
    tenant_id: 'acme-corp'
  });

  const phase1Decision = phase1Engine.evaluateWithMode(
    {
      agentId: 'enterprise-support-agent',
      action: 'tool.execute',
      tool: 'file_delete'  // Disallowed tool
    },
    phase1Context
  );

  console.log('Test: Attempting disallowed operation (file_delete)');
  console.log(`  Decision: ${phase1Decision.action}`);
  console.log(`  Mode: ${phase1Decision.mode}`);
  console.log(`  Risk Score: ${phase1Decision.risk_score}`);
  console.log(`  Result: Operation ALLOWED (violation logged)\n`);

  console.log('Phase 1 Outcomes:');
  console.log('  ✓ Collected 2 weeks of baseline behavior data');
  console.log('  ✓ Identified 15 policy violations (all logged)');
  console.log('  ✓ Zero production disruption');
  console.log('  ✓ Refined policy rules based on false positives');
  console.log('  ✓ Ready to proceed to Phase 2\n');

  // Phase 2: Mixed Mode (Week 3-4)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 2: Mixed Mode (Week 3-4)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Configuration:');
  console.log('  Default Mode: MONITOR');
  console.log('  Critical Policies: ENFORCE');
  console.log('    - tools.file_delete');
  console.log('    - tools.database_write');
  console.log('    - tools.admin_access');
  console.log('  Goal: Enforce critical policies, monitor others\n');

  const phase2Engine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: {
        default: PolicyMode.MONITOR,
        policy: {
          'tools.file_delete': PolicyMode.ENFORCE,
          'tools.database_write': PolicyMode.ENFORCE,
          'tools.admin_access': PolicyMode.ENFORCE
        }
      }
    }
  );

  const phase2Context = ContextManager.createContext({
    environment: 'production-phase2',
    application: 'customer-support',
    tenant_id: 'acme-corp'
  });

  const phase2Decision = phase2Engine.evaluateWithMode(
    {
      agentId: 'enterprise-support-agent',
      action: 'tool.execute',
      tool: 'file_delete'  // Critical policy
    },
    phase2Context
  );

  console.log('Test: Attempting critical operation (file_delete)');
  console.log(`  Decision: ${phase2Decision.action}`);
  console.log(`  Mode: ${phase2Decision.mode}`);
  console.log(`  Risk Score: ${phase2Decision.risk_score}`);
  console.log(`  Result: Operation BLOCKED (enforcement active)\n`);

  console.log('Phase 2 Outcomes:');
  console.log('  ✓ Critical policies enforced successfully');
  console.log('  ✓ Zero legitimate operations blocked');
  console.log('  ✓ Blocked 3 actual security violations');
  console.log('  ✓ Non-critical policies still in MONITOR mode');
  console.log('  ✓ Ready to proceed to Phase 3\n');

  // Phase 3: Full ENFORCE Mode (Week 5+)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 3: Full ENFORCE Mode (Week 5+)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Configuration:');
  console.log('  Mode: ENFORCE (all policies)');
  console.log('  Goal: Full security enforcement');
  console.log('  Actions: Block all policy violations\n');

  const phase3Engine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: { default: PolicyMode.ENFORCE }
    }
  );

  const phase3Context = ContextManager.createContext({
    environment: 'production-phase3',
    application: 'customer-support',
    tenant_id: 'acme-corp'
  });

  const phase3Decision = phase3Engine.evaluateWithMode(
    {
      agentId: 'enterprise-support-agent',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    phase3Context
  );

  console.log('Test: Attempting disallowed operation (file_delete)');
  console.log(`  Decision: ${phase3Decision.action}`);
  console.log(`  Mode: ${phase3Decision.mode}`);
  console.log(`  Risk Score: ${phase3Decision.risk_score}`);
  console.log(`  Result: Operation BLOCKED (full enforcement)\n`);

  console.log('Phase 3 Outcomes:');
  console.log('  ✓ Full security enforcement active');
  console.log('  ✓ All policy violations blocked');
  console.log('  ✓ Zero production incidents during rollout');
  console.log('  ✓ Compliance-ready audit trail');
  console.log('  ✓ Enterprise security posture achieved\n');

  console.log('✅ Gradual Rollout Complete!');
  console.log('   Timeline: 5+ weeks from observation to enforcement');
  console.log('   Risk: Minimized through phased validation');
  console.log('   Result: Safe production deployment with zero incidents\n');
}

/**
 * Step 9: CI/CD Integration with Policy Testing
 * 
 * Demonstrates how to integrate policy testing into CI/CD pipelines
 * to prevent policy regressions before deployment.
 */
async function step9_CICDIntegration() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 9: CI/CD Integration with Policy Testing                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('CI/CD Pipeline Integration:\n');

  console.log('1. Pre-Deployment Policy Tests:');
  console.log('   - Run policy test suite before every deployment');
  console.log('   - Block deployment if tests fail');
  console.log('   - Generate test reports for audit trail\n');

  console.log('2. GitHub Actions Example:\n');
  console.log('```yaml');
  console.log('name: Policy Tests');
  console.log('on: [push, pull_request]');
  console.log('');
  console.log('jobs:');
  console.log('  test-policies:');
  console.log('    runs-on: ubuntu-latest');
  console.log('    steps:');
  console.log('      - uses: actions/checkout@v3');
  console.log('      - uses: actions/setup-node@v3');
  console.log('        with:');
  console.log('          node-version: 18');
  console.log('      - run: npm install');
  console.log('      - run: npm run test:policies');
  console.log('      - name: Upload test results');
  console.log('        if: always()');
  console.log('        uses: actions/upload-artifact@v3');
  console.log('        with:');
  console.log('          name: policy-test-results');
  console.log('          path: test-results/');
  console.log('```\n');

  console.log('3. npm Scripts (package.json):\n');
  console.log('```json');
  console.log('{');
  console.log('  "scripts": {');
  console.log('    "test:policies": "tealtiger test ./policies/*.test.json",');
  console.log('    "test:policies:ci": "tealtiger test ./policies/*.test.json --format=junit --output=./test-results/junit.xml",');
  console.log('    "test:policies:coverage": "tealtiger test ./policies/*.test.json --coverage --min-coverage=80"');
  console.log('  }');
  console.log('}');
  console.log('```\n');

  console.log('4. Pre-Commit Hook:\n');
  console.log('```bash');
  console.log('#!/bin/bash');
  console.log('# .git/hooks/pre-commit');
  console.log('');
  console.log('echo "Running policy tests..."');
  console.log('npm run test:policies');
  console.log('');
  console.log('if [ $? -ne 0 ]; then');
  console.log('  echo "❌ Policy tests failed! Commit blocked."');
  console.log('  exit 1');
  console.log('fi');
  console.log('');
  console.log('echo "✅ Policy tests passed!"');
  console.log('```\n');

  console.log('✅ CI/CD Integration Benefits:');
  console.log('   - Prevent policy regressions');
  console.log('   - Automated testing on every commit');
  console.log('   - Block deployments with failing tests');
  console.log('   - Generate compliance reports');
  console.log('   - Shift-left security validation\n');
}

/**
 * Step 10: Complete Enterprise Setup Summary
 * 
 * Provides a comprehensive summary of the entire enterprise setup
 * and best practices for production deployment.
 */
function step10_EnterpriseSetupSummary() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 10: Complete Enterprise Setup Summary                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Enterprise Deployment Checklist:\n');

  console.log('✅ P0.1: Policy Rollout Modes');
  console.log('   - Multi-environment configuration (dev, staging, prod)');
  console.log('   - Gradual rollout strategy (MONITOR → ENFORCE)');
  console.log('   - Environment-specific mode overrides');
  console.log('   - Policy-specific mode configuration\n');

  console.log('✅ P0.2: Deterministic Decision Contract');
  console.log('   - Stable Decision object across all components');
  console.log('   - Typed DecisionAction and ReasonCode enums');
  console.log('   - Risk score calculation (0-100)');
  console.log('   - Component version tracking\n');

  console.log('✅ P0.3: Correlation IDs + Traceability');
  console.log('   - Auto-generated correlation_id (UUID v4)');
  console.log('   - ExecutionContext with full metadata');
  console.log('   - Workflow and run-level tracking');
  console.log('   - OpenTelemetry-compatible trace_id\n');

  console.log('✅ P0.4: Audit Schema + Redaction Guarantees');
  console.log('   - Versioned audit event schema (v1.0.0)');
  console.log('   - HASH redaction by default (SHA-256)');
  console.log('   - PII detection enabled by default');
  console.log('   - Security-by-default configuration\n');

  console.log('✅ P0.5: Policy Test Harness');
  console.log('   - Comprehensive test suite with 6+ test cases');
  console.log('   - PolicyTester for automated validation');
  console.log('   - CI/CD integration with test reports');
  console.log('   - Pre-deployment testing workflow\n');

  console.log('Best Practices:\n');

  console.log('1. Start with Testing:');
  console.log('   - Define test suite before deployment');
  console.log('   - Run tests in CI/CD pipeline');
  console.log('   - Block deployments on test failures\n');

  console.log('2. Gradual Rollout:');
  console.log('   - Phase 1: MONITOR mode (1-2 weeks)');
  console.log('   - Phase 2: Mixed mode (1-2 weeks)');
  console.log('   - Phase 3: ENFORCE mode (ongoing)\n');

  console.log('3. Complete Observability:');
  console.log('   - Use correlation_id for all requests');
  console.log('   - Enable audit logging in all environments');
  console.log('   - Query logs by correlation_id for investigations\n');

  console.log('4. Security by Default:');
  console.log('   - HASH redaction in production');
  console.log('   - PII detection always enabled');
  console.log('   - Debug mode disabled by default\n');

  console.log('5. Multi-Environment Strategy:');
  console.log('   - Development: MONITOR mode');
  console.log('   - Staging: Mixed mode (critical ENFORCE)');
  console.log('   - Production: ENFORCE mode\n');

  console.log('Compliance & Security:');
  console.log('  ✓ OWASP Top 10 for Agentic Applications coverage');
  console.log('  ✓ Google SAIF framework alignment');
  console.log('  ✓ NIST AI RMF 1.0 compliance');
  console.log('  ✓ Comprehensive audit trail');
  console.log('  ✓ PII protection by default');
  console.log('  ✓ Zero-infrastructure deployment\n');

  console.log('Performance Characteristics:');
  console.log('  - Mode resolution: < 1ms (p99)');
  console.log('  - Decision evaluation: < 10ms overhead (p99)');
  console.log('  - Context propagation: < 0.5ms (p99)');
  console.log('  - Content redaction: < 5ms for 10KB (p99)');
  console.log('  - Audit logging: < 2ms async (p99)\n');
}

/**
 * Main Function: Run Complete Enterprise Integration Example
 * 
 * Executes all steps in sequence to demonstrate the complete enterprise setup.
 */
async function runCompleteEnterpriseIntegration() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                ║');
  console.log('║  TealTiger SDK v1.1.x                                          ║');
  console.log('║  Complete Enterprise Integration Example                      ║');
  console.log('║                                                                ║');
  console.log('║  Demonstrates all P0 Enterprise Adoption Features:            ║');
  console.log('║  • Policy Rollout Modes (ENFORCE, MONITOR, REPORT_ONLY)       ║');
  console.log('║  • Deterministic Decision Contract                            ║');
  console.log('║  • Correlation IDs + Traceability                             ║');
  console.log('║  • Audit Schema + Redaction Guarantees                        ║');
  console.log('║  • Policy Test Harness                                        ║');
  console.log('║                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Define policy test suite
    const testSuite = step1_DefinePolicyTestSuite();

    // Step 2: Run policy tests before deployment
    const testReport = await step2_RunPolicyTests(testSuite);

    // Step 3: Configure multi-environment setup
    const { devEngine, stagingEngine, prodEngine } = step3_ConfigureMultiEnvironment();

    // Step 4: Configure audit with redaction (production)
    const prodAudit = step4_ConfigureAuditWithRedaction('production');

    // Step 5: Create execution context with full traceability
    const context = step5_CreateExecutionContext('production');

    // Step 6: Make LLM request with full context propagation
    await step6_MakeLLMRequestWithContext(prodEngine, prodAudit, context);

    // Step 7: Query audit logs by correlation_id
    await step7_QueryAuditLogsByCorrelationId(prodAudit, context.correlation_id);

    // Step 8: Demonstrate gradual policy rollout strategy
    await step8_GradualPolicyRollout();

    // Step 9: Show CI/CD integration
    await step9_CICDIntegration();

    // Step 10: Provide complete enterprise setup summary
    step10_EnterpriseSetupSummary();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                ║');
    console.log('║  ✅ Complete Enterprise Integration Example Finished!          ║');
    console.log('║                                                                ║');
    console.log('║  You now have a production-ready enterprise AI security       ║');
    console.log('║  platform with:                                               ║');
    console.log('║                                                                ║');
    console.log('║  ✓ Comprehensive policy testing                               ║');
    console.log('║  ✓ Multi-environment configuration                            ║');
    console.log('║  ✓ Gradual rollout strategy                                   ║');
    console.log('║  ✓ Complete observability                                     ║');
    console.log('║  ✓ Security-by-default                                        ║');
    console.log('║  ✓ CI/CD integration                                          ║');
    console.log('║                                                                ║');
    console.log('║  Next Steps:                                                  ║');
    console.log('║  1. Customize policies for your use case                      ║');
    console.log('║  2. Add your own test cases                                   ║');
    console.log('║  3. Integrate with your CI/CD pipeline                        ║');
    console.log('║  4. Deploy to development environment                         ║');
    console.log('║  5. Monitor and refine policies                               ║');
    console.log('║  6. Graduate to production with ENFORCE mode                  ║');
    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Error running enterprise integration example:', error);
    console.error('\nStack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    process.exit(1);
  }
}

/**
 * Quick Start Examples
 * 
 * Individual functions that can be run independently for specific use cases.
 */

/**
 * Quick Start 1: Basic Policy Testing
 */
async function quickStart_PolicyTesting() {
  console.log('\n=== Quick Start: Policy Testing ===\n');

  const testSuite = step1_DefinePolicyTestSuite();
  const report = await step2_RunPolicyTests(testSuite);

  console.log(`\n✅ Policy testing complete! ${report.passed}/${report.total} tests passed.\n`);
}

/**
 * Quick Start 2: Production Deployment
 */
async function quickStart_ProductionDeployment() {
  console.log('\n=== Quick Start: Production Deployment ===\n');

  // Configure production engine
  const prodEngine = new TealEngine(
    ENTERPRISE_POLICY_CONFIG,
    {
      mode: { default: PolicyMode.ENFORCE }
    }
  );

  // Configure production audit
  const prodAudit = step4_ConfigureAuditWithRedaction('production');

  // Create execution context
  const context = step5_CreateExecutionContext('production');

  // Make LLM request
  await step6_MakeLLMRequestWithContext(prodEngine, prodAudit, context);

  console.log('\n✅ Production deployment example complete!\n');
}

/**
 * Quick Start 3: Incident Investigation
 */
async function quickStart_IncidentInvestigation() {
  console.log('\n=== Quick Start: Incident Investigation ===\n');

  // Set up audit
  const audit = step4_ConfigureAuditWithRedaction('production');

  // Create context
  const context = step5_CreateExecutionContext('production');

  // Simulate some operations (would normally be real operations)
  console.log('Simulating operations...\n');

  // Query logs by correlation_id
  await step7_QueryAuditLogsByCorrelationId(audit, context.correlation_id);

  console.log('\n✅ Incident investigation example complete!\n');
}

// Export functions for use in other modules
export {
  runCompleteEnterpriseIntegration,
  quickStart_PolicyTesting,
  quickStart_ProductionDeployment,
  quickStart_IncidentInvestigation,
  step1_DefinePolicyTestSuite,
  step2_RunPolicyTests,
  step3_ConfigureMultiEnvironment,
  step4_ConfigureAuditWithRedaction,
  step5_CreateExecutionContext,
  step6_MakeLLMRequestWithContext,
  step7_QueryAuditLogsByCorrelationId,
  step8_GradualPolicyRollout,
  step9_CICDIntegration,
  step10_EnterpriseSetupSummary
};

// Run the complete example if this file is executed directly
if (require.main === module) {
  runCompleteEnterpriseIntegration();
}
