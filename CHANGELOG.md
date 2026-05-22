# Changelog

All notable changes to the TealTiger TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-05-04

### Added — Governance Bundle
- **TealEngineV12** — Parallel module evaluation pipeline (Promise.allSettled) with "most restrictive action wins" merge and fail-closed defaults
- **TealSecrets** — Secret detection with 500+ patterns across 9 categories (AI providers, cloud, database, infrastructure, payments, SaaS, VCS, generic) with confidence scoring
- **TealRegistry** — Model/tool allowlisting with provenance verification
- **TealReliability** — Retry budgets, circuit breakers, and fallback chains
- **TealMemory** — Memory governance across 5 scopes (SESSION, USER, AGENT, GLOBAL, EPHEMERAL) and 4 classifications (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)
- **GovernanceDashboard** — Governance visibility UI with control catalog
- **BundleExporter** — Evidence export in SARIF v2.1.0, JUnit XML, and JSON formats
- **TEECValidator** — Typed Evidence & Evidence Contract validation
- **TEECRegistryLoader** — Governance control catalog loader
- **ModuleRegistry** — Module registration, lazy initialization, and dependency resolution
- **Docker Sidecar** — Language-agnostic HTTP governance API (`POST /evaluate`, `/validate`, `/scan`, `GET /health`, `/ready`, `/modules`)

### Added — Infrastructure
- **Serverless optimizations** — CloudConfigLoader, ColdStartOptimizer, ConfigCache, LazyLoader, ServerlessOptimizer, SingletonFactory
- **Rollup build** — Tree-shakeable ESM + CJS bundles with bundle size analysis
- **Dockerfile.sidecar** — Multi-stage Docker build for governance sidecar image

### Fixed
- Enum types alignment in core engine types
- TealCircuit decision test assertions
- TealEngine evaluateWithMode test expectations
- CLI test runner improvements
- Test fixture keys replaced with obviously-fake values for GitHub push protection compatibility

## [1.1.1] - 2026-04-03

### Fixed
- README rewritten to accurately reflect all features included in v1.1.0
- Removed misleading "Enterprise Feature Comparison" table that incorrectly suggested v1.1.0 had fewer features than a non-existent "v1.1.x Enterprise"
- Removed duplicate OWASP coverage sections
- Removed old URLs (tealtiger.co.in, ssa.TealTiger.io)

### Changed
- License updated from MIT to Apache 2.0 across all files (LICENSE, package.json, README badges)
- Homepage URL updated to tealtiger.ai
- All enterprise features (TealEngine, TealGuard, TealCircuit, TealAudit, correlation IDs, policy testing) now correctly presented as included v1.1.0 features

### Notes
- **No code changes** — documentation and metadata only
- Fully backward compatible with v1.1.0

## [1.1.0] - 2026-03-15

### Added
- **TealEngine** — Deterministic policy evaluation with multi-mode enforcement (ENFORCE, MONITOR, REPORT_ONLY)
- **TealGuard** — Client-side security guardrails (PII detection, prompt injection, content moderation)
- **TealCircuit** — Circuit breaker for cascading failure prevention
- **TealAudit** — Versioned audit logging with security-by-default PII redaction
- **TealMonitor** — Real-time agent behavior monitoring
- **Correlation IDs** — Auto-generated UUID v4 with OpenTelemetry-compatible trace IDs
- **Decision Contract** — Deterministic typed Decision object with risk scores and reason codes
- **Policy Test Harness** — CLI/library test runner with JUnit XML export for CI/CD
- **Multi-Provider Support** — 7 providers (OpenAI, Anthropic, Gemini, Bedrock, Azure OpenAI, Cohere, Mistral)
- **TealMultiProvider** — Multi-provider orchestration with failover
- **OWASP Coverage** — 7/10 ASIs covered with SDK-only architecture

## [0.2.2] - 2026-01-31

### Added
- Complete GuardedAzureOpenAI documentation in README
- Updated "What's New" section to highlight v0.2.1+ features

### Fixed
- README now properly showcases all three client wrappers
- Version consistency across all files

## [0.2.1] - 2026-01-31

### Added
- **Drop-in Client Wrappers** - Secure replacements for AI provider clients
  - `GuardedOpenAI` - Drop-in replacement for OpenAI client with integrated security
  - `GuardedAnthropic` - Drop-in replacement for Anthropic client with integrated security
  - `GuardedAzureOpenAI` - Drop-in replacement for Azure OpenAI client with integrated security
  - 100% API compatibility with original clients
  - Automatic guardrail execution on input and output
  - Integrated cost tracking and budget enforcement
  - Security metadata in responses
  - Configurable features (enable/disable guardrails, cost tracking)
