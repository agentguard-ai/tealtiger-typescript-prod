# TealTiger SDK Performance Benchmarks

Comprehensive performance benchmark suite for TealTiger SDK v1.1.x enterprise adoption features.

## Overview

This benchmark suite validates that all enterprise features meet their performance targets as defined in the requirements document. The benchmarks measure p99 latency (99th percentile) to ensure consistent performance under load.

## Performance Targets

| Component | Target (p99) | Requirement |
|-----------|--------------|-------------|
| Mode Resolution | < 1ms | 10.1 |
| Decision Evaluation | < 10ms | 10.2 |
| Context Propagation | < 0.5ms | 10.3 |
| Content Redaction (10KB) | < 5ms | 10.4 |
| Audit Logging (Async) | < 2ms | 10.5 |
| Policy Test Execution | < 100ms | 10.6 |

## Running Benchmarks

### Quick Start

```bash
# Run all benchmarks
npm run benchmark

# Or run directly with ts-node
npx ts-node benchmarks/performance.bench.ts
```

### Output

The benchmark suite provides detailed statistics for each operation:

```
TealTiger SDK v1.1.x - Performance Benchmarks
==============================================

Running benchmarks...

[1/6] Mode Resolution...
[2/6] Decision Evaluation...
[3/6] Context Propagation...
[4/6] Content Redaction...
[5/6] Audit Logging...
[6/6] Policy Test Execution...

==============================================
Benchmark Results
==============================================

✓ PASS Mode Resolution
  Iterations: 1000
  Min:        0.123ms
  Max:        2.456ms
  Mean:       0.345ms
  Median:     0.312ms
  P95:        0.567ms
  P99:        0.789ms (target: 1.000ms)

...

==============================================
Summary
==============================================
Total:  6
Passed: 6
Failed: 0

✓ All performance targets met!
```

## Benchmark Details

### 1. Mode Resolution (Requirement 10.1)

**Target:** < 1ms p99

**What it measures:** Time to resolve the effective policy mode using hierarchical configuration (policy-specific → environment-specific → global default).

**Test scenario:**
- Engine with multiple mode overrides
- Policy-specific modes for different tools
- Environment-specific modes (production, staging, development)
- 1000 iterations with 100 warmup runs

### 2. Decision Evaluation Overhead (Requirement 10.2)

**Target:** < 10ms p99

**What it measures:** Total overhead of policy evaluation including mode resolution, risk scoring, reason code determination, and Decision object construction.

**Test scenario:**
- Complex policy with tools, identity, and behavioral rules
- Full ExecutionContext with tenant, application, environment
- ENFORCE mode with actual policy evaluation
- 1000 iterations with 100 warmup runs

### 3. Context Propagation (Requirement 10.3)

**Target:** < 0.5ms p99

**What it measures:** Time to propagate ExecutionContext from parent to child, including span ID generation and field preservation.

**Test scenario:**
- Parent context with full metadata (tenant, workflow, run, span)
- Child context creation with span linking
- 1000 iterations with 100 warmup runs

### 4. Content Redaction (Requirement 10.4)

**Target:** < 5ms for 10KB p99

**What it measures:** Time to redact 10KB of content with PII detection and HASH redaction level.

**Test scenario:**
- 10KB content with mixed text and PII patterns
- PII detection enabled (email, phone, SSN patterns)
- SHA-256 hashing for redacted content
- 1000 iterations with 100 warmup runs

### 5. Audit Logging (Requirement 10.5)

**Target:** < 2ms async p99

**What it measures:** Time to process and log a versioned audit event with context propagation and redaction metadata.

**Test scenario:**
- Full AuditEvent with all fields populated
- ExecutionContext propagation
- HASH redaction for inputs/outputs
- No-op output to measure pure logging overhead
- 1000 iterations with 100 warmup runs

### 6. Policy Test Execution (Requirement 10.6)

**Target:** < 100ms per test

**What it measures:** Time to execute a single policy test case including evaluation, assertion matching, and result generation.

