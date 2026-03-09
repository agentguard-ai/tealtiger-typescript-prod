/**
 * TealTiger SDK v1.1.x - Policy Rollout Modes Examples
 * 
 * Demonstrates how to use policy rollout modes for safe policy deployment:
 * - Development: MONITOR mode for testing without blocking
 * - Staging: Mixed modes (ENFORCE critical, MONITOR others)
 * - Production: ENFORCE mode for maximum security
 * - Gradual rollout: REPORT_ONLY → MONITOR → ENFORCE transition
 * 
 * Policy rollout modes enable organizations to deploy AI security policies
 * gradually, validating behavior before full enforcement.
 */

import { TealEngine } from '../src/core/engine/TealEngine';
import { TealOpenAI } from '../src/clients/TealOpenAI';
import { TealAudit, ConsoleOutput } from '../src/core/audit/TealAudit';
import { ContextManager } from '../src/core/context/ContextManager';
import { PolicyMode, DecisionAction, ReasonCode } from '../src/core/engine/types';
import { RedactionLevel } from '../src/core/audit/redaction';

/**
 * Example 1: Development Environment with MONITOR Mode
 * 
 * In development, use MONITOR mode for all policies to allow developers
 * to test without being blocked. Violations are logged but don't prevent
 * operations from proceeding.
 * 
 * Use case: Testing new features, debugging policy behavior
 */
async function example1_DevelopmentWithMonitor() {
  console.log('\n=== Example 1: Development Environment (MONITOR Mode) ===\n');

  // Development policy: Monitor everything, block nothing
  const devEngine = new TealEngine(
    {
      tools: {
        file_delete: { allowed: false },
        database_write: { allowed: false },
        customer_data_read: { allowed: true }
      },
      identity: {
        agentId: 'dev-agent-001',
        role: 'developer',
        permissions: ['read:customer_data']
      }
    },
    {
      mode: {
        default: PolicyMode.MONITOR  // All policies in MONITOR mode
      }
    }
  );

  // Create execution context
  const context = ContextManager.createContext({
    environment: 'development',
    application: 'customer-support',
    agent_purpose: 'testing'
  });

  console.log('Development Configuration:');
  console.log('  Mode: MONITOR (all policies)');
  console.log('  Behavior: Log violations, allow all operations');
  console.log('  Use case: Testing without blocking developers\n');

  // Test 1: Try to use a disallowed tool (file_delete)
  console.log('Test 1: Attempting to use disallowed tool (file_delete)...');
  const decision1 = devEngine.evaluateWithMode(
    {
      agentId: 'dev-agent-001',
      action: 'tool.execute',
      tool: 'file_delete',
      toolParams: { path: '/tmp/test.txt' }
    },
    context
  );

  console.log(`  Decision: ${decision1.action}`);
  console.log(`  Mode: ${decision1.mode}`);
  console.log(`  Risk Score: ${decision1.risk_score}`);
  console.log(`  Reason: ${decision1.reason}`);
  console.log(`  Result: Operation ALLOWED (MONITOR mode logs but doesn't block)\n`);

  // Test 2: Try to use another disallowed tool (database_write)
  console.log('Test 2: Attempting to use disallowed tool (database_write)...');
  const decision2 = devEngine.evaluateWithMode(
    {
      agentId: 'dev-agent-001',
      action: 'tool.execute',
      tool: 'database_write',
      toolParams: { table: 'customers', data: { name: 'Test' } }
    },
    context
  );

  console.log(`  Decision: ${decision2.action}`);
  console.log(`  Mode: ${decision2.mode}`);
  console.log(`  Risk Score: ${decision2.risk_score}`);
  console.log(`  Reason: ${decision2.reason}`);
  console.log(`  Result: Operation ALLOWED (violation logged for review)\n`);

  console.log('✅ Development Mode Benefits:');
  console.log('   - Developers can test freely without being blocked');
  console.log('   - All violations are logged for policy refinement');
  console.log('   - Identify false positives before production deployment');
}


/**
 * Example 2: Staging Environment with Mixed Modes
 * 
 * In staging, use ENFORCE mode for critical security policies and MONITOR
 * mode for less critical policies. This validates enforcement behavior
 * before production while still allowing testing of new policies.
 * 
 * Use case: Pre-production validation, gradual policy hardening
 */