- **Cost Tracking & Budget Management**
  - `CostTracker` - Track AI model costs across 30+ models
  - `BudgetManager` - Enforce spending limits with automatic blocking
  - Support for OpenAI, Anthropic, Google, Cohere models
  - Cost estimation before requests
  - Actual cost calculation after requests
  - Budget alerts at configurable thresholds (50%, 75%, 90%, 100%)
  - Agent-scoped budgets
  - Custom pricing support
- **Azure OpenAI Support**
  - Deployment-based API (uses deployment names instead of model names)
  - `deployments.chat.completions.create` API endpoint
  - Intelligent deployment-to-model mapping for pricing
  - Azure API version support (default: "2024-02-15-preview")
  - Azure AD token authentication support
- Demo examples for all three client wrappers
- Comprehensive test suite (318 tests passing)

### Features
- **Zero Migration**: Drop-in replacements require no code changes
- **Transparent Security**: Security evaluation happens automatically
- **Cost Visibility**: See costs in real-time with every request
- **Budget Protection**: Prevent runaway costs with automatic blocking
- **Multi-Provider**: Works with OpenAI, Anthropic, Azure OpenAI
- **Enterprise Ready**: Azure AD authentication, deployment mapping

### Performance
- < 100ms overhead for security evaluation
- Parallel guardrail execution
- Efficient cost calculation

### Documentation
- Updated README with all three client wrappers
- Added GuardedOpenAI documentation and examples
- Added GuardedAnthropic documentation and examples
- Added GuardedAzureOpenAI documentation and examples
- Cost tracking and budget management guides
- Microsoft Agentic Framework compatibility notes

## [0.2.0] - 2026-01-30

### Added
- **Client-Side Guardrails** - Offline security protection without server dependency
  - `GuardrailEngine` for parallel/sequential guardrail execution
  - `PIIDetectionGuardrail` - Detect and redact PII (emails, phones, SSNs, credit cards)
  - `ContentModerationGuardrail` - Detect harmful content (hate, violence, harassment)
  - `PromptInjectionGuardrail` - Detect jailbreak and injection attempts
  - Configurable actions: block, allow, redact, mask, transform
  - Timeout protection and error handling
  - Result caching for performance
- Comprehensive test suite for guardrails (199 tests passing)
- Guardrails demo example with 10+ test cases
- Full TypeScript support for all guardrail classes

### Features
- **Offline Capability**: Run guardrails without network calls
- **Parallel Execution**: Execute multiple guardrails simultaneously
- **Flexible Actions**: Block, redact, mask, or transform risky content
- **Risk Scoring**: Quantify security risks (0-100 scale)
- **Pattern Detection**: Regex-based detection with high accuracy
- **OpenAI Integration**: Optional OpenAI Moderation API support

### Performance
- < 50ms guardrail execution (parallel mode)
- Configurable timeouts per guardrail
- Efficient pattern matching with compiled regex

## [0.1.0] - 2024-01-29

### Added
- Initial release of AgentGuard SDK
- Core security evaluation functionality
- Tool execution with security decisions (allow/deny/transform)
- Security Sidecar Agent (SSA) HTTP client
- Configuration management with validation
- Comprehensive error handling with specific error types
- Audit trail functionality
- Policy validation and management
- TypeScript support with full type definitions
- Comprehensive test suite (148 tests)
- Examples for basic and advanced usage
- Complete API documentation

### Features
- **Security Evaluation**: Evaluate tool calls before execution
- **Policy Enforcement**: Automatic policy-based decision making  
- **Request Transformation**: Safe transformation of risky operations
- **Audit Trail**: Complete audit logging for compliance
- **Performance**: < 100ms security evaluation overhead
- **TypeScript Support**: Full type safety and IntelliSense
- **Framework Agnostic**: Works with any JavaScript/Node.js agent

### Security
- API key authentication with SSA
- Input validation and sanitization
- Secure HTTP communication with configurable timeouts
- Error handling that doesn't leak sensitive information

### Developer Experience
- Comprehensive documentation with examples
- Self-documenting code with TypeScript
- Jest test suite with 100% core functionality coverage
- ESLint configuration for code quality
- Examples for common integration patterns

[Unreleased]: https://github.com/agentguard-ai/tealtiger/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/agentguard-ai/tealtiger/releases/tag/v1.2.0
[1.1.1]: https://github.com/agentguard-ai/tealtiger/releases/tag/v1.1.1
[1.1.0]: https://github.com/agentguard-ai/tealtiger/releases/tag/v1.1.0
[0.2.2]: https://github.com/agentguard-ai/tealtiger/releases/tag/v0.2.2
[0.2.1]: https://github.com/agentguard-ai/tealtiger/releases/tag/v0.2.1
[0.2.0]: https://github.com/agentguard-ai/tealtiger/releases/tag/v0.2.0
[0.1.0]: https://github.com/agentguard-ai/tealtiger/releases/tag/v0.1.0