**Test scenario:**
- PolicyTester with moderate complexity policy
- Test case with expected assertions
- Coverage tracking enabled
- 100 iterations with 10 warmup runs (fewer due to slower operation)

## Interpreting Results

### Statistics Explained

- **Min:** Fastest execution time (best case)
- **Max:** Slowest execution time (worst case)
- **Mean:** Average execution time across all iterations
- **Median:** Middle value (50th percentile)
- **P95:** 95th percentile - 95% of executions are faster than this
- **P99:** 99th percentile - 99% of executions are faster than this (our target)

### Why P99?

We use p99 (99th percentile) rather than average or median because:
- It represents real-world performance under load
- It accounts for outliers and worst-case scenarios
- It ensures consistent performance for 99% of requests
- It's the industry standard for latency SLAs

### Pass/Fail Criteria

A benchmark **passes** if its p99 latency is at or below the target. A benchmark **fails** if p99 exceeds the target, indicating optimization is needed.

## Optimization Guidelines

If any benchmark fails to meet its target:

### 1. Identify Bottlenecks

Look at the detailed statistics:
- High max values suggest occasional spikes
- High mean vs median suggests outliers
- Large gap between p95 and p99 suggests tail latency issues

### 2. Common Optimizations

**Mode Resolution:**
- Cache resolved modes
- Optimize configuration lookup
- Reduce object allocations

**Decision Evaluation:**
- Enable policy caching
- Optimize risk score calculation
- Reduce metadata copying

**Context Propagation:**
- Minimize object cloning
- Optimize UUID generation
- Reduce field copying

**Content Redaction:**
- Optimize PII regex patterns
- Use streaming for large content
- Cache hash computations

**Audit Logging:**
- Batch audit events
- Use async I/O
- Optimize serialization

**Policy Test Execution:**
- Optimize assertion matching
- Reduce test overhead
- Enable parallel execution

### 3. Re-run After Optimization

After making optimizations, re-run the benchmark suite to verify improvements:

```bash
npm run benchmark
```

## CI/CD Integration

The benchmark suite exits with code 1 if any benchmark fails, making it suitable for CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Performance Benchmarks
  run: npm run benchmark
```

## Benchmark Methodology

### Warmup Phase

Each benchmark includes a warmup phase (typically 100 iterations) to:
- Allow JIT compilation to optimize hot paths
- Stabilize memory allocation patterns
- Prime caches
- Eliminate cold-start effects

### Measurement Phase

After warmup, we measure the actual performance:
- Sufficient iterations for statistical significance (typically 1000)
- High-precision timing using `performance.now()`
- Sorted results for accurate percentile calculation
- Minimal overhead between iterations

### Isolation

Benchmarks are designed to measure specific operations in isolation:
- No-op outputs for audit logging (measures logging overhead only)
- Minimal test policies (measures framework overhead)
- Controlled input sizes (10KB for redaction)

## Troubleshooting

### Benchmarks Running Slowly

If benchmarks take too long:
- Reduce iterations (edit `performance.bench.ts`)
- Run specific benchmarks only
- Check system load (close other applications)

### Inconsistent Results

If results vary significantly between runs:
- Ensure system is idle (no background processes)
- Run multiple times and average results
- Check for thermal throttling on laptops
- Disable power saving modes

### All Benchmarks Failing

If all benchmarks fail:
- Check Node.js version (requires 16.0.0+)
- Verify TypeScript compilation (`npm run build`)
- Check for debug mode or verbose logging
- Review recent code changes

## Contributing

When adding new enterprise features:

1. Add corresponding benchmark to `performance.bench.ts`
2. Define performance target in requirements document
3. Update this README with benchmark details
4. Ensure benchmark passes before merging

## References

- Requirements: `.kiro/specs/enterprise-adoption-features/requirements.md`
- Design: `.kiro/specs/enterprise-adoption-features/design.md`
- Tasks: `.kiro/specs/enterprise-adoption-features/tasks.md`
