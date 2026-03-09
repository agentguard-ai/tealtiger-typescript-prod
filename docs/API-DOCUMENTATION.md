# TealTiger SDK API Documentation

## Overview

This document provides an overview of the TealTiger SDK API documentation. The complete API reference is generated using TypeDoc and can be found in the `docs/api/` directory after running `npm run docs`.

## Documentation Coverage

### ✅ Core Types (Fully Documented)

#### Policy Types (`src/core/engine/types.ts`)
- **PolicyMode** - Evaluation modes (ENFORCE, MONITOR, REPORT_ONLY)
- **ModeConfig** - Hierarchical mode configuration
- **DecisionAction** - Decision actions (ALLOW, DENY, REDACT, TRANSFORM, REQUIRE_APPROVAL, DEGRADE)
- **ReasonCode** - Standardized reason codes for decisions
- **Decision** - Deterministic decision contract with all required fields
- **ComponentVersions** - Component version tracking
- **CostInfo** - Cost information for decisions
- **TealPolicy** - Complete policy configuration
- **RequestContext** - Request evaluation context
- **InvalidConfigurationError** - Configuration error class
- **PolicyViolationError** - Policy violation error class

All enums include:
- JSDoc descriptions for each value
- `@enum` tags
- `@since v1.1.0` tags for new features
- Usage examples

All interfaces include:
- Field descriptions
- Optional field indicators
- Type information
- Related type references

#### Execution Context (`src/core/context/ExecutionContext.ts`)
- **ExecutionContext** - Request tracing and context propagation
- **ExecutionContextOptions** - Context creation options
- **CONTEXT_HEADERS** - HTTP header constants for propagation
- **isValidUUIDv4()** - UUID validation function
- **isValidCorrelationId()** - Correlation ID validation
- **validateExecutionContext()** - Context validation

All exports include:
- Comprehensive JSDoc with `@interface` tags
- Field descriptions with optional indicators
- Usage examples
- Related documentation links

#### Context Manager (`src/core/context/ContextManager.ts`)
- **ContextManager** class - Context creation and management utilities
  - `createContext()` - Create new context with auto-generated correlation_id
  - `fromHeaders()` - Extract context from HTTP headers
  - `toHeaders()` - Convert context to HTTP headers
  - `propagate()` - Create child context with span linking
  - `enrich()` - Add metadata to context
  - `isValid()` - Validate context
  - `extract()` - Extract context from various sources
- **generateUUIDv4()** - Cryptographically random UUID generation
- **generateCorrelationId()** - Correlation ID generation
- **generateSpanId()** - Span ID generation (OpenTelemetry compatible)
- **generateTraceId()** - Trace ID generation (W3C compatible)

All methods include:
- `@param` tags with types and descriptions
- `@returns` tags with type and description
- `@example` code blocks
- Performance notes where relevant
- Security notes for cryptographic functions

### ✅ Audit Types (Fully Documented)

#### Audit Event Schema (`src/core/audit/types.ts`)
- **AUDIT_SCHEMA_VERSION** - Current schema version (1.0.0)
- **AuditEventType** - Event type enumeration
- **SafeContent** - Redacted content metadata
- **AuditComponentVersions** - Component version tracking
- **CostMetadata** - Cost governance metadata
- **AuditEvent** - Versioned audit event structure
- **isValidAuditEventType()** - Event type validation
- **validateAuditEvent()** - Event validation
- **createAuditEvent()** - Event creation helper

All types include:
- Security-by-default documentation
- Field descriptions
- Version information
- Validation rules

#### Content Redaction (`src/core/audit/redaction.ts`)
- **RedactionLevel** - Redaction strategies (NONE, HASH, SIZE_ONLY, CATEGORY_ONLY, FULL)
- **ContentCategory** - Content categorization types
- **SafeContentWithRaw** - Extended safe content with debug support
- **PIIDetection** - PII detection result
- **redactContent()** - Core redaction function
- **computeSHA256Hash()** - Secure hashing
- **categorizeContent()** - Content categorization
- **detectPIIPatterns()** - PII pattern detection
- **redactPIIFromContent()** - PII redaction
- **redactContentWithPII()** - PII-aware redaction (main entry point)

All functions include:
- `@param` tags with types
- `@returns` tags with types
- `@example` code blocks showing usage
- Performance targets (e.g., "< 5ms for 10KB content")
- Security guarantees
- Error handling documentation

### ✅ Testing Types (Fully Documented)

#### Policy Testing (`src/core/testing/types.ts`)
- **PolicyTestCase** - Single test case definition
- **PolicyTestSuite** - Test suite with policy configuration
- **PolicyTestResult** - Test execution result
- **PolicyTestReport** - Aggregated test report with coverage

All interfaces include:
- Field descriptions
- Optional field indicators
- Usage context
- Related type references

