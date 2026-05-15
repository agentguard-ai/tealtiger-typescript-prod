/**
 * TealEngine v1.3 — Post-Evaluation Pipeline
 *
 * Orchestrates the sequential post-evaluation hook stages after the
 * merge stage produces a final decision. Each step is independent —
 * failure of one does not block others.
 *
 * Pipeline order:
 *   1. TealProof: append decision hash to Merkle tree
 *   2. TealAudit: emit TEEC envelope to configured sinks
 *   3. Response hooks: invoke webhooks for violations
 *   4. OTel: emit governance span
 *   5. TealFlow: trigger workflow events
 *
 * Execution is non-blocking to the caller.
 *
 * @module core/engine/v1.3/post-evaluation
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import type { DecisionV13, GovernanceContext } from './types';
import type { ResponseHookConfig, SIEMExportConfig } from './soc-types';
import { SIEMExporter } from './siem-exporter';
import { OTelGovernanceEmitter } from './otel-emitter';
import { ResponseHookManager } from './response-hooks';

// ── Pipeline Step Interfaces ─────────────────────────────────────

/**
 * Result of a single pipeline step execution.
 */
export interface PipelineStepResult {
  /** Step name */
  step: string;
  /** Whether the step completed successfully */
  success: boolean;
  /** Error message if the step failed */
  error?: string;
  /** Duration of the step in milliseconds */
  duration_ms: number;
}

/**
 * Result of the full post-evaluation pipeline execution.
 */
export interface PostEvaluationResult {
  /** Results for each pipeline step */
  steps: PipelineStepResult[];
  /** Total pipeline duration in milliseconds */
  total_duration_ms: number;
}

/**
 * Interface for TealProof integration (append decision hash to Merkle tree).
 */
export interface ProofHandler {
  appendDecisionHash(decision: DecisionV13, context: GovernanceContext): Promise<void>;
}

/**
 * Interface for TealAudit integration (emit TEEC envelope).
 */
export interface AuditHandler {
  emitEnvelope(decision: DecisionV13, context: GovernanceContext): Promise<void>;
}

/**
 * Interface for TealFlow integration (trigger workflow events).
 */
export interface FlowHandler {
  triggerEvent(decision: DecisionV13, context: GovernanceContext): Promise<void>;
}

// ── Pipeline Configuration ───────────────────────────────────────

/**
 * Configuration for the post-evaluation pipeline.
 */
export interface PostEvaluationConfig {
  /** TealProof handler (optional — skipped if not provided) */
  proofHandler?: ProofHandler;
  /** TealAudit handler (optional — skipped if not provided) */
  auditHandler?: AuditHandler;
  /** Response hook configurations */
  responseHooks?: ResponseHookConfig[];
  /** SIEM export configuration (used by audit step) */
  siemConfig?: SIEMExportConfig;
  /** Whether OTel span emission is enabled */
  otelEnabled?: boolean;
  /** TealFlow handler (optional — skipped if not provided) */
  flowHandler?: FlowHandler;
}

// ── PostEvaluationPipeline ───────────────────────────────────────

/**
 * Orchestrates the post-evaluation pipeline.
 *
 * Executes steps sequentially but non-blocking to the caller.
 * Each step is independent — failure of one does not block others.
 */
export class PostEvaluationPipeline {
  private readonly config: PostEvaluationConfig;
  private readonly siemExporter: SIEMExporter;
  private readonly otelEmitter: OTelGovernanceEmitter;
  private readonly responseHookManager: ResponseHookManager;

  /** Execution order for pipeline steps */
  private readonly executionOrder: string[] = [
    'teal_proof',
    'teal_audit',
    'response_hooks',
    'otel_span',
    'teal_flow',
  ];

  constructor(
    config: PostEvaluationConfig,
    deps?: {
      siemExporter?: SIEMExporter;
      otelEmitter?: OTelGovernanceEmitter;
      responseHookManager?: ResponseHookManager;
    },
  ) {
    this.config = config;
    this.siemExporter = deps?.siemExporter ?? new SIEMExporter();
    this.otelEmitter = deps?.otelEmitter ?? new OTelGovernanceEmitter();
    this.responseHookManager = deps?.responseHookManager ?? new ResponseHookManager();
  }

  /**
   * Execute the full post-evaluation pipeline.
   *
   * Steps execute sequentially. Each step is independent — failure of
   * one does not block others. The pipeline is non-blocking to the caller.
   *
   * @param decision - The final governance decision
   * @param context - The governance context
   * @param evaluationDuration_ms - How long the evaluation took (for OTel span)
   */
  async execute(
    decision: DecisionV13,
    context: GovernanceContext,
    evaluationDuration_ms: number = 0,
  ): Promise<PostEvaluationResult> {
    const pipelineStart = Date.now();
    const steps: PipelineStepResult[] = [];

    // 1. TealProof: append decision hash to Merkle tree
    steps.push(await this.executeStep('teal_proof', async () => {
      if (this.config.proofHandler) {
        await this.config.proofHandler.appendDecisionHash(decision, context);
      }
    }));

    // 2. TealAudit: emit TEEC envelope to configured sinks
    steps.push(await this.executeStep('teal_audit', async () => {
      if (this.config.auditHandler) {
        await this.config.auditHandler.emitEnvelope(decision, context);
      }
      // Also export to SIEM if configured
      if (this.config.siemConfig) {
        const formatted = this.siemExporter.export(
          decision,
          context,
          this.config.siemConfig.format,
        );
        await this.siemExporter.exportToSink(formatted, this.config.siemConfig);
      }
    }));

    // 3. Response hooks: invoke webhooks for violations
    steps.push(await this.executeStep('response_hooks', async () => {
      if (this.config.responseHooks && this.config.responseHooks.length > 0) {
        await this.responseHookManager.invoke(decision, this.config.responseHooks);
      }
    }));

    // 4. OTel: emit governance span
    steps.push(await this.executeStep('otel_span', async () => {
      if (this.config.otelEnabled !== false) {
        this.otelEmitter.emitSpan(decision, context, evaluationDuration_ms);
      }
    }));

    // 5. TealFlow: trigger workflow events
    steps.push(await this.executeStep('teal_flow', async () => {
      if (this.config.flowHandler) {
        await this.config.flowHandler.triggerEvent(decision, context);
      }
    }));

    return {
      steps,
      total_duration_ms: Date.now() - pipelineStart,
    };
  }

  /**
   * Get the execution order of pipeline steps.
   */
  getExecutionOrder(): ReadonlyArray<string> {
    return this.executionOrder;
  }

  /**
   * Get the OTel emitter instance (for external access to recorded spans).
   */
  getOTelEmitter(): OTelGovernanceEmitter {
    return this.otelEmitter;
  }

  /**
   * Get the response hook manager instance.
   */
  getResponseHookManager(): ResponseHookManager {
    return this.responseHookManager;
  }

  // ── Private: Step execution ──────────────────────────────────

  /**
   * Execute a single pipeline step, catching errors to ensure
   * independence between steps.
   */
  private async executeStep(
    stepName: string,
    fn: () => Promise<void>,
  ): Promise<PipelineStepResult> {
    const start = Date.now();
    try {
      await fn();
      return {
        step: stepName,
        success: true,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        step: stepName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  }
}
