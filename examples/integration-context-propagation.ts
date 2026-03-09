/**
 * TealTiger SDK v1.1.x - Enterprise Adoption Features
 * Integration Example: ExecutionContext Propagation
 * 
 * This example demonstrates how ExecutionContext flows through all TealTiger components:
 * - Provider Clients (TealOpenAI, TealAnthropic)
 * - TealEngine (policy evaluation)
 * - TealGuard (guardrail checks)
 * - TealCircuit (circuit breaker)
 * - TealAudit (audit logging)
 * 
 * All components use the same correlation_id for end-to-end traceability.
 */

import { TealOpenAI } from '../src/clients/TealOpenAI';
import { TealEngine } from '../src/core/engine/TealEngine';
import { TealGuard } from '../src/core/guard/TealGuard';
import { TealCircuit } from '../src/core/circuit/TealCircuit';
import { TealAudit, ConsoleOutput } from '../src/core/audit/TealAudit';
import { ContextManager } from '../src/core/context/ContextManager';
import { PolicyMode, DecisionAction } from '../src/core/engine/types';
import { RedactionLevel } from '../src/core/audit/redaction';

/**
 * Example 1: Basic Context Propagation
 * 
 * Shows how to create an ExecutionContext and pass it through provider clients.
 */
async function example1_BasicContextPropagation() {
  console.log('\n=== Example 1: Basic Context Propagation ===\n');

  // Create execution context with correlation_id
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    application: 'customer-support',
    environment: 'production',
    agent_purpose: 'ticket_resolution'
  });

  console.log('Created ExecutionContext:');
  console.log(`  correlation_id: ${context.correlation_id}`);
  console.log(`  tenant_id: ${context.tenant_id}`);
  console.log(`  application: ${context.application}`);
  console.log(`  environment: ${context.environment}`);

  // Initialize TealOpenAI client
  const client = new TealOpenAI({
    apiKey: 'test-key',
    agentId: 'support-agent-001'
  });

  // Make request with context - correlation_id flows through all components
  const response = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Hello, how can I help you today?' }
    ],
    context // Pass ExecutionContext
  });

  console.log('\nResponse received with security metadata:');
  console.log(`  Response ID: ${response.id}`);
  console.log(`  Security checks: ${response.security ? 'Passed' : 'N/A'}`);
}

/**
 * Example 2: TealEngine with ExecutionContext
 * 
 * Shows how TealEngine evaluates policies with ExecutionContext and returns
 * Decision objects with correlation_id.
 */
async function example2_TealEngineWithContext() {
  console.log('\n=== Example 2: TealEngine with ExecutionContext ===\n');

  // Create execution context
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    environment: 'staging',
    workflow_id: 'customer-support-v2',
    run_id: 'run-12345'
  });

  console.log('Created ExecutionContext:');
  console.log(`  correlation_id: ${context.correlation_id}`);
  console.log(`  workflow_id: ${context.workflow_id}`);
  console.log(`  run_id: ${context.run_id}`);

  // Initialize TealEngine with MONITOR mode
  const engine = new TealEngine(
    {
      tools: {
        file_delete: { allowed: false },
        customer_data_read: { allowed: true }
      },
      identity: {
        agentId: 'support-001',
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

  // Evaluate policy with context
  const decision = engine.evaluateWithMode(
    {
      agentId: 'support-001',
      action: 'tool.execute',
      tool: 'file_delete'
    },
    context
  );

  console.log('\nDecision returned:');
  console.log(`  action: ${decision.action}`);
  console.log(`  mode: ${decision.mode}`);
  console.log(`  correlation_id: ${decision.correlation_id}`);
  console.log(`  workflow_id: ${decision.workflow_id}`);
  console.log(`  run_id: ${decision.run_id}`);
  console.log(`  risk_score: ${decision.risk_score}`);
  console.log(`  reason: ${decision.reason}`);
}

/**
 * Example 3: TealGuard with ExecutionContext
 * 
 * Shows how TealGuard checks content with ExecutionContext and returns
 * Decision objects with correlation_id.
 */
async function example3_TealGuardWithContext() {
  console.log('\n=== Example 3: TealGuard with ExecutionContext ===\n');

  // Create execution context
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    application: 'content-moderation',
    environment: 'production'
  });

  console.log('Created ExecutionContext:');
  console.log(`  correlation_id: ${context.correlation_id}`);

  // Initialize TealGuard
  const guard = new TealGuard({
    enableCache: true,
    cacheTTL: 60000
  });

  // Check content with context
  const decision = await guard.check(
    'This is a test message with no harmful content.',
    context
  );

  console.log('\nGuardrail Decision:');
  console.log(`  action: ${decision.action}`);
  console.log(`  correlation_id: ${decision.correlation_id}`);
  console.log(`  risk_score: ${decision.risk_score}`);
  console.log(`  reason: ${decision.reason}`);
  console.log(`  cache_hit: ${decision.metadata?.cache_hit}`);
}

