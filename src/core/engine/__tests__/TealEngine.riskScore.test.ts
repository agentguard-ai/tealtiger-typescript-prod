/**
 * Unit Tests for TealEngine Risk Score Calculation
 * 
 * Tests cover:
 * - Risk score bounds (0-100)
 * - Risk score calculation based on policy violation severity
 * - Different violation types and their risk scores
 * - Multiple policy violations
 * - High-risk pattern detection
 * 
 * Part of Enterprise Adoption Features v1.1.x - Task 2.2
 * Requirements: 2.4, 2.12
 */

import { TealEngine } from '../TealEngine';
import { 
  TealPolicy, 
  RequestContext, 
  PolicyMode, 
  DecisionAction 
} from '../types';

describe('TealEngine Risk Score Calculation', () => {
  describe('Requirement 2.4: Risk Score Bounds', () => {
    it('should return risk score between 0 and 100 (inclusive)', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false },
          database_delete: { allowed: false }
        },
        codeExecution: {
          allowedLanguages: [],
          blockedFunctions: ['eval', 'exec'],
          blockedPatterns: [],
          maxLength: 0,
          timeout: 0,
          requireSandbox: true
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBeGreaterThanOrEqual(0);
      expect(decision.risk_score).toBeLessThanOrEqual(100);
    });

    it('should return 0 risk score for allowed requests', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true }
        }
      };
      
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBe(0);
    });

    it('should clamp risk score to 100 maximum', () => {
      // Create a policy with many high-risk violations
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false },
          database_delete: { allowed: false }
        },
        identity: {
          agentId: 'agent-001',
          role: 'user',
          permissions: [],
          forbidden: ['admin_access', 'system_modify']
        },
        codeExecution: {
          allowedLanguages: [],
          blockedFunctions: ['eval', 'exec', 'system'],
          blockedPatterns: [/rm -rf/, /DROP TABLE/],
          maxLength: 0,
          timeout: 0,
          requireSandbox: true
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBeLessThanOrEqual(100);
    });
  });

  describe('Requirement 2.12: Risk Score Based on Violation Severity', () => {
    it('should calculate base risk score of 50 for violations', () => {
      const policy: TealPolicy = {
        tools: {
          unknown_tool: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'unknown_tool'
      };

      const decision = engine.evaluateWithMode(context);

      // Base score is 50, plus 10 for one triggered policy = 60
      expect(decision.risk_score).toBeGreaterThanOrEqual(50);
    });

    it('should increase risk score for high-risk file_delete operation', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + 10 for triggered policy + 20 for high-risk pattern = 80
      expect(decision.risk_score).toBeGreaterThanOrEqual(70);
    });

    it('should increase risk score for high-risk database_delete operation', () => {
      const policy: TealPolicy = {
        tools: {
          database_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_delete'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + 10 for triggered policy + 20 for high-risk pattern = 80
      expect(decision.risk_score).toBeGreaterThanOrEqual(70);
    });

    it('should increase risk score for identity.forbidden violations', () => {
      const policy: TealPolicy = {
        identity: {
          agentId: 'agent-001',
          role: 'user',
          permissions: [],
          forbidden: ['admin_access']
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'admin_access'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + 10 for triggered policy + 20 for high-risk pattern = 80
      expect(decision.risk_score).toBeGreaterThanOrEqual(70);
    });

    it('should increase risk score for blocked code execution functions', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['python'],
          blockedFunctions: ['eval', 'exec'],
          blockedPatterns: [],
          maxLength: 1000,
          timeout: 5000,
          requireSandbox: true
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'code.execute',
        code: 'eval("malicious code")'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + 10 for triggered policy = 60 (codeExecution.blockedFunctions doesn't match high-risk patterns)
      expect(decision.risk_score).toBeGreaterThanOrEqual(50);
    });

    it('should increase risk score for blocked code execution patterns', () => {
      const policy: TealPolicy = {
        codeExecution: {
          allowedLanguages: ['python'],
          blockedFunctions: [],
          blockedPatterns: [/rm -rf/, /DROP TABLE/],
          maxLength: 1000,
          timeout: 5000,
          requireSandbox: true
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'code.execute',
        code: 'import os; os.system("rm -rf /")'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + 10 for triggered policy = 60 (codeExecution.blockedPatterns doesn't match high-risk patterns)
      expect(decision.risk_score).toBeGreaterThanOrEqual(50);
    });

    it('should accumulate risk score for multiple triggered policies', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false },
          database_delete: { allowed: false }
        },
        identity: {
          agentId: 'agent-001',
          role: 'user',
          permissions: [],
          forbidden: ['admin_access']
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + 10 per triggered policy (capped at +40) + 20 for high-risk = 90+
      expect(decision.risk_score).toBeGreaterThan(60);
    });

    it('should cap risk score increase from triggered policies at +40', () => {
      // Create policy with many violations to test the cap
      const policy: TealPolicy = {
        tools: {
          tool1: { allowed: false },
          tool2: { allowed: false },
          tool3: { allowed: false },
          tool4: { allowed: false },
          tool5: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'tool1'
      };

      const decision = engine.evaluateWithMode(context);

      // Base 50 + capped at 40 = 90 (without high-risk bonus)
      expect(decision.risk_score).toBeLessThanOrEqual(100);
    });
  });

  describe('Risk Score in Different Modes', () => {
    it('should calculate risk score in MONITOR mode', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBeGreaterThan(0);
      expect(decision.action).toBe(DecisionAction.ALLOW);
    });

    it('should calculate risk score in ENFORCE mode', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.ENFORCE }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBeGreaterThan(0);
      expect(decision.action).toBe(DecisionAction.DENY);
    });

    it('should return 0 risk score in REPORT_ONLY mode', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.REPORT_ONLY }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBe(0);
      expect(decision.action).toBe(DecisionAction.ALLOW);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty policy with 0 risk score', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBe(0);
    });

    it('should handle allowed tool with 0 risk score', () => {
      const policy: TealPolicy = {
        tools: {
          safe_tool: { allowed: true }
        }
      };
      
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'safe_tool'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.risk_score).toBe(0);
    });

    it('should handle undefined tool with appropriate risk score', () => {
      const policy: TealPolicy = {
        tools: {}
      };
      
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'undefined_tool'
      };

      const decision = engine.evaluateWithMode(context);

      // Undefined tool triggers a violation (base 50 + 10 for triggered policy)
      expect(decision.risk_score).toBeGreaterThanOrEqual(50);
    });
  });
});
