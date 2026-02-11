/**
 * TealGuard Unit Tests
 * 
 * Tests for TealGuard class including:
 * - Policy integration
 * - Custom rules
 * - Parallel execution
 * - Performance (caching)
 */

import { TealGuard, CustomGuardrailRule } from '../TealGuard';
import { TealEngine } from '../../engine/TealEngine';
import { TealPolicy } from '../../engine/types';
import { Guardrail, GuardrailResult } from '../../../guardrails/base';
import { PIIDetectionGuardrail } from '../../../guardrails/pii-detection';

describe('TealGuard', () => {
  // Helper to create a simple test policy
  const createTestPolicy = (): TealPolicy => ({
    tools: {
      'dangerous-tool': { allowed: false },
      'safe-tool': { allowed: true }
    }
  });

  // Helper to create a simple test guardrail
  class TestGuardrail extends Guardrail {
    private shouldPass: boolean;

    constructor(shouldPass: boolean = true) {
      super({ name: 'TestGuardrail', description: 'Test guardrail' });
      this.shouldPass = shouldPass;
    }

    async evaluate(_input: any): Promise<GuardrailResult> {
      return new GuardrailResult({
        passed: this.shouldPass,
        action: this.shouldPass ? 'allow' : 'block',
        reason: this.shouldPass ? 'Test passed' : 'Test failed',
        riskScore: this.shouldPass ? 0 : 50
      });
    }
  }

  describe('3.3.1: Policy Integration', () => {
    it('should create TealGuard without policy', () => {
      const guard = new TealGuard();
      expect(guard).toBeDefined();
    });

    it('should create TealGuard with policy', () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({ policy });
      expect(guard).toBeDefined();
    });

    it('should create TealGuard with TealEngine instance', () => {
      const policy = createTestPolicy();
      const engine = new TealEngine(policy);
      const guard = new TealGuard({ engine });
      expect(guard).toBeDefined();
    });

    it('should execute guardrails without policy-driven mode', async () => {
      const guard = new TealGuard();
      const testGuardrail = new TestGuardrail(true);
      guard.registerGuardrail(testGuardrail);

      const result = await guard.check('test input');

      expect(result.passed).toBe(true);
      expect(result.guardrailResults.passed).toBe(true);
      expect(result.policyResult).toBeUndefined();
    });

    it('should execute guardrails with policy-driven mode enabled', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({
        policy,
        policyDriven: true
      });

      const testGuardrail = new TestGuardrail(true);
      guard.registerGuardrail(testGuardrail);

      const result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'test.action'
      });

      expect(result.passed).toBe(true);
      expect(result.guardrailResults.passed).toBe(true);
      expect(result.policyResult).toBeDefined();
      expect(result.policyResult?.allowed).toBe(true);
    });

    it('should block when policy denies access', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({
        policy,
        policyDriven: true
      });

      const testGuardrail = new TestGuardrail(true);
      guard.registerGuardrail(testGuardrail);

      const result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'tool.use',
        tool: 'dangerous-tool'
      });

      expect(result.passed).toBe(false);
      expect(result.guardrailResults.passed).toBe(true);
      expect(result.policyResult).toBeDefined();
      expect(result.policyResult?.allowed).toBe(false);
      expect(result.policyResult?.reason).toContain('dangerous');
    });

    it('should block when guardrail fails even if policy allows', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({
        policy,
        policyDriven: true
      });

      const testGuardrail = new TestGuardrail(false); // Failing guardrail
      guard.registerGuardrail(testGuardrail);

      const result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'test.action'
      });

      expect(result.passed).toBe(false);
      expect(result.guardrailResults.passed).toBe(false);
      expect(result.policyResult?.allowed).toBe(true);
    });

    it('should enable policy-driven mode dynamically', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({ policy });

      // Initially not policy-driven
      let result = await guard.check('test input');
      expect(result.policyResult).toBeUndefined();

      // Enable policy-driven mode
      guard.enablePolicyDriven();
      result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'test.action'
      });
      expect(result.policyResult).toBeDefined();
    });

    it('should disable policy-driven mode dynamically', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({
        policy,
        policyDriven: true
      });

      // Initially policy-driven
      let result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'test.action'
      });
      expect(result.policyResult).toBeDefined();

      // Disable policy-driven mode
      guard.disablePolicyDriven();
      result = await guard.check('test input');
      expect(result.policyResult).toBeUndefined();
    });

    it('should update policy dynamically', async () => {
      const initialPolicy = createTestPolicy();
      const guard = new TealGuard({
        policy: initialPolicy,
        policyDriven: true
      });

      // Check with initial policy
      let result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'tool.use',
        tool: 'dangerous-tool'
      });
      expect(result.policyResult?.allowed).toBe(false);

      // Update policy to allow dangerous-tool
      const newPolicy: TealPolicy = {
        tools: {
          'dangerous-tool': { allowed: true }
        }
      };
      guard.updatePolicy(newPolicy);

      // Check with updated policy
      result = await guard.check('test input', {
        agentId: 'test-agent',
        action: 'tool.use',
        tool: 'dangerous-tool'
      });
      expect(result.policyResult?.allowed).toBe(true);
    });
  });

  describe('3.3.2: Custom Rules', () => {
    it('should register custom guardrail rule', () => {
      const guard = new TealGuard();

      const customRule: CustomGuardrailRule = {
        name: 'CustomRule',
        description: 'Custom test rule',
        evaluate: async (_input: any) => {
          return new GuardrailResult({
            passed: true,
            action: 'allow',
            reason: 'Custom rule passed'
          });
        }
      };

      guard.addCustomRule(customRule);

      const guardrails = guard.getRegisteredGuardrails();
      expect(guardrails).toHaveLength(1);
      expect(guardrails[0].name).toBe('CustomRule');
    });

    it('should execute custom guardrail rule', async () => {
      const guard = new TealGuard();

      const customRule: CustomGuardrailRule = {
        name: 'CustomRule',
        evaluate: async (input: any) => {
          const hasKeyword = input.includes('forbidden');
          return new GuardrailResult({
            passed: !hasKeyword,
            action: hasKeyword ? 'block' : 'allow',
            reason: hasKeyword ? 'Contains forbidden keyword' : 'OK'
          });
        }
      };

      guard.addCustomRule(customRule);

      // Test with allowed input
      let result = await guard.check('safe input');
      expect(result.passed).toBe(true);

      // Test with blocked input
      result = await guard.check('forbidden input');
      expect(result.passed).toBe(false);
    });

    it('should remove custom guardrail rule', () => {
      const guard = new TealGuard();

      const customRule: CustomGuardrailRule = {
        name: 'CustomRule',
        evaluate: async () => new GuardrailResult({
          passed: true,
          action: 'allow',
          reason: 'OK'
        })
      };

      guard.addCustomRule(customRule);
      expect(guard.getRegisteredGuardrails()).toHaveLength(1);

      guard.removeCustomRule('CustomRule');
      expect(guard.getRegisteredGuardrails()).toHaveLength(0);
    });

    it('should support multiple custom rules', async () => {
      const guard = new TealGuard();

      const rule1: CustomGuardrailRule = {
        name: 'Rule1',
        evaluate: async (input: any) => new GuardrailResult({
          passed: !input.includes('bad1'),
          action: input.includes('bad1') ? 'block' : 'allow',
          reason: 'Rule1'
        })
      };

      const rule2: CustomGuardrailRule = {
        name: 'Rule2',
        evaluate: async (input: any) => new GuardrailResult({
          passed: !input.includes('bad2'),
          action: input.includes('bad2') ? 'block' : 'allow',
          reason: 'Rule2'
        })
      };

      guard.addCustomRule(rule1);
      guard.addCustomRule(rule2);

      expect(guard.getRegisteredGuardrails()).toHaveLength(2);

      // Both rules pass
      let result = await guard.check('safe input');
      expect(result.passed).toBe(true);

      // Rule1 fails
      result = await guard.check('bad1 input');
      expect(result.passed).toBe(false);

      // Rule2 fails
      result = await guard.check('bad2 input');
      expect(result.passed).toBe(false);
    });

    it('should support custom rules with context', async () => {
      const guard = new TealGuard();

      const customRule: CustomGuardrailRule = {
        name: 'ContextRule',
        evaluate: async (_input: any, context?: Record<string, any>) => {
          const isAdmin = context?.role === 'admin';
          return new GuardrailResult({
            passed: isAdmin,
            action: isAdmin ? 'allow' : 'block',
            reason: isAdmin ? 'Admin access' : 'Not admin'
          });
        }
      };

      guard.addCustomRule(customRule);

      // Test with admin context
      let result = await guard.check('test', { role: 'admin' });
      expect(result.passed).toBe(true);

      // Test with non-admin context
      result = await guard.check('test', { role: 'user' });
      expect(result.passed).toBe(false);
    });

    it('should respect custom rule enabled flag', async () => {
      const guard = new TealGuard();

      const customRule: CustomGuardrailRule = {
        name: 'DisabledRule',
        enabled: false,
        evaluate: async () => new GuardrailResult({
          passed: false,
          action: 'block',
          reason: 'Should not execute'
        })
      };

      guard.addCustomRule(customRule);

      // Disabled rule should not block
      const result = await guard.check('test');
      expect(result.passed).toBe(true);
    });
  });

  describe('3.3.3: Parallel Execution', () => {
    it('should execute multiple guardrails in parallel', async () => {
      const guard = new TealGuard({
        engineOptions: {
          parallelExecution: true
        }
      });

      // Add multiple guardrails
      guard.registerGuardrail(new TestGuardrail(true));
      guard.registerGuardrail(new TestGuardrail(true));
      guard.registerGuardrail(new TestGuardrail(true));

      const startTime = Date.now();
      const result = await guard.check('test input');
      const executionTime = Date.now() - startTime;

      expect(result.passed).toBe(true);
      expect(result.guardrailResults.guardrailsExecuted).toBe(3);
      
      // Parallel execution should be faster than sequential
      // (though in tests with fast guardrails, the difference may be minimal)
      expect(executionTime).toBeLessThan(1000);
    });

    it('should handle parallel execution with mixed results', async () => {
      const guard = new TealGuard({
        engineOptions: {
          parallelExecution: true
        }
      });

      guard.registerGuardrail(new TestGuardrail(true));
      guard.registerGuardrail(new TestGuardrail(false));
      guard.registerGuardrail(new TestGuardrail(true));

      const result = await guard.check('test input');

      expect(result.passed).toBe(false);
      expect(result.guardrailResults.guardrailsExecuted).toBe(3);
      expect(result.guardrailResults.failedGuardrails).toHaveLength(1);
    });

    it('should support sequential execution mode', async () => {
      const guard = new TealGuard({
        engineOptions: {
          parallelExecution: false
        }
      });

      guard.registerGuardrail(new TestGuardrail(true));
      guard.registerGuardrail(new TestGuardrail(true));

      const result = await guard.check('test input');

      expect(result.passed).toBe(true);
      expect(result.guardrailResults.guardrailsExecuted).toBe(2);
    });

    it('should register and unregister guardrails', () => {
      const guard = new TealGuard();

      const guardrail = new TestGuardrail();
      guard.registerGuardrail(guardrail);

      expect(guard.getRegisteredGuardrails()).toHaveLength(1);

      guard.unregisterGuardrail('TestGuardrail');

      expect(guard.getRegisteredGuardrails()).toHaveLength(0);
    });

    it('should clear all guardrails', () => {
      const guard = new TealGuard();

      guard.registerGuardrail(new TestGuardrail());
      guard.registerGuardrail(new TestGuardrail());

      expect(guard.getRegisteredGuardrails()).toHaveLength(2);

      guard.clearGuardrails();

      expect(guard.getRegisteredGuardrails()).toHaveLength(0);
    });
  });

  describe('3.3.4: Performance (Caching)', () => {
    it('should cache results when caching is enabled', async () => {
      const guard = new TealGuard({
        enableCache: true,
        cacheTTL: 60000
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // First call - cache miss
      const result1 = await guard.check('test input');
      expect(result1.cacheHit).toBe(false);
      const executionTime1 = result1.executionTime;

      // Second call with same input - cache hit
      const result2 = await guard.check('test input');
      expect(result2.cacheHit).toBe(true);
      // Cache hit should be at least as fast or faster
      expect(result2.executionTime).toBeLessThanOrEqual(executionTime1 + 1);
    });

    it('should not cache when caching is disabled', async () => {
      const guard = new TealGuard({
        enableCache: false
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      const result1 = await guard.check('test input');
      expect(result1.cacheHit).toBe(false);

      const result2 = await guard.check('test input');
      expect(result2.cacheHit).toBe(false);
    });

    it('should enable and disable cache dynamically', async () => {
      const guard = new TealGuard({
        enableCache: false
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // Cache disabled
      let result = await guard.check('test input');
      expect(result.cacheHit).toBe(false);

      // Enable cache
      guard.enableResultCache();
      result = await guard.check('test input');
      expect(result.cacheHit).toBe(false); // First call after enabling

      result = await guard.check('test input');
      expect(result.cacheHit).toBe(true); // Second call - cached

      // Disable cache
      guard.disableResultCache();
      result = await guard.check('test input');
      expect(result.cacheHit).toBe(false); // Cache disabled
    });

    it('should clear cache manually', async () => {
      const guard = new TealGuard({
        enableCache: true
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // Populate cache
      await guard.check('test input');
      let result = await guard.check('test input');
      expect(result.cacheHit).toBe(true);

      // Clear cache
      guard.clearCache();

      // Next call should be cache miss
      result = await guard.check('test input');
      expect(result.cacheHit).toBe(false);
    });

    it('should clear cache when policy is updated', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({
        policy,
        enableCache: true,
        policyDriven: true
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // Populate cache
      await guard.check('test input', { agentId: 'test', action: 'test' });
      let result = await guard.check('test input', { agentId: 'test', action: 'test' });
      expect(result.cacheHit).toBe(true);

      // Update policy (should clear cache)
      guard.updatePolicy(createTestPolicy());

      // Next call should be cache miss
      result = await guard.check('test input', { agentId: 'test', action: 'test' });
      expect(result.cacheHit).toBe(false);
    });

    it('should respect cache TTL', async () => {
      const guard = new TealGuard({
        enableCache: true,
        cacheTTL: 100 // 100ms TTL
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // First call
      await guard.check('test input');

      // Second call within TTL
      let result = await guard.check('test input');
      expect(result.cacheHit).toBe(true);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Call after TTL expiration
      result = await guard.check('test input');
      expect(result.cacheHit).toBe(false);
    });

    it('should get cache statistics', async () => {
      const guard = new TealGuard({
        enableCache: true,
        cacheMaxSize: 100
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // Initially empty
      let stats = guard.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(100);

      // Add entries
      await guard.check('input1');
      await guard.check('input2');
      await guard.check('input3');

      stats = guard.getCacheStats();
      expect(stats.size).toBe(3);
    });

    it('should handle different inputs separately in cache', async () => {
      const guard = new TealGuard({
        enableCache: true
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // Different inputs should not hit cache
      await guard.check('input1');
      const result1 = await guard.check('input1');
      expect(result1.cacheHit).toBe(true);

      const result2 = await guard.check('input2');
      expect(result2.cacheHit).toBe(false);

      const result3 = await guard.check('input2');
      expect(result3.cacheHit).toBe(true);
    });

    it('should handle different contexts separately in cache', async () => {
      const guard = new TealGuard({
        enableCache: true
      });

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      // Same input, different context
      await guard.check('test', { role: 'admin' });
      const result1 = await guard.check('test', { role: 'admin' });
      expect(result1.cacheHit).toBe(true);

      const result2 = await guard.check('test', { role: 'user' });
      expect(result2.cacheHit).toBe(false);
    });

    it('should include execution time in results', async () => {
      const guard = new TealGuard();

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      const result = await guard.check('test input');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should include timestamp in results', async () => {
      const guard = new TealGuard();

      const guardrail = new TestGuardrail(true);
      guard.registerGuardrail(guardrail);

      const result = await guard.check('test input');

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    it('should work with real PII detection guardrail', async () => {
      const guard = new TealGuard();

      const piiGuard = new PIIDetectionGuardrail({
        action: 'block',
        detectTypes: ['email', 'phone']
      });

      guard.registerGuardrail(piiGuard);

      // Test with PII
      let result = await guard.check('Contact me at john@example.com');
      expect(result.passed).toBe(false);

      // Test without PII
      result = await guard.check('Hello world');
      expect(result.passed).toBe(true);
    });

    it('should combine policy and guardrails correctly', async () => {
      const policy = createTestPolicy();
      const guard = new TealGuard({
        policy,
        policyDriven: true
      });

      const piiGuard = new PIIDetectionGuardrail({
        action: 'block',
        detectTypes: ['email']
      });

      guard.registerGuardrail(piiGuard);

      // Both policy and guardrail should pass
      let result = await guard.check('Hello world', {
        agentId: 'test',
        action: 'test.action'
      });
      expect(result.passed).toBe(true);

      // Guardrail fails, policy passes
      result = await guard.check('Email: test@example.com', {
        agentId: 'test',
        action: 'test.action'
      });
      expect(result.passed).toBe(false);
      expect(result.guardrailResults.passed).toBe(false);
      expect(result.policyResult?.allowed).toBe(true);

      // Guardrail passes, policy fails
      result = await guard.check('Hello world', {
        agentId: 'test',
        action: 'tool.use',
        tool: 'dangerous-tool'
      });
      expect(result.passed).toBe(false);
      expect(result.guardrailResults.passed).toBe(true);
      expect(result.policyResult?.allowed).toBe(false);
    });
  });
});
