/**
 * TealCircuit - Circuit Breaker Implementation
 * 
 * Prevents cascading failures by implementing the circuit breaker pattern.
 * The circuit has three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF-OPEN: Testing if the service has recovered
 * 
 * Part of TealTiger v1.1.x - Enterprise Adoption Features
 * Returns Decision objects for consistency with TealEngine and TealGuard.
 * 
 * @example
 * ```typescript
 * const circuit = new TealCircuit({
 *   failureThreshold: 5,
 *   timeout: 60000,
 *   halfOpenRequests: 3
 * });
 * 
 * try {
 *   const result = await circuit.execute(async () => {
 *     return await riskyOperation();
 *   });
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     console.log('Circuit is open, service unavailable');
 *   }
 * }
 * ```
 */

import { 
  Decision, 
  DecisionAction, 
  ReasonCode, 
  PolicyMode 
} from '../engine/types';
import { ExecutionContext } from '../context/ExecutionContext';
import { ContextManager } from '../context/ContextManager';
import { getComponentVersionsWithCircuit } from '../utils/version';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Configuration for TealCircuit
 */
export interface TealCircuitConfig {
  /**
   * Number of consecutive failures before opening the circuit
   * @default 5
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before attempting to close the circuit
   * @default 60000 (1 minute)
   */
  timeout: number;

  /**
   * Number of successful requests in half-open state before closing
   * @default 3
   */
  halfOpenRequests: number;

  /**
   * Callback invoked when circuit state changes
   */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * TealCircuit - Circuit Breaker for preventing cascading failures
 */
export class TealCircuit {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private lastFailureTime: Date | null = null;
  private halfOpenAttempts: number = 0;
  private config: Required<TealCircuitConfig>;

  constructor(config: TealCircuitConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      timeout: config.timeout,
      halfOpenRequests: config.halfOpenRequests,
      onStateChange: config.onStateChange || (() => {}),
    };
  }

  /**
   * Execute a function with circuit breaker protection
   * 
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws CircuitOpenError if circuit is open
   * @throws Original error if function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Evaluate circuit state and return a Decision object
   * 
   * This method checks the circuit state and returns a Decision object
   * indicating whether the operation should be allowed or denied.
   * 
   * Part of TealTiger v1.1.x - Enterprise Adoption Features (P0.2)
   * Returns Decision object with same structure as TealEngine and TealGuard.
   * 
   * @param context - Execution context for tracing (auto-generated if not provided)
   * @returns Decision object with action, reason_codes, risk_score, and metadata
   * 
   * @example
   * ```typescript
   * const context = ContextManager.createContext();
   * const decision = circuit.evaluate(context);
   * 
   * if (decision.action === DecisionAction.DENY) {
   *   console.log('Circuit is open, operation denied');
   * }
   * ```
   */
  evaluate(context?: ExecutionContext): Decision {
    const startTime = Date.now();

    // Ensure we have an ExecutionContext
    const executionContext = context || ContextManager.createContext();

    // Check if circuit should attempt reset
    if (this.state === 'open' && this.shouldAttemptReset()) {
      this.transitionTo('half-open');
    }

    // Determine action based on circuit state
    let action: DecisionAction;
    let reasonCodes: ReasonCode[];
    let riskScore: number;
    let reason: string;

    if (this.state === 'open') {
      action = DecisionAction.DENY;
      reasonCodes = [ReasonCode.CIRCUIT_OPEN];
      riskScore = 100; // Maximum risk when circuit is open
      reason = 'Circuit breaker is open - service unavailable';
    } else if (this.state === 'half-open') {
      action = DecisionAction.ALLOW;
      reasonCodes = [ReasonCode.CIRCUIT_HALF_OPEN];
      riskScore = 50; // Medium risk in half-open state
      reason = 'Circuit breaker is half-open - testing service recovery';
    } else {
      action = DecisionAction.ALLOW;
      reasonCodes = [ReasonCode.POLICY_COMPLIANT];
      riskScore = 0; // No risk when circuit is closed
      reason = 'Circuit breaker is closed - normal operation';
    }

    // Get component versions
    const componentVersions = getComponentVersionsWithCircuit();

    // Build metadata
    const metadata: Record<string, any> = {
      evaluation_time_ms: Date.now() - startTime,
      circuit_state: this.state,
      failures: this.failures,
      last_failure_time: this.lastFailureTime?.toISOString(),
      half_open_attempts: this.halfOpenAttempts
    };

    if (executionContext.tenant_id) metadata.tenant_id = executionContext.tenant_id;
    if (executionContext.application) metadata.application = executionContext.application;
    if (executionContext.environment) metadata.environment = executionContext.environment;
    if (executionContext.agent_purpose) metadata.agent_purpose = executionContext.agent_purpose;

    // Build Decision object
    const decision: Decision = {
      action,
      reason_codes: reasonCodes,
      risk_score: riskScore,
      mode: PolicyMode.ENFORCE, // Circuit breaker always enforces
      policy_id: 'circuit.breaker',
      policy_version: componentVersions.circuit || '1.1.0',
      component_versions: componentVersions,
      correlation_id: executionContext.correlation_id,
      reason,
      metadata
    };

    // Add optional fields only if defined
    if (executionContext.trace_id) decision.trace_id = executionContext.trace_id;
    if (executionContext.workflow_id) decision.workflow_id = executionContext.workflow_id;
    if (executionContext.run_id) decision.run_id = executionContext.run_id;
    if (executionContext.span_id) decision.span_id = executionContext.span_id;
    if (executionContext.parent_span_id) decision.parent_span_id = executionContext.parent_span_id;

    return decision;
  }

  /**
   * Reset the circuit to closed state
   */
  reset(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Force the circuit to open state
   */
  forceOpen(): void {
    this.transitionTo('open');
  }

  /**
   * Force the circuit to closed state
   */
  forceClose(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    lastFailureTime: Date | null;
    halfOpenAttempts: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenAttempts++;

      if (this.halfOpenAttempts >= this.config.halfOpenRequests) {
        this.transitionTo('closed');
        this.failures = 0;
        this.lastFailureTime = null;
        this.halfOpenAttempts = 0;
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      // Any failure in half-open state opens the circuit
      this.halfOpenAttempts = 0; // Reset half-open attempts
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
      // Threshold reached, open the circuit
      this.transitionTo('open');
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;

    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.config.timeout;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    
    if (oldState === newState) {
      return; // No transition needed
    }

    this.state = newState;

    if (newState === 'half-open') {
      this.halfOpenAttempts = 0;
    }

    // Invoke callback
    this.config.onStateChange(newState, oldState);
  }
}
