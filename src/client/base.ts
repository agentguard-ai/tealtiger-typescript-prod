/**
 * TealTiger Base Client - Integration Layer
 * 
 * This class integrates all TealTiger components (TealEngine, TealGuard, TealMonitor, TealCircuit, TealAudit)
 * and provides a unified interface for client implementations.
 */

import { TealEngine } from '../core/engine/TealEngine';
import type { PolicyEvaluationResult } from '../core/engine/types';
import { TealGuard } from '../core/guard/TealGuard';
import type { TealGuardResult } from '../core/guard/TealGuard';
import { TealMonitor } from '../core/monitor/TealMonitor';
import type { MonitoringEvent } from '../core/monitor/TealMonitor';
import { TealCircuit } from '../core/circuit/TealCircuit';
import { TealAudit } from '../core/audit/TealAudit';
import type { AuditEvent } from '../core/audit/TealAudit';
import type { TealPolicy } from '../core/engine/types';

/**
 * Request context for component communication
 */
export interface RequestContext {
  agentId: string;
  action: string;
  model?: string;
  content?: string;
  tool?: string;
  toolParams?: Record<string, any>;
  code?: string;
  cost?: number;
  metadata?: Record<string, any>;
}

/**
 * Configuration for TealBaseClient
 */
export interface TealClientConfig {
  apiKey: string;
  agentId?: string;
  
  // Component instances (pre-configured)
  engine?: TealEngine;
  guard?: TealGuard;
  monitor?: TealMonitor;
  circuit?: TealCircuit;
  audit?: TealAudit;
  
  // Or inline configuration
  policies?: TealPolicy;
  guardConfig?: TealGuardConfig;
  monitorConfig?: TealMonitorConfig;
  circuitConfig?: TealCircuitConfig;
  auditConfig?: TealAuditConfig;
}

// Import config types
import type { TealGuardConfig } from '../core/guard/TealGuard';
import type { TealMonitorConfig } from '../core/monitor/TealMonitor';
import type { TealCircuitConfig } from '../core/circuit/TealCircuit';
import type { TealAuditConfig } from '../core/audit/TealAudit';

/**
 * Error types for TealTiger
 */
export class TealTigerError extends Error {
  constructor(message: string, public component: string) {
    super(message);
    this.name = 'TealTigerError';
  }
}

export class PolicyViolationError extends TealTigerError {
  constructor(message: string, public policy: string) {
    super(message, 'TealEngine');
    this.name = 'PolicyViolationError';
  }
}

export class GuardrailViolationError extends TealTigerError {
  constructor(message: string, public violations: string[]) {
    super(message, 'TealGuard');
    this.name = 'GuardrailViolationError';
  }
}

export class CircuitOpenError extends TealTigerError {
  constructor(message: string) {
    super(message, 'TealCircuit');
    this.name = 'CircuitOpenError';
  }
}

export class AnomalyDetectedError extends TealTigerError {
  constructor(message: string, public anomaly: any) {
    super(message, 'TealMonitor');
    this.name = 'AnomalyDetectedError';
  }
}

/**
 * Base client class with component integration
 */
export class TealBaseClient {
  protected engine?: TealEngine;
  protected guard?: TealGuard;
  protected monitor?: TealMonitor;
  protected circuit?: TealCircuit;
  protected audit?: TealAudit;
  protected config: TealClientConfig;

  constructor(config: TealClientConfig) {
    this.config = config;
    
    // Initialize components from instances or inline config
    this.initializeComponents();
  }

  /**
   * Initialize all components based on configuration
   */
  private initializeComponents(): void {
    // TealEngine
    if (this.config.engine) {
      this.engine = this.config.engine;
    } else if (this.config.policies) {
      this.engine = new TealEngine(this.config.policies);
    }

    // TealGuard
    if (this.config.guard) {
      this.guard = this.config.guard;
    } else if (this.config.guardConfig) {
      this.guard = new TealGuard(this.config.guardConfig);
    }

    // TealMonitor
    if (this.config.monitor) {
      this.monitor = this.config.monitor;
    } else if (this.config.monitorConfig) {
      this.monitor = new TealMonitor(this.config.monitorConfig);
    }

    // TealCircuit
    if (this.config.circuit) {
      this.circuit = this.config.circuit;
    } else if (this.config.circuitConfig) {
      this.circuit = new TealCircuit(this.config.circuitConfig);
    }

    // TealAudit
    if (this.config.audit) {
      this.audit = this.config.audit;
    } else if (this.config.auditConfig) {
      this.audit = new TealAudit(this.config.auditConfig);
    }
  }