/**
 * Example 4: TealCircuit with ExecutionContext
 * 
 * Shows how TealCircuit evaluates circuit state with ExecutionContext and
 * returns Decision objects with correlation_id.
 */
async function example4_TealCircuitWithContext() {
  console.log('\n=== Example 4: TealCircuit with ExecutionContext ===\n');

  // Create execution context
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    application: 'api-gateway',
    environment: 'production'
  });

  console.log('Created ExecutionContext:');
  console.log(`  correlation_id: ${context.correlation_id}`);

  // Initialize TealCircuit
  const circuit = new TealCircuit({
    failureThreshold: 5,
    timeout: 60000,
    halfOpenRequests: 3
  });

  // Evaluate circuit state with context
  const decision = circuit.evaluate(context);

  console.log('\nCircuit Decision:');
  console.log(`  action: ${decision.action}`);
  console.log(`  correlation_id: ${decision.correlation_id}`);
  console.log(`  circuit_state: ${decision.metadata?.circuit_state}`);
  console.log(`  risk_score: ${decision.risk_score}`);
  console.log(`  reason: ${decision.reason}`);
}

/**
 * Example 5: TealAudit with ExecutionContext
 * 
 * Shows how TealAudit logs events with ExecutionContext and supports
 * querying by correlation_id.
 */
async function example5_TealAuditWithContext() {
  console.log('\n=== Example 5: TealAudit with ExecutionContext ===\n');

  // Initialize TealAudit with secure defaults
  const audit = new TealAudit({
    outputs: [new ConsoleOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    }
  });

  // Create execution context
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    application: 'audit-example',
    environment: 'production'
  });

  console.log('Created ExecutionContext:');
  console.log(`  correlation_id: ${context.correlation_id}`);

  // Log versioned audit event with context propagation
  const event = audit.propagateContext(
    {
      schema_version: '1.0.0',
      event_type: 'policy.evaluation' as any,
      timestamp: new Date().toISOString(),
      correlation_id: 'temp-id', // Will be replaced by context.correlation_id
      action: DecisionAction.ALLOW,
      risk_score: 25,
      mode: PolicyMode.ENFORCE,
      policy_id: 'test-policy',
      policy_version: '1.0.0'
    },
    context
  );

  console.log('\nEnriched Audit Event:');
  console.log(`  correlation_id: ${event.correlation_id}`);
  console.log(`  tenant_id: ${event.metadata?.tenant_id}`);
  console.log(`  environment: ${event.metadata?.environment}`);

  // Log the event
  audit.log(event);

  console.log('\nAudit event logged successfully');
}

/**
 * Example 6: End-to-End Integration
 * 
 * Shows complete flow: Provider → TealEngine → TealGuard → TealCircuit → TealAudit
 * All components share the same correlation_id for traceability.
 */
