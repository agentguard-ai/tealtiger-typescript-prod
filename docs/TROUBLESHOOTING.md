# TealTiger SDK v1.1.x - Troubleshooting Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Invalid Mode Configuration Errors](#invalid-mode-configuration-errors)
3. [Missing Correlation IDs](#missing-correlation-ids)
4. [Audit Redaction Failures](#audit-redaction-failures)
5. [Policy Test Assertion Failures](#policy-test-assertion-failures)
6. [Mode Override Conflicts](#mode-override-conflicts)
7. [Performance Issues](#performance-issues)
8. [Common Error Messages](#common-error-messages)
9. [Diagnostic Commands](#diagnostic-commands)
10. [Getting Help](#getting-help)

---

## Introduction

This troubleshooting guide helps you diagnose and resolve common issues with TealTiger SDK v1.1.x enterprise features. Each section follows a problem-solution format with symptoms, root causes, and step-by-step resolutions.

### How to Use This Guide

1. **Identify the symptom** - Find the section matching your issue
2. **Check the cause** - Understand why the problem occurs
3. **Apply the solution** - Follow step-by-step instructions
4. **Verify the fix** - Use diagnostic commands to confirm resolution

### Quick Diagnostic Checklist

Before diving into specific issues, run this quick checklist:

```bash
# 1. Verify TealTiger SDK version
npm list tealtiger
# Should show v1.1.x or higher

# 2. Check TypeScript compilation
npx tsc --noEmit

# 3. Run policy tests
npx tealtiger test ./policies/*.test.json

# 4. Check audit log output
tail -f ./logs/audit.log

# 5. Verify environment variables
echo $NODE_ENV
echo $TEAL_MODE_OVERRIDE
```

---

## Invalid Mode Configuration Errors

### Symptom

Application fails to start with error:
```
InvalidConfigurationError: Invalid mode configuration
```

or

```
Error: Invalid default mode: INVALID_MODE
```


### Root Cause

The TealEngine received an invalid PolicyMode value in the mode configuration. Valid values are: `ENFORCE`, `MONITOR`, and `REPORT_ONLY`.

Common causes:
- Typo in mode string (e.g., `'ENFORCED'` instead of `'ENFORCE'`)
- Using lowercase instead of uppercase (e.g., `'monitor'` instead of `'MONITOR'`)
- Invalid environment variable value
- Incorrect mode configuration structure

### Solution

**Step 1: Verify mode configuration syntax**

```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

// ❌ WRONG - Invalid mode string
const engineWrong = new TealEngine(
  myPolicies,
  {
    mode: {
      default: 'ENFORCED'  // Invalid - should be 'ENFORCE'
    }
  }
);

// ❌ WRONG - Lowercase mode
const engineWrong2 = new TealEngine(
  myPolicies,
  {
    mode: {
      default: 'monitor'  // Invalid - should be 'MONITOR'
    }
  }
);

// ✅ CORRECT - Use PolicyMode enum
const engineCorrect = new TealEngine(
  myPolicies,
  {
    mode: {
      default: PolicyMode.ENFORCE  // Valid enum value
    }
  }
);

// ✅ CORRECT - Valid string literal
const engineCorrect2 = new TealEngine(
  myPolicies,
  {
    mode: {
      default: 'ENFORCE'  // Valid string literal
    }
  }
);
```

**Step 2: Validate environment variable values**

```typescript
// Validate environment variable before using
function getValidMode(envVar: string | undefined): PolicyMode {
  const validModes = ['ENFORCE', 'MONITOR', 'REPORT_ONLY'];
  
  if (!envVar) {
    return PolicyMode.ENFORCE;  // Safe default
  }
  
  const upperMode = envVar.toUpperCase();
  
  if (!validModes.includes(upperMode)) {
    console.error(`Invalid mode: ${envVar}. Using ENFORCE as default.`);
    return PolicyMode.ENFORCE;
  }
  
  return upperMode as PolicyMode;
}

// Use validated mode
const mode = getValidMode(process.env.TEAL_MODE);
const engine = new TealEngine(myPolicies, { mode: { default: mode } });
```

**Step 3: Add configuration validation at startup**

```typescript
import { PolicyMode } from 'tealtiger';

function validateModeConfig(config: any): void {
  const validModes = Object.values(PolicyMode);
  
  // Validate default mode
  if (config.mode?.default && !validModes.includes(config.mode.default)) {
    throw new Error(
      `Invalid default mode: ${config.mode.default}. ` +
      `Valid modes: ${validModes.join(', ')}`
    );
  }
  
  // Validate policy-specific modes
  if (config.mode?.policy) {
    for (const [policyId, mode] of Object.entries(config.mode.policy)) {
      if (!validModes.includes(mode as PolicyMode)) {
        throw new Error(
          `Invalid mode for policy ${policyId}: ${mode}. ` +
          `Valid modes: ${validModes.join(', ')}`
        );
      }
    }
  }
  
  console.log('✅ Mode configuration validated');
}

// Validate before creating engine
const config = {
  mode: {
    default: PolicyMode.ENFORCE,
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE
    }
  }
};

validateModeConfig(config);
const engine = new TealEngine(myPolicies, config);
```

### Verification

```bash
# Test configuration validation
node -e "
const { TealEngine, PolicyMode } = require('tealtiger');
const engine = new TealEngine({}, { mode: { default: PolicyMode.ENFORCE } });
console.log('✅ Configuration valid');
"
```

---

## Missing Correlation IDs

### Symptom

Audit logs show `null` or `undefined` correlation IDs:
```json
{
  "event_type": "policy.evaluation",
  "correlation_id": null,
  "timestamp": "2024-02-19T10:30:00.000Z"
}
```

or

Cannot query audit logs by correlation ID:
```typescript
const events = audit.query({ correlation_id: 'req-123' });
// Returns empty array even though events exist
```

### Root Cause

ExecutionContext is not being created or passed to TealEngine and provider clients. Correlation IDs are only generated when ExecutionContext is provided.

Common causes:
- Forgot to create ExecutionContext
- Created context but didn't pass it to methods
- Context not propagating through middleware
- Using old API without context parameter

### Solution

**Step 1: Create ExecutionContext for every request**

```typescript
import { ContextManager } from 'tealtiger';

// ❌ WRONG - No context created
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete'
});
// decision.correlation_id will be auto-generated but not consistent

// ✅ CORRECT - Create and pass context
const context = ContextManager.createContext();
const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete',
  context: context  // Pass context
});
// decision.correlation_id matches context.correlation_id
```

**Step 2: Propagate context through all operations**

```typescript
import { ContextManager, TealOpenAI } from 'tealtiger';

async function handleRequest(req, res) {
  // Create context once per request
  const context = ContextManager.createContext({
    tenant_id: req.user.tenantId,
    application: 'api-server',
    environment: process.env.NODE_ENV
  });
  
  // Pass context to all TealTiger operations
  const decision = engine.evaluate({
    agentId: 'agent-001',
    action: 'chat.create',
    context: context  // Same context
  });
  
  const response = await client.chat.create({
    model: 'gpt-4',
    messages: req.body.messages,
    context: context  // Same context
  });
  
  // All audit events will have the same correlation_id
  console.log(`Request correlation_id: ${context.correlation_id}`);
  
  res.json(response);
}
```

**Step 3: Add middleware for automatic context creation**

```typescript
import { ContextManager } from 'tealtiger';

// Express middleware
function tealtigerContextMiddleware(req, res, next) {
  // Try to extract context from headers (for distributed tracing)
  let context = ContextManager.fromHeaders(req.headers);
  
  // If no context in headers, create new one
  if (!context || !context.correlation_id) {
    context = ContextManager.createContext({
      tenant_id: req.user?.tenantId,
      application: 'api-server',
      environment: process.env.NODE_ENV,
      metadata: {
        user_id: req.user?.id,
        request_path: req.path,
        request_method: req.method
      }
    });
  }
  
  // Attach to request object
  req.tealtigerContext = context;
  
  // Propagate to response headers
  const headers = ContextManager.toHeaders(context);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  next();
}

app.use(tealtigerContextMiddleware);

// Use in route handlers
app.post('/api/chat', async (req, res) => {
  const response = await client.chat.create({
    model: 'gpt-4',
    messages: req.body.messages,
    context: req.tealtigerContext  // Automatic context
  });
  
  res.json(response);
});
```

**Step 4: Verify context propagation**

```typescript
import { ContextManager } from 'tealtiger';

// Create context
const context = ContextManager.createContext({
  tenant_id: 'test-tenant'
});

console.log('Created context:', {
  correlation_id: context.correlation_id,
  tenant_id: context.tenant_id
});

// Make request
const decision = engine.evaluate({
  agentId: 'test-agent',
  action: 'tool.execute',
  tool: 'file_delete',
  context: context
});

console.log('Decision correlation_id:', decision.correlation_id);

// Verify they match
if (decision.correlation_id === context.correlation_id) {
  console.log('✅ Context propagated correctly');
} else {
  console.error('❌ Context not propagated');
}
```

### Verification

```bash
# Check audit logs for correlation IDs
cat ./logs/audit.log | jq '.correlation_id' | head -10

# Should show UUIDs, not null:
# "req-abc-123-def-456"
# "req-xyz-789-ghi-012"

# Query by correlation ID
node -e "
const { TealAudit } = require('tealtiger');
const audit = new TealAudit({ outputs: [] });
const events = audit.query({ correlation_id: 'req-abc-123' });
console.log(\`Found \${events.length} events\`);
"
```

---

## Audit Redaction Failures

### Symptom

Audit logs contain raw prompts or responses:
```json
{
  "event_type": "llm.request",
  "safe_inputs": {
    "content": "User's sensitive data here"  // Should be redacted!
  }
}
```

or

Error during audit logging:
```
Error: Content redaction failed
```

or

Warning in logs:
```
⚠️ DEBUG_MODE_ENABLED: Raw content is being logged
```

### Root Cause

Redaction configuration is incorrect or debug mode is enabled. Common causes:
- Debug mode enabled in production
- Redaction level set to NONE
- PII detection disabled
- Custom redaction rules failing
- Content too large for redaction

### Solution

**Step 1: Verify audit configuration**

```typescript
import { TealAudit, RedactionLevel, FileOutput } from 'tealtiger';

// ❌ WRONG - Debug mode enabled
const auditWrong = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.NONE,  // Dangerous!
    output_redaction: RedactionLevel.NONE,
    debug_mode: true  // Never in production!
  }
});

// ✅ CORRECT - Production-safe configuration
const auditCorrect = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,  // Secure default
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false  // Always false in production
  }
});

// ✅ BEST - Use secure defaults (no config needed)
const auditBest = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')]
  // Defaults to HASH redaction, PII detection enabled, debug mode disabled
});
```

**Step 2: Add environment-specific configuration**

```typescript
import { TealAudit, RedactionLevel, FileOutput, ConsoleOutput } from 'tealtiger';

function createAudit(environment: string): TealAudit {
  const isProd = environment === 'production';
  
  // Never allow debug mode in production
  if (isProd && process.env.TEAL_DEBUG_MODE === 'true') {
    throw new Error('❌ CRITICAL: Debug mode cannot be enabled in production!');
  }
  
  return new TealAudit({
    outputs: isProd 
      ? [new FileOutput('./logs/production-audit.log')]
      : [new ConsoleOutput()],
    config: {
      input_redaction: isProd ? RedactionLevel.HASH : RedactionLevel.SIZE_ONLY,
      output_redaction: isProd ? RedactionLevel.HASH : RedactionLevel.SIZE_ONLY,
      detect_pii: true,  // Always enabled
      debug_mode: false  // Always disabled in production
    }
  });
}

const audit = createAudit(process.env.NODE_ENV || 'development');
```

**Step 3: Handle redaction failures gracefully**

```typescript
import { TealAudit, RedactionLevel } from 'tealtiger';

class SafeAudit extends TealAudit {
  log(event: AuditEvent): void {
    try {
      // Attempt to log with configured redaction
      super.log(event);
    } catch (error) {
      console.error('Audit logging failed:', error);
      
      // Fall back to FULL redaction (safest)
      const safeEvent = {
        ...event,
        safe_inputs: { redacted: true },
        safe_outputs: { redacted: true }
      };
      
      try {
        super.log(safeEvent);
        console.warn('⚠️ Logged with FULL redaction fallback');
      } catch (fallbackError) {
        console.error('❌ Audit logging completely failed:', fallbackError);
        // Don't throw - audit failures should not break application
      }
    }
  }
}

const audit = new SafeAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});
```

**Step 4: Validate redaction at startup**

```typescript
import { TealAudit, RedactionLevel } from 'tealtiger';

function validateAuditConfig(config: any): void {
  // Check for dangerous configurations
  if (config.debug_mode === true) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('❌ CRITICAL: Debug mode cannot be enabled in production!');
    }
    console.warn('⚠️ WARNING: Debug mode enabled - raw content will be logged');
  }
  
  if (config.input_redaction === RedactionLevel.NONE) {
    console.warn('⚠️ WARNING: Input redaction disabled - sensitive data may be logged');
  }
  
  if (config.output_redaction === RedactionLevel.NONE) {
    console.warn('⚠️ WARNING: Output redaction disabled - sensitive data may be logged');
  }
  
  if (config.detect_pii === false) {
    console.warn('⚠️ WARNING: PII detection disabled');
  }
  
  // Recommend secure configuration
  const isSecure = 
    config.input_redaction === RedactionLevel.HASH &&
    config.output_redaction === RedactionLevel.HASH &&
    config.detect_pii === true &&
    config.debug_mode === false;
  
  if (isSecure) {
    console.log('✅ Audit configuration is secure');
  } else {
    console.warn('⚠️ Audit configuration is not using recommended secure defaults');
  }
}

const config = {
  input_redaction: RedactionLevel.HASH,
  output_redaction: RedactionLevel.HASH,
  detect_pii: true,
  debug_mode: false
};

validateAuditConfig(config);
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: config
});
```

### Verification

```bash
# Check audit logs for raw content
cat ./logs/audit.log | jq '.safe_inputs.content' | head -10
# Should show null, not raw content

# Check for redaction metadata
cat ./logs/audit.log | jq '.safe_inputs' | head -5
# Should show: { "hash": "sha256:...", "size": 1024, "category": "..." }

# Check for debug mode warnings
grep "DEBUG_MODE_ENABLED" ./logs/audit.log
# Should return nothing in production

# Verify PII redaction
cat ./logs/audit.log | grep -E '\d{3}-\d{2}-\d{4}|4\d{15}'
# Should return nothing (no SSN or credit card numbers)
```

---

## Policy Test Assertion Failures

### Symptom

Policy tests fail with assertion errors:
```
❌ Test failed: Block file deletion
Expected action: DENY
Actual action: ALLOW
```

or

```
❌ Test failed: PII detection
Expected reason codes: [PII_DETECTED]
Actual reason codes: [POLICY_PASSED]
```

or

```
❌ Test failed: Risk score validation
Expected risk score: 70-100
Actual risk score: 45
```


### Root Cause

Policy configuration doesn't match test expectations. Common causes:
- Policy rules not configured correctly
- Test expectations incorrect
- Mode configuration affecting results
- Policy evaluation logic changed
- Test context missing required fields

### Solution

**Step 1: Verify policy configuration matches test expectations**

```typescript
import { PolicyTestCase, DecisionAction, ReasonCode, PolicyMode } from 'tealtiger';

// Test case
const testCase: PolicyTestCase = {
  name: 'Block file deletion',
  context: {
    agentId: 'test-agent',
    action: 'tool.execute',
    tool: 'file_delete',
    context: ContextManager.createContext()
  },
  expected: {
    action: DecisionAction.DENY,
    reason_codes: [ReasonCode.TOOL_NOT_ALLOWED]
  }
};

// ❌ WRONG - Policy allows file_delete
const policyWrong = {
  tools: {
    'file_delete': { allowed: true }  // Conflicts with test expectation
  }
};

// ✅ CORRECT - Policy denies file_delete
const policyCorrect = {
  tools: {
    'file_delete': { allowed: false }  // Matches test expectation
  }
};

const engine = new TealEngine(policyCorrect, { mode: { default: PolicyMode.ENFORCE } });
const tester = new PolicyTester(engine);
const result = tester.runTest(testCase);

console.log(result.passed ? '✅ Test passed' : '❌ Test failed');
```

**Step 2: Check mode configuration**

```typescript
import { PolicyMode } from 'tealtiger';

// ❌ WRONG - MONITOR mode always allows
const engineMonitor = new TealEngine(
  { tools: { 'file_delete': { allowed: false } } },
  { mode: { default: PolicyMode.MONITOR } }  // Always returns ALLOW
);

// Test expects DENY but gets ALLOW
const result = tester.runTest(testCase);
console.log(result.actual.action);  // ALLOW (wrong!)

// ✅ CORRECT - ENFORCE mode blocks violations
const engineEnforce = new TealEngine(
  { tools: { 'file_delete': { allowed: false } } },
  { mode: { default: PolicyMode.ENFORCE } }  // Returns DENY for violations
);

const result2 = tester.runTest(testCase);
console.log(result2.actual.action);  // DENY (correct!)
```

**Step 3: Debug test failures with detailed output**

```typescript
import { PolicyTester } from 'tealtiger';

const tester = new PolicyTester(engine);
const result = tester.runTest(testCase);

if (!result.passed) {
  console.error('❌ Test failed:', testCase.name);
  console.error('Failure reason:', result.failure_reason);
  
  console.error('\nExpected:');
  console.error('  Action:', result.expected.action);
  console.error('  Reason codes:', result.expected.reason_codes);
  console.error('  Risk score range:', result.expected.risk_score_range);
  
  console.error('\nActual:');
  console.error('  Action:', result.actual.action);
  console.error('  Reason codes:', result.actual.reason_codes);
  console.error('  Risk score:', result.actual.risk_score);
  console.error('  Mode:', result.actual.mode);
  
  console.error('\nPolicy configuration:');
  console.error(JSON.stringify(engine.getPolicy(), null, 2));
}
```

**Step 4: Fix common test issues**

```typescript
// Issue 1: Missing context
// ❌ WRONG
const testCaseWrong: PolicyTestCase = {
  name: 'Test',
  context: {
    agentId: 'test-agent',
    action: 'tool.execute',
    tool: 'file_delete'
    // Missing context field!
  },
  expected: { action: DecisionAction.DENY }
};

// ✅ CORRECT
const testCaseCorrect: PolicyTestCase = {
  name: 'Test',
  context: {
    agentId: 'test-agent',
    action: 'tool.execute',
    tool: 'file_delete',
    context: ContextManager.createContext()  // Add context
  },
  expected: { action: DecisionAction.DENY }
};

// Issue 2: Incorrect reason code expectations
// ❌ WRONG - Expecting wrong reason code
const testCaseWrong2: PolicyTestCase = {
  name: 'Test',
  context: { /* ... */ },
  expected: {
    action: DecisionAction.DENY,
    reason_codes: [ReasonCode.PII_DETECTED]  // Wrong! Should be TOOL_NOT_ALLOWED
  }
};

// ✅ CORRECT - Correct reason code
const testCaseCorrect2: PolicyTestCase = {
  name: 'Test',
  context: { /* ... */ },
  expected: {
    action: DecisionAction.DENY,
    reason_codes: [ReasonCode.TOOL_NOT_ALLOWED]  // Correct!
  }
};

// Issue 3: Risk score range too narrow
// ❌ WRONG - Range too narrow
const testCaseWrong3: PolicyTestCase = {
  name: 'Test',
  context: { /* ... */ },
  expected: {
    action: DecisionAction.DENY,
    risk_score_range: { min: 95, max: 100 }  // Too narrow, actual might be 90
  }
};

// ✅ CORRECT - Reasonable range
const testCaseCorrect3: PolicyTestCase = {
  name: 'Test',
  context: { /* ... */ },
  expected: {
    action: DecisionAction.DENY,
    risk_score_range: { min: 70, max: 100 }  // Reasonable range
  }
};
```

**Step 5: Run tests with verbose output**

```bash
# Run tests with detailed output
npx tealtiger test ./policies/*.test.json --verbose

# Run specific test file
npx tealtiger test ./policies/tools.test.json --verbose

# Run tests with specific tag
npx tealtiger test ./policies/*.test.json --tags=security --verbose

# Generate detailed report
npx tealtiger test ./policies/*.test.json --format=json --output=./report.json
cat ./report.json | jq '.results[] | select(.passed == false)'
```

### Verification

```bash
# Run all tests
npx tealtiger test ./policies/*.test.json

# Check for failures
if [ $? -eq 0 ]; then
  echo "✅ All tests passed"
else
  echo "❌ Some tests failed"
  npx tealtiger test ./policies/*.test.json --verbose
fi

# Generate coverage report
npx tealtiger test ./policies/*.test.json --coverage
```

---

## Mode Override Conflicts

### Symptom

Policy enforcement behavior is inconsistent:
```
Expected: Request blocked (ENFORCE mode)
Actual: Request allowed (MONITOR mode)
```

or

Mode resolution produces unexpected results:
```typescript
console.log(engine.getEffectiveMode('tools.file_delete'));
// Expected: ENFORCE
// Actual: MONITOR
```

or

Multiple mode configurations conflict:
```
Warning: Multiple mode overrides for policy 'tools.file_delete'
```

### Root Cause

Multiple mode configurations are conflicting due to incorrect precedence or configuration structure. Common causes:
- Environment-specific override conflicts with policy-specific override
- Mode configuration in multiple places
- Incorrect precedence understanding
- Environment variable overriding configuration

### Solution

**Step 1: Understand mode resolution precedence**

Mode resolution follows this priority order (highest to lowest):
1. **Policy-specific override** (`mode.policy[policyId]`)
2. **Environment-specific override** (`mode.environment[env]`)
3. **Global default** (`mode.default`)

```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

const engine = new TealEngine(
  myPolicies,
  {
    mode: {
      // Priority 3: Global default (lowest)
      default: PolicyMode.MONITOR,
      
      // Priority 2: Environment-specific (medium)
      environment: {
        'production': PolicyMode.ENFORCE,
        'staging': PolicyMode.MONITOR
      },
      
      // Priority 1: Policy-specific (highest)
      policy: {
        'tools.file_delete': PolicyMode.ENFORCE  // Always enforced
      }
    }
  }
);

// Resolution examples:
// - tools.file_delete: ENFORCE (policy-specific wins)
// - tools.database_write: ENFORCE (environment-specific for production)
// - content.pii: MONITOR (global default)
```

**Step 2: Debug mode resolution**

```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

class DebugEngine extends TealEngine {
  getEffectiveMode(policyId: string): PolicyMode {
    const mode = super.getEffectiveMode(policyId);
    
    console.log(`Mode resolution for ${policyId}:`);
    console.log(`  Policy-specific: ${this.config.mode?.policy?.[policyId] || 'none'}`);
    console.log(`  Environment-specific: ${this.config.mode?.environment?.[process.env.NODE_ENV || 'development'] || 'none'}`);
    console.log(`  Global default: ${this.config.mode?.default || 'ENFORCE'}`);
    console.log(`  Effective mode: ${mode}`);
    
    return mode;
  }
}

const engine = new DebugEngine(myPolicies, {
  mode: {
    default: PolicyMode.MONITOR,
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE
    }
  }
});

// Debug mode resolution
engine.getEffectiveMode('tools.file_delete');
engine.getEffectiveMode('tools.database_write');
```

**Step 3: Resolve configuration conflicts**

```typescript
import { PolicyMode } from 'tealtiger';

// ❌ WRONG - Conflicting configurations
const configWrong = {
  mode: {
    default: PolicyMode.ENFORCE,
    environment: {
      'production': PolicyMode.MONITOR  // Conflicts with default
    },
    policy: {
      'tools.file_delete': PolicyMode.REPORT_ONLY  // Conflicts with both
    }
  }
};

// ✅ CORRECT - Clear, intentional configuration
const configCorrect = {
  mode: {
    // Default: Monitor everything
    default: PolicyMode.MONITOR,
    
    // Production: Enforce by default
    environment: {
      'production': PolicyMode.ENFORCE,
      'staging': PolicyMode.MONITOR,
      'development': PolicyMode.REPORT_ONLY
    },
    
    // Critical policies: Always enforce (even in dev)
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE,
      'tools.database_write': PolicyMode.ENFORCE,
      'tools.admin_access': PolicyMode.ENFORCE
    }
  }
};

const engine = new TealEngine(myPolicies, configCorrect);
```

**Step 4: Handle environment variable overrides carefully**

```typescript
import { PolicyMode } from 'tealtiger';

function getModeConfig(): any {
  const baseConfig = {
    mode: {
      default: PolicyMode.ENFORCE,
      policy: {
        'tools.file_delete': PolicyMode.ENFORCE
      }
    }
  };
  
  // Allow emergency override via environment variable
  const override = process.env.TEAL_MODE_OVERRIDE;
  if (override) {
    console.warn(`⚠️ MODE OVERRIDE ACTIVE: ${override}`);
    console.warn('This should only be used in emergencies!');
    
    // Validate override value
    if (!Object.values(PolicyMode).includes(override as PolicyMode)) {
      console.error(`Invalid mode override: ${override}`);
      return baseConfig;
    }
    
    // Override default mode only (preserve policy-specific)
    return {
      mode: {
        default: override as PolicyMode,
        policy: baseConfig.mode.policy  // Keep critical policies enforced
      }
    };
  }
  
  return baseConfig;
}

const config = getModeConfig();
const engine = new TealEngine(myPolicies, config);
```

**Step 5: Validate mode configuration at startup**

```typescript
import { PolicyMode } from 'tealtiger';

function validateModeConfiguration(config: any): void {
  console.log('Validating mode configuration...');
  
  // Check for conflicting configurations
  const warnings: string[] = [];
  
  if (config.mode?.environment && config.mode?.policy) {
    const env = process.env.NODE_ENV || 'development';
    const envMode = config.mode.environment[env];
    
    for (const [policyId, policyMode] of Object.entries(config.mode.policy)) {
      if (envMode && policyMode !== envMode) {
        warnings.push(
          `Policy ${policyId} has mode ${policyMode} but environment ${env} has mode ${envMode}. ` +
          `Policy-specific mode will take precedence.`
        );
      }
    }
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️ Mode configuration warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  } else {
    console.log('✅ Mode configuration validated');
  }
}

const config = {
  mode: {
    default: PolicyMode.MONITOR,
    environment: {
      'production': PolicyMode.ENFORCE
    },
    policy: {
      'tools.file_delete': PolicyMode.ENFORCE
    }
  }
};

validateModeConfiguration(config);
const engine = new TealEngine(myPolicies, config);
```

### Verification

```bash
# Test mode resolution
node -e "
const { TealEngine, PolicyMode } = require('tealtiger');
const engine = new TealEngine({}, {
  mode: {
    default: PolicyMode.MONITOR,
    policy: { 'test.policy': PolicyMode.ENFORCE }
  }
});
console.log('Default mode:', engine.getEffectiveMode('other.policy'));
console.log('Policy-specific mode:', engine.getEffectiveMode('test.policy'));
"

# Check for mode override warnings
grep "MODE OVERRIDE" ./logs/application.log

# Verify effective modes in audit logs
cat ./logs/audit.log | jq '.mode' | sort | uniq -c
```

---

## Performance Issues

### Symptom

Slow policy evaluation:
```
Policy evaluation took 150ms (expected < 10ms)
```

or

High memory usage:
```
Memory usage: 2.5GB (expected < 500MB)
```

or

Slow audit logging:
```
Audit logging took 50ms (expected < 2ms)
```

or

Test execution timeout:
```
Test execution exceeded 100ms timeout
```

### Root Cause

Performance degradation due to inefficient configuration or usage patterns. Common causes:
- Large policy configurations
- Synchronous audit logging
- Excessive redaction operations
- Memory leaks in long-running processes
- Inefficient test suites

### Solution

**Step 1: Optimize policy evaluation**

```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

// ❌ SLOW - Creating new engine per request
app.post('/api/chat', async (req, res) => {
  const engine = new TealEngine(myPolicies);  // Slow!
  const decision = engine.evaluate(req.body);
  res.json(decision);
});

// ✅ FAST - Reuse engine instance
const engine = new TealEngine(myPolicies, {
  cacheEnabled: true,  // Enable caching
  cacheTTL: 60000,     // 60 second TTL
  cacheMaxSize: 1000   // Max 1000 entries
});

app.post('/api/chat', async (req, res) => {
  const decision = engine.evaluate(req.body);  // Fast!
  res.json(decision);
});
```

**Step 2: Optimize audit logging**

```typescript
import { TealAudit, FileOutput, RedactionLevel } from 'tealtiger';

// ❌ SLOW - Synchronous file writes
const auditSlow = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log', { async: false })],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH
  }
});

// ✅ FAST - Asynchronous writes with batching
const auditFast = new TealAudit({
  outputs: [
    new FileOutput('./logs/audit.log', {
      async: true,        // Async writes
      batchSize: 100,     // Batch 100 events
      flushInterval: 1000 // Flush every 1 second
    })
  ],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH
  }
});
```

**Step 3: Optimize content redaction**

```typescript
import { TealAudit, RedactionLevel } from 'tealtiger';

// ❌ SLOW - Full PII detection on large content
const auditSlow = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    pii_max_content_size: 1000000  // 1MB - too large!
  }
});

// ✅ FAST - Limit PII detection to reasonable size
const auditFast = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    pii_max_content_size: 10000  // 10KB - reasonable
  }
});

// For large content, use SIZE_ONLY redaction
const auditLargeContent = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.SIZE_ONLY,  // Faster for large content
    output_redaction: RedactionLevel.SIZE_ONLY,
    detect_pii: false  // Skip PII detection for performance
  }
});
```

**Step 4: Optimize test execution**

```typescript
import { PolicyTester, PolicyTestSuite } from 'tealtiger';

// ❌ SLOW - Creating new engine per test
const tester = new PolicyTester(null);
testSuite.tests.forEach(test => {
  const engine = new TealEngine(testSuite.policy);  // Slow!
  const result = tester.runTest(test);
});

// ✅ FAST - Reuse engine for all tests
const engine = new TealEngine(testSuite.policy, testSuite.mode);
const tester = new PolicyTester(engine);
const report = tester.runSuite(testSuite);  // Fast!

// ✅ FASTER - Run tests in parallel
import { PolicyTester } from 'tealtiger';

async function runTestsInParallel(testSuite: PolicyTestSuite): Promise<PolicyTestReport> {
  const engine = new TealEngine(testSuite.policy, testSuite.mode);
  const tester = new PolicyTester(engine);
  
  // Run tests in parallel (up to 10 concurrent)
  const results = await Promise.all(
    testSuite.tests.map(test => 
      Promise.resolve(tester.runTest(test))
    )
  );
  
  // Aggregate results
  return {
    timestamp: new Date().toISOString(),
    suite_name: testSuite.name,
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    skipped: 0,
    success_rate: results.filter(r => r.passed).length / results.length,
    total_time: results.reduce((sum, r) => sum + r.execution_time, 0),
    results: results
  };
}
```

**Step 5: Monitor performance metrics**

```typescript
import { TealEngine, ContextManager } from 'tealtiger';

class PerformanceMonitoredEngine extends TealEngine {
  evaluate(request: any): Decision {
    const startTime = Date.now();
    const decision = super.evaluate(request);
    const duration = Date.now() - startTime;
    
    // Log slow evaluations
    if (duration > 10) {
      console.warn(`⚠️ Slow policy evaluation: ${duration}ms`);
      console.warn(`  Policy: ${request.action}`);
      console.warn(`  Agent: ${request.agentId}`);
    }
    
    // Track metrics
    this.recordMetric('policy_evaluation_duration_ms', duration);
    
    return decision;
  }
  
  private recordMetric(name: string, value: number): void {
    // Send to monitoring system (Prometheus, DataDog, etc.)
    console.log(`Metric: ${name}=${value}`);
  }
}

const engine = new PerformanceMonitoredEngine(myPolicies);
```

### Verification

```bash
# Benchmark policy evaluation
node -e "
const { TealEngine, PolicyMode } = require('tealtiger');
const engine = new TealEngine({}, { mode: { default: PolicyMode.ENFORCE } });

const start = Date.now();
for (let i = 0; i < 1000; i++) {
  engine.evaluate({ agentId: 'test', action: 'test' });
}
const duration = Date.now() - start;
console.log(\`1000 evaluations: \${duration}ms\`);
console.log(\`Average: \${(duration / 1000).toFixed(2)}ms per evaluation\`);
"

# Monitor memory usage
node --expose-gc -e "
const { TealEngine } = require('tealtiger');
const engine = new TealEngine({});

console.log('Initial memory:', process.memoryUsage().heapUsed / 1024 / 1024, 'MB');

for (let i = 0; i < 10000; i++) {
  engine.evaluate({ agentId: 'test', action: 'test' });
}

global.gc();
console.log('After 10k evaluations:', process.memoryUsage().heapUsed / 1024 / 1024, 'MB');
"

# Profile test execution
time npx tealtiger test ./policies/*.test.json
```


---

## Common Error Messages

### Error: "InvalidConfigurationError: Invalid mode configuration"

**Cause:** Invalid PolicyMode value provided

**Solution:** Use valid PolicyMode enum values: `ENFORCE`, `MONITOR`, or `REPORT_ONLY`

```typescript
import { PolicyMode } from 'tealtiger';

// ✅ Correct
const engine = new TealEngine(myPolicies, {
  mode: { default: PolicyMode.ENFORCE }
});
```

---

### Error: "TypeError: Cannot read property 'correlation_id' of undefined"

**Cause:** ExecutionContext not provided or null

**Solution:** Create ExecutionContext before making requests

```typescript
import { ContextManager } from 'tealtiger';

const context = ContextManager.createContext();
const decision = engine.evaluate({ ...request, context });
```

---

### Error: "Content redaction failed: PII detection error"

**Cause:** PII detection failed on malformed content

**Solution:** Disable PII detection or use SIZE_ONLY redaction for problematic content

```typescript
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    input_redaction: RedactionLevel.SIZE_ONLY,  // Skip PII detection
    output_redaction: RedactionLevel.SIZE_ONLY,
    detect_pii: false
  }
});
```

---

### Error: "PolicyTestError: Test assertion failed"

**Cause:** Test expectations don't match actual decision

**Solution:** Debug test with verbose output

```bash
npx tealtiger test ./policies/test.json --verbose
```

---

### Error: "Memory limit exceeded"

**Cause:** Memory leak or excessive caching

**Solution:** Limit cache size and enable garbage collection

```typescript
const engine = new TealEngine(myPolicies, {
  cacheEnabled: true,
  cacheMaxSize: 1000,  // Limit cache size
  cacheTTL: 60000      // Expire old entries
});
```

---

### Warning: "DEBUG_MODE_ENABLED: Raw content is being logged"

**Cause:** Debug mode enabled in audit configuration

**Solution:** Disable debug mode in production

```typescript
const audit = new TealAudit({
  outputs: [new FileOutput('./logs/audit.log')],
  config: {
    debug_mode: false  // Always false in production
  }
});
```

---

### Warning: "Mode override active: MONITOR"

**Cause:** Environment variable `TEAL_MODE_OVERRIDE` is set

**Solution:** Remove environment variable or verify it's intentional

```bash
# Check for override
echo $TEAL_MODE_OVERRIDE

# Remove override
unset TEAL_MODE_OVERRIDE

# Restart application
npm start
```

---

## Diagnostic Commands

### Check TealTiger SDK Version

```bash
npm list tealtiger
# Should show v1.1.x or higher
```

### Verify TypeScript Compilation

```bash
npx tsc --noEmit
# Should complete without errors
```

### Run Policy Tests

```bash
# Run all tests
npx tealtiger test ./policies/*.test.json

# Run with verbose output
npx tealtiger test ./policies/*.test.json --verbose

# Run specific test file
npx tealtiger test ./policies/tools.test.json

# Run tests with tag filter
npx tealtiger test ./policies/*.test.json --tags=security

# Generate coverage report
npx tealtiger test ./policies/*.test.json --coverage
```

### Check Audit Logs

```bash
# View recent audit events
tail -f ./logs/audit.log

# Check for correlation IDs
cat ./logs/audit.log | jq '.correlation_id' | head -10

# Check for raw content (should be none)
cat ./logs/audit.log | jq '.safe_inputs.content' | head -10

# Check redaction levels
cat ./logs/audit.log | jq '.safe_inputs' | head -5

# Count events by type
cat ./logs/audit.log | jq '.event_type' | sort | uniq -c

# Find events by correlation ID
cat ./logs/audit.log | jq 'select(.correlation_id == "req-abc-123")'
```

### Verify Mode Configuration

```bash
# Test mode resolution
node -e "
const { TealEngine, PolicyMode } = require('tealtiger');
const engine = new TealEngine({}, {
  mode: {
    default: PolicyMode.MONITOR,
    policy: { 'test.policy': PolicyMode.ENFORCE }
  }
});
console.log('Default mode:', engine.getEffectiveMode('other.policy'));
console.log('Policy-specific mode:', engine.getEffectiveMode('test.policy'));
"
```

### Check Environment Variables

```bash
# Check Node environment
echo $NODE_ENV

# Check TealTiger overrides
echo $TEAL_MODE_OVERRIDE
echo $TEAL_DEBUG_MODE
echo $TEAL_REDACTION_OVERRIDE

# List all TealTiger environment variables
env | grep TEAL
```

### Benchmark Performance

```bash
# Benchmark policy evaluation
node -e "
const { TealEngine, PolicyMode } = require('tealtiger');
const engine = new TealEngine({}, { mode: { default: PolicyMode.ENFORCE } });

const start = Date.now();
for (let i = 0; i < 1000; i++) {
  engine.evaluate({ agentId: 'test', action: 'test' });
}
const duration = Date.now() - start;
console.log('1000 evaluations:', duration + 'ms');
console.log('Average:', (duration / 1000).toFixed(2) + 'ms per evaluation');
"

# Benchmark test execution
time npx tealtiger test ./policies/*.test.json
```

### Monitor Memory Usage

```bash
# Check memory usage
node --expose-gc -e "
const { TealEngine } = require('tealtiger');
const engine = new TealEngine({});

console.log('Initial memory:', (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2), 'MB');

for (let i = 0; i < 10000; i++) {
  engine.evaluate({ agentId: 'test', action: 'test' });
}

global.gc();
console.log('After 10k evaluations:', (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2), 'MB');
"
```

### Validate Configuration

```bash
# Validate mode configuration
node -e "
const { TealEngine, PolicyMode } = require('tealtiger');

try {
  const engine = new TealEngine({}, {
    mode: { default: PolicyMode.ENFORCE }
  });
  console.log('✅ Configuration valid');
} catch (error) {
  console.error('❌ Configuration invalid:', error.message);
}
"

# Validate audit configuration
node -e "
const { TealAudit, RedactionLevel, ConsoleOutput } = require('tealtiger');

try {
  const audit = new TealAudit({
    outputs: [new ConsoleOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    }
  });
  console.log('✅ Audit configuration valid');
} catch (error) {
  console.error('❌ Audit configuration invalid:', error.message);
}
"
```

### Debug Context Propagation

```bash
# Test context propagation
node -e "
const { ContextManager, TealEngine } = require('tealtiger');

const context = ContextManager.createContext({ tenant_id: 'test' });
console.log('Created context:', context.correlation_id);

const engine = new TealEngine({});
const decision = engine.evaluate({
  agentId: 'test',
  action: 'test',
  context: context
});

console.log('Decision correlation_id:', decision.correlation_id);
console.log('Match:', context.correlation_id === decision.correlation_id ? '✅' : '❌');
"
```

### Export Test Reports

```bash
# Export to JSON
npx tealtiger test ./policies/*.test.json --format=json --output=./report.json

# Export to JUnit XML
npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml

# View failed tests
cat ./report.json | jq '.results[] | select(.passed == false)'

# View test summary
cat ./report.json | jq '{total, passed, failed, success_rate}'
```

---

## Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide** - Most common issues are covered here
2. **Review the documentation** - Check API docs, best practices, and migration guide
3. **Run diagnostic commands** - Gather information about your issue
4. **Check GitHub issues** - Your issue may already be reported

### Information to Include

When reporting an issue, include:

1. **TealTiger SDK version**
   ```bash
   npm list tealtiger
   ```

2. **Node.js version**
   ```bash
   node --version
   ```

3. **TypeScript version** (if applicable)
   ```bash
   npx tsc --version
   ```

4. **Minimal reproduction**
   ```typescript
   // Minimal code that reproduces the issue
   import { TealEngine } from 'tealtiger';
   const engine = new TealEngine({});
   // ... steps to reproduce
   ```

5. **Error messages and stack traces**
   ```
   Full error message and stack trace
   ```

6. **Configuration**
   ```typescript
   // Your TealEngine and TealAudit configuration
   ```

7. **Environment**
   - Operating system
   - Node environment (development/staging/production)
   - Any relevant environment variables

### Support Channels

1. **GitHub Issues**: [https://github.com/tealtiger/tealtiger/issues](https://github.com/tealtiger/tealtiger/issues)
   - Bug reports
   - Feature requests
   - Documentation improvements

2. **GitHub Discussions**: [https://github.com/tealtiger/tealtiger/discussions](https://github.com/tealtiger/tealtiger/discussions)
   - Questions
   - Best practices
   - Community support

3. **Documentation**: [https://docs.tealtiger.ai](https://docs.tealtiger.ai)
   - API reference
   - Guides and tutorials
   - Examples

### Community Guidelines

- Be respectful and constructive
- Provide complete information
- Follow up on your issues
- Help others when you can
- Share your solutions

---

## Additional Resources

### Documentation

- [API Documentation](./API-DOCUMENTATION.md) - Complete API reference
- [Best Practices Guide](./BEST-PRACTICES.md) - Production deployment guidance
- [Migration Guide](./MIGRATION-GUIDE-v1.1.x.md) - Upgrading from v1.1.0
- [Examples](../examples/) - Code examples for all features

### Related Guides

- **Policy Rollout Strategy** - See [Best Practices Guide](./BEST-PRACTICES.md#policy-rollout-strategy)
- **Correlation IDs and Tracing** - See [Best Practices Guide](./BEST-PRACTICES.md#correlation-ids-and-traceability)
- **Audit Configuration** - See [Best Practices Guide](./BEST-PRACTICES.md#audit-redaction-configuration)
- **Policy Testing** - See [Best Practices Guide](./BEST-PRACTICES.md#policy-testing-workflows)

### Performance Optimization

- **Caching** - Enable policy evaluation caching for better performance
- **Async Audit Logging** - Use asynchronous audit outputs with batching
- **Content Size Limits** - Limit PII detection to reasonable content sizes
- **Test Parallelization** - Run policy tests in parallel for faster CI/CD

### Security Best Practices

- **Never enable debug mode in production** - Always use HASH redaction
- **Always use correlation IDs** - Enable end-to-end traceability
- **Test policies before deployment** - Use policy test harness in CI/CD
- **Monitor audit logs** - Set up alerts for policy violations
- **Validate configurations** - Check mode and redaction settings at startup

---

## Changelog

### v1.1.x (2024-02-19)

- Initial troubleshooting guide for enterprise features
- Coverage for all P0 features (modes, decisions, context, audit, testing)
- Diagnostic commands and verification steps
- Common error messages and solutions

---

## Feedback

Found an issue not covered in this guide? Please [open an issue](https://github.com/tealtiger/tealtiger/issues) or [start a discussion](https://github.com/tealtiger/tealtiger/discussions).

Your feedback helps improve TealTiger for everyone!
