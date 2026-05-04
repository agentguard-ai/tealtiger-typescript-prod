# TealTiger v1.2 — Modules

## Core

**TealEngineV12** — Orchestration layer. Dispatches to all active modules in parallel, merges results using "most restrictive action wins", and applies fail-closed defaults on any module failure. Includes TEEC v0.1.0 evidence contract validation.

## Security Dimension

**TealSecrets** — Secret detection engine with 500+ built-in patterns across 9 categories. Provides confidence scoring (entropy, structural, context, FP), multi-layer caching, custom pattern registration, credential TTL enforcement, and threshold-based policy enforcement (DENY/REDACT/MONITOR/REQUIRE_APPROVAL).

## Memory Dimension

**TealMemory** — Memory governance module. Enforces write governance (secret/PII scan, scope validation, TTL enforcement), read governance (scope enforcement, classification clearance), and retention policies. Pluggable adapter interface for storage backends.

## Reliability Dimension

**TealReliability** — Bounded retry with budget, priority-ordered fallback chains, deterministic degradation, and circuit breaker (CLOSED/OPEN/HALF_OPEN state machine). All operations emit TEEC-compliant evidence.

## Registry Dimension

**TealRegistry** — Model/tool/detector/policy catalog with allowlist enforcement, build provenance verification (ed25519/ecdsa-p256), and supply chain scoring. Operates with local registry data only.

## Evidence Dimension

**TealVerify** — SARIF v2.1.0 export, JUnit XML export, JSON summary export, golden test runner, red-team harness, and TEEC validation commands. All exports enforce redaction by default.

## Visibility (Optional)

**GovernanceDashboard** — Read-only dashboard displaying controls, TEEC coverage, module status, and decision statistics. No runtime coupling with the engine.

**BundleExporter** — Exports governance artifacts (policy, registry, TEEC registries, manifest) as JSON for pull-based consumption.