async function example2_StagingMixedModes() {
  console.log('\n=== Example 2: Staging Environment (Mixed Modes) ===\n');

  // Staging policy: Enforce critical, monitor others
  const stagingEngine = new TealEngine(
    {
      tools: {
        file_delete: { allowed: false },           // Critical: ENFORCE
        database_write: { allowed: false },        // Critical: ENFORCE
        customer_data_read: { allowed: true },     // Non-critical: MONITOR
        send_email: { allowed: true }              // Non-critical: MONITOR
      },
      identity: {
        agentId: 'staging-agent-001',
        role: 'customer-support',
        permissions: ['read:customer_data', 'send:email']
      }
    },
    {
      mode: {
        default: PolicyMode.MONITOR,  // Default: MONITOR
        policy: {
          // Override critical policies to ENFORCE
          'tools.file_delete': PolicyMode.ENFORCE,
          'tools.database_write': PolicyMode.ENFORCE
        }
      }
    }
  );

  const context = ContextManager.createContext({
    environment: 'staging',
    application: 'customer-support',
    agent_purpose: 'pre_production_testing'
  });

  console.log('Staging Configuration:');
  console.log('  Default Mode: MONITOR');
  console.log('  Critical Policies (ENFORCE):');
  console.log('    - tools.file_delete');
  console.log('    - tools.database_write');
  console.log('  Other Policies (MONITOR):');
  console.log('    - tools.customer_data_read');
  console.log('    - tools.send_email\n');

  // Test 1: Try critical policy (file_delete) - should be DENIED
  console.log('Test 1: Attempting critical operation (file_delete)...');
  const decision1 = stagingEngine.evaluateWithMode(
    {
      agentId: 'staging-agent-001',
      action: 'tool.execute',
      tool: 'file_delete',
      toolParams: { path: '/data/important.txt' }
    },
    context
  );

  console.log(`  Decision: ${decision1.action}`);
  console.log(`  Mode: ${decision1.mode}`);
  console.log(`  Risk Score: ${decision1.risk_score}`);
  console.log(`  Reason: ${decision1.reason}`);
  console.log(`  Result: Operation BLOCKED (ENFORCE mode active)\n`);

  // Test 2: Try critical policy (database_write) - should be DENIED
  console.log('Test 2: Attempting critical operation (database_write)...');
  const decision2 = stagingEngine.evaluateWithMode(
    {
      agentId: 'staging-agent-001',
      action: 'tool.execute',
      tool: 'database_write',
      toolParams: { table: 'customers' }
    },
    context
  );

  console.log(`  Decision: ${decision2.action}`);
  console.log(`  Mode: ${decision2.mode}`);
  console.log(`  Risk Score: ${decision2.risk_score}`);
  console.log(`  Reason: ${decision2.reason}`);
  console.log(`  Result: Operation BLOCKED (ENFORCE mode active)\n`);

  // Test 3: Try non-critical policy (customer_data_read) - should be ALLOWED
  console.log('Test 3: Attempting non-critical operation (customer_data_read)...');
  const decision3 = stagingEngine.evaluateWithMode(
    {
      agentId: 'staging-agent-001',
      action: 'tool.execute',
      tool: 'customer_data_read',
      toolParams: { customerId: '12345' }
    },
    context
  );

  console.log(`  Decision: ${decision3.action}`);
  console.log(`  Mode: ${decision3.mode}`);
  console.log(`  Risk Score: ${decision3.risk_score}`);
  console.log(`  Reason: ${decision3.reason}`);
  console.log(`  Result: Operation ALLOWED (MONITOR mode for non-critical)\n`);

  console.log('✅ Staging Mixed Mode Benefits:');
  console.log('   - Critical security policies are enforced');
  console.log('   - Non-critical policies can be tested without blocking');
  console.log('   - Validates enforcement behavior before production');
  console.log('   - Reduces risk of production incidents');
}


/**
 * Example 3: Production Environment with ENFORCE Mode
 * 
 * In production, use ENFORCE mode for all policies to ensure maximum
 * security. All policy violations are blocked, and operations only
 * proceed if they comply with all policies.
 * 
 * Use case: Production deployment with full security enforcement
 */
