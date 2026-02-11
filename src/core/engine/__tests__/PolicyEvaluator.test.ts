/**
 * Unit Tests for PolicyEvaluator
 * 
 * Tests cover:
 * - Tool policy evaluation
 * - Identity policy evaluation
 * - Code execution policy evaluation
 * - Behavioral policy evaluation
 * - Result aggregation
 */

import { PolicyEvaluator } from '../PolicyEvaluator';
import { TealPolicy, RequestContext } from '../types';
import {
  createToolContext,
  createCodeContext,
  assertAllowed,
  assertBlocked,
} from './helpers';

describe('PolicyEvaluator', () => {
  let evaluator: PolicyEvaluator;

  beforeEach(() => {
    evaluator = new PolicyEvaluator();
  });

  describe('Tool Policy Evaluation', () => {
    it('should allow tool when explicitly allowed', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      const context = createToolContext('database_query');

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies).toContain('tools.database_query');
    });

    it('should block tool when explicitly blocked', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false },
        },
      };
      const context = createToolContext('file_delete');

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('blocked');
    });

    it('should block tool when not defined in policy', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      const context = createToolContext('file_write');

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('not defined in policy');
    });

    it('should allow tool with wildcard policy', () => {
      const policy: TealPolicy = {
        tools: {
          '*': { allowed: true },
        },
      };
      const context = createToolContext('any_tool');

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });

    it('should block tool with wildcard block policy', () => {
      const policy: TealPolicy = {
        tools: {
          '*': { allowed: false },
        },
      };
      const context = createToolContext('any_tool');

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
    });

    it('should prefer specific policy over wildcard', () => {
      const policy: TealPolicy = {
        tools: {
          '*': { allowed: false },
          database_query: { allowed: true },
        },
      };
      const context = createToolContext('database_query');

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });

    it('should check maxSize constraint', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: {
            allowed: true,
            maxSize: '100B',
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query',
        toolParams: {
          data: 'x'.repeat(200), // Exceeds 100 bytes
        },
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('exceed max size');
    });

    it('should check maxRows constraint', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: {
            allowed: true,
            maxRows: 1000,
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query',
        toolParams: {
          limit: 5000, // Exceeds maxRows
        },
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('exceeds max rows');
    });

    it('should check allowedTables constraint', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: {
            allowed: true,
            allowedTables: ['customers', 'orders'],
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query',
        toolParams: {
          table: 'admin_users', // Not in allowed list
        },
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('not in allowed tables');
    });

    it('should allow when table is in allowedTables', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: {
            allowed: true,
            allowedTables: ['customers', 'orders'],
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query',
        toolParams: {
          table: 'customers',
        },
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });
  });

  describe('Identity Policy Evaluation', () => {
    it('should allow when agent ID matches', () => {
      const policy: TealPolicy = {
        identity: {
          agentId: 'agent-001',
          role: 'admin',
          permissions: ['read:data'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies).toContain('identity');
    });

    it('should block when agent ID does not match', () => {
      const policy: TealPolicy = {
        identity: {
          agentId: 'agent-001',
          role: 'admin',
          permissions: ['read:data'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-002',
        action: 'tool.execute',
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('does not match');
    });

    it('should block forbidden actions', () => {
      const policy: TealPolicy = {
        identity: {
          agentId: 'agent-001',
          role: 'user',
          permissions: ['read:data'],
          forbidden: ['delete:*', 'admin:*'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'delete:records',
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('forbidden');
    });

    it('should allow non-forbidden actions', () => {
      const policy: TealPolicy = {
        identity: {
          agentId: 'agent-001',
          role: 'user',
          permissions: ['read:data'],
          forbidden: ['delete:*'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'read:data',
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });

    it('should match wildcard forbidden patterns', () => {
      const policy: TealPolicy = {
        identity: {
          agentId: 'agent-001',
          role: 'user',
          permissions: ['read:data'],
          forbidden: ['*'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'any:action',
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
    });
  });

  describe('Code Execution Policy Evaluation', () => {
    it('should allow code in allowed language', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript', 'python'],
          blockedFunctions: [],
          blockedPatterns: [],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: false,
        },
      };
      const context = createCodeContext('javascript', 'console.log("hello")');

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies).toContain('codeExecution');
    });

    it('should block code in disallowed language', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['python'],
          blockedFunctions: [],
          blockedPatterns: [],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: false,
        },
      };
      const context = createCodeContext('javascript', 'console.log("hello")');

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('not allowed');
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
      const longCode = 'a'.repeat(200);
      const context = createCodeContext('javascript', longCode);

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('exceeds max length');
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
      const context = createCodeContext('javascript', 'eval("malicious code")');

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('blocked function');
    });

    it('should block code matching blocked patterns', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript'],
          blockedFunctions: [],
          blockedPatterns: [/eval\s*\(/, /exec\s*\(/],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: false,
        },
      };
      const context = createCodeContext('javascript', 'eval("code")');

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('blocked pattern');
    });

    it('should block code when sandbox required but not available', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript'],
          blockedFunctions: [],
          blockedPatterns: [],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: true,
        },
      };
      const context = createCodeContext('javascript', 'console.log("hello")');
      // No sandboxed metadata

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('sandbox');
    });

    it('should allow code when sandbox is available', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript'],
          blockedFunctions: [],
          blockedPatterns: [],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: true,
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'code.execute',
        code: 'console.log("hello")',
        metadata: {
          language: 'javascript',
          sandboxed: true,
        },
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });
  });

  describe('Behavioral Policy Evaluation', () => {
    it('should allow when cost is within limits', () => {
      const policy: TealPolicy = {
        behavioral: {
          costLimit: {
            daily: 100,
          },
          rateLimit: {
            requests: 100,
            window: '1h',
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        cost: 5.0,
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies).toContain('behavioral');
    });

    it('should block when cost exceeds daily limit', () => {
      const policy: TealPolicy = {
        behavioral: {
          costLimit: {
            daily: 10,
          },
          rateLimit: {
            requests: 100,
            window: '1h',
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        cost: 50.0,
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toContain('exceeds daily limit');
    });

    it('should allow when no cost is provided', () => {
      const policy: TealPolicy = {
        behavioral: {
          costLimit: {
            daily: 10,
          },
          rateLimit: {
            requests: 100,
            window: '1h',
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });
  });

  describe('Result Aggregation', () => {
    it('should allow when all policies pass', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
        identity: {
          agentId: 'agent-001',
          role: 'admin',
          permissions: ['read:data'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query',
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies).toContain('tools.database_query');
      expect(result.triggeredPolicies).toContain('identity');
    });

    it('should block when any policy fails (AND logic)', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
        identity: {
          agentId: 'agent-001',
          role: 'admin',
          permissions: ['read:data'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-002', // Wrong agent
        action: 'tool.execute',
        tool: 'database_query',
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toBeDefined();
    });

    it('should allow when no policies are defined', () => {
      const policy: TealPolicy = {};
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies).toHaveLength(0);
    });

    it('should aggregate triggered policies from all evaluations', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
        identity: {
          agentId: 'agent-001',
          role: 'admin',
          permissions: ['read:data'],
        },
        behavioral: {
          costLimit: { daily: 100 },
          rateLimit: { requests: 100, window: '1h' },
        },
      };
      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query',
        cost: 5.0,
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
      expect(result.triggeredPolicies.length).toBeGreaterThan(1);
      expect(result.metadata.policiesEvaluated).toBe(3);
    });

    it('should return first blocked reason when multiple policies fail', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false },
        },
        identity: {
          agentId: 'agent-001',
          role: 'admin',
          permissions: ['read:data'],
        },
      };
      const context: RequestContext = {
        agentId: 'agent-002', // Wrong agent
        action: 'tool.execute',
        tool: 'file_delete', // Blocked tool
      };

      const result = evaluator.evaluate(context, policy);

      assertBlocked(result);
      expect(result.reason).toBeDefined();
      // Should return the first failure reason
    });
  });

  describe('Edge Cases', () => {
    it('should handle context without tool when tool policy exists', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'chat.create',
        // No tool specified
      };

      const result = evaluator.evaluate(context, policy);

      // Should not evaluate tool policy if no tool in context
      assertAllowed(result);
    });

    it('should handle context without code when code policy exists', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['javascript'],
          blockedFunctions: [],
          blockedPatterns: [],
          maxLength: 10000,
          timeout: 5000,
          requireSandbox: false,
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        // No code specified
      };

      const result = evaluator.evaluate(context, policy);

      // Should not evaluate code policy if no code in context
      assertAllowed(result);
    });

    it('should handle empty tool params', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: {
            allowed: true,
            maxRows: 1000,
          },
        },
      };
      const context: RequestContext = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query',
        toolParams: {},
      };

      const result = evaluator.evaluate(context, policy);

      assertAllowed(result);
    });

    it('should include evaluation time in metadata', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true },
        },
      };
      const context = createToolContext('database_query');

      const result = evaluator.evaluate(context, policy);

      expect(result.metadata.evaluationTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.evaluationTime).toBe('number');
    });
  });
});
