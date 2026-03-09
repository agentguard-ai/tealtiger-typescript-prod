# TealTiger SDK v1.1.x Migration Guide

## Overview

TealTiger SDK v1.1.x introduces five P0 (release-gating) enterprise features that transform TealTiger from a developer tool into an enterprise-ready AI security platform. This migration guide helps you upgrade from v1.1.0 to v1.1.x safely and efficiently.

**Good news:** All new features are **100% backwards compatible**. Your existing code will continue to work without any changes.

### What's New in v1.1.x

1. **Policy Rollout Modes** (P0.1): ENFORCE, MONITOR, REPORT_ONLY modes for safe policy deployment
2. **Deterministic Decision Contract** (P0.2): Stable typed Decision object for reliable flows
3. **Correlation IDs + Traceability** (P0.3): ExecutionContext with auto-generated correlation_id
4. **Audit Schema + Redaction Guarantees** (P0.4): Versioned audit events with security-by-default redaction
5. **Policy Test Harness** (P0.5): CLI/library test runner for CI/CD integration

### Key Benefits

- **Zero Breaking Changes**: All existing code works unchanged
- **Opt-In Features**: New capabilities are optional enhancements
- **Security by Default**: Secure configurations out of the box
- **Enterprise Ready**: Compliance, traceability, and testing built-in
- **Zero Infrastructure**: Everything runs client-side in SDK

---

## Backwards Compatibility Guarantees

### What Stays the Same

✅ **All existing APIs work unchanged**
- `TealEngine.evaluate()` continues to work
- `TealOpenAI`, `TealAnthropic` clients unchanged
- `TealGuard.check()` continues to work
- `TealAudit.log()` continues to work

✅ **Default behavior is preserved**
- Policies enforce by default (no mode changes)
- Audit logging works as before
- Decision objects are backwards compatible

✅ **No configuration changes required**
- Existing policy configurations work unchanged
- No new required fields
- All new fields are optional

### What's Enhanced (Opt-In)

🆕 **New optional features you can adopt**
- Policy rollout modes (optional `mode` config)
- ExecutionContext for tracing (optional parameter)
- Enhanced Decision object (extends existing interface)
- Redaction configuration (secure defaults)
- Policy testing framework (new capability)

---

## Quick Start: No Changes Required

If you're happy with your current setup, you don't need to change anything. Your code will continue to work exactly as before.

```typescript
// This code works in v1.1.0 and v1.1.x without changes
import { TealEngine, TealOpenAI } from 'tealtiger';

const engine = new TealEngine({
  tools: {
    'file_delete': { allowed: false }
  }
});

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'my-agent'
});

// Works exactly as before
const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

---

## Migration Path: Gradual Adoption

We recommend adopting new features gradually over 4-6 weeks:

### Week 1-2: Add Correlation IDs
Start tracking requests with correlation IDs for better observability.

### Week 3-4: Enable Policy Rollout Modes
Deploy policies safely with MONITOR mode before enforcing.

### Week 5-6: Add Policy Testing
Validate policies with automated tests before production deployment.

### Ongoing: Enhance as Needed
Add audit redaction, cost tracking, and other features as your needs grow.

---

## Feature-by-Feature Migration

### P0.1: Policy Rollout Modes

#### Before (v1.1.0)
```typescript
// Policies always enforce by default
const engine = new TealEngine({
  tools: {
    'file_delete': { allowed: false }
  }
});

// Violations are blocked immediately
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete'
});
// decision.allowed = false (blocked)
```

#### After (v1.1.x) - Optional Enhancement
```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

// Option 1: Keep default behavior (no changes)
const engine = new TealEngine({
  tools: {
    'file_delete': { allowed: false }
  }
});

// Option 2: Add mode configuration for gradual rollout
const engineWithModes = new TealEngine(
  {
    tools: {
      'file_delete': { allowed: false }
    }
  },
  {
    mode: {
      default: PolicyMode.MONITOR  // Log violations but allow
    }
  }
);

// Option 3: Mixed modes (enforce critical, monitor others)
const engineMixed = new TealEngine(
  {
    tools: {
      'file_delete': { allowed: false },
      'customer_data_read': { allowed: true }
    }
  },
  {
    mode: {
      default: PolicyMode.MONITOR,
      policy: {
        'tools.file_delete': PolicyMode.ENFORCE  // Enforce this one
      }
    }
  }
);
```

**Migration Steps:**
1. No changes required - existing code works
2. (Optional) Add `mode` configuration to TealEngine constructor
3. (Optional) Start with MONITOR mode in production
4. (Optional) Graduate to ENFORCE mode after validation

**Benefits:**
- Safe policy deployment without breaking production
- Observe policy behavior before enforcement
- Gradual rollout reduces risk

---

### P0.2: Deterministic Decision Contract

#### Before (v1.1.0)
```typescript
// PolicyEvaluationResult interface
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete'
});

