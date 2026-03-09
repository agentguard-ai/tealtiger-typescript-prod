/**
 * TealTiger SDK v1.1.x - Performance Benchmarks
 * 
 * Comprehensive benchmark suite for enterprise adoption features.
 * Validates performance targets from Requirements 10.1-10.6.
 * 
 * Performance Targets:
 * - Mode resolution: < 1ms p99 (Requirement 10.1)
 * - Decision evaluation: < 10ms p99 overhead (Requirement 10.2)
 * - Context propagation: < 0.5ms p99 (Requirement 10.3)
 * - Content redaction: < 5ms for 10KB p99 (Requirement 10.4)
 * - Audit logging: < 2ms async p99 (Requirement 10.5)
 * - Policy test execution: < 100ms per test (Requirement 10.6)
 * 
 * @module benchmarks/performance
 */

import { performance } from 'perf_hooks';
import { TealEngine } from '../src/core/engine/TealEngine';
import { PolicyMode, DecisionAction, ReasonCode } from '../src/core/engine/types';
import { ContextManager } from '../src/core/context/ContextManager';
import { TealAudit } from '../src/core/audit/TealAudit';
import { RedactionLevel, redactContentWithPII } from '../src/core/audit/redaction';
import { AuditEventType } from '../src/core/audit/types';
import { PolicyTester } from '../src/core/engine/PolicyTester';

/**
 * Benchmark result
 */
interface BenchmarkResult {
  name: string;
  iterations: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  target: number;
  passed: boolean;
}

/**
 * Benchmark suite results
 */
interface BenchmarkSuiteResult {
  timestamp: string;
  results: BenchmarkResult[];
  totalPassed: number;
  totalFailed: number;
  summary: string;
}

/**
 * Runs a benchmark with specified iterations
 * 
 * @param name - Benchmark name
 * @param fn - Function to benchmark
 * @param iterations - Number of iterations (default: 1000)
 * @param warmup - Number of warmup iterations (default: 100)
 * @param target - Performance target in ms (p99)
 * @returns Benchmark result
 */
function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 1000,
  warmup: number = 100,
  target: number = Infinity
): BenchmarkResult {
  const times: number[] = [];
  
  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    fn();
  }
  
  // Measurement phase
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }
  
  // Sort times for percentile calculation
  times.sort((a, b) => a - b);
  
  // Calculate statistics
  const min = times[0];
  const max = times[times.length - 1];
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const median = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  
  const passed = p99 <= target;
  
  return {
    name,
    iterations,
    min,
    max,
    mean,
    median,
    p95,
    p99,
    target,
    passed
  };
}

/**
 * Formats a benchmark result for display
 */
function formatResult(result: BenchmarkResult): string {
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  const color = result.passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  return `${color}${status}${reset} ${result.name}
  Iterations: ${result.iterations}
  Min:        ${result.min.toFixed(3)}ms
  Max:        ${result.max.toFixed(3)}ms
  Mean:       ${result.mean.toFixed(3)}ms
  Median:     ${result.median.toFixed(3)}ms
  P95:        ${result.p95.toFixed(3)}ms
  P99:        ${result.p99.toFixed(3)}ms (target: ${result.target.toFixed(3)}ms)`;
}

/**
 * Benchmark 1: Mode Resolution
 * Target: < 1ms p99 (Requirement 10.1)
 */
function benchmarkModeResolution(): BenchmarkResult {
  const engine = new TealEngine({
    tools: {
      file_delete: { allowed: false },
      file_read: { allowed: true }
    }
  }, {
    mode: {
      default: PolicyMode.ENFORCE,
      policy: {
        'tools.file_delete': PolicyMode.MONITOR,
        'tools.file_read': PolicyMode.ENFORCE
      },
      environment: {
        'production': PolicyMode.ENFORCE,
        'staging': PolicyMode.MONITOR,
        'development': PolicyMode.REPORT_ONLY
      }
    }
  });
  
  return benchmark(
    'Mode Resolution',
    () => {
      engine.evaluateWithMode({
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      });
    },
    1000,
    100,
    1.0 // 1ms target
  );
}

/**
 * Benchmark 2: Decision Evaluation Overhead
 * Target: < 10ms p99 (Requirement 10.2)
 */
function benchmarkDecisionEvaluation(): BenchmarkResult {
  const engine = new TealEngine({
    tools: {
      file_delete: { allowed: false },
      file_read: { allowed: true },
      database_query: { allowed: true, maxRows: 1000 }
    },
    identity: {
      agentId: 'agent-001',
      role: 'support',
      permissions: ['read:data', 'write:tickets']
    },
    behavioral: {
      costLimit: { daily: 100, hourly: 20 },
      rateLimit: { requests: 100, window: '1m' }
    }
  }, {
    mode: {
      default: PolicyMode.ENFORCE
    }
  });
  
  const context = ContextManager.createContext({
    tenant_id: 'test-tenant',
    application: 'benchmark',
    environment: 'test'
  });
  
  return benchmark(
    'Decision Evaluation Overhead',
    () => {
      engine.evaluateWithMode({
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query',
        toolParams: { query: 'SELECT * FROM users LIMIT 100' }
      }, context);
    },
    1000,
    100,
    10.0 // 10ms target
  );
}

/**
 * Benchmark 3: Context Propagation
 * Target: < 0.5ms p99 (Requirement 10.3)
 */
function benchmarkContextPropagation(): BenchmarkResult {
  const parentContext = ContextManager.createContext({
    tenant_id: 'test-tenant',
    application: 'benchmark',
    environment: 'test',
    workflow_id: 'workflow-001',
    run_id: 'run-001'
  });
  
  return benchmark(
    'Context Propagation',
    () => {
      ContextManager.propagate(parentContext, {
        agent_purpose: 'test'
      });
    },
    1000,
    100,
    0.5 // 0.5ms target
  );
}

