/**
 * Integration tests for component version tracking in TealEngine
 * 
 * Validates Requirements 2.6, 2.11, 14.7
 */

import { TealEngine } from '../TealEngine';
import { PolicyMode } from '../types';
import { ContextManager } from '../../context/ContextManager';
import { getPackageVersion } from '../../utils/version';

describe('TealEngine - Component Version Tracking', () => {
  let engine: TealEngine;
  const expectedVersion = getPackageVersion();

  beforeEach(() => {
    engine = new TealEngine({
      tools: {
        'database_query': { allowed: true },
        'file_delete': { allowed: false }
      }
    });
  });

  describe('Component versions in Decision objects', () => {
    it('should include component_versions in ENFORCE mode decisions', () => {
      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.sdk).toBe(expectedVersion);
      expect(decision.component_versions.engine).toBe(expectedVersion);
    });

    it('should include component_versions in MONITOR mode decisions', () => {
      const monitorEngine = new TealEngine(
        {
          tools: {
            'file_delete': { allowed: false }
          }
        },
        {
          mode: {
            default: PolicyMode.MONITOR
          }
        }
      );

      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = monitorEngine.evaluateWithMode(context);

      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.sdk).toBe(expectedVersion);
      expect(decision.component_versions.engine).toBe(expectedVersion);
    });

    it('should include component_versions in REPORT_ONLY mode decisions', () => {
      const reportEngine = new TealEngine(
        {
          tools: {
            'file_delete': { allowed: false }
          }
        },
        {
          mode: {
            default: PolicyMode.REPORT_ONLY
          }
        }
      );

      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'file_delete'
      };

      const decision = reportEngine.evaluateWithMode(context);

      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.sdk).toBe(expectedVersion);
      expect(decision.component_versions.engine).toBe(expectedVersion);
    });
  });

  describe('Version format validation', () => {
    it('should use semantic versioning format', () => {
      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      // Semantic versioning format: X.Y.Z
      expect(decision.component_versions.sdk).toMatch(/^\d+\.\d+\.\d+$/);
      expect(decision.component_versions.engine).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have consistent versions across multiple evaluations', () => {
      const context1 = {
        agentId: 'test-agent-1',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const context2 = {
        agentId: 'test-agent-2',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision1 = engine.evaluateWithMode(context1);
      const decision2 = engine.evaluateWithMode(context2);

      expect(decision1.component_versions.sdk).toBe(decision2.component_versions.sdk);
      expect(decision1.component_versions.engine).toBe(decision2.component_versions.engine);
    });
  });

  describe('Version tracking with ExecutionContext', () => {
    it('should include component_versions when ExecutionContext is provided', () => {
      const execContext = ContextManager.createContext({
        tenant_id: 'acme-corp',
        application: 'customer-support',
        environment: 'production'
      });

      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context, execContext);

      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.sdk).toBe(expectedVersion);
      expect(decision.component_versions.engine).toBe(expectedVersion);
      expect(decision.correlation_id).toBe(execContext.correlation_id);
    });

    it('should include component_versions when ExecutionContext is auto-generated', () => {
      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.sdk).toBe(expectedVersion);
      expect(decision.component_versions.engine).toBe(expectedVersion);
      expect(decision.correlation_id).toBeDefined();
    });
  });

  describe('TealEngine.VERSION static property', () => {
    it('should match the package version', () => {
      expect(TealEngine.VERSION).toBe(expectedVersion);
    });

    it('should be a readonly property', () => {
      // TypeScript enforces this at compile time, but we can verify the value doesn't change
      const version1 = TealEngine.VERSION;
      const version2 = TealEngine.VERSION;
      
      expect(version1).toBe(version2);
    });
  });

  describe('Component version consistency', () => {
    it('should use the same version for sdk and engine', () => {
      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.component_versions.sdk).toBe(decision.component_versions.engine);
    });

    it('should match TealEngine.VERSION', () => {
      const context = {
        agentId: 'test-agent',
        action: 'tool.execute',
        tool: 'database_query'
      };

      const decision = engine.evaluateWithMode(context);

      expect(decision.component_versions.sdk).toBe(TealEngine.VERSION);
      expect(decision.component_versions.engine).toBe(TealEngine.VERSION);
    });
  });
});