// Basic fields available
console.log(decision.allowed);  // boolean
console.log(decision.reason);   // string
```

#### After (v1.1.x) - Automatic Enhancement
```typescript
import { DecisionAction, ReasonCode } from 'tealtiger';

// Decision object is a superset of PolicyEvaluationResult
// Your existing code works, but you get more fields automatically
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete'
});

// Old fields still work (backwards compatible)
console.log(decision.allowed);  // Still available

// New fields available automatically
console.log(decision.action);           // DecisionAction.DENY
console.log(decision.reason_codes);     // [ReasonCode.TOOL_NOT_ALLOWED]
console.log(decision.risk_score);       // 95 (0-100)
console.log(decision.correlation_id);   // Auto-generated UUID
console.log(decision.mode);             // PolicyMode.ENFORCE
console.log(decision.component_versions); // { engine: '1.1.0', ... }

// Deterministic decision handling (new capability)
switch (decision.action) {
  case DecisionAction.ALLOW:
    await executeTool();
    break;
  case DecisionAction.DENY:
    throw new Error(`Denied: ${decision.reason_codes.join(', ')}`);
  case DecisionAction.REQUIRE_APPROVAL:
    await requestApproval(decision);
    break;
}

// Risk-based routing (new capability)
if (decision.risk_score > 80) {
  await escalateToHuman(decision);
}
```

**Migration Steps:**
1. No changes required - Decision extends PolicyEvaluationResult
2. (Optional) Use new fields for enhanced decision handling
3. (Optional) Implement risk-based routing
4. (Optional) Use reason codes for specific error handling

**Benefits:**
- Richer decision metadata for better handling
- Standardized reason codes for consistent logic
- Risk scores for intelligent routing
- Component versions for debugging

---

### P0.3: Correlation IDs + Traceability

#### Before (v1.1.0)
```typescript
// No built-in request tracking
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'agent-001'
});

const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Hard to correlate logs and events
```

#### After (v1.1.x) - Optional Enhancement
```typescript
import { ContextManager } from 'tealtiger';

// Option 1: Auto-generated correlation IDs (easiest)
const context = ContextManager.createContext();
// context.correlation_id is auto-generated UUID v4

const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  context: context  // Optional parameter
});

// Option 2: Provide your own correlation ID
const context = ContextManager.createContext({
  correlation_id: 'my-custom-id-12345'
});

// Option 3: Full traceability with metadata
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'customer-support',
  environment: 'production',
  trace_id: 'trace-abc123',  // OpenTelemetry compatible
  workflow_id: 'ticket-resolution-v2',
  run_id: 'run-xyz789',
  metadata: {
    user_id: 'user-12345',
    session_id: 'session-67890'
  }
});

// Context propagates through all components automatically
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'customer_data_read',
  context: context  // Propagates to Decision and audit events
});

// Query audit logs by correlation_id
const events = audit.query({
  correlation_id: context.correlation_id
});
```

**Migration Steps:**
1. No changes required - context parameter is optional
2. (Optional) Add `ContextManager.createContext()` to generate correlation IDs
3. (Optional) Pass context to client methods and engine.evaluate()
4. (Optional) Add tenant_id, trace_id, and other metadata as needed

**Benefits:**
- End-to-end request tracking across all components
- Incident investigation made simple
- OpenTelemetry integration ready
- Workflow-level aggregation for compliance

---

### P0.4: Audit Schema + Redaction Guarantees

#### Before (v1.1.0)
```typescript
import { TealAudit, ConsoleOutput } from 'tealtiger';

// Basic audit configuration
const audit = new TealAudit({
  outputs: [new ConsoleOutput()]
});

// Logs may contain raw prompts/responses
audit.log({
  event_type: 'llm.request',
  timestamp: new Date().toISOString(),
  content: 'User prompt with sensitive data'  // Raw content logged
});
```

#### After (v1.1.x) - Automatic Security Enhancement
```typescript
import { TealAudit, ConsoleOutput, RedactionLevel } from 'tealtiger';

