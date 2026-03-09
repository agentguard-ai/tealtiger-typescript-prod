# TealTiger SDK v1.1.x - Best Practices Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Policy Rollout Strategy](#policy-rollout-strategy)
3. [Correlation IDs and Traceability](#correlation-ids-and-traceability)
4. [Audit Redaction Configuration](#audit-redaction-configuration)
5. [Policy Testing Workflows](#policy-testing-workflows)
6. [Environment-Specific Configuration](#environment-specific-configuration)
7. [Security Best Practices](#security-best-practices)
8. [Performance Optimization](#performance-optimization)
9. [Compliance and Governance](#compliance-and-governance)
10. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## Introduction

This guide provides actionable best practices for deploying TealTiger SDK v1.1.x enterprise features in production environments. These recommendations are based on real-world enterprise deployments and are designed to maximize security, reliability, and compliance while minimizing operational risk.

### Who Should Read This Guide

- **DevOps Engineers**: Deploying AI security policies across environments
- **Security Engineers**: Implementing security controls and audit trails
- **Platform Engineers**: Integrating TealTiger into existing infrastructure
- **Compliance Officers**: Ensuring regulatory compliance and audit readiness
- **Development Teams**: Building AI applications with security guardrails

### Key Principles

1. **Start Safe, Graduate Gradually**: Begin with MONITOR mode, validate behavior, then enforce
2. **Always Trace**: Use correlation IDs for every request to enable incident investigation
3. **Secure by Default**: Use HASH redaction in production, never log raw content
4. **Test Before Deploy**: Validate policies in CI/CD before production deployment
5. **Environment-Specific**: Configure different enforcement levels per environment

---

## Policy Rollout Strategy

### Overview

The gradual rollout strategy minimizes production risk by validating policy behavior before full enforcement. This approach prevents false positives from disrupting operations while building confidence in policy accuracy.

### Recommended Rollout Timeline

```
Week 1-2: MONITOR Mode (Observation)
Week 3-4: Mixed Mode (Critical Enforcement)
Week 5-6: ENFORCE Mode (Full Enforcement)
```


### Phase 1: MONITOR Mode (Week 1-2)

**Goal**: Observe policy behavior without blocking operations

**Configuration**:
```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

const engine = new TealEngine(
  myPolicies,
  {
    mode: {
      default: PolicyMode.MONITOR
    }
  }
);
```

**Activities**:
- Deploy to production with MONITOR mode
- Collect baseline behavior data
- Analyze audit logs for violations
- Identify false positives
- Refine policy rules based on findings
- Validate that legitimate operations are not flagged

**Success Criteria**:
- Zero production disruption
- Comprehensive violation data collected
- False positive rate < 5%
- Policy rules refined and validated

**Key Metrics to Track**:
- Total requests evaluated
- Violations detected (by policy type)
- False positive rate
- Risk score distribution
- Most common violation types


### Phase 2: Mixed Mode (Week 3-4)

**Goal**: Enforce critical policies while monitoring others

**Configuration**:
```typescript
const engine = new TealEngine(
  myPolicies,
  {
    mode: {
      default: PolicyMode.MONITOR,
      policy: {
        // Enforce critical security policies
        'tools.file_delete': PolicyMode.ENFORCE,
        'tools.database_write': PolicyMode.ENFORCE,
        'tools.admin_access': PolicyMode.ENFORCE,
        'tools.system_command': PolicyMode.ENFORCE,
        
        // Continue monitoring others
        'content.pii': PolicyMode.MONITOR,
        'behavioral.cost_limit': PolicyMode.MONITOR
      }
    }
  }
);
```

**Activities**:
- Enable ENFORCE mode for critical policies only
- Monitor impact on operations
- Validate that critical violations are blocked
- Continue monitoring non-critical policies
- Adjust policy thresholds if needed

**Success Criteria**:
- Critical violations successfully blocked
- No false positive blocks in production
- Non-critical policies validated
- Team confidence in enforcement

**Critical Policies to Enforce First**:
1. **Destructive Operations**: file_delete, database_write, system_command
2. **Privilege Escalation**: admin_access, role_change
3. **Data Exfiltration**: external_api_call (to untrusted domains)
4. **Code Execution**: eval, exec, unsafe_code


### Phase 3: ENFORCE Mode (Week 5-6)

**Goal**: Full enforcement of all policies

**Configuration**:
```typescript
const engine = new TealEngine(
  myPolicies,
  {
    mode: {
      default: PolicyMode.ENFORCE
    }
  }
);
```

**Activities**:
- Enable ENFORCE mode for all policies
- Monitor for unexpected blocks
- Maintain incident response readiness
- Document policy exceptions if needed
- Establish ongoing monitoring

**Success Criteria**:
- All policies enforced successfully
- Incident response procedures validated
- Team trained on policy management
- Audit trail comprehensive and compliant

### Rollback Strategy

Always maintain the ability to quickly rollback to MONITOR mode if issues arise:

```typescript
// Emergency rollback configuration
const EMERGENCY_MONITOR_MODE = {
  mode: {
    default: PolicyMode.MONITOR
  }
};

// Deploy via environment variable or config management
const mode = process.env.EMERGENCY_ROLLBACK === 'true' 
  ? EMERGENCY_MONITOR_MODE 
  : PRODUCTION_ENFORCE_MODE;

const engine = new TealEngine(myPolicies, mode);
```

### Decision Tree: When to Enforce vs Monitor

```
Is this a critical security policy?
├─ YES: Does it have < 5% false positive rate?
│  ├─ YES: ENFORCE immediately
│  └─ NO: Refine policy, continue MONITOR
└─ NO: Is it a compliance requirement?
   ├─ YES: MONITOR for 2 weeks, then ENFORCE
   └─ NO: MONITOR indefinitely, enforce when mature
```


---

## Correlation IDs and Traceability

### Overview

Correlation IDs enable end-to-end request tracking across all TealTiger components and external systems. This is essential for incident investigation, compliance auditing, and distributed tracing.

### Best Practice: Always Use Correlation IDs

**DO**: Create execution context for every request
```typescript
import { ContextManager } from 'tealtiger';

// Create context with auto-generated correlation_id
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'customer-support',
  environment: 'production',
  agent_purpose: 'ticket_resolution'
});

// Use context in all operations
const decision = engine.evaluate(request, context);
const response = await client.chat.create({ ...params, context });
```

**DON'T**: Make requests without context
```typescript
// ❌ BAD: No traceability
const decision = engine.evaluate(request);
const response = await client.chat.create(params);
```

### Correlation ID Patterns

#### Pattern 1: Request-Level Correlation

Use for single-request operations:

```typescript
// Generate new correlation_id per request
app.post('/api/chat', async (req, res) => {
  const context = ContextManager.createContext({
    tenant_id: req.user.tenantId,
    application: 'api',
    environment: process.env.NODE_ENV
  });
  
  const response = await processRequest(req.body, context);
  res.json(response);
});
```

#### Pattern 2: Session-Level Correlation

Use for multi-turn conversations:

```typescript
// Reuse correlation_id across conversation
const sessionContext = ContextManager.createContext({
  tenant_id: req.user.tenantId,
  application: 'chat',
  metadata: {
    session_id: req.session.id,
    user_id: req.user.id
  }
});

// Store context in session
req.session.tealContext = sessionContext;

// Reuse for all requests in session
app.post('/api/chat', async (req, res) => {
  const context = req.session.tealContext;
  const response = await processRequest(req.body, context);
  res.json(response);
});
```


#### Pattern 3: Workflow-Level Correlation

Use for multi-step workflows with governance requirements:

```typescript
// Create workflow context with run_id and workflow_id
const workflowContext = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'workflow-engine',
  workflow_id: 'customer-onboarding-v2',
  run_id: `run-${Date.now()}`,
  metadata: {
    workflow_version: '2.1.0',
    triggered_by: 'user-12345'
  }
});

// Use same context across all workflow steps
async function executeWorkflow(steps, context) {
  for (const step of steps) {
    // Each step gets unique span_id, same run_id
    const stepContext = {
      ...context,
      span_id: `span-${step.id}`,
      parent_span_id: context.span_id
    };
    
    await executeStep(step, stepContext);
  }
}
```

### HTTP Header Propagation

Propagate context across service boundaries:

```typescript
import { ContextManager } from 'tealtiger';

// Service A: Convert context to headers
const context = ContextManager.createContext({ tenant_id: 'acme' });
const headers = ContextManager.toHeaders(context);

// Make HTTP request with headers
const response = await fetch('https://service-b/api', {
  headers: {
    ...headers,
    'Content-Type': 'application/json'
  }
});

// Service B: Extract context from headers
app.post('/api', (req, res) => {
  const context = ContextManager.fromHeaders(req.headers);
  // Context now includes correlation_id from Service A
  const result = processRequest(req.body, context);
  res.json(result);
});
```

### Querying Audit Logs by Correlation ID

```typescript
// Incident investigation
const events = audit.query({
  correlation_id: 'req-abc-123'
});

console.log(`Found ${events.length} events for request`);

// Analyze request timeline
events.forEach(event => {
  console.log(`${event.timestamp}: ${event.event_type}`);
  console.log(`  Action: ${event.action}`);
  console.log(`  Risk Score: ${event.risk_score}`);
});

// Generate compliance report
const report = {
  correlation_id: 'req-abc-123',
  total_events: events.length,
  event_types: [...new Set(events.map(e => e.event_type))],
  max_risk_score: Math.max(...events.map(e => e.risk_score || 0)),
  violations: events.filter(e => e.action === 'DENY')
};
```


---

## Audit Redaction Configuration

### Overview

Audit redaction protects sensitive data while maintaining comprehensive audit trails. TealTiger uses security-by-default configuration that never logs raw prompts or responses in production.

### Best Practice: Use HASH Redaction in Production

**Production Configuration** (Recommended):
```typescript
import { TealAudit, RedactionLevel, FileOutput } from 'tealtiger';

const prodAudit = new TealAudit({
  outputs: [
    new FileOutput('./logs/audit.log')
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false  // NEVER enable in production
  }
});
```

**Why HASH Redaction?**
- Provides content verification via SHA-256 hash
- Enables duplicate detection
- Maintains audit trail integrity
- Prevents data leakage
- Compliant with GDPR, HIPAA, SOC 2

### Redaction Level Decision Matrix

| Environment | Input Redaction | Output Redaction | PII Detection | Debug Mode |
|-------------|----------------|------------------|---------------|------------|
| **Production** | HASH | HASH | ✅ Enabled | ❌ Disabled |
| **Staging** | HASH | HASH | ✅ Enabled | ❌ Disabled |
| **Development** | HASH | SIZE_ONLY | ✅ Enabled | ❌ Disabled |
| **Local Debug** | NONE | NONE | ✅ Enabled | ✅ Enabled (explicit) |

### Environment-Specific Configurations

#### Production (Maximum Security)
```typescript
const prodAudit = new TealAudit({
  outputs: [
    new FileOutput('./logs/prod-audit.log'),
    new SyslogOutput({ host: 'siem.company.com' })
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});
```

#### Staging (Pre-Production Validation)
```typescript
const stagingAudit = new TealAudit({
  outputs: [
    new FileOutput('./logs/staging-audit.log'),
    new ConsoleOutput()
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});
```

#### Development (Debugging Friendly)
```typescript
const devAudit = new TealAudit({
  outputs: [new ConsoleOutput()],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.SIZE_ONLY,  // More readable
    detect_pii: true,
    debug_mode: false  // Still secure by default
  }
});
```


#### Local Debug (Explicit Opt-In Only)
```typescript
// ⚠️ WARNING: Only use for local debugging, NEVER in production
const debugAudit = new TealAudit({
  outputs: [new ConsoleOutput()],
  config: {
    input_redaction: RedactionLevel.NONE,
    output_redaction: RedactionLevel.NONE,
    detect_pii: true,  // Still detect PII for warnings
    debug_mode: true   // Explicit opt-in required
  }
});

// TealAudit will log warning:
// "⚠️ DEBUG MODE ENABLED - Raw content is being logged"
```

### Custom Redaction Rules

Add custom patterns for domain-specific sensitive data:

```typescript
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    custom_redaction: [
      // Redact internal employee IDs
      {
        pattern: /EMP-\d{6}/g,
        replacement: '[EMPLOYEE_ID]'
      },
      // Redact API keys
      {
        pattern: /sk-[a-zA-Z0-9]{48}/g,
        replacement: '[API_KEY]'
      },
      // Redact internal URLs
      {
        pattern: /https?:\/\/internal\.[a-z]+\.company\.com/g,
        replacement: '[INTERNAL_URL]'
      }
    ]
  }
});
```

### PII Detection Configuration

Enable automatic PII detection and redaction:

```typescript
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,  // Automatically detect and redact PII
    pii_types: [
      'ssn',           // Social Security Numbers
      'credit_card',   // Credit card numbers
      'email',         // Email addresses
      'phone',         // Phone numbers
      'ip_address',    // IP addresses
      'bank_account'   // Bank account numbers
    ]
  }
});
```

### Audit Event Structure

Understanding what gets logged:

```typescript
// Example audit event with HASH redaction
{
  schema_version: '1.0.0',
  event_type: 'llm.request',
  timestamp: '2024-02-19T10:30:00.000Z',
  correlation_id: 'req-abc-123',
  agent_id: 'support-agent-001',
  provider: 'openai',
  model: 'gpt-4',
  
  // Redacted inputs (HASH level)
  safe_inputs: {
    hash: 'sha256:a1b2c3d4...',  // SHA-256 hash
    size: 1024,                   // Content size in bytes
    category: 'chat_message'      // Content category
  },
  
  // Redacted outputs (HASH level)
  safe_outputs: {
    hash: 'sha256:e5f6g7h8...',
    size: 512,
    category: 'chat_response'
  },
  
  // Metadata (never redacted)
  metadata: {
    estimated_cost: 0.05,
    actual_cost: 0.048,
    tokens: 40,
    duration_ms: 1250
  }
}
```


---

## Policy Testing Workflows

### Overview

Policy testing enables shift-left security by validating policy behavior before production deployment. This prevents regressions, ensures compliance, and builds confidence in policy accuracy.

### Best Practice: Test Policies in CI/CD Before Deployment

**CI/CD Integration Pattern**:
```yaml
# .github/workflows/policy-tests.yml
name: Policy Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-policies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Run policy tests
        run: npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: policy-test-results
          path: results.xml
      
      - name: Fail on test failures
        if: failure()
        run: exit 1
```

### Test Suite Organization

Organize tests by policy category:

```
policies/
├── tools/
│   ├── file-operations.test.json
│   ├── database-operations.test.json
│   └── system-commands.test.json
├── content/
│   ├── pii-detection.test.json
│   ├── prompt-injection.test.json
│   └── content-moderation.test.json
├── behavioral/
│   ├── cost-limits.test.json
│   ├── rate-limits.test.json
│   └── anomaly-detection.test.json
└── integration/
    └── end-to-end.test.json
```

### Using Starter Test Corpora

Leverage pre-built test suites for comprehensive coverage:

```typescript
import { PolicyTester, TestCorpora } from 'tealtiger';

// Run all starter test corpora
async function runComprehensiveTests(engine) {
  const tester = new PolicyTester(engine);
  
  // 1. Prompt Injection Tests (20+ attack vectors)
  const injectionSuite = TestCorpora.promptInjection();
  const injectionReport = tester.runSuite(injectionSuite);
  console.log(`Prompt Injection: ${injectionReport.passed}/${injectionReport.total}`);
  
  // 2. PII Detection Tests
  const piiSuite = TestCorpora.piiDetection();
  const piiReport = tester.runSuite(piiSuite);
  console.log(`PII Detection: ${piiReport.passed}/${piiReport.total}`);
  
  // 3. Unsafe Code Tests
  const codeSuite = TestCorpora.unsafeCode();
  const codeReport = tester.runSuite(codeSuite);
  console.log(`Unsafe Code: ${codeReport.passed}/${codeReport.total}`);
  
  // 4. Tool Misuse Tests
  const toolSuite = TestCorpora.toolMisuse();
  const toolReport = tester.runSuite(toolSuite);
  console.log(`Tool Misuse: ${toolReport.passed}/${toolReport.total}`);
  
  // 5. Cost Limits Tests
  const costSuite = TestCorpora.costLimits();
  const costReport = tester.runSuite(costSuite);
  console.log(`Cost Limits: ${costReport.passed}/${costReport.total}`);
  
  // Aggregate results
  const totalTests = injectionReport.total + piiReport.total + 
                     codeReport.total + toolReport.total + costReport.total;
  const totalPassed = injectionReport.passed + piiReport.passed + 
                      codeReport.passed + toolReport.passed + costReport.passed;
  
  console.log(`\nTotal: ${totalPassed}/${totalTests} passed`);
  
  return totalPassed === totalTests;
}
```


### Custom Test Suite Example

Define comprehensive tests for your specific policies:

```typescript
import { PolicyTestSuite, PolicyMode, DecisionAction, ReasonCode } from 'tealtiger';

const customerSupportTests: PolicyTestSuite = {
  name: 'Customer Support Agent Policy Tests',
  description: 'Validates policies for customer support agents',
  
  policy: {
    tools: {
      'file_delete': { allowed: false },
      'database_write': { allowed: false },
      'customer_data_read': { allowed: true },
      'send_email': { allowed: true, rateLimit: { max: 100, window: '1h' } }
    },
    identity: {
      agentId: 'support-agent',
      role: 'customer-support',
      permissions: ['read:customer_data', 'send:email']
    },
    behavioral: {
      costLimit: { daily: 50.00, hourly: 10.00 }
    }
  },
  
  mode: { default: PolicyMode.ENFORCE },
  
  tests: [
    // Critical security tests
    {
      name: 'Block file deletion',
      description: 'Should deny file_delete tool usage',
      context: {
        agentId: 'support-agent',
        action: 'tool.execute',
        tool: 'file_delete',
        context: ContextManager.createContext()
      },
      expected: {
        action: DecisionAction.DENY,
        reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
        risk_score_range: { min: 70, max: 100 }
      },
      tags: ['security', 'critical']
    },
    
    // Allowed operations
    {
      name: 'Allow customer data read',
      description: 'Should allow customer_data_read tool',
      context: {
        agentId: 'support-agent',
        action: 'tool.execute',
        tool: 'customer_data_read',
        context: ContextManager.createContext()
      },
      expected: {
        action: DecisionAction.ALLOW,
        reason_codes: [ReasonCode.POLICY_COMPLIANT],
        risk_score_range: { min: 0, max: 30 }
      },
      tags: ['security', 'allowed']
    },
    
    // Cost enforcement
    {
      name: 'Block excessive cost',
      description: 'Should deny request exceeding cost limit',
      context: {
        agentId: 'support-agent',
        action: 'chat.create',
        model: 'gpt-4',
        cost: 15.00,  // Exceeds hourly limit
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
```

### Test Execution Workflow

```typescript
import { TealEngine, PolicyTester } from 'tealtiger';
import * as fs from 'fs';

async function runPolicyTestWorkflow() {
  console.log('Starting policy test workflow...\n');
  
  // 1. Initialize engine with test policy
  const engine = new TealEngine(
    customerSupportTests.policy,
    customerSupportTests.mode
  );
  
  // 2. Create tester instance
  const tester = new PolicyTester(engine);
  
  // 3. Run test suite
  const report = tester.runSuite(customerSupportTests);
  
  // 4. Display results
  console.log(`Tests: ${report.passed}/${report.total} passed`);
  console.log(`Success Rate: ${(report.success_rate * 100).toFixed(1)}%`);
  console.log(`Coverage: ${report.coverage?.coverage_percentage.toFixed(1)}%`);
  
  // 5. Export results for CI/CD
  const junitXml = tester.exportReport(report, 'junit');
  fs.writeFileSync('./test-results.xml', junitXml);
  
  // 6. Fail if tests failed
  if (report.failed > 0) {
    console.error('\n❌ Policy tests failed!');
    process.exit(1);
  }
  
  console.log('\n✅ All policy tests passed!');
  return report;
}
```

### Coverage Requirements

Set minimum coverage thresholds:

```bash
# Require 80% policy coverage
npx tealtiger test ./policies/*.test.json --coverage --min-coverage=80

# Fail if coverage is below threshold
if [ $? -ne 0 ]; then
  echo "Policy coverage below 80%"
  exit 1
fi
```


---

## Environment-Specific Configuration

### Overview

Different environments require different security postures. Use environment-specific configuration to balance security, observability, and operational flexibility.

### Configuration Management Pattern

**Recommended Approach**: Use environment variables and configuration files

```typescript
// config/teal-config.ts
import { PolicyMode, RedactionLevel } from 'tealtiger';

interface TealConfig {
  mode: {
    default: PolicyMode;
    policy?: Record<string, PolicyMode>;
  };
  audit: {
    input_redaction: RedactionLevel;
    output_redaction: RedactionLevel;
    detect_pii: boolean;
    debug_mode: boolean;
  };
}

const configs: Record<string, TealConfig> = {
  production: {
    mode: {
      default: PolicyMode.ENFORCE
    },
    audit: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    }
  },
  
  staging: {
    mode: {
      default: PolicyMode.MONITOR,
      policy: {
        'tools.file_delete': PolicyMode.ENFORCE,
        'tools.database_write': PolicyMode.ENFORCE,
        'tools.admin_access': PolicyMode.ENFORCE
      }
    },
    audit: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    }
  },
  
  development: {
    mode: {
      default: PolicyMode.MONITOR
    },
    audit: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.SIZE_ONLY,
      detect_pii: true,
      debug_mode: false
    }
  }
};

export function getTealConfig(): TealConfig {
  const env = process.env.NODE_ENV || 'development';
  return configs[env] || configs.development;
}
```

### Initialization Pattern

```typescript
// app.ts
import { TealEngine, TealAudit, FileOutput, ConsoleOutput } from 'tealtiger';
import { getTealConfig } from './config/teal-config';
import { myPolicies } from './policies';

// Get environment-specific configuration
const config = getTealConfig();

// Initialize TealEngine with environment-specific mode
const engine = new TealEngine(myPolicies, config.mode);

// Initialize TealAudit with environment-specific redaction
const audit = new TealAudit({
  outputs: process.env.NODE_ENV === 'production'
    ? [new FileOutput('./logs/audit.log')]
    : [new ConsoleOutput()],
  config: config.audit
});

export { engine, audit };
```

### Environment Variable Overrides

Support runtime configuration via environment variables:

```typescript
import { PolicyMode, RedactionLevel } from 'tealtiger';

function getEffectiveMode(): PolicyMode {
  // Allow emergency override via environment variable
  const override = process.env.TEAL_MODE_OVERRIDE;
  if (override) {
    console.warn(`⚠️ Mode override active: ${override}`);
    return override as PolicyMode;
  }
  
  // Use environment-specific default
  const config = getTealConfig();
  return config.mode.default;
}

function getEffectiveRedaction(): RedactionLevel {
  // Allow override for debugging (with warning)
  const override = process.env.TEAL_REDACTION_OVERRIDE;
  if (override) {
    console.warn(`⚠️ Redaction override active: ${override}`);
    if (override === 'NONE') {
      console.error('❌ WARNING: Raw content logging enabled!');
    }
    return override as RedactionLevel;
  }
  
  const config = getTealConfig();
  return config.audit.input_redaction;
}
```


### Multi-Tenant Configuration

Support different configurations per tenant:

```typescript
interface TenantConfig {
  tenantId: string;
  mode: PolicyMode;
  policies: any;
  audit: {
    input_redaction: RedactionLevel;
    output_redaction: RedactionLevel;
  };
}

class TenantConfigManager {
  private configs: Map<string, TenantConfig> = new Map();
  
  getConfig(tenantId: string): TenantConfig {
    return this.configs.get(tenantId) || this.getDefaultConfig();
  }
  
  setConfig(tenantId: string, config: TenantConfig): void {
    this.configs.set(tenantId, config);
  }
  
  private getDefaultConfig(): TenantConfig {
    return {
      tenantId: 'default',
      mode: PolicyMode.ENFORCE,
      policies: {},
      audit: {
        input_redaction: RedactionLevel.HASH,
        output_redaction: RedactionLevel.HASH
      }
    };
  }
}

// Usage
const configManager = new TenantConfigManager();

app.post('/api/chat', async (req, res) => {
  const tenantId = req.user.tenantId;
  const config = configManager.getConfig(tenantId);
  
  const engine = new TealEngine(config.policies, { mode: { default: config.mode } });
  const result = await processRequest(req.body, engine);
  
  res.json(result);
});
```

### Configuration Validation

Validate configuration at startup:

```typescript
function validateTealConfig(config: TealConfig): void {
  // Validate mode configuration
  if (!Object.values(PolicyMode).includes(config.mode.default)) {
    throw new Error(`Invalid default mode: ${config.mode.default}`);
  }
  
  // Validate policy-specific modes
  if (config.mode.policy) {
    for (const [policyId, mode] of Object.entries(config.mode.policy)) {
      if (!Object.values(PolicyMode).includes(mode)) {
        throw new Error(`Invalid mode for policy ${policyId}: ${mode}`);
      }
    }
  }
  
  // Validate redaction levels
  if (!Object.values(RedactionLevel).includes(config.audit.input_redaction)) {
    throw new Error(`Invalid input redaction: ${config.audit.input_redaction}`);
  }
  
  if (!Object.values(RedactionLevel).includes(config.audit.output_redaction)) {
    throw new Error(`Invalid output redaction: ${config.audit.output_redaction}`);
  }
  
  // Warn about debug mode in production
  if (process.env.NODE_ENV === 'production' && config.audit.debug_mode) {
    throw new Error('❌ CRITICAL: Debug mode cannot be enabled in production!');
  }
  
  console.log('✅ TealTiger configuration validated');
}

// Validate at startup
const config = getTealConfig();
validateTealConfig(config);
```

---

## Security Best Practices

### Principle 1: Never Log Raw Content in Production

**DO**:
```typescript
// Production-safe configuration
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});
```

**DON'T**:
```typescript
// ❌ DANGEROUS: Raw content logging
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.NONE,  // ❌ Exposes raw content
    output_redaction: RedactionLevel.NONE, // ❌ Exposes raw content
    debug_mode: true                        // ❌ Never in production
  }
});
```


### Principle 2: Enforce Critical Policies First

Prioritize enforcement of high-risk policies:

**High Priority (Enforce Immediately)**:
- Destructive operations (file_delete, database_drop)
- Privilege escalation (admin_access, role_change)
- Data exfiltration (external_api_call to untrusted domains)
- Code execution (eval, exec, system_command)

**Medium Priority (Monitor, Then Enforce)**:
- PII detection
- Prompt injection detection
- Content moderation
- Cost limits

**Low Priority (Monitor Indefinitely)**:
- Rate limits (non-critical)
- Logging policies
- Metadata validation

### Principle 3: Use Correlation IDs for All Operations

**DO**:
```typescript
// Always create execution context
const context = ContextManager.createContext({
  tenant_id: req.user.tenantId,
  application: 'api',
  environment: process.env.NODE_ENV
});

// Use context in all operations
const decision = engine.evaluate(request, context);
const response = await client.chat.create({ ...params, context });
audit.log(event, context);
```

**DON'T**:
```typescript
// ❌ Missing context - no traceability
const decision = engine.evaluate(request);
const response = await client.chat.create(params);
audit.log(event);
```

### Principle 4: Validate Policies Before Deployment

**DO**:
```typescript
// Run comprehensive tests before deployment
async function validateBeforeDeployment() {
  const engine = new TealEngine(newPolicies, { mode: { default: PolicyMode.ENFORCE } });
  const tester = new PolicyTester(engine);
  
  // Run all test suites
  const suites = [
    TestCorpora.promptInjection(),
    TestCorpora.piiDetection(),
    TestCorpora.unsafeCode(),
    customTestSuite
  ];
  
  for (const suite of suites) {
    const report = tester.runSuite(suite);
    if (report.failed > 0) {
      throw new Error(`Policy tests failed: ${report.failed} failures`);
    }
  }
  
  console.log('✅ All policy tests passed - safe to deploy');
}
```

**DON'T**:
```typescript
// ❌ Deploy without testing
const engine = new TealEngine(newPolicies, { mode: { default: PolicyMode.ENFORCE } });
// Hope for the best...
```

### Principle 5: Implement Defense in Depth

Layer multiple security controls:

```typescript
// Layer 1: Input validation
const guardDecision = await guard.check(userInput, context);
if (guardDecision.action === DecisionAction.DENY) {
  throw new SecurityError('Input validation failed');
}

// Layer 2: Policy evaluation
const policyDecision = engine.evaluate(request, context);
if (policyDecision.action === DecisionAction.DENY) {
  throw new PolicyViolationError('Policy violation detected');
}

// Layer 3: Circuit breaker
const circuitDecision = circuit.check(provider, context);
if (circuitDecision.action === DecisionAction.DENY) {
  throw new CircuitOpenError('Circuit breaker open');
}

// Layer 4: Cost limits
if (estimatedCost > costLimit) {
  throw new CostLimitError('Cost limit exceeded');
}

// All checks passed - proceed with operation
const response = await client.chat.create(params);

// Layer 5: Output validation
const outputDecision = await guard.check(response.content, context);
if (outputDecision.action === DecisionAction.DENY) {
  throw new SecurityError('Output validation failed');
}
```

### Principle 6: Secure Credential Management

**DO**:
```typescript
// Use environment variables or secret management
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // ✅ From environment
  agentId: 'support-agent'
});

// Or use secret management service
import { getSecret } from './secrets';

const apiKey = await getSecret('openai-api-key');
const client = new TealOpenAI({ apiKey, agentId: 'support-agent' });
```

**DON'T**:
```typescript
// ❌ Hardcoded credentials
const client = new TealOpenAI({
  apiKey: 'sk-1234567890abcdef',  // ❌ NEVER hardcode
  agentId: 'support-agent'
});
```


---

## Performance Optimization

### Overview

TealTiger is designed for minimal performance overhead. Follow these best practices to maintain optimal performance in production.

### Performance Targets

| Operation | Target Latency (p99) | Actual |
|-----------|---------------------|--------|
| Mode Resolution | < 1ms | ~0.3ms |
| Decision Evaluation | < 10ms | ~5ms |
| Context Propagation | < 0.5ms | ~0.2ms |
| Content Redaction (10KB) | < 5ms | ~3ms |
| Audit Logging (async) | < 2ms | ~1ms |
| Policy Test Execution | < 100ms | ~50ms |

### Best Practice 1: Reuse Engine Instances

**DO**:
```typescript
// Initialize once, reuse for all requests
const engine = new TealEngine(myPolicies, { mode: { default: PolicyMode.ENFORCE } });
const audit = new TealAudit({ outputs: [new FileOutput('./logs/audit.log')] });

// Reuse in request handlers
app.post('/api/chat', async (req, res) => {
  const decision = engine.evaluate(req.body, context);  // ✅ Reuse
  // ...
});
```

**DON'T**:
```typescript
// ❌ Create new instance per request (slow)
app.post('/api/chat', async (req, res) => {
  const engine = new TealEngine(myPolicies);  // ❌ Recreated every request
  const decision = engine.evaluate(req.body, context);
  // ...
});
```

### Best Practice 2: Enable Caching

```typescript
const engine = new TealEngine(
  myPolicies,
  {
    mode: { default: PolicyMode.ENFORCE },
    cacheEnabled: true,        // ✅ Enable caching
    cacheTTL: 300,             // 5 minutes
    cacheMaxSize: 1000         // Max 1000 entries
  }
);
```

**Cache Hit Rates**:
- Typical: 60-80% for repeated requests
- Reduces evaluation time by ~70% on cache hits

### Best Practice 3: Batch Audit Logging

```typescript
// Use batched output for high-throughput scenarios
import { BatchedFileOutput } from 'tealtiger';

const audit = new TealAudit({
  outputs: [
    new BatchedFileOutput({
      path: './logs/audit.log',
      batchSize: 100,           // Write every 100 events
      flushInterval: 5000       // Or every 5 seconds
    })
  ]
});
```

### Best Practice 4: Optimize Redaction for Large Content

```typescript
// For large content, use SIZE_ONLY or CATEGORY_ONLY
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.SIZE_ONLY,  // Faster for large content
    output_redaction: RedactionLevel.SIZE_ONLY,
    detect_pii: true
  }
});
```

**Redaction Performance**:
- NONE: ~0.1ms (no processing)
- SIZE_ONLY: ~0.5ms (length calculation)
- CATEGORY_ONLY: ~1ms (type detection)
- HASH: ~3ms (SHA-256 hashing)
- FULL: ~0.2ms (placeholder only)

### Best Practice 5: Async Audit Logging

```typescript
// Audit logging is async by default - don't await
audit.log(event, context);  // ✅ Fire and forget

// Only await if you need confirmation
await audit.logSync(event, context);  // Slower, but guaranteed
```

### Best Practice 6: Monitor Performance Metrics

```typescript
import { PerformanceMonitor } from 'tealtiger';

const monitor = new PerformanceMonitor();

// Track decision evaluation time
const startTime = Date.now();
const decision = engine.evaluate(request, context);
const duration = Date.now() - startTime;

monitor.recordMetric('decision_evaluation_ms', duration);

// Alert if p99 exceeds target
if (monitor.getP99('decision_evaluation_ms') > 10) {
  console.warn('⚠️ Decision evaluation latency exceeds target');
}
```

### Performance Troubleshooting

**Symptom**: High decision evaluation latency

**Possible Causes**:
1. Complex policy rules (too many conditions)
2. Cache disabled or low hit rate
3. Large request payloads
4. Synchronous audit logging

**Solutions**:
```typescript
// 1. Enable caching
const engine = new TealEngine(myPolicies, { cacheEnabled: true });

// 2. Simplify policy rules
// Before: 50 conditions per policy
// After: 10-15 conditions per policy

// 3. Use async audit logging
audit.log(event, context);  // Don't await

// 4. Batch audit writes
const audit = new TealAudit({
  outputs: [new BatchedFileOutput({ batchSize: 100 })]
});
```


---

## Compliance and Governance

### Overview

TealTiger provides comprehensive audit trails and security controls to support compliance with major regulatory frameworks.

### Supported Compliance Frameworks

- **GDPR** (General Data Protection Regulation)
- **HIPAA** (Health Insurance Portability and Accountability Act)
- **SOC 2** (Service Organization Control 2)
- **PCI DSS** (Payment Card Industry Data Security Standard)
- **NIST AI RMF 1.0** (AI Risk Management Framework)
- **OWASP Top 10 for Agentic Applications**

### GDPR Compliance

**Requirements**:
1. Right to erasure (data deletion)
2. Data minimization
3. Purpose limitation
4. Audit trails

**TealTiger Implementation**:
```typescript
// 1. PII Detection and Redaction
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,  // ✅ Automatic PII detection
    pii_types: ['email', 'phone', 'ssn', 'ip_address']
  }
});

// 2. Data Minimization (only log necessary metadata)
audit.log({
  event_type: 'llm.request',
  correlation_id: context.correlation_id,
  safe_inputs: { hash: '...', size: 1024 },  // ✅ No raw content
  metadata: { model: 'gpt-4', cost: 0.05 }
});

// 3. Right to Erasure (delete audit logs by tenant)
await audit.deleteByTenant(tenantId);

// 4. Purpose Limitation (policy enforcement)
const decision = engine.evaluate({
  agentId: 'support-agent',
  action: 'customer_data_read',
  purpose: 'customer_support',  // ✅ Explicit purpose
  context
});
```

### HIPAA Compliance

**Requirements**:
1. Access controls
2. Audit trails
3. Data encryption
4. Breach notification

**TealTiger Implementation**:
```typescript
// 1. Access Controls (policy enforcement)
const healthcarePolicy = {
  identity: {
    agentId: 'healthcare-agent',
    role: 'physician',
    permissions: ['read:patient_data', 'write:clinical_notes']
  },
  tools: {
    'patient_data_read': { 
      allowed: true,
      requiresApproval: false,
      auditLevel: 'detailed'
    },
    'patient_data_write': {
      allowed: true,
      requiresApproval: true,  // ✅ Require approval for writes
      auditLevel: 'detailed'
    }
  }
};

// 2. Comprehensive Audit Trails
const audit = new TealAudit({
  outputs: [
    new FileOutput('./logs/hipaa-audit.log'),
    new SyslogOutput({ host: 'siem.hospital.com' })
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true
  }
});

// 3. Encryption at Rest (file output with encryption)
const audit = new TealAudit({
  outputs: [
    new EncryptedFileOutput({
      path: './logs/audit.log',
      encryptionKey: process.env.AUDIT_ENCRYPTION_KEY
    })
  ]
});

// 4. Breach Detection (anomaly detection)
const decision = engine.evaluate(request, context);
if (decision.risk_score > 90) {
  await notifySecurityTeam({
    correlation_id: context.correlation_id,
    risk_score: decision.risk_score,
    reason_codes: decision.reason_codes
  });
}
```

### SOC 2 Compliance

**Requirements**:
1. Security controls
2. Availability monitoring
3. Processing integrity
4. Confidentiality
5. Privacy

**TealTiger Implementation**:
```typescript
// 1. Security Controls (policy enforcement)
const engine = new TealEngine(securityPolicies, {
  mode: { default: PolicyMode.ENFORCE }
});

// 2. Availability Monitoring (circuit breaker)
const circuit = new TealCircuit({
  failureThreshold: 5,
  resetTimeout: 60000,
  monitoringEnabled: true
});

// 3. Processing Integrity (decision validation)
const decision = engine.evaluate(request, context);
if (decision.action === DecisionAction.DENY) {
  audit.log({
    event_type: 'policy.violation',
    correlation_id: context.correlation_id,
    reason_codes: decision.reason_codes,
    risk_score: decision.risk_score
  });
}

// 4. Confidentiality (redaction)
const audit = new TealAudit({
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true
  }
});

// 5. Privacy (PII protection)
const guardDecision = await guard.check(userInput, context);
if (guardDecision.reason_codes.includes(ReasonCode.PII_DETECTED)) {
  return { error: 'PII detected in input' };
}
```


### Compliance Reporting

Generate compliance reports from audit logs:

```typescript
import { ComplianceReporter } from 'tealtiger';

const reporter = new ComplianceReporter(audit);

// Generate SOC 2 compliance report
const soc2Report = await reporter.generateReport({
  framework: 'SOC2',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  tenantId: 'acme-corp'
});

console.log(`Total Requests: ${soc2Report.totalRequests}`);
console.log(`Policy Violations: ${soc2Report.violations}`);
console.log(`Blocked Operations: ${soc2Report.blockedOperations}`);
console.log(`Average Risk Score: ${soc2Report.avgRiskScore}`);

// Export report
fs.writeFileSync('./reports/soc2-2024.json', JSON.stringify(soc2Report, null, 2));
```

### Evidence Collection for Audits

Collect evidence for compliance audits:

```typescript
// Query audit logs for specific time period
const auditEvidence = audit.query({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  tenantId: 'acme-corp',
  eventTypes: [
    'policy.evaluation',
    'policy.violation',
    'guardrail.check',
    'llm.request'
  ]
});

// Generate evidence bundle
const evidenceBundle = {
  period: '2024-01-01 to 2024-12-31',
  tenant: 'acme-corp',
  totalEvents: auditEvidence.length,
  policyEvaluations: auditEvidence.filter(e => e.event_type === 'policy.evaluation').length,
  violations: auditEvidence.filter(e => e.action === 'DENY').length,
  highRiskEvents: auditEvidence.filter(e => e.risk_score > 80).length,
  events: auditEvidence
};

// Export for auditor
fs.writeFileSync('./evidence/audit-evidence-2024.json', JSON.stringify(evidenceBundle, null, 2));
```

### Data Retention Policies

Implement data retention policies:

```typescript
// Automatic log rotation and retention
const audit = new TealAudit({
  outputs: [
    new RotatingFileOutput({
      path: './logs/audit.log',
      maxSize: '100MB',        // Rotate at 100MB
      maxFiles: 90,            // Keep 90 days
      compress: true           // Compress old logs
    })
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true
  }
});

// Manual cleanup for compliance
async function enforceRetentionPolicy() {
  const retentionDays = 90;  // GDPR: 90 days for operational logs
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  await audit.deleteOlderThan(cutoffDate);
  console.log(`✅ Deleted audit logs older than ${retentionDays} days`);
}

// Run daily
setInterval(enforceRetentionPolicy, 24 * 60 * 60 * 1000);
```

---

## Troubleshooting Common Issues

### Issue 1: Policy Tests Failing After Deployment

**Symptoms**:
- Tests pass locally but fail in CI/CD
- Inconsistent test results

**Possible Causes**:
1. Environment-specific configuration differences
2. Missing environment variables
3. Different policy versions

**Solutions**:
```typescript
// 1. Use consistent configuration across environments
const config = getTealConfig();  // Load from config file
const engine = new TealEngine(myPolicies, config.mode);

// 2. Validate environment variables at startup
if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

// 3. Version your policies
const myPolicies = {
  version: '1.2.0',  // ✅ Track policy version
  tools: { /* ... */ }
};

// 4. Use deterministic test data
const testContext = ContextManager.createContext({
  correlation_id: 'test-12345',  // ✅ Fixed for reproducibility
  tenant_id: 'test-tenant'
});
```


### Issue 2: High Latency in Production

**Symptoms**:
- Decision evaluation taking > 10ms
- Request timeouts
- Slow response times

**Possible Causes**:
1. Cache disabled or low hit rate
2. Complex policy rules
3. Synchronous audit logging
4. Large request payloads

**Solutions**:
```typescript
// 1. Enable caching
const engine = new TealEngine(myPolicies, {
  mode: { default: PolicyMode.ENFORCE },
  cacheEnabled: true,
  cacheTTL: 300,
  cacheMaxSize: 1000
});

// 2. Simplify policy rules
// Before: Complex nested conditions
const complexPolicy = {
  tools: {
    'file_delete': {
      allowed: (context) => {
        // ❌ Complex logic with multiple database queries
        return checkPermissions(context) && 
               checkRateLimit(context) && 
               checkCostLimit(context);
      }
    }
  }
};

// After: Simple boolean checks
const simplePolicy = {
  tools: {
    'file_delete': { allowed: false }  // ✅ Simple, fast
  }
};

// 3. Use async audit logging
audit.log(event, context);  // ✅ Don't await

// 4. Monitor performance
const startTime = Date.now();
const decision = engine.evaluate(request, context);
const duration = Date.now() - startTime;

if (duration > 10) {
  console.warn(`⚠️ Slow decision evaluation: ${duration}ms`);
}
```

### Issue 3: Missing Correlation IDs in Audit Logs

**Symptoms**:
- Cannot trace requests end-to-end
- Audit logs missing correlation_id field
- Incident investigation difficult

**Possible Causes**:
1. Context not created or passed
2. Context not propagated through components
3. Audit logging without context

**Solutions**:
```typescript
// 1. Always create context
const context = ContextManager.createContext({
  tenant_id: req.user.tenantId,
  application: 'api'
});

// 2. Pass context to all operations
const decision = engine.evaluate(request, context);  // ✅ Pass context
const response = await client.chat.create({ ...params, context });  // ✅ Pass context
audit.log(event, context);  // ✅ Pass context

// 3. Validate context before operations
function validateContext(context: ExecutionContext): void {
  if (!context.correlation_id) {
    throw new Error('Missing correlation_id in context');
  }
}

// 4. Add middleware to ensure context
app.use((req, res, next) => {
  req.tealContext = ContextManager.createContext({
    tenant_id: req.user?.tenantId,
    application: 'api',
    environment: process.env.NODE_ENV
  });
  next();
});
```

### Issue 4: False Positives Blocking Legitimate Operations

**Symptoms**:
- Legitimate operations blocked by policies
- Users reporting access denied errors
- High false positive rate

**Possible Causes**:
1. Overly restrictive policies
2. Incorrect policy configuration
3. Missing policy exceptions

**Solutions**:
```typescript
// 1. Start with MONITOR mode
const engine = new TealEngine(myPolicies, {
  mode: { default: PolicyMode.MONITOR }  // ✅ Observe first
});

// 2. Analyze violations before enforcing
const violations = audit.query({
  action: 'DENY',
  startDate: '2024-02-01',
  endDate: '2024-02-19'
});

console.log(`Total violations: ${violations.length}`);
violations.forEach(v => {
  console.log(`Policy: ${v.policy_id}, Reason: ${v.reason_codes}`);
});

// 3. Add policy exceptions for legitimate use cases
const refinedPolicy = {
  tools: {
    'file_delete': {
      allowed: false,
      exceptions: [
        {
          condition: 'agentId === "admin-agent"',
          allowed: true
        },
        {
          condition: 'path.startsWith("/tmp/")',
          allowed: true
        }
      ]
    }
  }
};

// 4. Gradually enforce critical policies only
const engine = new TealEngine(myPolicies, {
  mode: {
    default: PolicyMode.MONITOR,
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE,  // Only enforce critical
      'tools.database_write': PolicyMode.ENFORCE
    }
  }
});
```


### Issue 5: Audit Logs Growing Too Large

**Symptoms**:
- Disk space running out
- Slow audit log queries
- Large log files

**Possible Causes**:
1. No log rotation configured
2. Logging too much detail
3. No retention policy

**Solutions**:
```typescript
// 1. Enable log rotation
const audit = new TealAudit({
  outputs: [
    new RotatingFileOutput({
      path: './logs/audit.log',
      maxSize: '100MB',      // Rotate at 100MB
      maxFiles: 30,          // Keep 30 files
      compress: true         // Compress old logs
    })
  ]
});

// 2. Use appropriate redaction level
const audit = new TealAudit({
  config: {
    input_redaction: RedactionLevel.SIZE_ONLY,  // ✅ Less data
    output_redaction: RedactionLevel.SIZE_ONLY,
    detect_pii: true
  }
});

// 3. Implement retention policy
async function cleanupOldLogs() {
  const retentionDays = 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  await audit.deleteOlderThan(cutoffDate);
}

// Run daily
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// 4. Archive to cold storage
async function archiveOldLogs() {
  const archiveDate = new Date();
  archiveDate.setDate(archiveDate.getDate() - 30);
  
  const oldLogs = await audit.query({
    endDate: archiveDate.toISOString()
  });
  
  // Upload to S3 or similar
  await uploadToArchive(oldLogs);
  
  // Delete from local storage
  await audit.deleteOlderThan(archiveDate);
}
```

### Issue 6: PII Detected in Audit Logs

**Symptoms**:
- Raw PII found in audit logs
- Compliance violation
- Security incident

**Immediate Actions**:
```typescript
// 1. Stop logging immediately
audit.pause();

// 2. Rotate logs to secure location
await audit.rotateNow();

// 3. Enable PII detection
const newAudit = new TealAudit({
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,  // ✅ Enable PII detection
    debug_mode: false  // ✅ Ensure debug mode off
  }
});

// 4. Scrub existing logs
async function scrubPIIFromLogs() {
  const logs = await audit.query({});
  
  for (const log of logs) {
    if (containsPII(log)) {
      await audit.redactEvent(log.id);
    }
  }
}

// 5. Notify compliance team
await notifyComplianceTeam({
  incident: 'PII_IN_LOGS',
  severity: 'HIGH',
  timestamp: new Date().toISOString()
});
```

**Prevention**:
```typescript
// Always use HASH redaction in production
const audit = new TealAudit({
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});

// Validate configuration at startup
if (process.env.NODE_ENV === 'production') {
  if (audit.config.debug_mode) {
    throw new Error('❌ Debug mode cannot be enabled in production');
  }
  if (audit.config.input_redaction === RedactionLevel.NONE) {
    throw new Error('❌ Raw content logging not allowed in production');
  }
}
```

---

## Quick Reference

### Policy Rollout Checklist

- [ ] Define comprehensive test suite
- [ ] Run tests in CI/CD
- [ ] Deploy to development with MONITOR mode
- [ ] Collect baseline data (1-2 weeks)
- [ ] Analyze violations and refine policies
- [ ] Deploy to staging with mixed mode (critical policies enforced)
- [ ] Validate critical policy enforcement (1-2 weeks)
- [ ] Deploy to production with ENFORCE mode
- [ ] Monitor for false positives
- [ ] Maintain rollback capability

### Security Checklist

- [ ] Use HASH redaction in production
- [ ] Enable PII detection
- [ ] Disable debug mode in production
- [ ] Use correlation IDs for all requests
- [ ] Implement defense in depth
- [ ] Secure credential management
- [ ] Regular security audits
- [ ] Incident response plan

### Performance Checklist

- [ ] Reuse engine instances
- [ ] Enable caching
- [ ] Use async audit logging
- [ ] Batch audit writes
- [ ] Monitor latency metrics
- [ ] Optimize policy rules
- [ ] Profile hot paths

### Compliance Checklist

- [ ] Enable comprehensive audit trails
- [ ] Implement data retention policies
- [ ] Configure PII detection and redaction
- [ ] Generate compliance reports
- [ ] Collect evidence for audits
- [ ] Document policy decisions
- [ ] Regular compliance reviews


---

## Summary

### Key Takeaways

1. **Start Safe, Graduate Gradually**: Begin with MONITOR mode, validate behavior, then enforce
2. **Always Trace**: Use correlation IDs for every request to enable incident investigation
3. **Secure by Default**: Use HASH redaction in production, never log raw content
4. **Test Before Deploy**: Validate policies in CI/CD before production deployment
5. **Environment-Specific**: Configure different enforcement levels per environment

### Recommended Rollout Timeline

| Week | Phase | Mode | Activities |
|------|-------|------|------------|
| 1-2 | Observation | MONITOR | Collect baseline data, identify violations |
| 3-4 | Partial Enforcement | Mixed | Enforce critical policies, monitor others |
| 5-6 | Full Enforcement | ENFORCE | Enforce all policies, maintain monitoring |

### Production-Ready Configuration

```typescript
import { TealEngine, TealAudit, PolicyMode, RedactionLevel, FileOutput } from 'tealtiger';

// Production engine configuration
const engine = new TealEngine(
  myPolicies,
  {
    mode: { default: PolicyMode.ENFORCE },
    cacheEnabled: true,
    cacheTTL: 300,
    cacheMaxSize: 1000
  }
);

// Production audit configuration
const audit = new TealAudit({
  outputs: [
    new RotatingFileOutput({
      path: './logs/audit.log',
      maxSize: '100MB',
      maxFiles: 90,
      compress: true
    })
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});

// Always use execution context
const context = ContextManager.createContext({
  tenant_id: req.user.tenantId,
  application: 'api',
  environment: 'production'
});

// Evaluate with context
const decision = engine.evaluate(request, context);

// Log with context
audit.log(event, context);
```

### Additional Resources

- **API Documentation**: `./API-DOCUMENTATION.md`
- **Migration Guide**: `./MIGRATION-GUIDE-v1.1.x.md`
- **Examples**: `../examples/`
  - `enterprise-integration.ts` - Complete enterprise setup
  - `policy-testing.ts` - Policy testing examples
  - `correlation-ids-tracing.ts` - Tracing examples
- **Starter Test Corpora**: `TestCorpora` class in SDK
- **CLI Documentation**: `npx tealtiger --help`

### Getting Help

- **GitHub Issues**: https://github.com/tealtiger/tealtiger/issues
- **Documentation**: https://docs.tealtiger.com
- **Community**: https://discord.gg/tealtiger
- **Enterprise Support**: enterprise@tealtiger.com

---

## Appendix: Configuration Templates

### Development Environment

```typescript
// config/development.ts
export const developmentConfig = {
  mode: {
    default: PolicyMode.MONITOR
  },
  audit: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.SIZE_ONLY,
    detect_pii: true,
    debug_mode: false
  },
  cache: {
    enabled: true,
    ttl: 60,
    maxSize: 100
  }
};
```

### Staging Environment

```typescript
// config/staging.ts
export const stagingConfig = {
  mode: {
    default: PolicyMode.MONITOR,
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE,
      'tools.database_write': PolicyMode.ENFORCE,
      'tools.admin_access': PolicyMode.ENFORCE,
      'tools.system_command': PolicyMode.ENFORCE
    }
  },
  audit: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  },
  cache: {
    enabled: true,
    ttl: 300,
    maxSize: 500
  }
};
```

### Production Environment

```typescript
// config/production.ts
export const productionConfig = {
  mode: {
    default: PolicyMode.ENFORCE
  },
  audit: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  },
  cache: {
    enabled: true,
    ttl: 300,
    maxSize: 1000
  },
  monitoring: {
    enabled: true,
    alertThresholds: {
      latency_p99: 10,
      error_rate: 0.01,
      violation_rate: 0.05
    }
  }
};
```

---

**Document Version**: 1.0.0  
**Last Updated**: February 19, 2024  
**TealTiger SDK Version**: v1.1.x  
**Maintained By**: TealTiger Team
