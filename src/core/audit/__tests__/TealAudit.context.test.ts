/**
 * TealAudit Context Propagation Tests
 * 
 * Tests for Task 3.5: Implement context propagation in TealAudit
 * 
 * Requirements tested:
 * - 3.8: TealAudit SHALL accept ExecutionContext for every log operation
 * - 3.9: TealAudit SHALL include correlation_id in all audit events
 * - 3.10: TealAudit SHALL propagate ExecutionContext through all internal components
 * - 7.4: Context propagation SHALL preserve all non-null fields from input ExecutionContext
 * - 7.5: Context propagation SHALL complete in less than 0.5 milliseconds
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TealAudit } from '../TealAudit';
import { AuditEventType, AUDIT_SCHEMA_VERSION, AuditEvent as VersionedAuditEvent } from '../types';
import { DecisionAction } from '../../engine/types';
import { ContextManager } from '../../context/ContextManager';

describe('TealAudit - Context Propagation (Task 3.5)', () => {
  let audit: TealAudit;
  let capturedEvents: any[] = [];

  beforeEach(() => {
    capturedEvents = [];
    audit = new TealAudit({
      outputs: [{
        write: (event: any) => {
          capturedEvents.push(event);
        }
      }],
      enableStorage: true
    });
  });

  describe('Requirement 3.8: Accept ExecutionContext for log operations', () => {
    it('should accept ExecutionContext as optional second parameter', () => {
      const context = ContextManager.createContext({
        tenant_id: 'test-tenant',
        environment: 'test'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-correlation-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      // Should not throw
      expect(() => {
        audit.log(event, context);
      }).not.toThrow();

      expect(capturedEvents).toHaveLength(1);
    });

    it('should work without ExecutionContext (backwards compatibility)', () => {
      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-correlation-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      // Should not throw
      expect(() => {
        audit.log(event);
      }).not.toThrow();

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].correlation_id).toBe('test-correlation-id');
    });
  });

  describe('Requirement 3.9: Include correlation_id in all audit events', () => {
    it('should include correlation_id from ExecutionContext', () => {
      const context = ContextManager.createContext({
        correlation_id: 'ctx-correlation-123'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'original-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].correlation_id).toBe('ctx-correlation-123');
    });

    it('should preserve original correlation_id if no context provided', () => {
      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'original-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].correlation_id).toBe('original-id');
    });

    it('should include auto-generated correlation_id from context', () => {
      const context = ContextManager.createContext(); // Auto-generates correlation_id

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].correlation_id).toBe(context.correlation_id);
      expect(capturedEvents[0].correlation_id).not.toBe('temp-id');
    });
  });

  describe('Requirement 3.10: Propagate ExecutionContext fields', () => {
    it('should propagate trace_id from ExecutionContext', () => {
      const context = ContextManager.createContext({
        trace_id: 'trace-abc-123'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].trace_id).toBe('trace-abc-123');
    });

    it('should propagate workflow_id from ExecutionContext', () => {
      const context = ContextManager.createContext({
        workflow_id: 'workflow-xyz'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].workflow_id).toBe('workflow-xyz');
    });

    it('should propagate run_id from ExecutionContext', () => {
      const context = ContextManager.createContext({
        run_id: 'run-456'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].run_id).toBe('run-456');
    });

    it('should propagate span_id from ExecutionContext', () => {
      const context = ContextManager.createContext({
        span_id: 'span-789'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].span_id).toBe('span-789');
    });

    it('should propagate parent_span_id from ExecutionContext', () => {
      const context = ContextManager.createContext({
        parent_span_id: 'parent-span-abc'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].parent_span_id).toBe('parent-span-abc');
    });

    it('should propagate tenant_id to metadata', () => {
      const context = ContextManager.createContext({
        tenant_id: 'tenant-acme'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].metadata).toBeDefined();
      expect(capturedEvents[0].metadata.tenant_id).toBe('tenant-acme');
    });

    it('should propagate environment to metadata', () => {
      const context = ContextManager.createContext({
        environment: 'production'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].metadata).toBeDefined();
      expect(capturedEvents[0].metadata.environment).toBe('production');
    });

    it('should propagate application to metadata', () => {
      const context = ContextManager.createContext({
        application: 'customer-support'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].metadata).toBeDefined();
      expect(capturedEvents[0].metadata.application).toBe('customer-support');
    });

    it('should propagate all context fields together', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123',
        trace_id: 'trace-456',
        workflow_id: 'workflow-789',
        run_id: 'run-abc',
        span_id: 'span-def',
        parent_span_id: 'parent-ghi',
        tenant_id: 'tenant-xyz',
        environment: 'staging',
        application: 'api-gateway'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      const logged = capturedEvents[0];
      
      expect(logged.correlation_id).toBe('corr-123');
      expect(logged.trace_id).toBe('trace-456');
      expect(logged.workflow_id).toBe('workflow-789');
      expect(logged.run_id).toBe('run-abc');
      expect(logged.span_id).toBe('span-def');
      expect(logged.parent_span_id).toBe('parent-ghi');
      expect(logged.metadata.tenant_id).toBe('tenant-xyz');
      expect(logged.metadata.environment).toBe('staging');
      expect(logged.metadata.application).toBe('api-gateway');
    });
  });

  describe('Requirement 7.4: Preserve all non-null fields from ExecutionContext', () => {
    it('should not add undefined fields to audit event', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123'
        // No other fields
      });

      const event: VersionedAuditEvent = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      const logged = capturedEvents[0] as VersionedAuditEvent;
      
      expect(logged.correlation_id).toBe('corr-123');
      expect(logged.trace_id).toBeUndefined();
      expect(logged.workflow_id).toBeUndefined();
      expect(logged.run_id).toBeUndefined();
      expect(logged.span_id).toBeUndefined();
      expect(logged.parent_span_id).toBeUndefined();
    });

    it('should preserve existing event metadata when adding context fields', () => {
      const context = ContextManager.createContext({
        tenant_id: 'tenant-123',
        environment: 'prod'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'test-id',
        action: DecisionAction.ALLOW,
        risk_score: 10,
        metadata: {
          custom_field: 'custom_value',
          another_field: 42
        }
      };

      audit.log(event, context);

      expect(capturedEvents).toHaveLength(1);
      const logged = capturedEvents[0];
      
      expect(logged.metadata.tenant_id).toBe('tenant-123');
      expect(logged.metadata.environment).toBe('prod');
      expect(logged.metadata.custom_field).toBe('custom_value');
      expect(logged.metadata.another_field).toBe(42);
    });
  });

  describe('Requirement 7.5: Context propagation performance', () => {
    it('should complete context propagation in less than 0.5ms', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123',
        trace_id: 'trace-456',
        workflow_id: 'workflow-789',
        run_id: 'run-abc',
        span_id: 'span-def',
        parent_span_id: 'parent-ghi',
        tenant_id: 'tenant-xyz',
        environment: 'staging',
        application: 'api-gateway'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      const start = performance.now();
      audit.log(event, context);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(0.5); // Less than 0.5 milliseconds
      expect(capturedEvents).toHaveLength(1);
    });

    it('should handle multiple rapid context propagations efficiently', () => {
      const contexts = Array.from({ length: 100 }, (_, i) => 
        ContextManager.createContext({
          correlation_id: `corr-${i}`,
          trace_id: `trace-${i}`,
          tenant_id: `tenant-${i}`
        })
      );

      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        const event = {
          schema_version: AUDIT_SCHEMA_VERSION,
          event_type: AuditEventType.POLICY_EVALUATION,
          timestamp: new Date().toISOString(),
          correlation_id: 'temp-id',
          action: DecisionAction.ALLOW,
          risk_score: 10
        };
        
        audit.log(event, contexts[i]);
      }
      
      const duration = performance.now() - start;
      const avgDuration = duration / 100;

      expect(avgDuration).toBeLessThan(0.5); // Average less than 0.5ms per operation
      expect(capturedEvents).toHaveLength(100);
    });
  });

  describe('propagateContext() helper method', () => {
    it('should provide propagateContext() utility method', () => {
      expect(audit.propagateContext).toBeDefined();
      expect(typeof audit.propagateContext).toBe('function');
    });

    it('should enrich event with context fields using propagateContext()', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123',
        trace_id: 'trace-456',
        tenant_id: 'tenant-xyz'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      const enriched = audit.propagateContext(event, context);

      expect(enriched.correlation_id).toBe('corr-123');
      expect(enriched.trace_id).toBe('trace-456');
      expect(enriched.metadata?.tenant_id).toBe('tenant-xyz');
    });

    it('should not mutate original event when using propagateContext()', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123',
        trace_id: 'trace-456'
      });

      const event: VersionedAuditEvent = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'original-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      const enriched = audit.propagateContext(event, context);

      expect(event.correlation_id).toBe('original-id');
      expect(event.trace_id).toBeUndefined();
      expect(enriched.correlation_id).toBe('corr-123');
      expect(enriched.trace_id).toBe('trace-456');
    });

    it('should complete propagateContext() in less than 0.5ms', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123',
        trace_id: 'trace-456',
        workflow_id: 'workflow-789',
        tenant_id: 'tenant-xyz'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      const start = performance.now();
      const enriched = audit.propagateContext(event, context);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(0.5);
      expect(enriched.correlation_id).toBe('corr-123');
    });
  });

  describe('Query by correlation_id (Requirement 3.12)', () => {
    it('should support querying audit events by correlation_id', () => {
      const context1 = ContextManager.createContext({
        correlation_id: 'corr-aaa'
      });
      const context2 = ContextManager.createContext({
        correlation_id: 'corr-bbb'
      });

      const event1 = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      const event2 = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.GUARDRAIL_CHECK,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.DENY,
        risk_score: 80
      };

      audit.log(event1, context1);
      audit.log(event2, context2);
      audit.log(event1, context1); // Log another event with corr-aaa

      const results = audit.query({ correlation_id: 'corr-aaa' });

      expect(results).toHaveLength(2);
      const result0 = results[0] as VersionedAuditEvent;
      const result1 = results[1] as VersionedAuditEvent;
      expect(result0.correlation_id).toBe('corr-aaa');
      expect(result1.correlation_id).toBe('corr-aaa');
    });

    it('should return empty array when no events match correlation_id', () => {
      const context = ContextManager.createContext({
        correlation_id: 'corr-123'
      });

      const event = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      audit.log(event, context);

      const results = audit.query({ correlation_id: 'non-existent' });

      expect(results).toHaveLength(0);
    });
  });

  describe('Integration with nested operations', () => {
    it('should support nested span tracking', () => {
      // Parent operation
      const parentContext = ContextManager.createContext({
        correlation_id: 'corr-123',
        span_id: 'span-parent'
      });

      // Child operation
      const childContext = ContextManager.propagate(parentContext);

      const parentEvent = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.POLICY_EVALUATION,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 10
      };

      const childEvent = {
        schema_version: AUDIT_SCHEMA_VERSION,
        event_type: AuditEventType.GUARDRAIL_CHECK,
        timestamp: new Date().toISOString(),
        correlation_id: 'temp-id',
        action: DecisionAction.ALLOW,
        risk_score: 5
      };

      audit.log(parentEvent, parentContext);
      audit.log(childEvent, childContext);

      expect(capturedEvents).toHaveLength(2);
      
      // Parent event
      expect(capturedEvents[0].correlation_id).toBe('corr-123');
      expect(capturedEvents[0].span_id).toBe('span-parent');
      expect(capturedEvents[0].parent_span_id).toBeUndefined();
      
      // Child event
      expect(capturedEvents[1].correlation_id).toBe('corr-123'); // Same correlation_id
      expect(capturedEvents[1].span_id).toBe(childContext.span_id); // New span_id
      expect(capturedEvents[1].parent_span_id).toBe('span-parent'); // Links to parent
    });
  });
});