// Option 1: Use secure defaults (no changes required)
const audit = new TealAudit({
  outputs: [new ConsoleOutput()]
  // Defaults:
  // - input_redaction: RedactionLevel.HASH
  // - output_redaction: RedactionLevel.HASH
  // - detect_pii: true
  // - debug_mode: false
});

// Raw content is automatically redacted
audit.log({
  event_type: 'llm.request',
  timestamp: new Date().toISOString(),
  safe_inputs: {
    hash: 'sha256:abc123...',  // SHA-256 hash only
    size: 1024,
    category: 'chat_message'
  }
  // No raw content in logs by default
});

// Option 2: Customize redaction levels
const auditCustom = new TealAudit({
  outputs: [new ConsoleOutput()],
  config: {
    input_redaction: RedactionLevel.HASH,      // SHA-256 hash
    output_redaction: RedactionLevel.SIZE_ONLY, // Size only
    detect_pii: true,                           // Detect PII before logging
    debug_mode: false                           // Never enable in production
  }
});

// Option 3: Development mode (use with caution)
const auditDev = new TealAudit({
  outputs: [new ConsoleOutput()],
  config: {
    input_redaction: RedactionLevel.NONE,  // Raw content (DEBUG ONLY)
    output_redaction: RedactionLevel.SIZE_ONLY,
    detect_pii: true,
    debug_mode: true  // Explicit opt-in required
  }
});
// Logs warning: "DEBUG_MODE_ENABLED: Raw content is being logged"
```

**Migration Steps:**
1. No changes required - secure defaults applied automatically
2. (Optional) Customize redaction levels for your use case
3. (Optional) Enable debug mode only in development (explicit opt-in)
4. Review audit logs to ensure no sensitive data leakage

**Benefits:**
- Security by default - no raw prompts/responses logged
- PII detection and redaction automatic
- Compliance-ready audit trails
- SHA-256 hashing for content verification

**Redaction Levels:**
- `NONE`: Raw content (debug only, requires explicit opt-in)
- `HASH`: SHA-256 hash + size (default, secure)
- `SIZE_ONLY`: Content size only
- `CATEGORY_ONLY`: Content category only
- `FULL`: Complete redaction (no metadata)

---

### P0.5: Policy Test Harness

#### Before (v1.1.0)
```typescript
// Manual policy testing
const engine = new TealEngine({
  tools: {
    'file_delete': { allowed: false }
  }
});

// Test manually
const decision = engine.evaluate({
  agentId: 'test-agent',
  action: 'tool.execute',
  tool: 'file_delete'
});

console.assert(decision.allowed === false, 'Should deny file_delete');
// Tedious, error-prone, no coverage tracking
```

#### After (v1.1.x) - New Capability
```typescript
import { PolicyTester, TestCorpora } from 'tealtiger';
import type { PolicyTestSuite } from 'tealtiger';

// Define test suite
const testSuite: PolicyTestSuite = {
  name: 'Customer Support Policy Tests',
  description: 'Validates customer support agent policies',
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
      name: 'Block file deletion',
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
      tags: ['security', 'critical']
    },
    {
      name: 'Allow customer data read',
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
      tags: ['security', 'allowed']
    },
    // Add starter test corpora
    ...TestCorpora.promptInjection().tests,
    ...TestCorpora.piiDetection().tests
  ]
};

// Run tests
const engine = new TealEngine(testSuite.policy, testSuite.mode);
const tester = new PolicyTester(engine);
const report = tester.runSuite(testSuite);

console.log(`Tests: ${report.passed}/${report.total} passed`);
console.log(`Coverage: ${report.coverage?.coverage_percentage.toFixed(1)}%`);

// Export for CI/CD
const junitXml = tester.exportReport(report, 'junit');
fs.writeFileSync('./test-results.xml', junitXml);

// CLI usage (new)
// $ npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml
```

**Migration Steps:**
1. This is a new capability - no migration needed
2. (Optional) Define test suites for your policies
3. (Optional) Use TestCorpora for comprehensive security tests
4. (Optional) Integrate with CI/CD using CLI

**Benefits:**
- Shift-left security - test policies before deployment
- Comprehensive test coverage with starter corpora
- CI/CD integration with JUnit XML export
- Coverage tracking and reporting
- Prevent policy regressions

---

## Complete Migration Example

Here's a complete before/after example showing how to adopt all five P0 features:

### Before (v1.1.0)

```typescript
import { TealEngine, TealOpenAI, TealAudit, ConsoleOutput } from 'tealtiger';

// Basic setup
const engine = new TealEngine({
  tools: {
    'file_delete': { allowed: false },
    'customer_data_read': { allowed: true }
  }
});

