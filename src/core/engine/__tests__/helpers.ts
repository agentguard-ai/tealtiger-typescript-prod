/**
 * Test Helpers for TealEngine Testing
 * 
 * This module provides utility functions and helpers for testing TealEngine components.
 */

import { TealPolicy, RequestContext, PolicyEvaluationResult, ToolPolicy } from '../types';

// ============================================================================
// Sample Policies
// ============================================================================

/**
 * Create a simple allow-all policy (empty policy allows everything)
 */
export function createAllowAllPolicy(): TealPolicy {
  return {};
}

/**
 * Create a simple deny-all policy
 */
export function createDenyAllPolicy(): TealPolicy {
  return {
    tools: {
      '*': { allowed: false }, // Wildcard blocks all tools
    },
  };
}

/**
 * Create a tool policy with specific tools
 */
export function createToolPolicy(tools: ToolPolicy): TealPolicy {
  return { tools };
}

/**
 * Create a simple tool policy with allowed/blocked tools
 */
export function createSimpleToolPolicy(allowedTools: string[], blockedTools?: string[]): TealPolicy {
  const tools: ToolPolicy = {};
  
  for (const tool of allowedTools) {
    tools[tool] = { allowed: true };
  }
  
  if (blockedTools) {
    for (const tool of blockedTools) {
      tools[tool] = { allowed: false };
    }
  }
  
  return { tools };
}

/**
 * Create an identity policy
 */
export function createIdentityPolicy(agentId: string, role: string, permissions: string[]): TealPolicy {
  return {
    identity: {
      agentId,
      role,
      permissions,
    },
  };
}

/**
 * Create a code execution policy
 */
export function createCodeExecutionPolicy(allowedLanguages: string[], requireSandbox?: boolean): TealPolicy {
  return {
    codeExecution: {
      allowedLanguages,
      blockedFunctions: [],
      blockedPatterns: [],
      maxLength: 10000,
      timeout: 5000,
      requireSandbox: requireSandbox || false,
    },
  };
}

/**
 * Create a behavioral policy with cost limits
 */
export function createBehavioralPolicy(daily?: number, hourly?: number): TealPolicy {
  const costLimit: { daily?: number; hourly?: number; monthly?: number } = {};
  
  if (daily !== undefined) {
    costLimit.daily = daily;
  }
  if (hourly !== undefined) {
    costLimit.hourly = hourly;
  }
  
  return {
    behavioral: {
      costLimit,
      rateLimit: {
        requests: 100,
        window: '1h',
      },
    },
  };
}

// ============================================================================
// Sample Request Contexts
// ============================================================================

/**
 * Create a simple request context for a tool
 */
export function createToolContext(tool: string, agentId?: string): RequestContext {
  return {
    agentId: agentId || 'test-agent',
    action: 'tool.execute',
    tool,
  };
}

/**
 * Create a request context for code execution
 */
export function createCodeContext(language: string, content: string, agentId?: string): RequestContext {
  return {
    agentId: agentId || 'test-agent',
    action: 'code.execute',
    code: content,
    metadata: {
      language,
    },
  };
}

/**
 * Create a request context with metadata
 */
