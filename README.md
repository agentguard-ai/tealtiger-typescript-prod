<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/logo/tealtiger-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset=".github/logo/tealtiger-logo-light.png">
    <img alt="TealTiger Logo" src=".github/logo/tealtiger-logo-light.png" width="200">
  </picture>
  
  # TealTiger SDK
  
  > The first open-source AI agent security SDK with **client-side guardrails** 🛡️
  
  [![npm version](https://badge.fury.io/js/tealtiger.svg)](https://www.npmjs.com/package/tealtiger)
  [![npm downloads](https://img.shields.io/npm/dm/tealtiger.svg)](https://www.npmjs.com/package/tealtiger)
  [![Tests](https://github.com/agentguard-ai/tealtiger-sdk/actions/workflows/test.yml/badge.svg)](https://github.com/agentguard-ai/tealtiger-sdk/actions/workflows/test.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
</div>

> 📖 **[Read the introduction blog post](https://dev.to/nagasatish_chilakamarti_2/introducing-tealtiger-ai-security-cost-control-made-simple-4lma)** to learn more about TealTiger!

## ✨ What's New in v1.1.0

**Multi-Provider Support** - 95%+ market coverage with 7 LLM providers!

- 🔌 **TealOpenAI** - Drop-in replacement for OpenAI client
- 🔌 **TealAnthropic** - Drop-in replacement for Anthropic client
- 🔌 **TealGemini** - Google Gemini with multimodal support
- 🔌 **TealBedrock** - AWS Bedrock (Claude, Titan, Jurassic, Command, Llama)
- 🔌 **TealAzureOpenAI** - Azure OpenAI with deployment support
- 🔌 **TealMistral** - Mistral AI with European data residency
- 🔌 **TealCohere** - Cohere with RAG and embeddings
- 🌐 **TealMultiProvider** - Multi-provider orchestration with failover
- 💰 **Cost Tracking** - Monitor costs across 50+ models
- 💵 **Budget Management** - Enforce spending limits automatically
- 🛡️ **Automatic Security** - Guardrails run on every request
- ⚡ **100% Compatible** - No migration needed

## 🏢 Enterprise-Ready Features (v1.1.x)

TealTiger v1.1.x introduces five P0 enterprise features that transform TealTiger from a developer tool into an enterprise-ready AI security platform:

### 🎯 Policy Rollout Modes

Deploy AI security policies gradually with three enforcement levels:

```typescript
import { TealEngine, PolicyMode } from 'tealtiger';

// Development: Monitor everything
const devEngine = new TealEngine({
  policies: myPolicies,
  mode: {
    defaultMode: PolicyMode.MONITOR
  }
});

// Staging: Enforce critical, monitor others
const stagingEngine = new TealEngine({
  policies: myPolicies,
  mode: {
    defaultMode: PolicyMode.MONITOR,
    policyModes: {
      'tools.file_delete': PolicyMode.ENFORCE,
      'identity.admin_access': PolicyMode.ENFORCE
    }
  }
});

// Production: Enforce all
const prodEngine = new TealEngine({
  policies: myPolicies,
  mode: {
    defaultMode: PolicyMode.ENFORCE
  }
});
```

**Modes:**
- **ENFORCE**: Block operations that violate policies
- **MONITOR**: Allow operations but log violations
- **REPORT_ONLY**: Allow all operations, log decisions without evaluation

### 📋 Deterministic Decision Contract

Stable, typed Decision object for reliable integration flows:

```typescript
import { TealEngine, DecisionAction, ReasonCode } from 'tealtiger';

const decision = engine.evaluate({
  agentId: 'agent-001',
  action: 'tool.execute',
  tool: 'file_delete',
  correlation_id: 'req-12345'
});

// Deterministic decision handling
switch (decision.action) {
  case DecisionAction.ALLOW:
    await executeTool();
    break;
    
  case DecisionAction.DENY:
    if (decision.reason_codes.includes(ReasonCode.TOOL_NOT_ALLOWED)) {
      throw new ToolNotAllowedError(decision.reason);
    }
    break;
    
  case DecisionAction.REQUIRE_APPROVAL:
    await requestApproval(decision);
    break;
}

// Risk-based routing
if (decision.risk_score > 80) {
  await escalateToHuman(decision);
}
```

**Decision Fields:**
- `action`: ALLOW, DENY, REDACT, TRANSFORM, REQUIRE_APPROVAL, DEGRADE
- `reason_codes`: Standardized enum values (TOOL_NOT_ALLOWED, PII_DETECTED, etc.)
- `risk_score`: 0-100 risk level
- `correlation_id`: Request tracing
- `metadata`: Cost, evaluation time, triggered policies

### 🔗 Correlation IDs & Traceability

End-to-end request tracking across all components:

```typescript
import { TealOpenAI, ContextManager } from 'tealtiger';

// Create execution context
const context = ContextManager.createContext({
  tenant_id: 'acme-corp',
  app: 'customer-support',
  env: 'production',
  agent_purpose: 'ticket_resolution'
});

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  engine: myEngine,
  audit: myAudit
});

// Context propagates through all operations
const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  context: context
});

// Query audit logs by correlation_id
const events = audit.query({
  correlation_id: context.correlation_id
});
```

**Features:**
- Auto-generated UUID v4 correlation IDs
- OpenTelemetry-compatible trace IDs
- HTTP header propagation
- Multi-tenant support

### 🔒 Audit Schema & Redaction

Versioned audit events with security-by-default redaction:

```typescript
import { TealAudit, RedactionLevel } from 'tealtiger';

// Production configuration (secure by default)
const prodAudit = new TealAudit({
  outputs: [new FileOutput('./audit.log')],
  config: {
    input_redaction: RedactionLevel.HASH,
    output_redaction: RedactionLevel.HASH,
    detect_pii: true,
    debug_mode: false
  }
});

// Audit events never contain raw prompts/responses by default
const event = {
  schema_version: '1.0.0',
  event_type: 'policy.evaluation',
  correlation_id: 'req-12345',
  action: DecisionAction.DENY,
  reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
  safe_inputs: {
    hash: 'sha256:abc123...',
    size: 1024,
    category: 'tool_execution'
  }
};
```

**Redaction Levels:**
- **HASH**: SHA-256 hash + size (default, production-safe)
- **SIZE_ONLY**: Content size only
- **CATEGORY_ONLY**: Content category only
- **FULL**: Complete redaction
- **NONE**: Raw content (debug mode only, requires explicit opt-in)

### ✅ Policy Test Harness

Validate policy behavior before production deployment:

```typescript
import { PolicyTester, TestCorpora } from 'tealtiger';

// Define test suite
const suite = {
  name: 'Customer Support Agent Policy Tests',
  policy: myPolicies,
  mode: { defaultMode: PolicyMode.ENFORCE },
  tests: [
    {
      name: 'Block file deletion',
      context: {
        agentId: 'support-001',
        action: 'tool.execute',
        tool: 'file_delete',
        context: ContextManager.createContext()
      },
      expected: {
        action: DecisionAction.DENY,
        reason_codes: [ReasonCode.TOOL_NOT_ALLOWED]
      }
    },
    // Include starter corpora
    ...TestCorpora.promptInjection(),
    ...TestCorpora.piiDetection()
  ]
};

// Run tests
const tester = new PolicyTester(engine);
const report = tester.runSuite(suite);

console.log(`Tests: ${report.passed}/${report.total} passed`);
console.log(`Coverage: ${report.coverage?.coverage_percentage.toFixed(1)}%`);

// Export for CI/CD
const junitXml = tester.exportReport(report, 'junit');
```

**CLI Usage:**

```bash
# Run tests from file
npx tealtiger test ./policies/customer-support.test.json

# Generate coverage report
npx tealtiger test ./policies/*.test.json --coverage

# Export to JUnit XML for CI/CD
npx tealtiger test ./policies/*.test.json --format=junit --output=./results.xml

# Watch mode for development
npx tealtiger test ./policies/*.test.json --watch
```

### 📚 Enterprise Documentation

- [API Documentation](./docs/API-DOCUMENTATION.md) - Complete API reference
- [Migration Guide](./docs/MIGRATION-GUIDE-v1.1.x.md) - Upgrade from v1.1.0
- [Best Practices](./docs/BEST-PRACTICES.md) - Policy rollout strategies
- [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Examples](./examples/) - Complete integration examples

### 📊 Enterprise Feature Comparison

| Feature | v1.1.0 | v1.1.x Enterprise |
|---------|--------|-------------------|
| **Policy Enforcement** | ✅ Basic | ✅ Multi-mode (ENFORCE/MONITOR/REPORT_ONLY) |
| **Decision Contract** | ⚠️ Untyped | ✅ Deterministic typed Decision object |
| **Request Tracing** | ❌ None | ✅ Auto-generated correlation IDs |
| **Audit Logging** | ⚠️ Basic | ✅ Versioned schema with PII redaction |
| **Policy Testing** | ❌ Manual | ✅ Automated test harness + CLI |
| **Risk Scoring** | ❌ None | ✅ 0-100 risk scores |
| **Reason Codes** | ⚠️ Text only | ✅ Standardized enum values |
| **Context Propagation** | ❌ Manual | ✅ Automatic through all components |
| **Compliance Ready** | ⚠️ Partial | ✅ OWASP/SAIF/NIST aligned |
| **CI/CD Integration** | ❌ None | ✅ JUnit XML export, exit codes |
| **Production Safety** | ⚠️ Basic | ✅ Security-by-default redaction |
| **Distributed Tracing** | ❌ None | ✅ OpenTelemetry compatible |

**Legend:**
- ✅ Full support
- ⚠️ Partial support
- ❌ Not available

### 🎯 Enterprise Adoption Path

1. **Week 1-2**: Start with MONITOR mode in development
2. **Week 3-4**: Add correlation IDs and audit logging
3. **Week 5-6**: Write policy tests and integrate with CI/CD
4. **Week 7-8**: Deploy to staging with mixed modes (ENFORCE critical policies)
5. **Week 9-10**: Production rollout with full ENFORCE mode
6. **Ongoing**: Continuous policy testing and refinement

## 🚀 Quick Start

### Installation

#### Via npm
```bash
npm install tealtiger
```

#### Via Docker
```bash
# Pull and run
docker pull ghcr.io/tealtiger/typescript-sdk:latest
docker run -it --rm \
  -e OPENAI_API_KEY=your-key \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node

# See DOCKER.md for more options
```

### Client-Side Guardrails (New!)

```typescript
import { GuardrailEngine, PIIDetectionGuardrail, PromptInjectionGuardrail } from 'tealtiger';

// Create guardrail engine
const engine = new GuardrailEngine();

// Register guardrails
engine.registerGuardrail(new PIIDetectionGuardrail());
engine.registerGuardrail(new PromptInjectionGuardrail());

// Evaluate user input
const result = await engine.execute("Contact me at john@example.com");

if (!result.passed) {
  console.log('Security check failed:', result.message);
  console.log('Risk score:', result.riskScore);
}
```

### Server-Side Security

```typescript
import { TealTiger } from 'tealtiger';

// Initialize the SDK
const guard = new TealTiger({
  apiKey: 'your-api-key',
  ssaUrl: 'https://ssa.TealTiger.io'
});

// Secure tool execution
const result = await guard.executeTool(
  'web-search',
  { query: 'AI agent security' },
  { sessionId: 'user-session-123' }
);
```

## 🌐 Supported Providers

TealTiger supports 7 major LLM providers with 95%+ market coverage:

| Provider | Client | Models | Features |
|----------|--------|--------|----------|
| **OpenAI** | `TealOpenAI` | GPT-4, GPT-3.5 Turbo | Chat, Completions, Embeddings |
| **Anthropic** | `TealAnthropic` | Claude 3, Claude 2 | Chat, Streaming |
| **Google** | `TealGemini` | Gemini Pro, Ultra | Multimodal, Safety Settings |
| **AWS** | `TealBedrock` | Claude, Titan, Jurassic, Command, Llama | Multi-model, Regional |
| **Azure** | `TealAzureOpenAI` | GPT-4, GPT-3.5 | Deployment-based, Azure AD |
| **Mistral** | `TealMistral` | Large, Medium, Small, Mixtral | EU Data Residency, GDPR |
| **Cohere** | `TealCohere` | Command, Embed | RAG, Citations, Connectors |

### Multi-Provider Orchestration

```typescript
import { TealMultiProvider, TealOpenAI, TealAnthropic } from 'tealtiger';

const multiProvider = new TealMultiProvider({
  strategy: 'priority',      // or 'round-robin', 'cost', 'use-case'
  enableFailover: true,
  maxFailoverAttempts: 3
});

// Register providers with priorities
multiProvider.registerProvider({
  type: 'openai',
  name: 'openai-primary',
  client: new TealOpenAI({ apiKey: 'key' }),
  priority: 1
});

multiProvider.registerProvider({
  type: 'anthropic',
  name: 'anthropic-backup',
  client: new TealAnthropic({ apiKey: 'key' }),
  priority: 2
});

// Automatic failover if primary fails
const response = await multiProvider.chat({
  messages: [{ role: 'user', content: 'Hello' }]
});
```

## 🛡️ Client-Side Guardrails

### PIIDetectionGuardrail

Detect and protect personally identifiable information:

```typescript
import { PIIDetectionGuardrail } from 'tealtiger';

const guard = new PIIDetectionGuardrail({
  action: 'redact', // or 'block', 'mask', 'allow'
  customPatterns: [
    { name: 'custom-id', pattern: /ID-\d{6}/, category: 'identifier' }
  ]
});

const result = await guard.evaluate("My email is john@example.com");
// result.passed = false
// result.violations = [{ type: 'email', value: 'john@example.com', ... }]
```

**Detects:**
- Email addresses
- Phone numbers (US, international)
- Social Security Numbers
- Credit card numbers
- Custom patterns

### ContentModerationGuardrail

Block harmful content:

```typescript
import { ContentModerationGuardrail } from 'tealtiger';

const guard = new ContentModerationGuardrail({
  categories: ['hate', 'violence', 'harassment', 'self-harm'],
  threshold: 0.7,
  useOpenAI: true, // Optional: Use OpenAI Moderation API
  openaiApiKey: 'your-key'
});

const result = await guard.evaluate("I hate everyone");
// result.passed = false
// result.riskScore = 85
```

### PromptInjectionGuardrail

Prevent jailbreak attempts:

```typescript
import { PromptInjectionGuardrail } from 'tealtiger';

const guard = new PromptInjectionGuardrail({
  sensitivity: 'high', // 'low', 'medium', 'high'
  customPatterns: [
    /custom attack pattern/i
  ]
});

const result = await guard.evaluate("Ignore previous instructions and...");
// result.passed = false
// result.riskScore = 90
```

**Detects:**
- Instruction injection
- Role-playing attacks
- System prompt leakage
- DAN jailbreaks
- Developer mode attempts

### GuardrailEngine

Execute multiple guardrails:

```typescript
import { 
  GuardrailEngine, 
  PIIDetectionGuardrail,
  ContentModerationGuardrail,
  PromptInjectionGuardrail 
} from 'tealtiger';

const engine = new GuardrailEngine({
  mode: 'parallel', // or 'sequential'
  timeout: 5000, // ms
  continueOnError: true
});

// Register guardrails
engine.registerGuardrail(new PIIDetectionGuardrail());
engine.registerGuardrail(new ContentModerationGuardrail());
engine.registerGuardrail(new PromptInjectionGuardrail());

// Execute all guardrails
const result = await engine.execute(userInput);

console.log('Passed:', result.passed);
console.log('Risk Score:', result.riskScore);
console.log('Results:', result.results);
```

## 💰 Cost Tracking & Budget Management

Track AI model costs and enforce budgets automatically:

### Cost Estimation

```typescript
import { CostTracker } from 'tealtiger';

const tracker = new CostTracker({
  enabled: true,
  persistRecords: true,
  enableBudgets: true,
  enableAlerts: true
});

// Estimate cost before making a request
const estimate = tracker.estimateCost(
  'gpt-4',
  {
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500
  },
  'openai'
);

console.log(`Estimated cost: $${estimate.estimatedCost.toFixed(4)}`);
```

### Actual Cost Tracking

```typescript
// Calculate actual cost after API call
const actualCost = tracker.calculateActualCost(
  'req-123',
  'agent-456',
  'gpt-4',
  {
    inputTokens: 1050,
    outputTokens: 480,
    totalTokens: 1530
  },
  'openai'
);

// Store cost record
await storage.store(actualCost);
```

### Budget Management

```typescript
import { BudgetManager, InMemoryCostStorage } from 'tealtiger';

const storage = new InMemoryCostStorage();
const budgetManager = new BudgetManager(storage);

// Create a daily budget
const budget = budgetManager.createBudget({
  name: 'Daily GPT-4 Budget',
  limit: 10.0,
  period: 'daily',
  alertThresholds: [50, 75, 90, 100],
  action: 'block', // or 'alert'
  enabled: true
});

// Check budget before making a request
const budgetCheck = await budgetManager.checkBudget('agent-123', estimatedCost);

if (!budgetCheck.allowed) {
  console.log('Request blocked - budget exceeded');
  console.log(`Blocked by: ${budgetCheck.blockedBy?.name}`);
}

// Get budget status
const status = await budgetManager.getBudgetStatus(budget.id);
console.log(`Current spending: $${status?.currentSpending.toFixed(2)}`);
console.log(`Remaining: $${status?.remaining.toFixed(2)}`);
console.log(`Percentage used: ${status?.percentageUsed.toFixed(1)}%`);
```

### Agent-Scoped Budgets

```typescript
// Create budget for specific agent
const agentBudget = budgetManager.createBudget({
  name: 'Agent 1 Budget',
  limit: 5.0,
  period: 'daily',
  alertThresholds: [80, 100],
  action: 'block',
  scope: {
    type: 'agent',
    id: 'agent-1'
  },
  enabled: true
});
```

### Supported Models

**30+ models across 4 providers:**
- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, GPT-4 Vision
- **Anthropic**: Claude 3 Opus, Sonnet, Haiku
- **Google**: Gemini Pro, Gemini Pro Vision
- **Cohere**: Command, Command Light

## 🔌 Drop-in Client Wrappers

### TealOpenAI

Drop-in replacement for the OpenAI client with integrated security and cost tracking:

```typescript
import {
  TealOpenAI,
  GuardrailEngine,
  PIIDetectionGuardrail,
  PromptInjectionGuardrail,
  CostTracker,
  BudgetManager,
  InMemoryCostStorage
} from 'tealtiger';

// Set up guardrails
const guardrailEngine = new GuardrailEngine();
guardrailEngine.registerGuardrail(new PIIDetectionGuardrail());
guardrailEngine.registerGuardrail(new PromptInjectionGuardrail());

// Set up cost tracking
const storage = new InMemoryCostStorage();
const costTracker = new CostTracker({ enabled: true });
const budgetManager = new BudgetManager(storage);

budgetManager.createBudget({
  name: 'Daily Budget',
  limit: 10.0,
  period: 'daily',
  action: 'block',
  enabled: true
});

// Create TealOpenAI client (100% API compatible with OpenAI)
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'my-agent',
  guardrailEngine,
  costTracker,
  budgetManager,
  costStorage: storage
});

// Use exactly like OpenAI client
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' }
  ],
  max_tokens: 100
});

// Response includes security metadata
console.log('Response:', response.choices[0].message.content);
console.log('Guardrails passed:', response.security?.guardrailResult?.passed);
console.log('Cost:', `$${response.security?.costRecord?.actualCost.toFixed(4)}`);
console.log('Budget check:', response.security?.budgetCheck?.allowed);
```

**Features:**
- ✅ **100% API Compatible** - Drop-in replacement for OpenAI client
- 🛡️ **Automatic Guardrails** - Input and output validation
- 💰 **Cost Tracking** - Automatic cost calculation and storage
- 🚫 **Budget Enforcement** - Blocks requests when budget exceeded
- 📊 **Security Metadata** - Detailed security info in responses
- ⚙️ **Configurable** - Enable/disable features as needed

**Configuration Options:**

```typescript
const client = new TealOpenAI({
  apiKey: 'your-api-key',           // Required: OpenAI API key
  agentId: 'my-agent',               // Optional: Agent identifier
  enableGuardrails: true,            // Optional: Enable guardrails (default: true)
  enableCostTracking: true,          // Optional: Enable cost tracking (default: true)
  guardrailEngine,                   // Optional: Custom guardrail engine
  costTracker,                       // Optional: Custom cost tracker
  budgetManager,                     // Optional: Budget manager
  costStorage,                       // Optional: Cost storage
  baseURL: 'https://api.openai.com', // Optional: Custom base URL
  organization: 'org-id'             // Optional: Organization ID
});

// Update configuration at runtime
client.updateConfig({
  enableGuardrails: false,
  agentId: 'new-agent-id'
});
```

**Error Handling:**

```typescript
try {
  const response = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
} catch (error) {
  if (error.message.includes('Guardrail check failed')) {
    console.log('Request blocked by guardrails');
  } else if (error.message.includes('Budget exceeded')) {
    console.log('Budget limit reached');
  } else {
    console.log('Other error:', error.message);
  }
}
```

### TealAnthropic

Drop-in replacement for the Anthropic client with integrated security and cost tracking:

```typescript
import {
  TealAnthropic,
  GuardrailEngine,
  PIIDetectionGuardrail,
  PromptInjectionGuardrail,
  CostTracker,
  BudgetManager,
  InMemoryCostStorage
} from 'tealtiger';

// Set up guardrails
const guardrailEngine = new GuardrailEngine();
guardrailEngine.registerGuardrail(new PIIDetectionGuardrail());
guardrailEngine.registerGuardrail(new PromptInjectionGuardrail());

// Set up cost tracking
const storage = new InMemoryCostStorage();
const costTracker = new CostTracker({ enabled: true });
const budgetManager = new BudgetManager(storage);

budgetManager.createBudget({
  name: 'Daily Budget',
  limit: 10.0,
  period: 'daily',
  action: 'block',
  enabled: true
});

// Create TealAnthropic client (100% API compatible with Anthropic)
const client = new TealAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  agentId: 'my-agent',
  guardrailEngine,
  costTracker,
  budgetManager,
  costStorage: storage
});

// Use exactly like Anthropic client
const response = await client.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 100,
  messages: [
    { role: 'user', content: 'What is the capital of France?' }
  ]
});

// Response includes security metadata
console.log('Response:', response.content[0].text);
console.log('Guardrails passed:', response.security?.guardrailResult?.passed);
console.log('Cost:', `$${response.security?.costRecord?.actualCost.toFixed(4)}`);
console.log('Budget check:', response.security?.budgetCheck?.allowed);
```

**Features:**
- ✅ **100% API Compatible** - Drop-in replacement for Anthropic client
- 🛡️ **Automatic Guardrails** - Input and output validation
- 💰 **Cost Tracking** - Automatic cost calculation for Claude models
- 🚫 **Budget Enforcement** - Blocks requests when budget exceeded
- 📊 **Security Metadata** - Detailed security info in responses
- ⚙️ **Configurable** - Enable/disable features as needed

**Configuration Options:**

```typescript
const client = new TealAnthropic({
  apiKey: 'your-api-key',           // Required: Anthropic API key
  agentId: 'my-agent',               // Optional: Agent identifier
  enableGuardrails: true,            // Optional: Enable guardrails (default: true)
  enableCostTracking: true,          // Optional: Enable cost tracking (default: true)
  guardrailEngine,                   // Optional: Custom guardrail engine
  costTracker,                       // Optional: Custom cost tracker
  budgetManager,                     // Optional: Budget manager
  costStorage,                       // Optional: Cost storage
  baseURL: 'https://api.anthropic.com' // Optional: Custom base URL
});

// Update configuration at runtime
client.updateConfig({
  enableGuardrails: false,
  agentId: 'new-agent-id'
});
```

**Supported Models:**
- Claude 3 Opus (`claude-3-opus-20240229`)
- Claude 3 Sonnet (`claude-3-sonnet-20240229`)
- Claude 3 Haiku (`claude-3-haiku-20240307`)
- Claude 2.1 (`claude-2.1`)
- Claude 2.0 (`claude-2.0`)
- Claude Instant (`claude-instant-1.2`)

### TealAzureOpenAI

Drop-in replacement for the Azure OpenAI client with integrated security and cost tracking:

```typescript
import {
  TealAzureOpenAI,
  GuardrailEngine,
  PIIDetectionGuardrail,
  PromptInjectionGuardrail,
  CostTracker,
  BudgetManager,
  InMemoryCostStorage
} from 'tealtiger';

// Set up guardrails
const guardrailEngine = new GuardrailEngine();
guardrailEngine.registerGuardrail(new PIIDetectionGuardrail());
guardrailEngine.registerGuardrail(new PromptInjectionGuardrail());

// Set up cost tracking
const storage = new InMemoryCostStorage();
const costTracker = new CostTracker({ enabled: true });
const budgetManager = new BudgetManager(storage);

budgetManager.createBudget({
  name: 'Daily Budget',
  limit: 10.0,
  period: 'daily',
  action: 'block',
  enabled: true
});

// Create TealAzureOpenAI client (100% API compatible with Azure OpenAI)
const client = new TealAzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT, // e.g., https://your-resource.openai.azure.com
  apiVersion: '2024-02-15-preview',
  agentId: 'my-agent',
  guardrailEngine,
  costTracker,
  budgetManager,
  costStorage: storage
});

// Use exactly like Azure OpenAI client
const response = await client.chat.completions.create({
  deployment: 'gpt-4-deployment', // Your Azure deployment name
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' }
  ],
  max_tokens: 100
});

// Or use the deployments API (Azure-specific)
const response2 = await client.deployments.chat.completions.create({
  deployment: 'gpt-35-turbo-deployment',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  max_tokens: 50
});

// Response includes security metadata
console.log('Response:', response.choices[0].message.content);
console.log('Guardrails passed:', response.security?.guardrailResult?.passed);
console.log('Cost:', `${response.security?.costRecord?.actualCost.toFixed(4)}`);
console.log('Budget check:', response.security?.budgetCheck?.allowed);
```

**Features:**
- ✅ **100% API Compatible** - Drop-in replacement for Azure OpenAI client
- 🛡️ **Automatic Guardrails** - Input and output validation
- 💰 **Cost Tracking** - Automatic cost calculation with deployment mapping
- 🚫 **Budget Enforcement** - Blocks requests when budget exceeded
- 📊 **Security Metadata** - Detailed security info in responses
- ⚙️ **Configurable** - Enable/disable features as needed
- 🔑 **Azure AD Support** - Azure Active Directory authentication

**Configuration Options:**

```typescript
const client = new TealAzureOpenAI({
  apiKey: 'your-api-key',                    // Required: Azure OpenAI API key
  endpoint: 'https://your-resource.openai.azure.com', // Required: Azure endpoint
  apiVersion: '2024-02-15-preview',          // Optional: API version (default: 2024-02-15-preview)
  agentId: 'my-agent',                       // Optional: Agent identifier
  enableGuardrails: true,                    // Optional: Enable guardrails (default: true)
  enableCostTracking: true,                  // Optional: Enable cost tracking (default: true)
  guardrailEngine,                           // Optional: Custom guardrail engine
  costTracker,                               // Optional: Custom cost tracker
  budgetManager,                             // Optional: Budget manager
  costStorage,                               // Optional: Cost storage
  azureADToken: 'your-token'                 // Optional: Azure AD token for authentication
});

// Update configuration at runtime
client.updateConfig({
  enableGuardrails: false,
  agentId: 'new-agent-id'
});
```

**Deployment Name Mapping:**

Azure OpenAI uses deployment names instead of model names. TealAzureOpenAI automatically maps deployment names to model names for accurate cost tracking:

```typescript
// Deployment name → Model name mapping
'my-gpt-4-deployment'        → 'gpt-4'
'my-gpt-4-32k-deployment'    → 'gpt-4-32k'
'my-gpt-4-turbo-deployment'  → 'gpt-4-turbo'
'my-gpt-35-turbo-deployment' → 'gpt-3.5-turbo'
'my-gpt-35-turbo-16k-deployment' → 'gpt-3.5-turbo-16k'
```

The mapping is intelligent and works with common naming patterns. If your deployment name doesn't match, it defaults to `gpt-3.5-turbo` pricing.

**Azure-Specific Features:**

```typescript
// Both APIs are supported:
// 1. Standard chat API
await client.chat.completions.create({ deployment: 'my-deployment', ... });

// 2. Deployments API (Azure-specific)
await client.deployments.chat.completions.create({ deployment: 'my-deployment', ... });

// Azure AD authentication
const client = new TealAzureOpenAI({
  endpoint: 'https://your-resource.openai.azure.com',
  azureADToken: 'your-azure-ad-token',
  apiVersion: '2024-02-15-preview'
});
```

### Custom Pricing

```typescript
// Add custom pricing for your models
tracker.addCustomPricing('custom-model-v1', {
  model: 'custom-model-v1',
  provider: 'custom',
  inputCostPer1K: 0.01,
  outputCostPer1K: 0.02,
  lastUpdated: new Date().toISOString()
});
```

## 📋 Features

### Enterprise Features (v1.1.x)
- 🎯 **Policy Rollout Modes** - ENFORCE, MONITOR, REPORT_ONLY for safe deployment
- 📋 **Deterministic Decision Contract** - Stable typed Decision object
- 🔗 **Correlation IDs & Traceability** - End-to-end request tracking
- 🔒 **Audit Schema & Redaction** - Versioned events with PII redaction
- ✅ **Policy Test Harness** - CLI/library test runner for CI/CD
- 📊 **Risk Scoring** - 0-100 risk scores for all decisions
- 🏷️ **Reason Codes** - Standardized explainable decision codes
- 🔄 **Context Propagation** - Automatic context flow through components

### Client-Side (Offline)
- 🔍 **PII Detection** - Protect sensitive data
- 🛡️ **Content Moderation** - Block harmful content
- 🚫 **Prompt Injection Prevention** - Prevent attacks
- 💰 **Cost Tracking** - Monitor AI model costs
- 💵 **Budget Management** - Enforce spending limits
- ⚡ **Fast** - Millisecond latency
- 🔒 **Private** - No data leaves your server

### Server-Side (Platform)
- 🔐 **Runtime Security Enforcement** - Mediate all agent tool/API calls
- 📜 **Policy-Based Access Control** - Define and enforce security policies
- 🔍 **Comprehensive Audit Trails** - Track every agent action
- ⚡ **High Performance** - <100ms latency for security decisions
- 🔄 **Request Transformation** - Automatically transform risky requests
- 📊 **Real-time Monitoring** - Track agent behavior and security events

## 🛡️ OWASP Top 10 for Agentic Applications Coverage

TealTiger v1.1.0 provides comprehensive coverage for **7 out of 10** OWASP Top 10 for Agentic Applications (ASI01-ASI10) vulnerabilities through its SDK-only architecture.

### Coverage Summary

| ASI | Vulnerability | Coverage | Components |
|-----|--------------|----------|------------|
| ASI01 | Goal Hijacking & Prompt Injection | 🟡 Partial | TealGuard, TealEngine |
| ASI02 | Tool Misuse & Unauthorized Actions | 🟢 Full | TealEngine |
| ASI03 | Identity & Access Control Failures | 🟢 Full | TealEngine |
| ASI04 | Supply Chain Vulnerabilities | 🔧 Support | TealAudit |
| ASI05 | Unsafe Code Execution | 🟢 Full | TealEngine |
| ASI06 | Memory & Context Corruption | 🟢 Full | TealEngine, TealGuard |
| ASI07 | Inter-Agent Communication Security | ❌ Platform | N/A |
| ASI08 | Cascading Failures & Resource Exhaustion | 🟢 Full | TealCircuit, TealMonitor |
| ASI09 | Harmful Content Generation | 🔧 Support | TealGuard |
| ASI10 | Rogue Agent Behavior | 🟢 Full | TealMonitor, TealAudit |

**Total Coverage: 7/10 ASIs (70%) with SDK alone**

### Legend
- 🟢 **Full Coverage**: Comprehensive protection via SDK
- 🟡 **Partial Coverage**: Basic protection, advanced features require ML/platform
- 🔧 **Support**: Logging/monitoring support, external tools recommended
- ❌ **Platform Required**: Requires centralized infrastructure

### Learn More
- [Complete OWASP ASI Mapping](../../OWASP-AGENTIC-TOP10-TEALTIGER-MAPPING.md)
- [OWASP Coverage Diagram](../../TEALTIGER-OWASP-COVERAGE-DIAGRAM.md)
- [OWASP Top 10 for Agentic Applications](https://owasp.org/www-project-top-10-for-agentic-applications/)

---

## 🎯 Use Cases

- **Customer Support Bots** - Protect customer PII
- **Healthcare AI** - HIPAA compliance
- **Financial Services** - Prevent data leakage
- **E-commerce** - Secure payment information
- **Enterprise AI** - Policy enforcement
- **Education Platforms** - Content safety

## 📚 Documentation

- [Getting Started Guide](https://github.com/agentguard-ai/tealtiger#readme)
- [API Reference](https://github.com/agentguard-ai/tealtiger/blob/main/docs/API.md)
- [Examples](https://github.com/agentguard-ai/tealtiger/tree/main/examples)
- [Changelog](https://github.com/agentguard-ai/tealtiger/blob/main/CHANGELOG.md)

## 🛡️ OWASP Coverage

TealTiger provides comprehensive coverage for **7 out of 10** OWASP Top 10 for Agentic Applications (ASI01-ASI10):

### Full Coverage (100%)
- ✅ **ASI02**: Tool Misuse & Unauthorized Actions
- ✅ **ASI03**: Excessive Agency & Autonomy
- ✅ **ASI05**: Insecure Output Handling
- ✅ **ASI06**: Excessive Costs & Resource Consumption
- ✅ **ASI08**: Lack of Resilience & Error Handling
- ✅ **ASI10**: Supply Chain & Dependency Risks

### Partial Coverage (50-90%)
- 🟡 **ASI01**: Agent Goal Hijacking & Prompt Injection (70%)
- 🟡 **ASI04**: Sensitive Information Disclosure (60%)
- 🟡 **ASI09**: Inadequate Access Controls (50%)

### Platform Required
- ⚠️ **ASI07**: Insufficient Logging & Monitoring (30% SDK, 100% with Platform)

**Overall SDK Coverage**: 70% (7/10 ASIs)  
**With Platform**: 100% (10/10 ASIs)

📊 [View detailed OWASP coverage diagram](./docs/owasp-coverage-diagram.md)  
📖 [Read complete OWASP mapping](../OWASP-AGENTIC-TOP10-TEALTIGER-MAPPING.md)

### Key Differentiators

1. **Comprehensive Cost Control** (ASI06)
   - Only solution with 7-provider cost tracking
   - Real-time budget enforcement
   - Cost anomaly detection

2. **Resilience Patterns** (ASI08)
   - Circuit breaker implementation
   - Automatic failover
   - Health monitoring

3. **Tool Security** (ASI02)
   - Granular tool policies
   - Parameter validation
   - Rate limiting per tool

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/agentguard-ai/tealtiger/blob/main/CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](https://github.com/agentguard-ai/tealtiger/blob/main/LICENSE)

## 🔗 Links

- **npm**: https://www.npmjs.com/package/tealtiger
- **GitHub**: https://github.com/agentguard-ai/tealtiger
- **Python SDK**: https://pypi.org/project/tealtiger/
- **Issues**: https://github.com/agentguard-ai/tealtiger/issues

## 🌟 Star Us!

If you find TealTiger useful, please give us a star on GitHub! ⭐

---

**Made with ❤️ by the TealTiger team**