const audit = new TealAudit({
  outputs: [new ConsoleOutput()]
});

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'support-agent'
});

// Make request
const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

### After (v1.1.x) - Full Enterprise Setup

```typescript
import { 
  TealEngine, 
  TealOpenAI, 
  TealAudit, 
  ConsoleOutput,
  FileOutput,
  ContextManager,
  PolicyMode,
  RedactionLevel,
  PolicyTester,
  TestCorpora
} from 'tealtiger';
import type { PolicyTestSuite } from 'tealtiger';

// Step 1: Define and test policies before deployment
const testSuite: PolicyTestSuite = {
  name: 'Customer Support Policy Tests',
  policy: {
    tools: {
      'file_delete': { allowed: false },
      'customer_data_read': { allowed: true }
    }
  },
  mode: { default: PolicyMode.ENFORCE },
  tests: [
    ...TestCorpora.promptInjection().tests,
    ...TestCorpora.piiDetection().tests
  ]
};

const testEngine = new TealEngine(testSuite.policy, testSuite.mode);
const tester = new PolicyTester(testEngine);
const report = tester.runSuite(testSuite);

if (report.failed > 0) {
  throw new Error('Policy tests failed! Fix before deployment.');
}

// Step 2: Configure engine with gradual rollout mode
const engine = new TealEngine(
  {
    tools: {
      'file_delete': { allowed: false },
      'customer_data_read': { allowed: true }
    }
  },
  {
    mode: {
      default: PolicyMode.MONITOR,  // Start with MONITOR
      policy: {
        'tools.file_delete': PolicyMode.ENFORCE  // Enforce critical
      }
    }
  }
);

// Step 3: Configure audit with security-by-default redaction
const audit = new TealAudit({
  outputs: [
    new ConsoleOutput(),
    new FileOutput('./logs/production-audit.log')
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false  // Never enable in production
  }
});

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'support-agent'
});

// Step 4: Create execution context for traceability
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  application: 'customer-support',
  environment: 'production',
  trace_id: 'trace-abc123',
  metadata: {
    user_id: 'user-12345',
    session_id: 'session-67890'
  }
});

// Step 5: Make request with full context propagation
const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  context: context  // Propagates through all components
});

// Step 6: Query audit logs by correlation_id for investigation
const events = audit.query({
  correlation_id: context.correlation_id
});

console.log(`Found ${events.length} events for request ${context.correlation_id}`);
```

**What Changed:**
1. ✅ Added policy testing before deployment (P0.5)
2. ✅ Added mode configuration for gradual rollout (P0.1)
3. ✅ Added audit redaction for security (P0.4)
4. ✅ Added execution context for traceability (P0.3)
5. ✅ Enhanced decision handling automatically (P0.2)

**What Stayed the Same:**
- Core API structure unchanged
- All existing code still works
- No breaking changes

---

## Upgrade Checklist

Use this checklist to track your migration progress:

### Phase 1: Preparation (Week 1)
- [ ] Review this migration guide
- [ ] Update TealTiger SDK to v1.1.x: `npm install tealtiger@latest`
- [ ] Run existing tests to verify backwards compatibility
- [ ] Review new TypeScript types and interfaces
- [ ] Identify policies that need gradual rollout

### Phase 2: Add Traceability (Week 1-2)
- [ ] Import `ContextManager` from tealtiger
- [ ] Add `ContextManager.createContext()` to request handlers
- [ ] Pass context to client methods and engine.evaluate()
- [ ] Verify correlation_id appears in logs
- [ ] Test querying audit logs by correlation_id

### Phase 3: Enable Policy Rollout Modes (Week 2-3)
- [ ] Add `mode` configuration to TealEngine
- [ ] Start with `PolicyMode.MONITOR` in production
- [ ] Monitor audit logs for violations
- [ ] Refine policies based on false positives
- [ ] Graduate critical policies to `PolicyMode.ENFORCE`
- [ ] Graduate all policies to `PolicyMode.ENFORCE` after validation

### Phase 4: Enhance Audit Security (Week 3-4)
- [ ] Review current audit configuration
- [ ] Add `RedactionLevel` configuration if needed
- [ ] Verify PII detection is enabled (default)
- [ ] Ensure debug_mode is disabled in production
- [ ] Test audit logs contain no raw sensitive data
- [ ] Configure file output for production audit logs

### Phase 5: Add Policy Testing (Week 4-5)
- [ ] Define test suites for your policies
- [ ] Use `TestCorpora` for comprehensive security tests
- [ ] Run tests locally with `PolicyTester`
- [ ] Export test reports to JUnit XML
- [ ] Integrate with CI/CD pipeline
- [ ] Set up automated policy testing on every commit