export function createContextWithMetadata(
  tool: string,
  metadata: Record<string, string | number | boolean>
): RequestContext {
  return {
    agentId: 'test-agent',
    action: 'tool.execute',
    tool,
    metadata,
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a result is allowed
 */
export function assertAllowed(result: PolicyEvaluationResult, message?: string): void {
  if (!result.allowed) {
    throw new Error(
      message || `Expected result to be allowed, but got: ${result.reason || 'no reason'}`
    );
  }
}

/**
 * Assert that a result is blocked
 */
export function assertBlocked(result: PolicyEvaluationResult, message?: string): void {
  if (result.allowed) {
    throw new Error(message || 'Expected result to be blocked, but it was allowed');
  }
}

/**
 * Assert that a result has specific violations
 */
export function assertHasViolations(result: PolicyEvaluationResult, expectedViolations: string[]): void {
  if (!result.triggeredPolicies || result.triggeredPolicies.length === 0) {
    throw new Error('Expected violations but got none');
  }

  for (const expected of expectedViolations) {
    const found = result.triggeredPolicies.some((v) => v.includes(expected));
    if (!found) {
      throw new Error(`Expected violation containing "${expected}" but got: ${result.triggeredPolicies.join(', ')}`);
    }
  }
}

/**
 * Assert that a result has metadata
 */
export function assertHasMetadata(result: PolicyEvaluationResult): void {
  if (!result.metadata) {
    throw new Error('Expected result to have metadata');
  }
  if (typeof result.metadata.evaluationTime !== 'number') {
    throw new Error('Expected metadata to have evaluationTime');
  }
  if (typeof result.metadata.cacheHit !== 'boolean') {
    throw new Error('Expected metadata to have cacheHit boolean');
  }
  if (typeof result.metadata.engine !== 'string') {
    throw new Error('Expected metadata to have engine string');
  }
}

// ============================================================================
// Comparison Helpers
// ============================================================================

/**
 * Compare two policies for equality (deep comparison)
 */
export function policiesEqual(p1: TealPolicy, p2: TealPolicy): boolean {
  return JSON.stringify(p1) === JSON.stringify(p2);
}

/**
 * Compare two request contexts for equality (deep comparison)
 */
export function contextsEqual(c1: RequestContext, c2: RequestContext): boolean {
  return JSON.stringify(c1) === JSON.stringify(c2);
}

/**
 * Compare two results for equality (ignoring metadata timestamps)
 */
export function resultsEqual(r1: PolicyEvaluationResult, r2: PolicyEvaluationResult): boolean {
  const r1Copy = { ...r1, metadata: { ...r1.metadata, evaluationTime: 0 } };
  const r2Copy = { ...r2, metadata: { ...r2.metadata, evaluationTime: 0 } };
  return JSON.stringify(r1Copy) === JSON.stringify(r2Copy);
}

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Generate a random tool name
 */
export function randomToolName(): string {
  const tools = ['database_query', 'file_read', 'file_write', 'api_call', 'code_execution'];
  return tools[Math.floor(Math.random() * tools.length)];
}

/**
 * Generate a random identity
 */
export function randomIdentity(): string {
  const identities = ['admin', 'user', 'guest', 'service-account'];
  return identities[Math.floor(Math.random() * identities.length)];
}

/**
 * Generate a random language
 */
export function randomLanguage(): string {
  const languages = ['javascript', 'typescript', 'python', 'java'];
  return languages[Math.floor(Math.random() * languages.length)];
}

// ============================================================================
// Performance Helpers
// ============================================================================

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(fn: () => T | Promise<T>): Promise<{ result: T; timeMs: number }> {
  const start = Date.now();
  const result = await fn();
  const timeMs = Date.now() - start;
  return { result, timeMs };
}

/**
 * Run a function multiple times and return average execution time
 */
export async function benchmarkFunction<T>(
  fn: () => T | Promise<T>,
  iterations: number = 100
): Promise<{ avgTimeMs: number; minTimeMs: number; maxTimeMs: number }> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { timeMs } = await measureTime(fn);
    times.push(timeMs);
  }

  const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
  const minTimeMs = Math.min(...times);
  const maxTimeMs = Math.max(...times);

  return { avgTimeMs, minTimeMs, maxTimeMs };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a policy is valid (has at least one policy section)
 */
export function isValidPolicy(policy: TealPolicy): boolean {
  return !!(
    policy.tools ||
    policy.identity ||
    policy.codeExecution ||
    policy.behavioral
  );
}

/**
 * Check if a request context is valid (has at least tool or identity)
 */
export function isValidContext(context: RequestContext): boolean {
  return !!(context.tool || context.agentId);
}

/**
 * Create a deep copy of a policy
 */
export function clonePolicy(policy: TealPolicy): TealPolicy {
  return JSON.parse(JSON.stringify(policy));
}

/**
 * Create a deep copy of a request context
 */
export function cloneContext(context: RequestContext): RequestContext {
  return JSON.parse(JSON.stringify(context));
}

// ============================================================================
// Basic Tests (to satisfy test file requirements)
// ============================================================================

/**
 * Basic test to ensure helpers module loads correctly
 */
export function testHelpersModule(): boolean {
  // Test that basic helper functions work
  const policy = createSimpleToolPolicy(['test-tool']);  // Create a valid policy with at least one section
  const context = createToolContext('test-tool');
  
  return isValidPolicy(policy) && isValidContext(context);
}
