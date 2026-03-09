# ExecutionContext Propagation in TealTiger SDK v1.1.x

## Overview

TealTiger SDK v1.1.x introduces **ExecutionContext** for end-to-end request tracing across all components. Every request can be tracked using a unique `correlation_id` that flows through:

- **Provider Clients** (TealOpenAI, TealAnthropic)
- **TealEngine** (policy evaluation)
- **TealGuard** (guardrail checks)
- **TealCircuit** (circuit breaker)
- **TealAudit** (audit logging)

This enables comprehensive observability, debugging, and compliance reporting.

## Key Concepts

### ExecutionContext

An `ExecutionContext` contains metadata about a request:

```typescript
interface ExecutionContext {
  // Required
  correlation_id: string;        // Unique request identifier (UUID v4)
  
  // Optional - Distributed Tracing
  trace_id?: string;             // OpenTelemetry-compatible trace ID
  span_id?: string;              // Current operation span ID
  parent_span_id?: string;       // Parent operation span ID
  
  // Optional - Governance
  workflow_id?: string;          // Logical workflow identifier
  run_id?: string;               // Execution instance identifier
  
  // Optional - Multi-tenancy
  tenant_id?: string;            // Tenant/organization ID
  application?: string;          // Application name
  environment?: string;          // Environment (dev, staging, prod)
  agent_purpose?: string;        // Agent role/purpose
  session_id?: string;           // Session identifier
  user_id?: string;              // User identifier
  
  // Optional - Metadata
  created_at?: string;           // ISO 8601 timestamp
  metadata?: Record<string, any>; // Custom metadata
}
```

### ContextManager

Utility class for creating and managing ExecutionContext:

```typescript
import { ContextManager } from 'tealtiger';

// Create context with auto-generated correlation_id
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'customer-support',
  environment: 'production'
});

// Generate correlation ID manually
const correlationId = ContextManager.generateCorrelationId();

// Convert to/from HTTP headers
const headers = ContextManager.toHeaders(context);
const contextFromHeaders = ContextManager.fromHeaders(headers);

// Propagate context (creates child context with new span_id)
const childContext = ContextManager.propagate(context);
```

## Integration Points

### 1. Provider Clients (TealOpenAI, TealAnthropic)

Provider clients accept an optional `context` parameter in request objects:

```typescript
import { TealOpenAI, ContextManager } from 'tealtiger';

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'support-agent-001'
});

// Create execution context
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'customer-support',
  environment: 'production'
});

// Pass context in request
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
  context // ExecutionContext flows through all components
});
```

**Backwards Compatibility**: If `context` is not provided, it will be auto-generated with a unique `correlation_id`.

### 2. TealEngine (Policy Evaluation)

TealEngine accepts ExecutionContext in `evaluateWithMode()`:

```typescript
import { TealEngine, PolicyMode, ContextManager } from 'tealtiger';

const engine = new TealEngine(
  {
    tools: {
      file_delete: { allowed: false }
    }
  },
  {
    mode: { default: PolicyMode.ENFORCE }
  }
);

const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  workflow_id: 'support-workflow-v1',
  run_id: 'run-12345'
});

// Evaluate with context
const decision = engine.evaluateWithMode(
  {
    agentId: 'agent-001',
    action: 'tool.execute',
    tool: 'file_delete'
  },
  context
);

console.log(decision.correlation_id); // Same as context.correlation_id
console.log(decision.workflow_id);    // Same as context.workflow_id
console.log(decision.run_id);         // Same as context.run_id
```

**Decision Object**: All Decision objects include `correlation_id` and optional context fields (`trace_id`, `workflow_id`, `run_id`, `span_id`, `parent_span_id`).

### 3. TealGuard (Guardrail Checks)

TealGuard accepts ExecutionContext in `check()`:

```typescript
import { TealGuard, ContextManager } from 'tealtiger';

const guard = new TealGuard({
  enableCache: true
});

const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'content-moderation'
});

// Check content with context
const decision = await guard.check(
  'User input to validate',
  context
);

console.log(decision.correlation_id); // Same as context.correlation_id
```

### 4. TealCircuit (Circuit Breaker)

TealCircuit provides an `evaluate()` method that returns a Decision object:

