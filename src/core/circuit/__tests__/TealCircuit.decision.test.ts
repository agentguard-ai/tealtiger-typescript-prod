/**
 * TealCircuit Decision Object Tests
 * 
 * Tests for the checkCircuit method that returns Decision objects
 * Part of Enterprise Adoption Features (P0.2: Deterministic Decision Contract)
 */

import { TealCircuit } from '../TealCircuit';
import { DecisionAction, ReasonCode, PolicyMode } from '../../engine/types';
import { ContextManager } from '../../context/ContextManager';

describe('TealCircuit - Decision Object', () => {
  describe('checkCircuit method', () => {
    it('should return ALLOW decision when circuit is closed', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();
      const decision = circuit.evaluate(context);

      expect(decision.action).toBe(DecisionAction.ALLOW);
      expect(decision.reason_codes).toContain(ReasonCode.POLICY_COMPLIANT);
      expect(decision.risk_score).toBe(0);
      expect(decision.correlation_id).toBe(context.correlation_id);
      expect(decision.mode).toBe(PolicyMode.ENFORCE);
      expect(decision.policy_id).toBe('circuit.breaker');
      expect(decision.policy_version).toBe('1.2.0');
      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.circuit).toBeDefined();
      expect(decision.reason).toContain('closed');
      expect(decision.metadata?.circuit_state).toBe('closed');
    });

    it('should return DENY decision when circuit is open', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();

      // Open the circuit by triggering failures
      const failingFn = jest.fn(async () => {
        throw new Error('Operation failed');
      });

      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      const decision = circuit.evaluate(context);

      expect(decision.action).toBe(DecisionAction.DENY);
      expect(decision.reason_codes).toContain(ReasonCode.CIRCUIT_OPEN);
      expect(decision.risk_score).toBe(100);
      expect(decision.correlation_id).toBe(context.correlation_id);
      expect(decision.reason).toContain('Circuit breaker is open');
      expect(decision.metadata?.circuit_state).toBe('open');
      expect(decision.metadata?.failures).toBe(2);
    });

    it('should return ALLOW decision with medium risk when circuit is half-open', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();

      // Open the circuit
      const failingFn = jest.fn(async () => {
        throw new Error('Operation failed');
      });

      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Execute one success to transition to half-open
      const successFn = jest.fn(async () => 'success');
      await circuit.execute(successFn);

      const decision = circuit.evaluate(context);

      expect(decision.action).toBe(DecisionAction.ALLOW);
      expect(decision.reason_codes).toContain(ReasonCode.CIRCUIT_HALF_OPEN);
      expect(decision.risk_score).toBe(50);
      expect(decision.correlation_id).toBe(context.correlation_id);
      expect(decision.reason).toContain('half-open');
      expect(decision.metadata?.circuit_state).toBe('half-open');
    });

    it('should include correlation_id from ExecutionContext', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext({
        correlation_id: 'test-correlation-123',
      });

      const decision = circuit.evaluate(context);

      expect(decision.correlation_id).toBe('test-correlation-123');
    });

    it('should include trace_id from ExecutionContext', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext({
        trace_id: 'trace-456',
      });

      const decision = circuit.evaluate(context);

      expect(decision.trace_id).toBe('trace-456');
    });

    it('should include workflow_id and run_id from ExecutionContext', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext({
        workflow_id: 'workflow-789',
        run_id: 'run-abc',
      });

      const decision = circuit.evaluate(context);

      expect(decision.workflow_id).toBe('workflow-789');
      expect(decision.run_id).toBe('run-abc');
    });

    it('should include span_id and parent_span_id from ExecutionContext', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext({
        span_id: 'span-123',
        parent_span_id: 'parent-span-456',
      });

      const decision = circuit.evaluate(context);

      expect(decision.span_id).toBe('span-123');
      expect(decision.parent_span_id).toBe('parent-span-456');
    });

    it('should accept custom policy_id', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();
      const decision = circuit.evaluate(context);

      expect(decision.policy_id).toBe('circuit.breaker');
    });

    it('should accept custom mode', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();
      const decision = circuit.evaluate(context);

      expect(decision.mode).toBe(PolicyMode.ENFORCE);
    });

    it('should include circuit metadata in decision', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 2000,
        halfOpenRequests: 3,
      });

      const context = ContextManager.createContext();

      // Trigger one failure
      const failingFn = jest.fn(async () => {
        throw new Error('Operation failed');
      });

      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      const decision = circuit.evaluate(context);

      expect(decision.metadata?.circuit_state).toBe('closed');
      expect(decision.metadata?.failures).toBe(1);
      expect(decision.metadata?.failure_threshold).toBeUndefined(); // Not exposed in metadata
      expect(decision.metadata?.timeout_ms).toBeUndefined(); // Not exposed in metadata
      expect(decision.metadata?.half_open_attempts).toBe(0);
      expect(decision.metadata?.last_failure_time).toBeDefined();
    });

    it('should include tenant_id and environment from ExecutionContext', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext({
        tenant_id: 'tenant-123',
        environment: 'production',
        application: 'my-app',
        agent_purpose: 'customer-support',
      });

      const decision = circuit.evaluate(context);

      expect(decision.metadata?.tenant_id).toBe('tenant-123');
      expect(decision.metadata?.environment).toBe('production');
      expect(decision.metadata?.application).toBe('my-app');
      expect(decision.metadata?.agent_purpose).toBe('customer-support');
    });

    it('should have component_versions with circuit version', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();
      const decision = circuit.evaluate(context);

      expect(decision.component_versions).toBeDefined();
      expect(decision.component_versions.sdk).toBeDefined();
      expect(decision.component_versions.engine).toBeDefined();
      expect(decision.component_versions.circuit).toBeDefined();
    });

    it('should return ALLOW when circuit is open but timeout has expired', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
      });

      const context = ContextManager.createContext();

      // Open the circuit
      const failingFn = jest.fn(async () => {
        throw new Error('Operation failed');
      });

      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Circuit is open
      expect(circuit.getState()).toBe('open');
      let decision = circuit.evaluate(context);
      expect(decision.action).toBe(DecisionAction.DENY);

      // Wait for timeout to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Circuit should allow operation (will transition to half-open on next execute)
      decision = circuit.evaluate(context);
      expect(decision.action).toBe(DecisionAction.ALLOW);
    });
  });
});