### Phase 6: Optimize and Monitor (Week 5-6)
- [ ] Review Decision objects for enhanced handling
- [ ] Implement risk-based routing if needed
- [ ] Use reason codes for specific error handling
- [ ] Monitor performance metrics
- [ ] Review audit logs for compliance
- [ ] Document your enterprise setup

### Phase 7: Ongoing Maintenance
- [ ] Run policy tests before every deployment
- [ ] Monitor audit logs for anomalies
- [ ] Review correlation_id traces for incidents
- [ ] Update policies based on new threats
- [ ] Keep TealTiger SDK up to date

---

## Breaking Changes

**Good news: There are ZERO breaking changes in v1.1.x!**

All new features are:
- ✅ Backwards compatible
- ✅ Opt-in enhancements
- ✅ Additive only (no removals)
- ✅ Default behavior preserved

### What's NOT Breaking

❌ **No API removals** - All v1.1.0 APIs still work
❌ **No signature changes** - All method signatures unchanged
❌ **No behavior changes** - Default behavior preserved
❌ **No configuration changes required** - Existing configs work
❌ **No dependency updates required** - Same peer dependencies

### What's Enhanced (Non-Breaking)

✅ **Decision object** - Extends PolicyEvaluationResult (superset)
✅ **TealEngine constructor** - Accepts optional second parameter (mode config)
✅ **Client methods** - Accept optional context parameter
✅ **TealAudit** - Uses secure defaults automatically
✅ **New exports** - Additional types and utilities available

---

## Common Migration Patterns

### Pattern 1: Gradual Rollout Strategy

```typescript
// Week 1-2: MONITOR mode everywhere
const engineWeek1 = new TealEngine(policy, {
  mode: { default: PolicyMode.MONITOR }
});

// Week 3-4: ENFORCE critical, MONITOR others
const engineWeek3 = new TealEngine(policy, {
  mode: {
    default: PolicyMode.MONITOR,
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE,
      'tools.database_write': PolicyMode.ENFORCE
    }
  }
});

// Week 5+: ENFORCE everything
const engineWeek5 = new TealEngine(policy, {
  mode: { default: PolicyMode.ENFORCE }
});
```

### Pattern 2: Multi-Environment Configuration

```typescript
// Environment-specific configuration
const getEngineConfig = (env: string) => {
  const basePolicy = {
    tools: {
      'file_delete': { allowed: false },
      'customer_data_read': { allowed: true }
    }
  };

  switch (env) {
    case 'development':
      return {
        policy: basePolicy,
        mode: { default: PolicyMode.MONITOR }
      };
    
    case 'staging':
      return {
        policy: basePolicy,
        mode: {
          default: PolicyMode.MONITOR,
          policy: {
            'tools.file_delete': PolicyMode.ENFORCE
          }
        }
      };
    
    case 'production':
      return {
        policy: basePolicy,
        mode: { default: PolicyMode.ENFORCE }
      };
    
    default:
      throw new Error(`Unknown environment: ${env}`);
  }
};

const config = getEngineConfig(process.env.NODE_ENV || 'development');
const engine = new TealEngine(config.policy, config.mode);
```

### Pattern 3: Context Propagation Middleware

```typescript
// Express middleware for automatic context creation
import { ContextManager } from 'tealtiger';

const tealtigerContextMiddleware = (req, res, next) => {
  // Extract or create context
  req.tealtigerContext = ContextManager.fromHeaders(req.headers) || 
    ContextManager.createContext({
      tenant_id: req.user?.tenantId,
      application: 'api-server',
      environment: process.env.NODE_ENV,
      metadata: {
        user_id: req.user?.id,
        request_id: req.id
      }
    });
  
  // Propagate to response headers
  const headers = ContextManager.toHeaders(req.tealtigerContext);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  next();
};

app.use(tealtigerContextMiddleware);

// Use in route handlers
app.post('/api/chat', async (req, res) => {
  const response = await client.chat.create({
    model: 'gpt-4',
    messages: req.body.messages,
    context: req.tealtigerContext  // Automatic propagation
  });
  
  res.json(response);
});
```

### Pattern 4: Risk-Based Decision Handling