#### Test Corpora (`src/core/testing/TestCorpora.ts`)
- **TestCorpora** class - Pre-built test suites
  - `promptInjection()` - 20+ prompt injection test cases
  - `piiDetection()` - PII detection test cases
  - `unsafeCode()` - Unsafe code execution test cases
  - `toolMisuse()` - Tool misuse scenarios
  - `costLimits()` - Cost limit test cases

All methods include:
- `@returns` tags with PolicyTestSuite type
- Descriptions of test coverage
- Example usage
- Test case counts

### ✅ Core Classes (Documented)

#### TealEngine (`src/core/engine/TealEngine.ts`)
- **TealEngine** class - Core policy evaluation engine
  - `constructor()` - Initialize engine with policies and mode config
  - `evaluate()` - Evaluate request against policies (legacy)
  - `evaluateWithMode()` - Evaluate with mode-specific behavior (returns Decision)
  - `validate()` - Validate policy configuration
  - `test()` - Test policy with test case
  - `getCoverage()` - Get policy coverage report
  - `getPolicies()` - Get current policies
  - `getModeConfig()` - Get mode configuration
  - `updatePolicies()` - Update policies at runtime
  - `clearCache()` - Clear evaluation cache
  - `getCacheStats()` - Get cache statistics

Static template methods:
  - `customerSupport()` - Customer support policy template
  - `dataAnalysis()` - Data analysis policy template
  - `codeGeneration()` - Code generation policy template
  - `codeExecutionSafe()` - Safe code execution policy template
  - `strictSecurity()` - Strict security policy template
  - `development()` - Development policy template

All methods include:
- `@param` tags
- `@returns` tags
- `@throws` tags for errors
- `@example` code blocks
- Performance notes

#### TealGuard (`src/core/guard/TealGuard.ts`)
- **TealGuard** class - Enhanced guardrails system
  - `constructor()` - Initialize with configuration
  - `check()` - Check input against guardrails (returns Decision)
  - `registerGuardrail()` - Register custom guardrail
  - `unregisterGuardrail()` - Remove guardrail
  - `addCustomRule()` - Add custom validation rule
  - `removeCustomRule()` - Remove custom rule
  - `getRegisteredGuardrails()` - List registered guardrails
  - `updatePolicy()` - Update policy configuration
  - `enablePolicyDriven()` - Enable policy-driven mode
  - `disablePolicyDriven()` - Disable policy-driven mode
  - `clearGuardrails()` - Clear all guardrails
  - `enableResultCache()` - Enable result caching
  - `disableResultCache()` - Disable result caching
  - `clearCache()` - Clear result cache
  - `getCacheStats()` - Get cache statistics

Configuration interfaces:
  - **TealGuardConfig** - Guard configuration
  - **CustomGuardrailRule** - Custom rule definition
  - **TealGuardResult** - Guard execution result

#### TealCircuit (`src/core/circuit/TealCircuit.ts`)
- **TealCircuit** class - Circuit breaker implementation
  - `constructor()` - Initialize with configuration
  - `execute()` - Execute function with circuit breaker protection
  - `getState()` - Get current circuit state
  - `evaluate()` - Evaluate circuit state (returns Decision)
  - `reset()` - Reset circuit to closed state
  - `forceOpen()` - Force circuit open
  - `forceClose()` - Force circuit closed
  - `getStats()` - Get circuit statistics

Configuration:
  - **TealCircuitConfig** - Circuit configuration
  - **CircuitOpenError** - Circuit open error class

#### TealAudit (`src/core/audit/TealAudit.ts`)
- **TealAudit** class - Audit logging system
  - `constructor()` - Initialize with configuration
  - `log()` - Log audit event
  - `propagateContext()` - Propagate execution context
  - `query()` - Query audit events
  - `export()` - Export events (JSON/CSV)
  - `clear()` - Clear audit log
  - `getEventCount()` - Get event count
  - `close()` - Close audit outputs
  - `getConfig()` - Get audit configuration

Configuration:
  - **TealAuditConfig** - Audit configuration
  - **AuditConfig** - Redaction configuration
  - **AuditOutput** - Output interface
  - **ConsoleOutput** - Console output implementation
  - **CustomOutput** - Custom output implementation

## JSDoc Standards Used

All public APIs follow these JSDoc standards:

### Required Tags
- `@param` - Parameter description with type
- `@returns` - Return value description with type
- `@throws` - Exception documentation
- `@example` - Code examples
- `@since` - Version information (v1.1.0 for enterprise features)

### Optional Tags
- `@see` - Related documentation links
- `@deprecated` - Deprecated features
- `@internal` - Internal implementation details
- `@private` - Private methods (excluded from docs)

### Example Format

