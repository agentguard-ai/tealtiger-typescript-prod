/**
 * Unit Tests for TealEngine.evaluateWithMode()
 * 
 * Tests cover:
 * - Decision object construction
 * - Mode-specific behavior (ENFORCE, MONITOR, REPORT_ONLY)
 * - Correlation ID propagation
 * - Risk score calculation
 * - Reason code determination
 * 
 * Part of Enterprise Adoption Features v1.1.x - Task 2.1
 */

import { TealEngine } from '../TealEngine';
import { 
  TealPolicy, 
  RequestContext, 
  PolicyMode, 
  DecisionAction, 
  ReasonCode 
} from '../types';
import { ContextManager } from '../../context/ContextManager';

describe('TealEngine.evaluateWithMode()', () => {
  describe('REPORT_ONLY Mode', () => {
    it('should always return ALLOW action without evaluating policies', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: {
          default: PolicyMode.REPORT_ONLY
        }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.action).toBe(DecisionAction.ALLOW);
      expect(decision.mode).toBe(PolicyMode.REPORT_ONLY);
      expect(decision.reason_codes).toContain(ReasonCode.REPORT_ONLY_MODE);
      expect(decision.risk_score).toBe(0);
      expect(decision.metadata?.evaluation_performed).toBe(false);
    });

    it('should include correlation_id in decision', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.REPORT_ONLY }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.correlation_id).toBeDefined();
      expect(decision.correlation_id.length).toBeGreaterThan(0);
    });

    it('should preserve provided execution context', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.REPORT_ONLY }
      });

      const execContext = ContextManager.createContext({
        tenant_id: 'tenant-123',
        application: 'test-app',
        environment: 'production'
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context, execContext);

      expect(decision.correlation_id).toBe(execContext.correlation_id);
      expect(decision.trace_id).toBe(execContext.trace_id);
      expect(decision.metadata?.tenant_id).toBe('tenant-123');
      expect(decision.metadata?.application).toBe('test-app');
      expect(decision.metadata?.environment).toBe('production');
    });
  });

  describe('MONITOR Mode', () => {
    it('should return ALLOW action for compliant requests', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.MONITOR }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.action).toBe(DecisionAction.ALLOW);
      expect(decision.mode).toBe(PolicyMode.MONITOR);
      expect(decision.reason_codes).toContain(ReasonCode.POLICY_COMPLIANT);
      expect(decision.risk_score).toBe(0);
      expect(decision.metadata?.evaluation_performed).toBe(true);
    });

    it('should return ALLOW action for violations but log them', () => {
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

      expect(decision.action).toBe(DecisionAction.ALLOW);
      expect(decision.mode).toBe(PolicyMode.MONITOR);
      expect(decision.reason_codes).toContain(ReasonCode.MONITOR_MODE_VIOLATION);
      expect(decision.risk_score).toBeGreaterThan(0);
      expect(decision.metadata?.evaluation_performed).toBe(true);
      expect(decision.reason).toContain('MONITOR mode');
    });

    it('should calculate risk score for violations', () => {
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

      expect(decision.risk_score).toBeGreaterThanOrEqual(0);
      expect(decision.risk_score).toBeLessThanOrEqual(100);
      expect(decision.risk_score).toBeGreaterThan(50); // High risk for file_delete
    });
  });

  describe('ENFORCE Mode', () => {
    it('should return ALLOW action for compliant requests', () => {
      const policy: TealPolicy = {
        tools: {
          database_query: { allowed: true }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: { default: PolicyMode.ENFORCE }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.action).toBe(DecisionAction.ALLOW);
      expect(decision.mode).toBe(PolicyMode.ENFORCE);
      expect(decision.reason_codes).toContain(ReasonCode.POLICY_COMPLIANT);
      expect(decision.risk_score).toBe(0);
    });

    it('should return DENY action for violations', () => {
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

      expect(decision.action).toBe(DecisionAction.DENY);
      expect(decision.mode).toBe(PolicyMode.ENFORCE);
      expect(decision.reason_codes).toContain(ReasonCode.POLICY_VIOLATION);
      expect(decision.risk_score).toBeGreaterThan(0);
    });

    it('should include appropriate reason codes for tool violations', () => {
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

      expect(decision.reason_codes).toContain(ReasonCode.TOOL_NOT_ALLOWED);
    });
  });

  describe('Decision Object Structure', () => {
    it('should include all required Decision fields', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context);

      // Required fields
      expect(decision.action).toBeDefined();
      expect(decision.reason_codes).toBeDefined();
      expect(Array.isArray(decision.reason_codes)).toBe(true);
      expect(decision.reason_codes.length).toBeGreaterThan(0);
      expect(decision.risk_score).toBeDefined();
      expect(decision.mode).toBeDefined();
      expect(decision.policy_id).toBeDefined();
      expect(decision.policy_version).toBeDefined();
      expect(decision.component_versions).toBeDefined();
      expect(decision.correlation_id).toBeDefined();
      expect(decision.reason).toBeDefined();
    });

    it('should include component versions', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.component_versions.sdk).toBe('1.1.0');
      expect(decision.component_versions.engine).toBe('1.1.0');
    });

    it('should include evaluation metadata', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.metadata).toBeDefined();
      expect(decision.metadata?.evaluation_time_ms).toBeDefined();
      expect(decision.metadata?.cache_hit).toBe(false);
      expect(decision.metadata?.triggered_policies).toBeDefined();
    });

    it('should propagate workflow and run IDs', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const execContext = ContextManager.createContext({
        workflow_id: 'workflow-123',
        run_id: 'run-456',
        span_id: 'span-789'
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context, execContext);

      expect(decision.workflow_id).toBe('workflow-123');
      expect(decision.run_id).toBe('run-456');
      expect(decision.span_id).toBe('span-789');
    });
  });

  describe('Mode Resolution', () => {
    it('should use policy-specific mode override', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: {
          default: PolicyMode.ENFORCE,
          policy: {
            'tools.file_delete': PolicyMode.MONITOR
          }
        }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.mode).toBe(PolicyMode.MONITOR);
      expect(decision.action).toBe(DecisionAction.ALLOW); // MONITOR allows violations
    });

    it('should use environment-specific mode override', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: {
          default: PolicyMode.ENFORCE,
          environment: {
            'staging': PolicyMode.MONITOR
          }
        }
      });

      const execContext = ContextManager.createContext({
        environment: 'staging'
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context, execContext);

      expect(decision.mode).toBe(PolicyMode.MONITOR);
      expect(decision.action).toBe(DecisionAction.ALLOW);
    });

    it('should use default mode when no overrides match', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false }
        }
      };
      
      const engine = new TealEngine(policy, {
        mode: {
          default: PolicyMode.ENFORCE
        }
      });

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.mode).toBe(PolicyMode.ENFORCE);
      expect(decision.action).toBe(DecisionAction.DENY);
    });
  });

  describe('Risk Score Calculation', () => {
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

    it('should calculate higher risk for dangerous operations', () => {
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

      expect(decision.risk_score).toBeGreaterThan(50);
    });

    it('should keep risk score within 0-100 range', () => {
      const policy: TealPolicy = {
        tools: {
          file_delete: { allowed: false },
          database_delete: { allowed: false }
        },
        codeExecution: {
          allowedLanguages: [],
          blockedFunctions: ['eval'],
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
  });

  describe('Backwards Compatibility', () => {
    it('should work without mode configuration (defaults to ENFORCE)', () => {
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

      expect(decision.mode).toBe(PolicyMode.ENFORCE);
      expect(decision.action).toBe(DecisionAction.ALLOW);
    });

    it('should work without execution context (auto-generates correlation_id)', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const context: RequestContext = {
        agentId: 'agent-001',
        action: 'test'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.correlation_id).toBeDefined();
      expect(decision.correlation_id.length).toBeGreaterThan(0);
    });
  });

  describe('getModeConfig()', () => {
    it('should return current mode configuration', () => {
      const modeConfig = {
        default: PolicyMode.MONITOR,
        policy: {
          'tools.file_delete': PolicyMode.ENFORCE
        }
      };

      const policy: TealPolicy = {};
      const engine = new TealEngine(policy, { mode: modeConfig });

      const config = engine.getModeConfig();

      expect(config.default).toBe(PolicyMode.MONITOR);
      expect(config.policy).toBeDefined();
      expect(config.policy!['tools.file_delete']).toBe(PolicyMode.ENFORCE);
    });

    it('should return frozen object', () => {
      const policy: TealPolicy = {};
      const engine = new TealEngine(policy);

      const config = engine.getModeConfig();

      expect(Object.isFrozen(config)).toBe(true);
    });
  });
});