```typescript
import { DecisionAction, ReasonCode } from 'tealtiger';

const handleDecision = async (decision: Decision) => {
  // High risk - escalate to human
  if (decision.risk_score > 80) {
    await escalateToHuman({
      correlation_id: decision.correlation_id,
      risk_score: decision.risk_score,
      reason_codes: decision.reason_codes,
      reason: decision.reason
    });
    throw new Error('High risk operation requires human approval');
  }
  
  // Medium risk - log and allow with monitoring
  if (decision.risk_score > 50) {
    await logHighRiskOperation({
      correlation_id: decision.correlation_id,
      risk_score: decision.risk_score,
      action: decision.action
    });
  }
  
  // Handle specific actions
  switch (decision.action) {
    case DecisionAction.ALLOW:
      return true;
    
    case DecisionAction.DENY:
      if (decision.reason_codes.includes(ReasonCode.TOOL_NOT_ALLOWED)) {
        throw new ToolNotAllowedError(decision.reason);
      }
      if (decision.reason_codes.includes(ReasonCode.COST_BUDGET_EXCEEDED)) {
        throw new BudgetExceededError(decision.reason);
      }
      throw new PolicyViolationError(decision.reason);
    
    case DecisionAction.REQUIRE_APPROVAL:
      await requestApproval(decision);
      return false;
    
    case DecisionAction.REDACT:
      // Content was redacted, proceed with redacted version
      return true;
    
    default:
      throw new Error(`Unhandled decision action: ${decision.action}`);
  }
};
```