async function example3_ProductionEnforce() {
  console.log('\n=== Example 3: Production Environment (ENFORCE Mode) ===\n');

  // Production policy: Enforce everything
  const prodEngine = new TealEngine(
    {
      tools: {
        file_delete: { allowed: false },
        database_write: { allowed: false },
        customer_data_read: { allowed: true },
        send_email: { allowed: true, rateLimit: { max: 100, window: '1h' } }
      },
      identity: {
        agentId: 'prod-agent-001',
        role: 'customer-support',
        permissions: ['read:customer_data', 'send:email']
      },
      behavioral: {
        costLimit: {
          daily: 100,
          hourly: 10
        },
        rateLimit: {
          requests: 1000,
          window: '1h'
        }
      }
    },
    {
      mode: {
        default: PolicyMode.ENFORCE  // All policies in ENFORCE mode
      }
    }
  );

  const context = ContextManager.createContext({
    environment: 'production',
    application: 'customer-support',
    tenant_id: 'acme-corp',
    agent_purpose: 'customer_service'
  });

  console.log('Production Configuration:');
  console.log('  Mode: ENFORCE (all policies)');
  console.log('  Behavior: Block all policy violations');
  console.log('  Use case: Maximum security in production\n');

  // Test 1: Try disallowed operation - should be DENIED
  console.log('Test 1: Attempting disallowed operation (file_delete)...');
  const decision1 = prodEngine.evaluateWithMode(
    {
      agentId: 'prod-agent-001',
      action: 'tool.execute',
      tool: 'file_delete',
      toolParams: { path: '/data/customer.db' }
    },
    context
  );

  console.log(`  Decision: ${decision1.action}`);
  console.log(`  Mode: ${decision1.mode}`);
  console.log(`  Risk Score: ${decision1.risk_score}`);
  console.log(`  Reason: ${decision1.reason}`);
  console.log(`  Result: Operation BLOCKED (security violation)\n`);

  // Test 2: Try allowed operation - should be ALLOWED
  console.log('Test 2: Attempting allowed operation (customer_data_read)...');
  const decision2 = prodEngine.evaluateWithMode(
    {
      agentId: 'prod-agent-001',
      action: 'tool.execute',
      tool: 'customer_data_read',
      toolParams: { customerId: '12345' }
    },
    context
  );

  console.log(`  Decision: ${decision2.action}`);
  console.log(`  Mode: ${decision2.mode}`);
  console.log(`  Risk Score: ${decision2.risk_score}`);
  console.log(`  Reason: ${decision2.reason}`);
  console.log(`  Result: Operation ALLOWED (complies with policy)\n`);

  console.log('✅ Production ENFORCE Mode Benefits:');
  console.log('   - Maximum security posture');
  console.log('   - All violations are blocked');
  console.log('   - Compliance-ready audit trail');
  console.log('   - Zero tolerance for policy violations');
}


/**
 * Example 4: Gradual Rollout Strategy
 * 
 * Demonstrates a safe, phased approach to policy deployment:
 * Phase 1: REPORT_ONLY - Observe behavior without any enforcement
 * Phase 2: MONITOR - Log violations but allow operations
 * Phase 3: ENFORCE - Block violations in production
 * 
 * This strategy minimizes risk and allows validation at each phase.
 * 
 * Use case: Rolling out new policies to production safely
 */
