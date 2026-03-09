/**
 * Unit tests for TealAudit versioned types
 * Tests AUDIT_SCHEMA_VERSION, AuditEventType, and validation functions
 */

import {
  AUDIT_SCHEMA_VERSION,
  AuditEventType,
  isValidAuditEventType,
  validateAuditEvent,
  createAuditEvent,
  type AuditEvent,
  type SafeContent,
  type AuditComponentVersions,
  type CostMetadata
} from '../types';
import { PolicyMode, DecisionAction, ReasonCode } from '../../engine/types';

describe('TealAudit Types', () => {
  describe('AUDIT_SCHEMA_VERSION', () => {
    it('should be version 1.0.0', () => {
      expect(AUDIT_SCHEMA_VERSION).toBe('1.0.0');
    });

    it('should be a string', () => {
      expect(typeof AUDIT_SCHEMA_VERSION).toBe('string');
    });
  });

  describe('AuditEventType', () => {
    it('should have all required event types', () => {
      expect(AuditEventType.POLICY_EVALUATION).toBe('policy.evaluation');
      expect(AuditEventType.GUARDRAIL_CHECK).toBe('guardrail.check');
      expect(AuditEventType.LLM_REQUEST).toBe('llm.request');
      expect(AuditEventType.LLM_RESPONSE).toBe('llm.response');
      expect(AuditEventType.TOOL_EXECUTION).toBe('tool.execution');
      expect(AuditEventType.CIRCUIT_STATE_CHANGE).toBe('circuit.state_change');
      expect(AuditEventType.ANOMALY_DETECTED).toBe('anomaly.detected');
      expect(AuditEventType.COST_THRESHOLD_EXCEEDED).toBe('cost.threshold_exceeded');
      expect(AuditEventType.COST_EVALUATION).toBe('cost.evaluation');
      expect(AuditEventType.COST_BUDGET_EXCEEDED).toBe('cost.budget_exceeded');
    });

    it('should have exactly 10 event types', () => {
      const eventTypes = Object.values(AuditEventType);
      expect(eventTypes.length).toBe(10);
    });
  });

  describe('isValidAuditEventType', () => {
    it('should return true for valid event types', () => {
      expect(isValidAuditEventType(AuditEventType.POLICY_EVALUATION)).toBe(true);
      expect(isValidAuditEventType(AuditEventType.GUARDRAIL_CHECK)).toBe(true);
      expect(isValidAuditEventType(AuditEventType.LLM_REQUEST)).toBe(true);
      expect(isValidAuditEventType(AuditEventType.COST_EVALUATION)).toBe(true);
    });

    it('should return false for invalid event types', () => {
      expect(isValidAuditEventType('invalid.type')).toBe(false);
      expect(isValidAuditEventType('')).toBe(false);
      expect(isValidAuditEventType(null)).toBe(false);
      expect(isValidAuditEventType(undefined)).toBe(false);
      expect(isValidAuditEventType(123)).toBe(false);
    });
  });

  describe('validateAuditEvent', () => {
    const validEvent: AuditEvent = {
      schema_version: '1.0.0',
      event_type: AuditEventType.POLICY_EVALUATION,
      timestamp: new Date().toISOString(),
      correlation_id: 'test-correlation-id'
    };

    it('should validate a complete valid event', () => {
      expect(() => validateAuditEvent(validEvent)).not.toThrow();
    });

    it('should throw if event is null or undefined', () => {
      expect(() => validateAuditEvent(null as any)).toThrow('AuditEvent is required');
      expect(() => validateAuditEvent(undefined as any)).toThrow('AuditEvent is required');
    });

    it('should throw if schema_version is missing', () => {
      const event = { ...validEvent, schema_version: '' };
      expect(() => validateAuditEvent(event)).toThrow('must have a valid schema_version');
    });

    it('should throw if event_type is invalid', () => {
      const event = { ...validEvent, event_type: 'invalid.type' as any };
      expect(() => validateAuditEvent(event)).toThrow('Invalid audit event type');
    });

    it('should throw if timestamp is missing', () => {
      const event = { ...validEvent, timestamp: '' };
      expect(() => validateAuditEvent(event)).toThrow('must have a valid ISO 8601 timestamp');
    });

    it('should throw if timestamp is not ISO 8601 format', () => {
      const event = { ...validEvent, timestamp: 'not-a-timestamp' };
      expect(() => validateAuditEvent(event)).toThrow('Invalid ISO 8601 timestamp format');
    });

    it('should throw if correlation_id is missing', () => {
      const event = { ...validEvent, correlation_id: '' };
      expect(() => validateAuditEvent(event)).toThrow('must have a non-empty correlation_id');
    });

    it('should accept valid ISO 8601 timestamps', () => {
      const timestamps = [
        '2026-02-19T12:34:56Z',
        '2026-02-19T12:34:56.123Z',
        '2026-02-19T12:34:56'
      ];

      timestamps.forEach(timestamp => {
        const event = { ...validEvent, timestamp };
        expect(() => validateAuditEvent(event)).not.toThrow();
      });
    });
  });

  describe('createAuditEvent', () => {
    it('should create a valid audit event with required fields', () => {
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'test-correlation-id'
      );

      expect(event.schema_version).toBe(AUDIT_SCHEMA_VERSION);
      expect(event.event_type).toBe(AuditEventType.POLICY_EVALUATION);
      expect(event.correlation_id).toBe('test-correlation-id');
      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe('string');
    });

    it('should create event with optional fields', () => {
      const event = createAuditEvent(
        AuditEventType.GUARDRAIL_CHECK,
        'test-correlation-id',
        {
          trace_id: 'test-trace-id',
          policy_id: 'test-policy',
          policy_version: '1.0.0',
          mode: PolicyMode.ENFORCE,
          action: DecisionAction.DENY,
          reason_codes: [ReasonCode.PII_DETECTED],
          risk_score: 85,
          agent_id: 'agent-001',
          provider: 'openai',
          model: 'gpt-4'
        }
      );

      expect(event.trace_id).toBe('test-trace-id');
      expect(event.policy_id).toBe('test-policy');
      expect(event.policy_version).toBe('1.0.0');
      expect(event.mode).toBe(PolicyMode.ENFORCE);
      expect(event.action).toBe(DecisionAction.DENY);
      expect(event.reason_codes).toEqual([ReasonCode.PII_DETECTED]);
      expect(event.risk_score).toBe(85);
      expect(event.agent_id).toBe('agent-001');
      expect(event.provider).toBe('openai');
      expect(event.model).toBe('gpt-4');
    });

    it('should create event with safe_inputs and safe_outputs', () => {
      const safeInputs: SafeContent = {
        hash: 'sha256:abc123',
        size: 1024,
        category: 'prompt'
      };

      const safeOutputs: SafeContent = {
        hash: 'sha256:def456',
        size: 2048,
        category: 'response'
      };

      const event = createAuditEvent(
        AuditEventType.LLM_REQUEST,
        'test-correlation-id',
        {
          safe_inputs: safeInputs,
          safe_outputs: safeOutputs
        }
      );

      expect(event.safe_inputs).toEqual(safeInputs);
      expect(event.safe_outputs).toEqual(safeOutputs);
    });

    it('should create event with component versions', () => {
      const componentVersions: AuditComponentVersions = {
        sdk: '1.1.0',
        engine: '1.1.0',
        guard: '1.1.0',
        circuit: '1.1.0',
        monitor: '1.1.0'
      };

      const event = createAuditEvent(
        AuditEventType.CIRCUIT_STATE_CHANGE,
        'test-correlation-id',
        {
          component_versions: componentVersions
        }
      );

      expect(event.component_versions).toEqual(componentVersions);
    });

    it('should create event with cost metadata', () => {
      const costMetadata: CostMetadata = {
        estimated: 0.05,
        actual: 0.048,
        currency: 'USD',
        budget_scope: 'session',
        budget_window: 'per_session',
        budget_limit: 1.0,
        budget_remaining: 0.952,
        risk_score: 25,
        model: 'gpt-4',
        model_tier: 'premium'
      };

      const event = createAuditEvent(
        AuditEventType.COST_EVALUATION,
        'test-correlation-id',
        {
          metadata: {
            cost: costMetadata
          }
        }
      );

      expect(event.metadata?.cost).toEqual(costMetadata);
    });

    it('should create event with execution identity fields', () => {
      const event = createAuditEvent(
        AuditEventType.TOOL_EXECUTION,
        'test-correlation-id',
        {
          workflow_id: 'customer_support.ticket_resolution:v3',
          run_id: 'run-12345',
          span_id: 'span-67890',
          parent_span_id: 'span-54321'
        }
      );

      expect(event.workflow_id).toBe('customer_support.ticket_resolution:v3');
      expect(event.run_id).toBe('run-12345');
      expect(event.span_id).toBe('span-67890');
      expect(event.parent_span_id).toBe('span-54321');
    });

    it('should create event with error field', () => {
      const event = createAuditEvent(
        AuditEventType.ANOMALY_DETECTED,
        'test-correlation-id',
        {
          error: 'Anomaly detection threshold exceeded'
        }
      );

      expect(event.error).toBe('Anomaly detection threshold exceeded');
    });

    it('should create event with duration field', () => {
      const event = createAuditEvent(
        AuditEventType.LLM_RESPONSE,
        'test-correlation-id',
        {
          duration: 1250
        }
      );

      expect(event.duration).toBe(1250);
    });

    it('should validate created event automatically', () => {
      // Should throw if invalid event type is provided
      expect(() => {
        createAuditEvent(
          'invalid.type' as any,
          'test-correlation-id'
        );
      }).toThrow('Invalid audit event type');
    });

    it('should generate valid ISO 8601 timestamp', () => {
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'test-correlation-id'
      );

      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      expect(timestampRegex.test(event.timestamp)).toBe(true);
    });
  });

  describe('SafeContent interface', () => {
    it('should support hash-only redaction', () => {
      const safeContent: SafeContent = {
        hash: 'sha256:abc123'
      };

      expect(safeContent.hash).toBe('sha256:abc123');
      expect(safeContent.size).toBeUndefined();
      expect(safeContent.category).toBeUndefined();
    });

    it('should support size-only redaction', () => {
      const safeContent: SafeContent = {
        size: 1024
      };

      expect(safeContent.size).toBe(1024);
      expect(safeContent.hash).toBeUndefined();
      expect(safeContent.category).toBeUndefined();
    });

    it('should support category-only redaction', () => {
      const safeContent: SafeContent = {
        category: 'prompt'
      };

      expect(safeContent.category).toBe('prompt');
      expect(safeContent.hash).toBeUndefined();
      expect(safeContent.size).toBeUndefined();
    });

    it('should support combined metadata', () => {
      const safeContent: SafeContent = {
        hash: 'sha256:abc123',
        size: 1024,
        category: 'prompt'
      };

      expect(safeContent.hash).toBe('sha256:abc123');
      expect(safeContent.size).toBe(1024);
      expect(safeContent.category).toBe('prompt');
    });
  });

  describe('CostMetadata interface', () => {
    it('should support estimated cost only', () => {
      const costMetadata: CostMetadata = {
        estimated: 0.05,
        currency: 'USD'
      };

      expect(costMetadata.estimated).toBe(0.05);
      expect(costMetadata.actual).toBeUndefined();
    });

    it('should support actual cost only', () => {
      const costMetadata: CostMetadata = {
        actual: 0.048,
        currency: 'USD'
      };

      expect(costMetadata.actual).toBe(0.048);
      expect(costMetadata.estimated).toBeUndefined();
    });

    it('should support both estimated and actual costs', () => {
      const costMetadata: CostMetadata = {
        estimated: 0.05,
        actual: 0.048,
        currency: 'USD'
      };

      expect(costMetadata.estimated).toBe(0.05);
      expect(costMetadata.actual).toBe(0.048);
    });

    it('should support budget tracking fields', () => {
      const costMetadata: CostMetadata = {
        estimated: 0.05,
        budget_scope: 'session',
        budget_window: 'per_session',
        budget_limit: 1.0,
        budget_remaining: 0.95
      };

      expect(costMetadata.budget_scope).toBe('session');
      expect(costMetadata.budget_window).toBe('per_session');
      expect(costMetadata.budget_limit).toBe(1.0);
      expect(costMetadata.budget_remaining).toBe(0.95);
    });

    it('should support model tier information', () => {
      const costMetadata: CostMetadata = {
        estimated: 0.05,
        model: 'gpt-4',
        model_tier: 'premium'
      };

      expect(costMetadata.model).toBe('gpt-4');
      expect(costMetadata.model_tier).toBe('premium');
    });

    it('should support cost risk score', () => {
      const costMetadata: CostMetadata = {
        estimated: 0.05,
        risk_score: 75
      };

      expect(costMetadata.risk_score).toBe(75);
    });
  });

  describe('AuditComponentVersions interface', () => {
    it('should support all component versions', () => {
      const versions: AuditComponentVersions = {
        sdk: '1.1.0',
        engine: '1.1.0',
        guard: '1.1.0',
        circuit: '1.1.0',
        monitor: '1.1.0'
      };

      expect(versions.sdk).toBe('1.1.0');
      expect(versions.engine).toBe('1.1.0');
      expect(versions.guard).toBe('1.1.0');
      expect(versions.circuit).toBe('1.1.0');
      expect(versions.monitor).toBe('1.1.0');
    });

    it('should support partial component versions', () => {
      const versions: AuditComponentVersions = {
        sdk: '1.1.0',
        engine: '1.1.0'
      };

      expect(versions.sdk).toBe('1.1.0');
      expect(versions.engine).toBe('1.1.0');
      expect(versions.guard).toBeUndefined();
      expect(versions.circuit).toBeUndefined();
      expect(versions.monitor).toBeUndefined();
    });
  });

  describe('Backwards compatibility', () => {
    it('should support deprecated cost field at top level', () => {
      const event = createAuditEvent(
        AuditEventType.LLM_REQUEST,
        'test-correlation-id',
        {
          cost: 0.05
        }
      );

      expect(event.cost).toBe(0.05);
    });

    it('should support both deprecated cost and new metadata.cost', () => {
      const event = createAuditEvent(
        AuditEventType.COST_EVALUATION,
        'test-correlation-id',
        {
          cost: 0.05,
          metadata: {
            cost: {
              estimated: 0.05,
              actual: 0.048,
              currency: 'USD'
            }
          }
        }
      );

      expect(event.cost).toBe(0.05);
      expect(event.metadata?.cost?.estimated).toBe(0.05);
      expect(event.metadata?.cost?.actual).toBe(0.048);
    });
  });
});
