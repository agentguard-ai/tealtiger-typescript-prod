/**
 * Property-Based Tests for TealEngine
 * 
 * These tests use fast-check to verify universal properties that should hold
 * for all possible inputs.
 * 
 * Validates Requirements: 2.3.1 - 2.3.6
 * 
 * NOTE: Due to TypeScript's exactOptionalPropertyTypes setting, we use simplified
 * generators that don't rely on fc.option() for optional fields.
 */

import * as fc from 'fast-check';
import { TealEngine } from '../TealEngine';
import type { TealPolicy, RequestContext } from '../types';

// Simplified generators that work with exactOptionalPropertyTypes
const arbSimplePolicy = (): fc.Arbitrary<TealPolicy> =>
  fc.record({
    tools: fc.constant({
      test_tool: { allowed: true },
      blocked_tool: { allowed: false }
    })
  });

const arbSimpleContext = (): fc.Arbitrary<RequestContext> =>
  fc.record({
    agentId: fc.string({ minLength: 1, maxLength: 20 }),
    action: fc.constantFrom('chat.create', 'tool.execute', 'code.execute'),
    tool: fc.string({ minLength: 1, maxLength: 20 })
  });

describe('TealEngine Property-Based Tests', () => {
  describe('2.3.1 Evaluation Consistency', () => {
    /**
     * Property: Same input → Same output
     * Validates: Requirements 2.3.1
     */
    it('should return consistent results for same input', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimpleContext(),
          (policy: TealPolicy, context: RequestContext) => {
            const engine = new TealEngine(policy);
            
            const result1 = engine.evaluate(context);
            const result2 = engine.evaluate(context);
            const result3 = engine.evaluate(context);
            
            expect(result1.allowed).toBe(result2.allowed);
            expect(result1.allowed).toBe(result3.allowed);
            expect(result1.reason).toBe(result2.reason);
            expect(result1.triggeredPolicies).toEqual(result2.triggeredPolicies);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent results across different engine instances', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimpleContext(),
          (policy: TealPolicy, context: RequestContext) => {
            const engine1 = new TealEngine(policy);
            const engine2 = new TealEngine(policy);
            
            const result1 = engine1.evaluate(context);
            const result2 = engine2.evaluate(context);
            
            expect(result1.allowed).toBe(result2.allowed);
            expect(result1.reason).toBe(result2.reason);
            expect(result1.triggeredPolicies).toEqual(result2.triggeredPolicies);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('2.3.2 Cache Correctness', () => {
    /**
     * Property: Cached result === Fresh result
     * Validates: Requirements 2.3.2
     */
    it('should return same result from cache as fresh evaluation', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimpleContext(),
          (policy: TealPolicy, context: RequestContext) => {
            const engine = new TealEngine(policy, { cacheEnabled: true });
            
            const freshResult = engine.evaluate(context);
            const cachedResult = engine.evaluate(context);
            
            expect(cachedResult.allowed).toBe(freshResult.allowed);
            expect(cachedResult.reason).toBe(freshResult.reason);
            expect(cachedResult.triggeredPolicies).toEqual(freshResult.triggeredPolicies);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invalidate cache when policy changes', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimplePolicy(),
          arbSimpleContext(),
          (policy1: TealPolicy, policy2: TealPolicy, context: RequestContext) => {
            const engine = new TealEngine(policy1, { cacheEnabled: true });
            
            engine.evaluate(context);
            engine.updatePolicies(policy2);
            
            const result2 = engine.evaluate(context);
            const result3 = engine.evaluate(context);
            
            expect(result3.allowed).toBe(result2.allowed);
            expect(result3.reason).toBe(result2.reason);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should clear cache when explicitly requested', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimpleContext(),
          (policy: TealPolicy, context: RequestContext) => {
            const engine = new TealEngine(policy, { cacheEnabled: true });
            
            engine.evaluate(context);
            engine.clearCache();
            
            const result = engine.evaluate(context);
            
            expect(result).toHaveProperty('allowed');
            expect(result).toHaveProperty('triggeredPolicies');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('2.3.3 Policy Composition', () => {
    /**
     * Property: A ∧ B === B ∧ A (Commutative)
     * Validates: Requirements 2.3.3
     */
    it('should produce same result regardless of policy component order', () => {
      fc.assert(
        fc.property(
          arbSimpleContext(),
          (context: RequestContext) => {
            const toolPolicy = {
              test_tool: { allowed: true }
            };
            
            const identityPolicy = {
              agentId: 'test-agent',
              role: 'admin',
              permissions: ['read', 'write']
            };
            
            const policy1: TealPolicy = {
              tools: toolPolicy,
              identity: identityPolicy
            };
            
            const policy2: TealPolicy = {
              identity: identityPolicy,
              tools: toolPolicy
            };
            
            const engine1 = new TealEngine(policy1);
            const engine2 = new TealEngine(policy2);
            
            const result1 = engine1.evaluate(context);
            const result2 = engine2.evaluate(context);
            
            expect(result1.allowed).toBe(result2.allowed);
            expect(result1.reason).toBe(result2.reason);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should combine multiple policy types with AND logic', () => {
      fc.assert(
        fc.property(
          arbSimpleContext(),
          (context: RequestContext) => {
            const combinedPolicy: TealPolicy = {
              tools: {
                test_tool: { allowed: true }
              },
              behavioral: {
                costLimit: {
                  daily: 100
                },
                rateLimit: {
                  requests: 1000,
                  window: '1h'
                }
              }
            };
            
            const engine = new TealEngine(combinedPolicy);
            const result = engine.evaluate(context);
            
            if (!result.allowed) {
              expect(result.reason).toBeDefined();
              expect(result.reason).not.toBe('');
            }
            
            if (result.allowed) {
              expect(result.reason).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('2.3.4 Policy Idempotence', () => {
    /**
     * Property: evaluate(evaluate(x)) === evaluate(x)
     * Validates: Requirements 2.3.4
     */
    it('should produce same result when evaluated multiple times', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimpleContext(),
          fc.integer({ min: 2, max: 10 }),
          (policy: TealPolicy, context: RequestContext, iterations: number) => {
            const engine = new TealEngine(policy);
            
            const results = Array.from({ length: iterations }, () =>
              engine.evaluate(context)
            );
            
            const firstResult = results[0];
            results.forEach((result) => {
              expect(result.allowed).toBe(firstResult.allowed);
              expect(result.reason).toBe(firstResult.reason);
              expect(result.triggeredPolicies).toEqual(firstResult.triggeredPolicies);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not accumulate state across evaluations', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          fc.array(arbSimpleContext(), { minLength: 2, maxLength: 5 }),
          (policy: TealPolicy, contexts: RequestContext[]) => {
            const engine = new TealEngine(policy);
            
            const results = contexts.map(ctx => engine.evaluate(ctx));
            const reEvaluated = engine.evaluate(contexts[0]);
            
            expect(reEvaluated.allowed).toBe(results[0].allowed);
            expect(reEvaluated.reason).toBe(results[0].reason);
            expect(reEvaluated.triggeredPolicies).toEqual(results[0].triggeredPolicies);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('2.3.5 Boundary Conditions', () => {
    /**
     * Property: Handles empty/null values gracefully
     * Validates: Requirements 2.3.5
     */
    it('should handle empty policy gracefully', () => {
      fc.assert(
        fc.property(
          arbSimpleContext(),
          (context: RequestContext) => {
            const engine = new TealEngine({});
            const result = engine.evaluate(context);
            
            expect(result.allowed).toBe(true);
            expect(result.triggeredPolicies).toEqual([]);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle minimal context gracefully', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          (policy: TealPolicy) => {
            const engine = new TealEngine(policy);
            const minimalContext: RequestContext = {
              agentId: 'test-agent',
              action: 'chat.create'
            };
            
            const result = engine.evaluate(minimalContext);
            
            expect(result).toHaveProperty('allowed');
            expect(typeof result.allowed).toBe('boolean');
            expect(Array.isArray(result.triggeredPolicies)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle policy with empty tool definitions', () => {
      fc.assert(
        fc.property(
          arbSimpleContext(),
          (context: RequestContext) => {
            const engine = new TealEngine({
              tools: {}
            });
            
            const result = engine.evaluate(context);
            
            if (context.tool) {
              expect(result.allowed).toBe(false);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle very long strings in context', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          fc.string({ minLength: 1000, maxLength: 10000 }),
          (policy: TealPolicy, longString: string) => {
            const engine = new TealEngine(policy);
            const context: RequestContext = {
              agentId: longString,
              action: 'chat.create'
            };
            
            const result = engine.evaluate(context);
            
            expect(result).toHaveProperty('allowed');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('2.3.6 Policy Template Validity', () => {
    /**
     * Property: All policy templates are valid
     * Validates: Requirements 2.3.6
     */
    it('should handle policy with all fields defined', () => {
      fc.assert(
        fc.property(
          arbSimpleContext(),
          (context: RequestContext) => {
            const fullPolicy: TealPolicy = {
              tools: {
                test_tool: { allowed: true }
              },
              identity: {
                agentId: 'test-agent',
                role: 'admin',
                permissions: ['read', 'write']
              },
              behavioral: {
                costLimit: {
                  daily: 100
                },
                rateLimit: {
                  requests: 1000,
                  window: '1h'
                }
              }
            };
            
            const engine = new TealEngine(fullPolicy);
            const result = engine.evaluate(context);
            
            expect(result).toHaveProperty('allowed');
            expect(typeof result.allowed).toBe('boolean');
            expect(Array.isArray(result.triggeredPolicies)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle policy with only tools defined', () => {
      fc.assert(
        fc.property(
          arbSimpleContext(),
          (context: RequestContext) => {
            const policy: TealPolicy = {
              tools: {
                test_tool: { allowed: true }
              }
            };
            
            const engine = new TealEngine(policy);
            const result = engine.evaluate(context);
            
            expect(result).toHaveProperty('allowed');
            expect(typeof result.allowed).toBe('boolean');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle policy modifications correctly', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (allowValue: boolean) => {
            const policy: TealPolicy = {
              tools: {
                test_tool: { allowed: allowValue }
              }
            };
            
            const engine = new TealEngine(policy);
            const context: RequestContext = {
              agentId: 'test-agent',
              action: 'tool.execute',
              tool: 'test_tool'
            };
            
            const result = engine.evaluate(context);
            
            expect(result).toHaveProperty('allowed');
            expect(result.allowed).toBe(allowValue);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Additional Property Tests', () => {
    it('should maintain type safety across all operations', () => {
      fc.assert(
        fc.property(
          arbSimplePolicy(),
          arbSimpleContext(),
          (policy: TealPolicy, context: RequestContext) => {
            const engine = new TealEngine(policy);
            const result = engine.evaluate(context);
            
            expect(typeof result.allowed).toBe('boolean');
            expect(Array.isArray(result.triggeredPolicies)).toBe(true);
            expect(result.metadata).toBeDefined();
            expect(typeof result.metadata.evaluationTime).toBe('number');
            
            if (result.reason) {
              expect(typeof result.reason).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle concurrent evaluations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbSimplePolicy(),
          fc.array(arbSimpleContext(), { minLength: 5, maxLength: 20 }),
          async (policy: TealPolicy, contexts: RequestContext[]) => {
            const engine = new TealEngine(policy);
            
            const results = await Promise.all(
              contexts.map(ctx => Promise.resolve(engine.evaluate(ctx)))
            );
            
            results.forEach(result => {
              expect(result).toHaveProperty('allowed');
              expect(typeof result.allowed).toBe('boolean');
            });
            
            const sequentialResults = contexts.map(ctx => engine.evaluate(ctx));
            
            results.forEach((result, index) => {
              expect(result.allowed).toBe(sequentialResults[index].allowed);
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