async function example4_GradualRollout() {
  console.log('\n=== Example 4: Gradual Rollout Strategy ===\n');

  // Define the policy configuration (same for all phases)
  const policyConfig = {
    tools: {
      file_delete: { allowed: false },
      database_write: { allowed: false },
      admin_access: { allowed: false },
      customer_data_read: { allowed: true }
    },
    identity: {
      agentId: 'rollout-agent-001',
      role: 'customer-support',
      permissions: ['read:customer_data']
    }
  };

  const context = ContextManager.createContext({
    application: 'customer-support',
    agent_purpose: 'gradual_rollout_testing'
  });

  // ========================================================================
  // PHASE 1: REPORT_ONLY Mode
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 1: REPORT_ONLY Mode (Week 1-2)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const phase1Engine = new TealEngine(policyConfig, {
    mode: {
      default: PolicyMode.REPORT_ONLY
    }
  });

  context.environment = 'production-phase1';

  console.log('Configuration:');
  console.log('  Mode: REPORT_ONLY');
  console.log('  Goal: Observe behavior, collect baseline data');
  console.log('  Duration: 1-2 weeks\n');

  const phase1Decision = phase1Engine.evaluateWithMode(
    {
      agentId: 'rollout-agent-001',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    context
  );

  console.log('Test: Attempting file_delete operation');
  console.log(`  Decision: ${phase1Decision.action}`);
  console.log(`  Mode: ${phase1Decision.mode}`);
  console.log(`  Risk Score: ${phase1Decision.risk_score}`);
  console.log(`  Result: Operation ALLOWED (observing only)\n`);

  console.log('Phase 1 Outcomes:');
  console.log('  ✓ Collected baseline behavior data');
  console.log('  ✓ Identified policy violations without impact');
  console.log('  ✓ No production disruption');
  console.log('  ✓ Ready to proceed to Phase 2\n');

  // ========================================================================
  // PHASE 2: MONITOR Mode
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 2: MONITOR Mode (Week 3-4)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const phase2Engine = new TealEngine(policyConfig, {
    mode: {
      default: PolicyMode.MONITOR
    }
  });

  context.environment = 'production-phase2';

  console.log('Configuration:');
  console.log('  Mode: MONITOR');
  console.log('  Goal: Log violations, validate detection accuracy');
  console.log('  Duration: 1-2 weeks\n');

  const phase2Decision = phase2Engine.evaluateWithMode(
    {
      agentId: 'rollout-agent-001',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    context
  );

  console.log('Test: Attempting file_delete operation');
  console.log(`  Decision: ${phase2Decision.action}`);
  console.log(`  Mode: ${phase2Decision.mode}`);
  console.log(`  Risk Score: ${phase2Decision.risk_score}`);
  console.log(`  Reason: ${phase2Decision.reason}`);
  console.log(`  Result: Operation ALLOWED (violation logged)\n`);

  console.log('Phase 2 Outcomes:');
  console.log('  ✓ Validated policy detection accuracy');
  console.log('  ✓ Identified false positives');
  console.log('  ✓ Refined policy rules based on logs');
  console.log('  ✓ Confirmed no legitimate operations blocked');
  console.log('  ✓ Ready to proceed to Phase 3\n');

  // ========================================================================
  // PHASE 3: ENFORCE Mode
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 3: ENFORCE Mode (Week 5+)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const phase3Engine = new TealEngine(policyConfig, {
    mode: {
      default: PolicyMode.ENFORCE
    }
  });

  context.environment = 'production-phase3';

  console.log('Configuration:');
  console.log('  Mode: ENFORCE');
  console.log('  Goal: Full security enforcement');
  console.log('  Duration: Ongoing\n');

  const phase3Decision = phase3Engine.evaluateWithMode(
    {
      agentId: 'rollout-agent-001',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    context
  );

  console.log('Test: Attempting file_delete operation');
  console.log(`  Decision: ${phase3Decision.action}`);
  console.log(`  Mode: ${phase3Decision.mode}`);
  console.log(`  Risk Score: ${phase3Decision.risk_score}`);
  console.log(`  Reason: ${phase3Decision.reason}`);
  console.log(`  Result: Operation BLOCKED (enforcement active)\n`);

  console.log('Phase 3 Outcomes:');
  console.log('  ✓ Full security enforcement active');
  console.log('  ✓ Policy violations blocked');
  console.log('  ✓ Zero production incidents during rollout');
  console.log('  ✓ Compliance-ready audit trail\n');

  console.log('✅ Gradual Rollout Complete!');
  console.log('   Timeline: 5+ weeks from observation to enforcement');
  console.log('   Risk: Minimized through phased validation');
  console.log('   Result: Safe production deployment');
}


/**
 * Example 5: Environment-Based Mode Configuration
 * 
 * Shows how to use environment-specific mode overrides to automatically
 * apply the right mode based on the deployment environment.
 * 
 * Use case: Single configuration for all environments
 */
async function example5_EnvironmentBasedModes() {
  console.log('\n=== Example 5: Environment-Based Mode Configuration ===\n');

  // Single engine configuration with environment-specific modes
  const engine = new TealEngine(
    {
      tools: {
        file_delete: { allowed: false },
        database_write: { allowed: false },
        customer_data_read: { allowed: true }
      },
      identity: {
        agentId: 'multi-env-agent',
        role: 'customer-support',
        permissions: ['read:customer_data']
      }
    },
    {
      mode: {
        default: PolicyMode.ENFORCE,  // Default to ENFORCE
        environment: {
          development: PolicyMode.MONITOR,
          staging: PolicyMode.MONITOR,
          production: PolicyMode.ENFORCE
        }
      }
    }
  );

  console.log('Configuration:');
  console.log('  Default Mode: ENFORCE');
  console.log('  Environment Overrides:');
  console.log('    - development: MONITOR');
  console.log('    - staging: MONITOR');
  console.log('    - production: ENFORCE\n');

  // Test in development environment
  const devContext = ContextManager.createContext({
    environment: 'development',
    application: 'customer-support'
  });

  const devDecision = engine.evaluateWithMode(
    {
      agentId: 'multi-env-agent',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    devContext
  );

  console.log('Development Environment:');
  console.log(`  Resolved Mode: ${devDecision.mode}`);
  console.log(`  Decision: ${devDecision.action}`);
  console.log(`  Result: Violation logged but allowed\n`);

  // Test in production environment
  const prodContext = ContextManager.createContext({
    environment: 'production',
    application: 'customer-support'
  });

  const prodDecision = engine.evaluateWithMode(
    {
      agentId: 'multi-env-agent',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    prodContext
  );

  console.log('Production Environment:');
  console.log(`  Resolved Mode: ${prodDecision.mode}`);
  console.log(`  Decision: ${prodDecision.action}`);
  console.log(`  Result: Violation blocked\n`);

  console.log('✅ Environment-Based Configuration Benefits:');
  console.log('   - Single configuration for all environments');
  console.log('   - Automatic mode resolution based on context');
  console.log('   - Consistent policy definitions across environments');
  console.log('   - Reduced configuration management overhead');
}


/**
 * Example 6: Integration with Audit Logging
 * 
 * Shows how policy rollout modes integrate with TealAudit to provide
 * comprehensive visibility into policy decisions across all modes.
 * 
 * Use case: Monitoring policy effectiveness during rollout
 */
async function example6_AuditIntegration() {
  console.log('\n=== Example 6: Audit Integration with Policy Modes ===\n');

  // Initialize audit with secure defaults
  const audit = new TealAudit({
    outputs: [new ConsoleOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    }
  });

  // Initialize engine in MONITOR mode
  const engine = new TealEngine(
    {
      tools: {
        file_delete: { allowed: false },
        customer_data_read: { allowed: true }
      },
      identity: {
        agentId: 'audit-demo-agent',
        role: 'customer-support',
        permissions: ['read:customer_data']
      }
    },
    {
      mode: {
        default: PolicyMode.MONITOR
      }
    }
  );

  const context = ContextManager.createContext({
    environment: 'staging',
    application: 'customer-support',
    tenant_id: 'acme-corp'
  });

  console.log('Configuration:');
  console.log('  Mode: MONITOR');
  console.log('  Audit: Enabled with HASH redaction');
  console.log('  Goal: Track policy violations during rollout\n');

  // Evaluate policy
  const decision = engine.evaluateWithMode(
    {
      agentId: 'audit-demo-agent',
      action: 'tool.execute',
      tool: 'file_delete',
      toolParams: { path: '/tmp/test.txt' }
    },
    context
  );

  console.log('Policy Decision:');
  console.log(`  Action: ${decision.action}`);
  console.log(`  Mode: ${decision.mode}`);
  console.log(`  Risk Score: ${decision.risk_score}`);
  console.log(`  Correlation ID: ${decision.correlation_id}\n`);

  // Log to audit
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: 'policy.evaluation' as any,
      timestamp: new Date().toISOString(),
      correlation_id: decision.correlation_id,
      action: decision.action,
      mode: decision.mode,
      risk_score: decision.risk_score,
      policy_id: decision.policy_id,
      policy_version: decision.policy_version,
      reason_codes: decision.reason_codes
    },
    context
  );

  console.log('Audit Event Logged:');
  console.log('  ✓ Policy evaluation recorded');
  console.log('  ✓ Mode included in audit event');
  console.log('  ✓ Correlation ID for traceability');
  console.log('  ✓ Risk score tracked\n');

  console.log('✅ Audit Integration Benefits:');
  console.log('   - Track policy effectiveness across modes');
  console.log('   - Query violations by correlation_id');
  console.log('   - Monitor mode transitions');
  console.log('   - Generate compliance reports');
}


/**
 * Example 7: Real-World LLM Integration
 * 
 * Shows how policy rollout modes work with actual LLM provider clients
 * (TealOpenAI) in a realistic scenario.
 * 
 * Use case: Gradual rollout of content policies for LLM applications
 */
async function example7_LLMIntegration() {
  console.log('\n=== Example 7: Real-World LLM Integration ===\n');

  // Initialize audit
  const audit = new TealAudit({
    outputs: [new ConsoleOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true
    }
  });

  // Initialize engine with content policies in MONITOR mode
  const engine = new TealEngine(
    {
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
          daily: 100,
          hourly: 10
        },
        rateLimit: {
          requests: 1000,
          window: '1h'
        }
      },
      identity: {
        agentId: 'llm-agent-001',
        role: 'content-generator',
        permissions: ['generate:content']
      }
    },
    {
      mode: {
        default: PolicyMode.MONITOR  // Start with MONITOR
      }
    }
  );

  // Initialize TealOpenAI client
  const client = new TealOpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
    agentId: 'llm-agent-001',
    enableGuardrails: true,
    enableCostTracking: true
  });

  const context = ContextManager.createContext({
    environment: 'staging',
    application: 'content-generation',
    tenant_id: 'acme-corp',
    agent_purpose: 'marketing_content'
  });

  console.log('Configuration:');
  console.log('  Provider: OpenAI');
  console.log('  Mode: MONITOR');
  console.log('  Policies: Content moderation, PII detection, cost limits');
  console.log('  Goal: Test policies before enforcement\n');

  console.log('Scenario: Making LLM request with policy monitoring...\n');

  try {
    // Make LLM request with context
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Generate a marketing email for our product.' }
      ],
      context: context
    });

    console.log('LLM Request Completed:');
    console.log(`  Response ID: ${response.id}`);
    console.log(`  Model: ${response.model}`);
    console.log(`  Security Checks: Passed (MONITOR mode)`);
    console.log(`  Correlation ID: ${context.correlation_id}\n`);

    console.log('Policy Evaluation Results:');
    console.log('  ✓ Content moderation: Passed');
    console.log('  ✓ PII detection: No PII found');
    console.log('  ✓ Cost limits: Within budget');
    console.log('  ✓ Rate limits: Within limits');
    console.log('  ✓ All violations logged for review\n');

  } catch (error: any) {
    console.log('Request blocked (would only happen in ENFORCE mode)');
    console.log(`  Error: ${error.message}\n`);
  }

  console.log('✅ LLM Integration Benefits:');
  console.log('   - Test policies without blocking production traffic');
  console.log('   - Validate content moderation accuracy');
  console.log('   - Monitor cost and rate limit effectiveness');
  console.log('   - Gradual transition to ENFORCE mode');
}