### Pattern 5: CI/CD Integration

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
        run: npm ci
      
      - name: Run policy tests
        run: |
          npx tealtiger test ./policies/*.test.json \
            --format=junit \
            --output=./test-results/policy-tests.xml \
            --coverage \
            --min-coverage=80
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: policy-test-results
          path: test-results/
      
      - name: Publish test results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          files: test-results/*.xml
```

---

## Troubleshooting

### Issue: "Cannot find module 'tealtiger'"

**Cause:** TealTiger SDK not installed or outdated version.

**Solution:**
```bash
# Install latest version
npm install tealtiger@latest

# Or update existing installation
npm update tealtiger

# Verify version
npm list tealtiger
# Should show v1.1.x or higher
```

---

### Issue: "Property 'mode' does not exist on type 'TealEngineConfig'"

**Cause:** TypeScript types not updated or using cached types.

**Solution:**
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache

# Reinstall dependencies
npm ci

# Restart TypeScript server in your IDE
# VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

---

### Issue: Correlation IDs not appearing in logs

**Cause:** Context not being passed to components.

**Solution:**
```typescript
// ❌ Wrong - context not passed
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete'
});

// ✅ Correct - pass context
const context = ContextManager.createContext();
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete',
  context: context  // Add this
});
```

---

### Issue: Audit logs still contain raw prompts

**Cause:** Debug mode enabled or custom configuration overriding defaults.

**Solution:**
```typescript
// Check your audit configuration
const audit = new TealAudit({
  outputs: [new ConsoleOutput()],
  config: {
    input_redaction: RedactionLevel.HASH,  // Should be HASH, not NONE
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false  // Should be false in production
  }
});

// Or use secure defaults (recommended)
const audit = new TealAudit({
  outputs: [new ConsoleOutput()]
  // No config = secure defaults
});
```

---

### Issue: Policy tests failing after upgrade

**Cause:** Test expectations may need updating for new Decision fields.

**Solution:**
```typescript
// Update test expectations to use new fields
const testCase: PolicyTestCase = {
  name: 'Block file deletion',
  context: {
    agentId: 'test-agent',
    action: 'tool.execute',
    tool: 'file_delete',
    context: ContextManager.createContext()
  },
  expected: {
    action: DecisionAction.DENY,  // Use DecisionAction enum
    reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],  // Use ReasonCode enum
    risk_score_range: { min: 70, max: 100 }  // Optional but recommended
  }
};
```

---

### Issue: Mode configuration not taking effect

**Cause:** Mode config passed incorrectly or policy ID mismatch.

**Solution:**
```typescript
// ❌ Wrong - mode as first parameter
const engine = new TealEngine({
  mode: { default: PolicyMode.MONITOR }  // Wrong place
});

// ✅ Correct - mode as second parameter
const engine = new TealEngine(
  {
    tools: {
      'file_delete': { allowed: false }
    }
  },
  {
    mode: { default: PolicyMode.MONITOR }  // Correct place
  }
);

// Check policy IDs match exactly
const engine = new TealEngine(
  {
    tools: {
      'file_delete': { allowed: false }  // Policy ID: 'tools.file_delete'
    }
  },
  {
    mode: {
      default: PolicyMode.MONITOR,
      policy: {
        'tools.file_delete': PolicyMode.ENFORCE  // Must match exactly
      }
    }
  }
);
```

---

### Issue: Performance degradation after upgrade

**Cause:** Unlikely, but check for excessive context creation or audit logging.

**Solution:**
```typescript
// ❌ Wrong - creating new context for every operation
for (const item of items) {
  const context = ContextManager.createContext();  // Don't do this
  await processItem(item, context);
}

// ✅ Correct - reuse context for related operations
const context = ContextManager.createContext();
for (const item of items) {
  await processItem(item, context);  // Reuse context
}

// Or create child contexts with span linking
const parentContext = ContextManager.createContext();
for (const item of items) {
  const childContext = ContextManager.propagate(parentContext);
  await processItem(item, childContext);
}
```

**Performance Targets:**
- Mode resolution: < 1ms (p99)
- Context propagation: < 0.5ms (p99)
- Content redaction: < 5ms for 10KB (p99)
- Decision evaluation overhead: < 10ms (p99)

---

### Issue: TypeScript errors with Decision object

**Cause:** Using old PolicyEvaluationResult type instead of Decision.

**Solution:**
```typescript
// ❌ Old type (still works but missing new fields)
import type { PolicyEvaluationResult } from 'tealtiger';
const decision: PolicyEvaluationResult = engine.evaluate(...);

// ✅ New type (recommended)
import type { Decision } from 'tealtiger';
const decision: Decision = engine.evaluate(...);

// Decision extends PolicyEvaluationResult, so both work
// But Decision includes new fields like risk_score, reason_codes, etc.
```

---

### Issue: CLI command not found

**Cause:** TealTiger CLI not installed or not in PATH.

**Solution:**
```bash
# Use npx to run without global install
npx tealtiger test ./policies/*.test.json

# Or install globally
npm install -g tealtiger
tealtiger test ./policies/*.test.json

# Or add to package.json scripts
{
  "scripts": {
    "test:policies": "tealtiger test ./policies/*.test.json"
  }
}
npm run test:policies
```

---

## FAQ

### Q: Do I need to change my existing code?

**A:** No! All new features are backwards compatible and opt-in. Your existing code will continue to work without any changes.

---

### Q: What's the recommended migration timeline?

**A:** We recommend 4-6 weeks for gradual adoption:
- Week 1-2: Add correlation IDs for traceability
- Week 3-4: Enable policy rollout modes (MONITOR → ENFORCE)
- Week 5-6: Add policy testing to CI/CD

But you can adopt features at your own pace or not at all.

---

### Q: Are there any performance impacts?

**A:** Minimal. All new features are designed for production use:
- Mode resolution: < 1ms
- Context propagation: < 0.5ms
- Content redaction: < 5ms for 10KB
- Decision evaluation overhead: < 10ms

These are p99 targets and should not impact your application performance.

---

### Q: Can I use some features but not others?

**A:** Yes! All features are independent and opt-in. You can:
- Use correlation IDs without policy modes
- Use policy modes without testing
- Use audit redaction without correlation IDs
- Mix and match as needed

---

### Q: What happens to my audit logs after upgrade?

**A:** Audit logs automatically use secure defaults (HASH redaction, PII detection enabled). Raw prompts/responses are no longer logged by default. If you need raw content for debugging, you must explicitly enable debug mode.

---

### Q: How do I test the migration before production?

**A:** Follow this approach:
1. Upgrade in development environment first
2. Run existing tests to verify backwards compatibility
3. Add new features incrementally
4. Test in staging with MONITOR mode
5. Graduate to production with ENFORCE mode

---

### Q: Can I roll back if something goes wrong?

**A:** Yes! Since there are no breaking changes:
1. Your code works with both v1.1.0 and v1.1.x
2. You can downgrade by running: `npm install tealtiger@1.1.0`
3. Remove any new feature usage if needed
4. No data migration required

---

### Q: Do I need to update my policy configurations?

**A:** No. Existing policy configurations work unchanged. Mode configuration is optional and added as a second parameter to TealEngine constructor.

---

### Q: What about my existing audit logs?

**A:** Existing audit logs remain unchanged. New audit events will use the versioned schema (v1.0.0) with redaction applied. You can query both old and new events.

---

### Q: How do I know which features to adopt first?

**A:** Recommended priority:
1. **Correlation IDs** (P0.3) - Easiest, immediate value for debugging
2. **Audit Redaction** (P0.4) - Automatic security enhancement
3. **Policy Modes** (P0.1) - Safe deployment for new policies
4. **Policy Testing** (P0.5) - Quality assurance for policy changes
5. **Decision Contract** (P0.2) - Enhanced decision handling (automatic)

---

### Q: Are there any new dependencies?

**A:** No new peer dependencies. TealTiger SDK v1.1.x has the same dependencies as v1.1.0.

---

### Q: How do I get help with migration?

**A:** Multiple resources available:
- This migration guide
- API documentation: `packages/tealtiger-sdk/docs/API-DOCUMENTATION.md`
- Code examples: `packages/tealtiger-sdk/examples/`
- GitHub issues: https://github.com/tealtiger/tealtiger/issues
- Community Discord: [link]

---

### Q: What if I find a bug during migration?

**A:** Please report it:
1. Check existing issues: https://github.com/tealtiger/tealtiger/issues
2. Create new issue with:
   - TealTiger version
   - Code snippet reproducing the issue
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, etc.)

---

### Q: Can I use v1.1.x features with v1.1.0?

**A:** No. New features are only available in v1.1.x. However, your v1.1.0 code will work with v1.1.x without changes.

---

### Q: How do I verify the migration was successful?

**A:** Checklist:
- [ ] All existing tests pass
- [ ] Correlation IDs appear in logs (if enabled)
- [ ] Policy modes work as expected (if enabled)
- [ ] Audit logs contain no raw sensitive data
- [ ] Policy tests pass (if added)
- [ ] No performance degradation
- [ ] No TypeScript errors

---

## Additional Resources

### Documentation
- **API Documentation**: `packages/tealtiger-sdk/docs/API-DOCUMENTATION.md`
- **Requirements**: `.kiro/specs/enterprise-adoption-features/requirements.md`
- **Design Document**: `.kiro/specs/enterprise-adoption-features/design.md`
- **Implementation Tasks**: `.kiro/specs/enterprise-adoption-features/tasks.md`

### Code Examples
- **Enterprise Integration**: `packages/tealtiger-sdk/examples/enterprise-integration.ts`
- **Policy Testing**: `packages/tealtiger-sdk/examples/policy-testing.ts`
- **Correlation IDs & Tracing**: `packages/tealtiger-sdk/examples/correlation-ids-tracing.ts`

### Framework Alignment
- **OWASP Top 10 for Agentic Applications 2026**: Coverage mapping available
- **Google SAIF (Secure AI Framework)**: Alignment documented
- **NIST AI RMF 1.0**: Compliance guidelines available

### Community & Support
- **GitHub Repository**: https://github.com/tealtiger/tealtiger
- **Issue Tracker**: https://github.com/tealtiger/tealtiger/issues
- **Discussions**: https://github.com/tealtiger/tealtiger/discussions
- **Blog**: https://dev.to/nagasatish_chilakamarti_2/introducing-tealtiger-ai-security-cost-control-made-simple-4lma

---

## Summary

TealTiger SDK v1.1.x brings enterprise-grade features to your AI security platform with **zero breaking changes**. All new capabilities are opt-in enhancements that you can adopt at your own pace.

### Key Takeaways

✅ **100% Backwards Compatible** - Your existing code works unchanged

✅ **Opt-In Features** - Adopt new capabilities when you're ready

✅ **Security by Default** - Secure configurations out of the box

✅ **Enterprise Ready** - Compliance, traceability, and testing built-in

✅ **Zero Infrastructure** - Everything runs client-side in SDK

### Next Steps

1. **Upgrade**: `npm install tealtiger@latest`
2. **Test**: Run existing tests to verify compatibility
3. **Adopt**: Follow the migration checklist to add new features
4. **Monitor**: Track correlation IDs and audit logs
5. **Iterate**: Refine policies based on production data

### Migration Timeline Recommendation

| Week | Focus | Features |
|------|-------|----------|
| 1-2 | Traceability | Add correlation IDs (P0.3) |
| 3-4 | Safe Deployment | Enable policy modes (P0.1) |
| 5-6 | Quality Assurance | Add policy testing (P0.5) |
| Ongoing | Optimization | Enhance decision handling (P0.2), audit security (P0.4) |

### Support

If you encounter any issues during migration:
- Review this guide and troubleshooting section
- Check code examples in `packages/tealtiger-sdk/examples/`
- Search existing GitHub issues
- Create a new issue with details
- Join community discussions

**Welcome to TealTiger SDK v1.1.x - Enterprise AI Security Made Simple!** 🎉

---

*Last Updated: February 2026*
*Version: 1.1.x*
*Status: Production Ready*