async function example6_EndToEndIntegration() {
  console.log('\n=== Example 6: End-to-End Integration ===\n');

  // Step 1: Create ExecutionContext
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    application: 'customer-support',
    environment: 'production',
    agent_purpose: 'ticket_resolution',
    workflow_id: 'support-workflow-v1',
    run_id: 'run-67890'
  });

  console.log('Step 1: Created ExecutionContext');
  console.log(`  correlation_id: ${context.correlation_id}`);
  console.log(`  workflow_id: ${context.workflow_id}`);
  console.log(`  run_id: ${context.run_id}`);

  // Step 2: Initialize TealAudit
  const audit = new TealAudit({
    outputs: [new ConsoleOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true
    }
  });

  console.log('\nStep 2: Initialized TealAudit');

  // Step 3: Initialize TealEngine
  const engine = new TealEngine(
    {
      tools: {
        customer_data_read: { allowed: true },
        file_delete: { allowed: false }
      },
      identity: {
        agentId: 'support-001',
        role: 'customer-support',
        permissions: ['read:customer_data']
      }
    },
    {
      mode: {
        default: PolicyMode.ENFORCE
      }
    }
  );

  console.log('Step 3: Initialized TealEngine');

  // Step 4: Evaluate policy with context
  const policyDecision = engine.evaluateWithMode(
    {
      agentId: 'support-001',
      action: 'tool.execute',
      tool: 'customer_data_read'
    },
    context
  );

  console.log('\nStep 4: Policy Evaluation');
  console.log(`  action: ${policyDecision.action}`);
  console.log(`  correlation_id: ${policyDecision.correlation_id}`);
  console.log(`  Same as context: ${policyDecision.correlation_id === context.correlation_id}`);

  // Step 5: Initialize TealGuard
  const guard = new TealGuard();

  console.log('\nStep 5: Initialized TealGuard');

  // Step 6: Check content with context
  const guardDecision = await guard.check(
    'Read customer data for ticket #12345',
    context
  );

  console.log('\nStep 6: Guardrail Check');
  console.log(`  action: ${guardDecision.action}`);
  console.log(`  correlation_id: ${guardDecision.correlation_id}`);
  console.log(`  Same as context: ${guardDecision.correlation_id === context.correlation_id}`);

  // Step 7: Initialize TealCircuit
  const circuit = new TealCircuit({
    failureThreshold: 5,
    timeout: 60000,
    halfOpenRequests: 3
  });

  console.log('\nStep 7: Initialized TealCircuit');

  // Step 8: Evaluate circuit with context
  const circuitDecision = circuit.evaluate(context);

  console.log('\nStep 8: Circuit Evaluation');
  console.log(`  action: ${circuitDecision.action}`);
  console.log(`  correlation_id: ${circuitDecision.correlation_id}`);
  console.log(`  Same as context: ${circuitDecision.correlation_id === context.correlation_id}`);

  // Step 9: Log all decisions to audit
  console.log('\nStep 9: Logging to Audit');

  // Log policy decision
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: 'policy.evaluation' as any,
      timestamp: new Date().toISOString(),
      correlation_id: policyDecision.correlation_id,
      action: policyDecision.action,
      risk_score: policyDecision.risk_score,
      mode: policyDecision.mode,
      policy_id: policyDecision.policy_id,
      policy_version: policyDecision.policy_version
    },
    context
  );

  console.log('  Logged policy decision');

  // Log guardrail decision
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: 'guardrail.check' as any,
      timestamp: new Date().toISOString(),
      correlation_id: guardDecision.correlation_id,
      action: guardDecision.action,
      risk_score: guardDecision.risk_score,
      mode: guardDecision.mode,
      policy_id: guardDecision.policy_id,
      policy_version: guardDecision.policy_version
    },
    context
  );

  console.log('  Logged guardrail decision');

  // Log circuit decision
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: 'circuit.state_change' as any,
      timestamp: new Date().toISOString(),
      correlation_id: circuitDecision.correlation_id,
      action: circuitDecision.action,
      risk_score: circuitDecision.risk_score,
      mode: circuitDecision.mode,
      policy_id: circuitDecision.policy_id,
      policy_version: circuitDecision.policy_version
    },
    context
  );

  console.log('  Logged circuit decision');

  console.log('\n✅ End-to-End Integration Complete!');
  console.log(`   All components used correlation_id: ${context.correlation_id}`);
  console.log(`   All audit events can be queried by this correlation_id`);
}

/**
 * Example 7: Auto-Generated Context
 * 
 * Shows backwards compatibility - components auto-generate ExecutionContext
 * if not provided.
 */
async function example7_AutoGeneratedContext() {
  console.log('\n=== Example 7: Auto-Generated Context (Backwards Compatibility) ===\n');

  // Initialize TealEngine without providing context
  const engine = new TealEngine({
    tools: {
      test_tool: { allowed: true }
    },
    identity: {
      agentId: 'test-agent',
      role: 'test',
      permissions: ['test']
    }
  });

  // Evaluate without providing ExecutionContext - it will be auto-generated
  const decision = engine.evaluateWithMode({
    agentId: 'test-agent',
    action: 'tool.execute',
    tool: 'test_tool'
  });

  console.log('Decision with auto-generated context:');
  console.log(`  action: ${decision.action}`);
  console.log(`  correlation_id: ${decision.correlation_id}`);
  console.log(`  Auto-generated: ${decision.correlation_id.length > 0}`);

  console.log('\n✅ Backwards compatibility maintained!');
  console.log('   ExecutionContext is optional - auto-generated if not provided');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TealTiger SDK v1.1.x - ExecutionContext Integration Examples ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    await example1_BasicContextPropagation();
    await example2_TealEngineWithContext();
    await example3_TealGuardWithContext();
    await example4_TealCircuitWithContext();
    await example5_TealAuditWithContext();
    await example6_EndToEndIntegration();
    await example7_AutoGeneratedContext();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
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

export {
  example1_BasicContextPropagation,
  example2_TealEngineWithContext,
  example3_TealGuardWithContext,
  example4_TealCircuitWithContext,
  example5_TealAuditWithContext,
  example6_EndToEndIntegration,
  example7_AutoGeneratedContext
};