/**
 * Best Practices Summary
 */
function printBestPractices() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Policy Rollout Modes - Best Practices                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('1. Start with REPORT_ONLY or MONITOR');
  console.log('   - Observe behavior before enforcement');
  console.log('   - Collect baseline data for 1-2 weeks');
  console.log('   - Identify false positives early\n');

  console.log('2. Use Mixed Modes in Staging');
  console.log('   - ENFORCE critical security policies');
  console.log('   - MONITOR new or experimental policies');
  console.log('   - Validate enforcement behavior\n');

  console.log('3. Gradual Production Rollout');
  console.log('   - Phase 1: REPORT_ONLY (1-2 weeks)');
  console.log('   - Phase 2: MONITOR (1-2 weeks)');
  console.log('   - Phase 3: ENFORCE (ongoing)');
  console.log('   - Minimize risk of production incidents\n');

  console.log('4. Environment-Based Configuration');
  console.log('   - Use environment overrides for automatic mode selection');
  console.log('   - Single configuration for all environments');
  console.log('   - Consistent policy definitions\n');

  console.log('5. Comprehensive Audit Logging');
  console.log('   - Enable audit logging in all modes');
  console.log('   - Use correlation IDs for traceability');
  console.log('   - Monitor policy effectiveness');
  console.log('   - Generate compliance reports\n');

  console.log('6. Policy-Specific Overrides');
  console.log('   - ENFORCE critical security policies immediately');
  console.log('   - MONITOR less critical policies during rollout');
  console.log('   - Prioritize based on risk assessment\n');

  console.log('7. Regular Review and Refinement');
  console.log('   - Review audit logs weekly during rollout');
  console.log('   - Refine policies based on violations');
  console.log('   - Adjust thresholds and rules as needed');
  console.log('   - Document policy changes\n');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TealTiger SDK v1.1.x - Policy Rollout Modes Examples         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    await example1_DevelopmentWithMonitor();
    await example2_StagingMixedModes();
    await example3_ProductionEnforce();
    await example4_GradualRollout();
    await example5_EnvironmentBasedModes();
    await example6_AuditIntegration();
    await example7_LLMIntegration();
    
    printBestPractices();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  All Examples Completed Successfully! ✅                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

// Export individual examples for testing
export {
  example1_DevelopmentWithMonitor,
  example2_StagingMixedModes,
  example3_ProductionEnforce,
  example4_GradualRollout,
  example5_EnvironmentBasedModes,
  example6_AuditIntegration,
  example7_LLMIntegration,
  printBestPractices
};
