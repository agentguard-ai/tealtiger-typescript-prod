/**
 * TealCircuit Unit Tests
 * 
 * Tests for the circuit breaker implementation
 */

import { TealCircuit, CircuitOpenError, CircuitState } from '../TealCircuit';

describe('TealCircuit', () => {
  // Helper to create a mock async function
  const createMockFn = <T>(result: T, shouldFail = false) => {
    return jest.fn(async () => {
      if (shouldFail) {
        throw new Error('Operation failed');
      }
      return result;
    });
  };

  // Helper to wait for a specific time
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  describe('5.3.1 State Transitions', () => {
    it('should start in closed state', () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      expect(circuit.getState()).toBe('closed');
    });

    it('should transition from closed to open after threshold failures', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Execute 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuit.getState()).toBe('open');
    });

    it('should transition from open to half-open after timeout', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100, // Short timeout for testing
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Trigger failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('open');

      // Wait for timeout
      await wait(150);

      // Next execution should transition to half-open
      const result = await circuit.execute(successFn);
      expect(result).toBe('success');
      expect(circuit.getState()).toBe('half-open');
    });

    it('should transition from half-open to closed after successful requests', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 3,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await wait(150);

      // Execute successful requests in half-open state
      for (let i = 0; i < 3; i++) {
        await circuit.execute(successFn);
      }

      expect(circuit.getState()).toBe('closed');
    });

    it('should transition from half-open back to open on failure', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 3,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await wait(150);

      // First success transitions to half-open
      await circuit.execute(successFn);
      expect(circuit.getState()).toBe('half-open');

      // Failure in half-open should reopen circuit
      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      expect(circuit.getState()).toBe('open');
    });

    it('should invoke state change callback on transitions', async () => {
      const stateChanges: Array<{ from: CircuitState; to: CircuitState }> = [];
      
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
        onStateChange: (newState, oldState) => {
          stateChanges.push({ from: oldState, to: newState });
        },
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Trigger transition to open
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Wait and trigger transition to half-open
      await wait(150);
      await circuit.execute(successFn);

      // Complete half-open to closed
      await circuit.execute(successFn);

      expect(stateChanges).toEqual([
        { from: 'closed', to: 'open' },
        { from: 'open', to: 'half-open' },
        { from: 'half-open', to: 'closed' },
      ]);
    });
  });

  describe('5.3.2 Failure Threshold', () => {
    it('should not open circuit before threshold is reached', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Execute 4 times (below threshold)
      for (let i = 0; i < 4; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('closed');
    });

    it('should open circuit exactly at threshold', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Execute exactly 5 times (at threshold)
      for (let i = 0; i < 5; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('open');
    });

    it('should reset failure count on success in closed state', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // 1 success (should reset count)
      await circuit.execute(successFn);

      // 2 more failures (should not open since count was reset)
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('closed');
    });

    it('should track failures independently per execution', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      const stats1 = circuit.getStats();
      expect(stats1.failures).toBe(0);

      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      const stats2 = circuit.getStats();
      expect(stats2.failures).toBe(1);

      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      const stats3 = circuit.getStats();
      expect(stats3.failures).toBe(2);
    });
  });

  describe('5.3.3 Timeout Behavior', () => {
    it('should not allow execution before timeout expires', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 200,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('open');

      // Try to execute before timeout (should throw CircuitOpenError)
      await expect(circuit.execute(failingFn)).rejects.toThrow(CircuitOpenError);
      expect(circuit.getState()).toBe('open');
    });

    it('should allow execution after timeout expires', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await wait(150);

      // Should allow execution and transition to half-open
      const result = await circuit.execute(successFn);
      expect(result).toBe('success');
      expect(circuit.getState()).toBe('half-open');
    });

    it('should calculate timeout from last failure time', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 150,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // First failure
      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      await wait(50);

      // Second failure (this sets the lastFailureTime)
      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      expect(circuit.getState()).toBe('open');

      // Wait 100ms (total 150ms from first failure, but only 100ms from last)
      await wait(100);

      // Should still be blocked
      await expect(circuit.execute(successFn)).rejects.toThrow(CircuitOpenError);

      // Wait another 60ms (total 160ms from last failure)
      await wait(60);

      // Should now allow execution
      const result = await circuit.execute(successFn);
      expect(result).toBe('success');
    });
  });

  describe('5.3.4 Half-Open Recovery', () => {
    it('should require configured number of successes to close', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 4,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      await wait(150);

      // Execute 3 successful requests (below threshold)
      for (let i = 0; i < 3; i++) {
        await circuit.execute(successFn);
      }

      expect(circuit.getState()).toBe('half-open');

      // 4th success should close the circuit
      await circuit.execute(successFn);
      expect(circuit.getState()).toBe('closed');
    });

    it('should track half-open attempts correctly', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 3,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      await wait(150);

      // First success
      await circuit.execute(successFn);
      let stats = circuit.getStats();
      expect(stats.halfOpenAttempts).toBe(1);

      // Second success
      await circuit.execute(successFn);
      stats = circuit.getStats();
      expect(stats.halfOpenAttempts).toBe(2);

      // Third success (should close)
      await circuit.execute(successFn);
      stats = circuit.getStats();
      expect(stats.halfOpenAttempts).toBe(0); // Reset after closing
      expect(circuit.getState()).toBe('closed');
    });

    it('should reopen on any failure in half-open state', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 5,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      await wait(150);

      // 2 successes in half-open
      await circuit.execute(successFn);
      await circuit.execute(successFn);
      expect(circuit.getState()).toBe('half-open');

      // Single failure should reopen
      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      expect(circuit.getState()).toBe('open');
    });

    it('should reset half-open attempts when reopening', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 3,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      await wait(150);

      // 2 successes in half-open
      await circuit.execute(successFn);
      await circuit.execute(successFn);

      let stats = circuit.getStats();
      expect(stats.halfOpenAttempts).toBe(2);

      // Failure reopens
      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      stats = circuit.getStats();
      expect(stats.halfOpenAttempts).toBe(0);
      expect(circuit.getState()).toBe('open');
    });
  });

  describe('5.3.5 Callbacks', () => {
    it('should invoke callback with correct states', async () => {
      const stateChanges: Array<{ from: CircuitState; to: CircuitState }> = [];
      
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
        onStateChange: (newState, oldState) => {
          stateChanges.push({ from: oldState, to: newState });
        },
      });

      const failingFn = createMockFn('result', true);

      // Trigger open
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({ from: 'closed', to: 'open' });
    });

    it('should not invoke callback when state does not change', async () => {
      const callback = jest.fn();
      
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 100,
        halfOpenRequests: 2,
        onStateChange: callback,
      });

      const failingFn = createMockFn('result', true);

      // Multiple failures below threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it('should invoke callback for all state transitions', async () => {
      const stateChanges: CircuitState[] = [];
      
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
        onStateChange: (newState) => {
          stateChanges.push(newState);
        },
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // closed -> open
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      await wait(150);

      // open -> half-open
      await circuit.execute(successFn);

      // half-open -> closed
      await circuit.execute(successFn);

      expect(stateChanges).toEqual(['open', 'half-open', 'closed']);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual reset', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('open');

      // Manual reset
      circuit.reset();

      expect(circuit.getState()).toBe('closed');
      const stats = circuit.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
    });

    it('should allow forcing circuit open', () => {
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      expect(circuit.getState()).toBe('closed');

      circuit.forceOpen();

      expect(circuit.getState()).toBe('open');
    });

    it('should allow forcing circuit closed', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuit.getState()).toBe('open');

      circuit.forceClose();

      expect(circuit.getState()).toBe('closed');
      const stats = circuit.getStats();
      expect(stats.failures).toBe(0);
    });

    it('should invoke callback on manual state changes', () => {
      const stateChanges: CircuitState[] = [];
      
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 1000,
        halfOpenRequests: 2,
        onStateChange: (newState) => {
          stateChanges.push(newState);
        },
      });

      circuit.forceOpen();
      circuit.reset();

      expect(stateChanges).toEqual(['open', 'closed']);
    });
  });

  describe('Error Handling', () => {
    it('should throw CircuitOpenError when circuit is open', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      await expect(circuit.execute(failingFn)).rejects.toThrow(CircuitOpenError);
      await expect(circuit.execute(failingFn)).rejects.toThrow('Circuit breaker is open');
    });

    it('should propagate original error from function', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const customError = new Error('Custom error message');
      const failingFn = jest.fn(async () => {
        throw customError;
      });

      await expect(circuit.execute(failingFn)).rejects.toThrow('Custom error message');
    });

    it('should handle synchronous errors', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const syncError = new Error('Sync error');
      const syncFailingFn = jest.fn(async () => {
        throw syncError;
      });

      await expect(circuit.execute(syncFailingFn)).rejects.toThrow('Sync error');
      expect(circuit.getStats().failures).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 1000,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);

      let stats = circuit.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
      expect(stats.halfOpenAttempts).toBe(0);

      // First failure
      try {
        await circuit.execute(failingFn);
      } catch (error) {
        // Expected
      }

      stats = circuit.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should update statistics on state changes', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 2,
        timeout: 100,
        halfOpenRequests: 2,
      });

      const failingFn = createMockFn('result', true);
      const successFn = createMockFn('success', false);

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuit.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      let stats = circuit.getStats();
      expect(stats.state).toBe('open');
      expect(stats.failures).toBe(2);

      await wait(150);

      // Transition to half-open
      await circuit.execute(successFn);

      stats = circuit.getStats();
      expect(stats.state).toBe('half-open');
      expect(stats.halfOpenAttempts).toBe(1);

      // Close circuit
      await circuit.execute(successFn);

      stats = circuit.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.halfOpenAttempts).toBe(0);
    });
  });
});