```typescript
import { TealCircuit, ContextManager } from 'tealtiger';

const circuit = new TealCircuit({
  failureThreshold: 5,
  timeout: 60000,
  halfOpenRequests: 3
});

const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'api-gateway'
});

// Evaluate circuit state with context
const decision = circuit.evaluate(context);

console.log(decision.correlation_id);           // Same as context.correlation_id
console.log(decision.metadata?.circuit_state);  // 'closed', 'open', or 'half-open'
```

### 5. TealAudit (Audit Logging)

TealAudit supports context propagation via `propagateContext()` and `log()`:

```typescript
import { TealAudit, ConsoleOutput, ContextManager, DecisionAction, PolicyMode } from 'tealtiger';

const audit = new TealAudit({
  outputs: [new ConsoleOutput()],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true
  }
});

const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  environment: 'production'
});

// Method 1: Propagate context into event
const event = audit.propagateContext(
  {
    schema_version: '1.0.0',
    event_type: 'policy.evaluation',
    timestamp: new Date().toISOString(),
    correlation_id: 'temp-id', // Will be replaced
    action: DecisionAction.ALLOW,
    risk_score: 25,
    mode: PolicyMode.ENFORCE,
    policy_id: 'test-policy',
    policy_version: '1.0.0'
  },
  context
);

audit.log(event);

// Method 2: Pass context directly to log()
audit.log(
  {
    schema_version: '1.0.0',
    event_type: 'guardrail.check',
    timestamp: new Date().toISOString(),
    correlation_id: 'temp-id',
    action: DecisionAction.DENY,
    risk_score: 85
  },
  context // Context propagated automatically
);

// Query events by correlation_id
const events = audit.query({
  correlation_id: context.correlation_id
});
```

## End-to-End Example

Complete flow showing context propagation through all components:

```typescript
import {
  TealOpenAI,
  TealEngine,
  TealGuard,
  TealCircuit,
  TealAudit,
  ContextManager,
  PolicyMode,
  ConsoleOutput,
  RedactionLevel
} from 'tealtiger';

async function endToEndExample() {
  // Step 1: Create ExecutionContext
  const context = ContextManager.createContext({
    tenant_id: 'acme-corp',
    application: 'customer-support',
    environment: 'production',
    agent_purpose: 'ticket_resolution',
    workflow_id: 'support-workflow-v1',
    run_id: 'run-67890'
  });

  console.log('correlation_id:', context.correlation_id);

  // Step 2: Initialize components
  const audit = new TealAudit({
    outputs: [new ConsoleOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true
    }
  });

  const engine = new TealEngine(
    {
      tools: {
        customer_data_read: { allowed: true }
      },
      identity: {
        agentId: 'support-001',
        role: 'customer-support',
        permissions: ['read:customer_data']
      }
    },
    {
      mode: { default: PolicyMode.ENFORCE }
    }
  );

  const guard = new TealGuard();

  const circuit = new TealCircuit({
    failureThreshold: 5,
    timeout: 60000,
    halfOpenRequests: 3
  });

  // Step 3: Evaluate policy with context
  const policyDecision = engine.evaluateWithMode(
    {
      agentId: 'support-001',
      action: 'tool.execute',
      tool: 'customer_data_read'
    },
    context
  );

  console.log('Policy decision correlation_id:', policyDecision.correlation_id);
  console.log('Same as context:', policyDecision.correlation_id === context.correlation_id);

  // Step 4: Check content with context
  const guardDecision = await guard.check(
    'Read customer data for ticket #12345',
    context
  );

  console.log('Guard decision correlation_id:', guardDecision.correlation_id);
  console.log('Same as context:', guardDecision.correlation_id === context.correlation_id);

  // Step 5: Evaluate circuit with context
  const circuitDecision = circuit.evaluate(context);

  console.log('Circuit decision correlation_id:', circuitDecision.correlation_id);
  console.log('Same as context:', circuitDecision.correlation_id === context.correlation_id);

  // Step 6: Log all decisions to audit
  audit.log(
    {
      schema_version: '1.0.0',
      event_type: 'policy.evaluation',
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

  // Step 7: Query audit logs by correlation_id
  const events = audit.query({
    correlation_id: context.correlation_id
  });

  console.log(`Found ${events.length} audit events with correlation_id: ${context.correlation_id}`);
}

endToEndExample();
```