```typescript
/**
 * Policy evaluation mode
 * 
 * Determines how policy violations are handled:
 * - ENFORCE: Block requests that violate policies
 * - MONITOR: Allow requests but log violations
 * - REPORT_ONLY: Allow all requests, log for analysis
 * 
 * @since v1.1.0
 * @see {@link ModeConfig} for mode configuration
 * @example
 * ```typescript
 * const engine = new TealEngine(policies, {
 *   mode: {
 *     default: PolicyMode.ENFORCE
 *   }
 * });
 * ```
 */
export enum PolicyMode {
  /** Block requests that violate policies */
  ENFORCE = 'ENFORCE',
  
  /** Allow requests but log violations for monitoring */
  MONITOR = 'MONITOR',
  
  /** Allow all requests, log for analysis only */
  REPORT_ONLY = 'REPORT_ONLY'
}
```

## Generating Documentation

To generate the complete API documentation:

```bash
# Install dependencies (includes TypeDoc)
npm install

# Generate HTML documentation
npm run docs

# Documentation will be generated in docs/api/
```

The generated documentation includes:
- Complete API reference for all public interfaces
- Type definitions with descriptions
- Method signatures with parameters and return types
- Code examples from JSDoc
- Cross-references between related types
- Search functionality
- Dark/light theme support

## Documentation Structure

```
docs/
├── api/                          # Generated TypeDoc HTML
│   ├── index.html               # API documentation home
│   ├── modules/                 # Module documentation
│   ├── classes/                 # Class documentation
│   ├── interfaces/              # Interface documentation
│   └── enums/                   # Enum documentation
├── API-DOCUMENTATION.md         # This file
├── benchmarks.md                # Performance benchmarks
├── CLI-TEST-RUNNER.md          # CLI test runner guide
└── CONTEXT-PROPAGATION.md      # Context propagation guide
```

## Key Documentation Areas

### 1. Policy Modes
- **ENFORCE**: Block operations that violate policies
- **MONITOR**: Allow operations but log violations
- **REPORT_ONLY**: Allow all operations, log for analysis

Use cases:
- Development: MONITOR mode for testing
- Staging: Mixed modes (ENFORCE critical, MONITOR others)
- Production: ENFORCE mode for security

### 2. Decision Contract
All policy-enforcing components return a consistent Decision object:
- `action`: ALLOW, DENY, REDACT, TRANSFORM, REQUIRE_APPROVAL, DEGRADE
- `reason_codes`: Array of standardized reason codes
- `risk_score`: 0-100 risk assessment
- `mode`: Evaluation mode used
- `correlation_id`: Request tracing ID
- `metadata`: Additional context

### 3. ExecutionContext
Request tracing and context propagation:
- `correlation_id`: Required, auto-generated if not provided
- `trace_id`: Optional, OpenTelemetry-compatible
- `workflow_id`: Optional, for governance aggregation
- `run_id`: Optional, execution instance tracking
- `span_id`: Optional, operation tracking
- `tenant_id`: Optional, multi-tenancy support

### 4. Audit Events
Versioned audit schema with security-by-default:
- Schema version: 1.0.0
- Redaction levels: NONE, HASH, SIZE_ONLY, CATEGORY_ONLY, FULL
- Default: HASH redaction (SHA-256)
- PII detection: Enabled by default
- Debug mode: Explicit opt-in required

### 5. Policy Testing
Test harness for policy validation:
- **PolicyTestCase**: Single test definition
- **PolicyTestSuite**: Collection of tests
- **PolicyTestReport**: Aggregated results with coverage
- **TestCorpora**: Pre-built test suites (20+ test cases)

## Requirements Coverage

This documentation satisfies the following requirements from the enterprise-adoption-features spec:

- **Requirement 15.1**: TypeScript type definitions for all new interfaces and enums ✅
- **Requirement 15.2**: JSDoc comments for all public APIs ✅
- **Requirement 15.3**: Code examples demonstrating enterprise features (see examples/) ✅
- **Requirement 15.4**: Migration guide (see examples/migration-guide.md) ✅
- **Requirement 15.5**: Starter test corpora with 20+ test cases ✅
- **Requirement 15.6**: CLI documentation (see docs/CLI-TEST-RUNNER.md) ✅
- **Requirement 15.7**: Best practices guide (see examples/best-practices.md) ✅
- **Requirement 15.8**: Troubleshooting guide (see examples/troubleshooting.md) ✅

## Next Steps

1. Run `npm install` to install TypeDoc
2. Run `npm run docs` to generate HTML documentation
3. Open `docs/api/index.html` in a browser
4. Review generated documentation for completeness
5. Add any missing examples or clarifications

## Support

For questions or issues with the API documentation:
- GitHub Issues: https://github.com/agentguard-ai/tealtiger-typescript/issues
- Documentation: https://tealtiger.co.in/docs
- Email: support@tealtiger.co.in
