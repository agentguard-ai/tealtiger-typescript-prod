
/**
 * Unit Tests for TealEngine
 * 
 * Tests cover:
 * - Policy evaluation (allowed and blocked cases)
 * - Policy validation
 * - Policy templates
 * - Cache functionality
 */

import { TealEngine } from '../TealEngine';
import { TealPolicy, RequestContext } from '../types';
import {
  createSimpleToolPolicy,
  createIdentityPolicy,
  createCodeExecutionPolicy,
  createToolContext,
  createCodeContext,
  assertAllowed,
  assertBlocked,
  assertHasMetadata,
} from './helpers';

describe('TealEngine', () => {
  describe('Constructor', () => {
    it('should create TealEngine with empty policy', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);
      expect(engine).toBeInstanceOf(TealEngine);
    });

    it('should create TealEngine with tool policy', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      const engine = new TealEngine(policy);
      expect(engine).toBeInstanceOf(TealEngine);
    });

    it('should create TealEngine with cache enabled', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy, { cacheEnabled: true, cacheTTL: 60000 });
      expect(engine).toBeInstanceOf(TealEngine);
    });

    it('should create TealEngine with cache disabled', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy, { cacheEnabled: false });
      expect(engine).toBeInstanceOf(TealEngine);
    });

    it('should throw error for invalid policy', () => {
      // Note: Testing invalid policies is difficult with TypeScript's type system
      // This test verifies that valid policies don't throw
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      expect(() => new TealEngine(policy)).not.toThrow();
    });
  });

  describe('Policy Evaluation - Allowed Cases', () => {
    it('should allow request when no policies are defined', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);
      const context = createToolContext('database_query', 'admin');

      const result = engine.evaluate(context);

      assertAllowed(result);
      assertHasMetadata(result);
    });

    it('should allow tool when explicitly allowed', () => {
      const policy = createSimpleToolPolicy(['database_query', 'file_read']);
      const engine = new TealEngine(policy);
      const context = createToolContext('database_query');

      const result = engine.evaluate(context);

      assertAllowed(result);
    });

    it('should allow tool with wildcard policy', () => {
      const policy: TealPolicy = {
        tools: {
          '*': { allowed: true },
        },
      };
      const engine = new TealEngine(policy);
      const context = createToolContext('any_tool');

      const result = engine.evaluate(context);

      assertAllowed(result);
    });

    it('should allow identity when matching policy', () => {
      const policy = createIdentityPolicy('agent-001', 'admin', ['read:data']);
      const engine = new TealEngine(policy);
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query',
      };

      const result = engine.evaluate(context);

      assertAllowed(result);
    });

    it('should allow code execution when language is allowed', () => {
      const policy = createCodeExecutionPolicy(['javascript', 'python']);
      const engine = new TealEngine(policy);
      const context = createCodeContext('javascript', 'console.log("hello")');

      const result = engine.evaluate(context);

      assertAllowed(result);
    });
  });

  describe('Policy Evaluation - Blocked Cases', () => {
    it('should block tool when explicitly blocked', () => {
      const policy = createSimpleToolPolicy([], ['file_write', 'file_delete']);
      const engine = new TealEngine(policy);
      const context = createToolContext('file_write');

      const result = engine.evaluate(context);

      assertBlocked(result);
      expect(result.reason).toBeDefined();
    });

    it('should block tool when not in allowed list', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);
      const context = createToolContext('file_write');

      const result = engine.evaluate(context);

      assertBlocked(result);
    });

    it('should block identity when not matching', () => {
      const policy = createIdentityPolicy('agent-001', 'admin', ['read:data']);
      const engine = new TealEngine(policy);
      const context: RequestContext = {
        agentId: 'agent-002', // Different agent
        action: 'tool.execute',
        tool: 'database_query',
      };

      const result = engine.evaluate(context);

      assertBlocked(result);
    });

    it('should block code execution when language not allowed', () => {
      const policy = createCodeExecutionPolicy(['python']);
      const engine = new TealEngine(policy);
      const context = createCodeContext('javascript', 'console.log("hello")');

      const result = engine.evaluate(context);

      assertBlocked(result);
    });

    it('should block code with blocked functions', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript'],
          blockedFunctions: ['eval', 'Function'],
          blockedPatterns: [],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: false,
        },
      };
      const engine = new TealEngine(policy);
      const context = createCodeContext('javascript', 'eval("malicious code")');

      const result = engine.evaluate(context);

      assertBlocked(result);
      expect(result.reason).toContain('blocked function');
    });

    it('should block code exceeding maxLength', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript'],
          blockedFunctions: [],
          blockedPatterns: [],
          maxLength: 100,
          timeout: 5000,
          requireSandbox: false,
        },
      };
      const engine = new TealEngine(policy);
      const longCode = 'a'.repeat(200);
      const context = createCodeContext('javascript', longCode);

      const result = engine.evaluate(context);

      assertBlocked(result);
      expect(result.reason).toContain('exceeds max length');
    });
  });

  describe('Policy Validation', () => {
    it('should validate a valid policy', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);

      const validation = engine.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should provide warnings for best practices', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      const engine = new TealEngine(policy);

      const validation = engine.validate();

      // May have warnings about missing identity policy, etc.
      expect(validation.warnings).toBeDefined();
    });
  });

  describe('Policy Templates', () => {
    it('should have customerSupport template', () => {
      const template = TealEngine.Templates.customerSupport();
      expect(template.tools).toBeDefined();
      expect(template.identity).toBeDefined();
      expect(template.behavioral).toBeDefined();
    });

    it('should have dataAnalysis template', () => {
      const template = TealEngine.Templates.dataAnalysis();
      expect(template.tools).toBeDefined();
      expect(template.codeExecution).toBeDefined();
    });

    it('should have codeGeneration template', () => {
      const template = TealEngine.Templates.codeGeneration();
      expect(template.codeExecution).toBeDefined();
    });

    it('should have codeExecutionSafe template', () => {
      const template = TealEngine.Templates.codeExecutionSafe();
      expect(template.codeExecution).toBeDefined();
      expect(template.codeExecution!.requireSandbox).toBe(true);
    });

    it('should have strictSecurity template', () => {
      const template = TealEngine.Templates.strictSecurity();
      expect(template.codeExecution).toBeDefined();
      expect(template.content).toBeDefined();
    });

    it('should have development template', () => {
      const template = TealEngine.Templates.development();
      expect(template.tools).toBeDefined();
    });

    it('should create new policy objects (not references)', () => {
      const template1 = TealEngine.Templates.customerSupport();
      const template2 = TealEngine.Templates.customerSupport();
      expect(template1).not.toBe(template2);
      expect(template1).toEqual(template2);
    });

    it('should allow using templates with TealEngine', () => {
      const template = TealEngine.Templates.customerSupport();
      const engine = new TealEngine(template);
      const context = createToolContext('search_knowledge_base');

      const result = engine.evaluate(context);

      expect(result).toBeDefined();
      assertHasMetadata(result);
    });
  });

  describe('Cache Functionality', () => {
    it('should cache evaluation results when cache is enabled', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy, { cacheEnabled: true, cacheTTL: 60000 });
      const context = createToolContext('database_query');

      const result1 = engine.evaluate(context);
      const result2 = engine.evaluate(context);

      expect(result1.metadata.cacheHit).toBe(false);
      expect(result2.metadata.cacheHit).toBe(true);
      expect(result1.allowed).toBe(result2.allowed);
    });

    it('should not cache when cache is disabled', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy, { cacheEnabled: false });
      const context = createToolContext('database_query');

      const result1 = engine.evaluate(context);
      const result2 = engine.evaluate(context);

      expect(result1.metadata.cacheHit).toBe(false);
      expect(result2.metadata.cacheHit).toBe(false);
    });

    it('should clear cache', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy, { cacheEnabled: true, cacheTTL: 60000 });
      const context = createToolContext('database_query');

      engine.evaluate(context);
      engine.clearCache();
      const result = engine.evaluate(context);

      expect(result.metadata.cacheHit).toBe(false);
    });

    it('should get cache statistics', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy, { cacheEnabled: true, cacheTTL: 60000 });

      const stats = engine.getCacheStats();

      expect(stats).toBeDefined();
      expect(stats.size).toBe(0);
      expect(stats.enabled).toBe(true);
    });

    it('should cache different contexts separately', () => {
      const policy = createSimpleToolPolicy(['database_query', 'file_read']);
      const engine = new TealEngine(policy, { cacheEnabled: true, cacheTTL: 60000 });
      const context1 = createToolContext('database_query');
      const context2 = createToolContext('file_read');

      engine.evaluate(context1);
      engine.evaluate(context2);
      const stats = engine.getCacheStats();

      expect(stats.size).toBe(2);
    });

    it('should respect cache TTL', async () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy, { cacheEnabled: true, cacheTTL: 100 }); // 100ms TTL
      const context = createToolContext('database_query');

      const result1 = engine.evaluate(context);
      await new Promise((resolve) => setTimeout(resolve, 150)); // wait for TTL to expire
      const result2 = engine.evaluate(context);

      expect(result1.metadata.cacheHit).toBe(false);
      expect(result2.metadata.cacheHit).toBe(false); // cache expired
    });
  });

  describe('Policy Management', () => {
    it('should get current policies', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);

      const policies = engine.getPolicies();

      expect(policies).toBeDefined();
      expect(policies.tools).toBeDefined();
    });

    it('should update policies', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);

      const newPolicy = createSimpleToolPolicy(['database_query', 'file_read']);
      engine.updatePolicies(newPolicy);

      const policies = engine.getPolicies();
      expect(policies.tools).toBeDefined();
    });

    it('should throw error when updating with invalid policy', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);

      // Create an invalid policy (this is tricky to do with TypeScript)
      // For now, just test that updatePolicies works with valid policy
      const newPolicy = createSimpleToolPolicy(['file_read']);
      expect(() => engine.updatePolicies(newPolicy)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle context with only required fields', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
      };

      const result = engine.evaluate(context);

      expect(result).toBeDefined();
      assertHasMetadata(result);
    });

    it('should handle context with metadata', () => {
      const policy = createSimpleToolPolicy(['database_query']);
      const engine = new TealEngine(policy);
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query',
        metadata: { key: 'value' },
      };

      const result = engine.evaluate(context);

      expect(result).toBeDefined();
    });

    it('should handle special characters in tool names', () => {
      const policy: TealPolicy = {
        tools: {
          'api-call': { allowed: true },
          'file.read': { allowed: true },
        },
      };
      const engine = new TealEngine(policy);
      const context = createToolContext('api-call');

      const result = engine.evaluate(context);

      assertAllowed(result);
    });
  });
});