## HTTP Header Propagation

For distributed systems, ExecutionContext can be propagated via HTTP headers:

```typescript
import { ContextManager, CONTEXT_HEADERS } from 'tealtiger';

// Server A: Create context and convert to headers
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'api-gateway'
});

const headers = ContextManager.toHeaders(context);

// Make HTTP request with headers
await fetch('https://api.example.com/endpoint', {
  headers: {
    ...headers,
    'Content-Type': 'application/json'
  }
});

// Server B: Extract context from headers
const incomingHeaders = request.headers;
const receivedContext = ContextManager.fromHeaders(incomingHeaders);

console.log('Received correlation_id:', receivedContext.correlation_id);
```

**Standard Headers**:
- `x-correlation-id`: Correlation ID
- `traceparent`: W3C Trace Context (trace_id)
- `x-workflow-id`: Workflow ID
- `x-run-id`: Run ID
- `x-span-id`: Span ID
- `x-parent-span-id`: Parent Span ID
- `x-tenant-id`: Tenant ID
- `x-application`: Application name
- `x-environment`: Environment
- `x-agent-purpose`: Agent purpose
- `x-session-id`: Session ID
- `x-user-id`: User ID

## Backwards Compatibility

All ExecutionContext parameters are **optional**. Existing code continues to work without modification:

```typescript
// Old code (still works)
const decision = engine.evaluateWithMode({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'test_tool'
});
// correlation_id is auto-generated

// New code (with context)
const context = ContextManager.createContext();
const decision = engine.evaluateWithMode(
  {
    agentId: 'agent-001',
    action: 'tool.execute',
    tool: 'test_tool'
  },
  context
);
// correlation_id from context
```

## Best Practices

1. **Create context at entry point**: Generate ExecutionContext at the start of each request/workflow
2. **Pass context explicitly**: Always pass context to components for consistent tracing
3. **Use workflow_id and run_id**: For governance-grade aggregation and reporting
4. **Propagate via HTTP headers**: Use `ContextManager.toHeaders()` and `fromHeaders()` for distributed systems
5. **Query audit logs by correlation_id**: Use `audit.query({ correlation_id })` for incident investigation
6. **Use span_id for nested operations**: Track operation hierarchy with span_id and parent_span_id

## Performance

- **Context creation**: < 0.5ms (Requirement 7.5)
- **Context propagation**: < 0.5ms (Requirement 7.5)
- **UUID v4 generation**: Cryptographically random (Requirement 3.14)
- **No performance overhead**: ExecutionContext is lightweight and passed by reference

## Security

- **Correlation IDs are UUIDs**: Cryptographically random, unpredictable (Requirement 3.14)
- **No sensitive data**: ExecutionContext should not contain PII or secrets
- **Audit redaction**: TealAudit applies redaction to all logged content (Requirement 4.14)

## Requirements Satisfied

This implementation satisfies the following requirements from the Enterprise Adoption Features spec:

- **Requirement 3.1**: TealEngine accepts ExecutionContext with correlation_id
- **Requirement 3.2**: Auto-generates UUID v4 correlation_id if not provided
- **Requirement 3.3**: Preserves correlation_id in all Decision objects and audit events
- **Requirement 3.8**: ContextManager provides utility methods
- **Requirement 3.9**: ContextManager provides HTTP header conversion
- **Requirement 3.10**: TealEngine propagates ExecutionContext through all components
- **Requirement 3.11**: TealAudit includes correlation_id in all audit events
- **Requirement 3.12**: TealAudit supports querying by correlation_id
- **Requirement 7.1-7.5**: Context propagation completes in < 0.5ms
- **Requirement 12.3**: Backwards compatible (ExecutionContext is optional)

## See Also

- [Enterprise Adoption Features Spec](../../.kiro/specs/enterprise-adoption-features/)
- [Integration Example](../examples/integration-context-propagation.ts)
- [TealEngine Documentation](./TEALENGINE.md)
- [TealAudit Documentation](./TEALAUDIT.md)