  /**
   * Execute a request with all component integrations
   * 
   * This method orchestrates:
   * 1. Policy evaluation (TealEngine)
   * 2. Content validation (TealGuard)
   * 3. Circuit breaker (TealCircuit)
   * 4. Request execution
   * 5. Metrics tracking (TealMonitor)
   * 6. Audit logging (TealAudit)
   */
  protected async executeRequest<T>(
    fn: () => Promise<T>,
    context: RequestContext
  ): Promise<T> {
    const startTime = Date.now();
    let policyResult: PolicyEvaluationResult | undefined;
    let guardResult: TealGuardResult | undefined;

    try {
      // Step 1: Policy evaluation (TealEngine)
      if (this.engine) {
        policyResult = this.engine.evaluate(context);
        
        if (!policyResult.allowed) {
          throw new PolicyViolationError(
            `TealEngine: ${policyResult.reason || 'Policy violation'}`,
            policyResult.triggeredPolicies.join(', ')
          );
        }
      }

      // Step 2: Content validation (TealGuard)
      if (this.guard && context.content) {
        guardResult = await this.guard.check(context.content, {
          agentId: context.agentId,
          action: context.action
        });
        
        if (!guardResult.passed) {
          const failedGuardrails = guardResult.guardrailResults.failedGuardrails;
          throw new GuardrailViolationError(
            `TealGuard: Content validation failed - ${failedGuardrails.join(', ')}`,
            failedGuardrails
          );
        }
      }

      // Step 3: Circuit breaker (TealCircuit)
      const execute = this.circuit 
        ? () => this.circuit!.execute(fn)
        : fn;

      // Step 4: Execute request
      const result = await execute();

      // Step 5: Track metrics (TealMonitor)
      if (this.monitor) {
        const event: MonitoringEvent = {
          agentId: context.agentId,
          type: 'request',
          timestamp: new Date(),
          request: {
            action: context.action,
            ...(context.model && { model: context.model }),
            success: true,
            duration: Date.now() - startTime
          },
          ...(context.cost && {
            cost: {
              amount: context.cost,
              currency: 'USD',
              ...(context.model && { model: context.model })
            }
          })
        };
        this.monitor.track(event);
      }

      // Step 6: Audit log (TealAudit)
      if (this.audit) {
        const auditEvent: AuditEvent = {
          timestamp: new Date(),
          agentId: context.agentId,
          action: context.action,
          duration: Date.now() - startTime,
          ...(context.model && { model: context.model }),
          ...(context.cost && { cost: context.cost }),
          ...(policyResult && {
            policyDecisions: {
              allowed: policyResult.allowed.toString(),
              triggeredPolicies: policyResult.triggeredPolicies.join(', ')
            }
          }),
          ...(context.metadata && { metadata: context.metadata })
        };
        this.audit.log(auditEvent);
      }

      return result;

    } catch (error) {
      // Track failure (TealMonitor)
      if (this.monitor) {
        const errorDetails: { message: string; code?: string } = {
          message: error instanceof Error ? error.message : 'Unknown error'
        };
        
        if (error instanceof Error && 'code' in error && error.code) {
          errorDetails.code = String(error.code);
        }

        const event: MonitoringEvent = {
          agentId: context.agentId,
          type: 'request', // Changed from 'error' to 'request' so it counts in metrics
          timestamp: new Date(),
          request: {
            action: context.action,
            ...(context.model && { model: context.model }),
            success: false,
            duration: Date.now() - startTime
          },
          error: errorDetails
        };
        this.monitor.track(event);
      }

      // Audit log error (TealAudit)
      if (this.audit) {
        const auditEvent: AuditEvent = {
          timestamp: new Date(),
          agentId: context.agentId,
          action: context.action,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          ...(context.metadata && { metadata: context.metadata })
        };
        this.audit.log(auditEvent);
      }

      throw error;
    }
  }

  /**
   * Get metadata about enabled components
   */
  protected getComponentMetadata(): Record<string, string> {
    return {
      ...(this.engine && { engine: 'TealEngine v1.1.0' }),
      ...(this.guard && { guard: 'TealGuard' }),
      ...(this.monitor && { monitor: 'TealMonitor' }),
      ...(this.circuit && { circuit: `TealCircuit (${this.circuit.getState()})` }),
      ...(this.audit && { audit: 'TealAudit' })
    };
  }

  /**
   * Get current configuration (safe for logging)
   */
  getConfig(): Partial<TealClientConfig> {
    return {
      ...(this.config.agentId && { agentId: this.config.agentId })
    };
  }
}
