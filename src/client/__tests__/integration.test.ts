/**
 * Integration Tests for TealTiger Client Components
 * 
 * Tests the integration of all components (TealEngine, TealGuard, TealMonitor, TealCircuit, TealAudit)
 * with the client classes.
 */

import { TealOpenAI, TealAnthropic } from '../';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealMonitor } from '../../core/monitor/TealMonitor';
import { TealCircuit } from '../../core/circuit/TealCircuit';
import { TealAudit } from '../../core/audit/TealAudit';
import { PolicyViolationError } from '../base';

describe('TealOpenAI Integration', () => {
  describe('with TealEngine', () => {
    it('should allow requests that match policy', async () => {
      const engine = new TealEngine({
        tools: {
          'chat': { allowed: true }
        }
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        })
      });

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(response).toBeDefined();
      expect(response.metadata?.engine).toBe('TealEngine v1.1.0');
    });

    it('should block requests that violate policy', async () => {
      const engine = new TealEngine({
        tools: {
          'chat': { allowed: false }
        }
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      await expect(
        client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      ).rejects.toThrow(PolicyViolationError);
    });
  });

  describe('with TealMonitor', () => {
    it('should track metrics', async () => {
      const monitor = new TealMonitor({
        anomalyThreshold: 2.0,
        autoBaseline: false
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        monitor
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        })
      });

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(response).toBeDefined();
      expect(response.metadata?.monitor).toBe('TealMonitor');

      // Check metrics
      const metrics = monitor.getMetrics('test-agent');
      expect(metrics).not.toBeNull();
      if (metrics) {
        expect(metrics.requests.total).toBe(1);
        expect(metrics.requests.successful).toBe(1);
      }
    });

    it('should track failures', async () => {
      const monitor = new TealMonitor({
        anomalyThreshold: 2.0,
        autoBaseline: false
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        monitor
      });

      // Mock fetch to fail
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Invalid request' }
        })
      });

      await expect(
        client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      ).rejects.toThrow();

      // Check metrics
      const metrics = monitor.getMetrics('test-agent');
      expect(metrics).not.toBeNull();
      if (metrics) {
        expect(metrics.requests.total).toBe(1);
        expect(metrics.requests.failed).toBe(1);
      }
    });
  });

  describe('with TealCircuit', () => {
    it('should execute requests through circuit breaker', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 1
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        circuit
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        })
      });

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(response).toBeDefined();
      expect(response.metadata?.circuit).toContain('TealCircuit');
      expect(circuit.getState()).toBe('closed');
    });

    it('should open circuit after threshold failures', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 1
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        circuit
      });

      // Mock fetch to fail
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: { message: 'Server error' }
        })
      });

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await client.chat.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hello' }]
          });
        } catch (e) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('open');

      // Next request should fail immediately with CircuitOpenError
      try {
        await client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });
        // If we get here, the test should fail
        fail('Expected CircuitOpenError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CircuitOpenError');
        expect((error as Error).message).toContain('Circuit breaker is open');
      }
    });
  });

  describe('with TealAudit', () => {
    it('should log audit events', async () => {
      const events: any[] = [];
      const audit = new TealAudit({
        outputs: [{
          write: (event) => events.push(event)
        }]
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        audit
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        })
      });

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(response).toBeDefined();
      expect(response.metadata?.audit).toBe('TealAudit');
      expect(events.length).toBe(1);
      expect(events[0].agentId).toBe('test-agent');
      expect(events[0].action).toBe('chat.create');
    });
  });

  describe('with all components', () => {
    it('should work with all components together', async () => {
      const engine = new TealEngine({
        tools: {
          'chat': { allowed: true }
        }
      });

      const monitor = new TealMonitor({
        anomalyThreshold: 2.0,
        autoBaseline: false
      });

      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 1000,
        halfOpenRequests: 1
      });

      const events: any[] = [];
      const audit = new TealAudit({
        outputs: [{
          write: (event) => events.push(event)
        }]
      });

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        engine,
        monitor,
        circuit,
        audit
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        })
      });

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, how are you?' }]
      });

      expect(response).toBeDefined();
      expect(response.metadata?.engine).toBe('TealEngine v1.1.0');
      expect(response.metadata?.monitor).toBe('TealMonitor');
      expect(response.metadata?.circuit).toContain('TealCircuit');
      expect(response.metadata?.audit).toBe('TealAudit');

      // Check metrics
      const metrics = monitor.getMetrics('test-agent');
      expect(metrics).not.toBeNull();
      if (metrics) {
        expect(metrics.requests.total).toBe(1);
        expect(metrics.requests.successful).toBe(1);
      }

      // Check audit
      expect(events.length).toBe(1);
      expect(events[0].agentId).toBe('test-agent');
    });
  });
});

describe('TealAnthropic Integration', () => {
  it('should work with all components', async () => {
    const engine = new TealEngine({
      tools: {
        'messages': { allowed: true }
      }
    });

    const monitor = new TealMonitor({
      anomalyThreshold: 2.0,
      autoBaseline: false
    });

    const client = new TealAnthropic({
      apiKey: 'test-key',
      agentId: 'test-agent',
      engine,
      monitor
    });

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5
        }
      })
    });

    const response = await client.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hello' }]
    });

    expect(response).toBeDefined();
    expect(response.metadata?.engine).toBe('TealEngine v1.1.0');
    expect(response.metadata?.monitor).toBe('TealMonitor');

    // Check metrics
    const metrics = monitor.getMetrics('test-agent');
    expect(metrics).not.toBeNull();
    if (metrics) {
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.successful).toBe(1);
    }
  });
});