/**
 * Benchmark 4: Content Redaction (10KB)
 * Target: < 5ms for 10KB p99 (Requirement 10.4)
 */
function benchmarkContentRedaction(): BenchmarkResult {
  // Generate 10KB of content with some PII
  const content = generateTestContent(10 * 1024);
  
  return benchmark(
    'Content Redaction (10KB)',
    () => {
      redactContentWithPII(content, RedactionLevel.HASH, 'prompt', true);
    },
    1000,
    100,
    5.0 // 5ms target
  );
}

/**
 * Benchmark 5: Audit Logging (Async)
 * Target: < 2ms async p99 (Requirement 10.5)
 */
function benchmarkAuditLogging(): BenchmarkResult {
  // Use a no-op output for pure logging overhead measurement
  class NoOpOutput {
    write(): void {
      // No-op for performance testing
    }
  }
  
  const audit = new TealAudit({
    outputs: [new NoOpOutput()],
    config: {
      input_redaction: RedactionLevel.HASH,
      output_redaction: RedactionLevel.HASH,
      detect_pii: true,
      debug_mode: false
    }
  });
  
  const context = ContextManager.createContext({
    tenant_id: 'test-tenant',
    application: 'benchmark'
  });
  
  return benchmark(
    'Audit Logging (Async)',
    () => {
      audit.log({
        schema_version: '1.0.0',
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: context.correlation_id,
        policy_id: 'tools.file_delete',
        policy_version: '1.0.0',
        mode: PolicyMode.ENFORCE,
        action: DecisionAction.DENY,
        reason_codes: [ReasonCode.TOOL_NOT_ALLOWED],
        risk_score: 75,
        agent_id: 'agent-001',
        safe_inputs: {
          hash: 'sha256:abc123',
          size: 1024
        },
        safe_outputs: {
          hash: 'sha256:def456',
          size: 512
        }
      }, context);
    },
    1000,
    100,
    2.0 // 2ms target
  );
}

/**
 * Benchmark 6: Policy Test Execution
 * Target: < 100ms per test (Requirement 10.6)
 */
function benchmarkPolicyTestExecution(): BenchmarkResult {
  const engine = new TealEngine({
    tools: {
      file_delete: { allowed: false },
      file_read: { allowed: true },
      database_query: { allowed: true, maxRows: 1000 }
    },
    identity: {
      agentId: 'agent-001',
      role: 'support',
      permissions: ['read:data']
    }
  });
  
  const tester = new PolicyTester(engine);
  
  return benchmark(
    'Policy Test Execution',
    () => {
      tester.runTest({
        name: 'Block file deletion',
        context: {
          agentId: 'agent-001',
          action: 'tool.execute',
          tool: 'file_delete'
        },
        expected: {
          allowed: false,
          triggeredPolicies: ['tools.file_delete']
        }
      });
    },
    100, // Fewer iterations for slower operations
    10,
    100.0 // 100ms target
  );
}

/**
 * Generates test content of specified size
 */
function generateTestContent(sizeBytes: number): string {
  const chunks: string[] = [];
  const sampleText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
  const samplePII = 'Email: test@example.com, Phone: 555-123-4567, SSN: 123-45-6789. ';
  
  let currentSize = 0;
  let usePII = false;
  
  while (currentSize < sizeBytes) {
    const chunk = usePII ? samplePII : sampleText;
    chunks.push(chunk);
    currentSize += chunk.length;
    usePII = !usePII; // Alternate between regular text and PII
  }
  
  return chunks.join('').substring(0, sizeBytes);
}

/**
 * Runs all benchmarks and generates report
 */
export function runBenchmarks(): BenchmarkSuiteResult {
  console.log('TealTiger SDK v1.1.x - Performance Benchmarks');
  console.log('==============================================\n');
  
  const results: BenchmarkResult[] = [];
  
  // Run each benchmark
  console.log('Running benchmarks...\n');
  
  console.log('[1/6] Mode Resolution...');
  results.push(benchmarkModeResolution());
  
  console.log('[2/6] Decision Evaluation...');
  results.push(benchmarkDecisionEvaluation());
  
  console.log('[3/6] Context Propagation...');
  results.push(benchmarkContextPropagation());
  
  console.log('[4/6] Content Redaction...');
  results.push(benchmarkContentRedaction());
  
  console.log('[5/6] Audit Logging...');
  results.push(benchmarkAuditLogging());
  
  console.log('[6/6] Policy Test Execution...');
  results.push(benchmarkPolicyTestExecution());
  
  console.log('\n==============================================');
  console.log('Benchmark Results');
  console.log('==============================================\n');
  
  // Display results
  for (const result of results) {
    console.log(formatResult(result));
    console.log('');
  }
  
  // Summary
  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;
  
  console.log('==============================================');
  console.log('Summary');
  console.log('==============================================');
  console.log(`Total:  ${results.length}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  
  const allPassed = totalFailed === 0;
  if (allPassed) {
    console.log('\n✓ All performance targets met!');
  } else {
    console.log('\n✗ Some performance targets not met. Optimization needed.');
  }
  
  return {
    timestamp: new Date().toISOString(),
    results,
    totalPassed,
    totalFailed,
    summary: allPassed ? 'All targets met' : 'Optimization needed'
  };
}

/**
 * Main entry point
 */
if (require.main === module) {
  const result = runBenchmarks();
  
  // Exit with error code if any benchmarks failed
  process.exit(result.totalFailed > 0 ? 1 : 0);
}
