/**
 * Multi-Stage Defense Pipeline — DefensePipeline Orchestrator
 *
 * Top-level orchestrator that manages the three lifecycle stages
 * (PRE_EXECUTION → EXECUTION → POST_EXECUTION) for a governed LLM request.
 * Validates configuration, wires internal components, and coordinates
 * the full pipeline flow including remediation.
 *
 * @module pipeline/DefensePipeline
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 2.5, 3.1, 4.3, 5.1, 5.5, 13.1, 13.4
 */

import type { ModuleContext, ModuleEvaluationRequest } from '../core/engine/v1.2/types';
import type {
  PipelineConfig,
  PipelineRequest,
  PipelineResult,
  PipelineStage,
  PipelineTimingMetadata,
  StageDecision,
  RemediationAction,
} from './types';
import { PipelineStage as Stage, ACTION_SEVERITY } from './types';
import { StageEvaluator } from './StageEvaluator';
import { ExecutionStage } from './ExecutionStage';
import { RemediationHandler } from './RemediationHandler';
import { StageDecisionBuilder } from './StageDecisionBuilder';
import { HookRunner } from './HookRunner';
import { ModuleValidationError, PipelineConfigError } from './errors';

// ── Module Status Type ───────────────────────────────────────────

/**
 * Status information for a registered module.
 */
export interface ModuleStatusEntry {
  name: string;
  version: string;
  stage: PipelineStage;
  registered: boolean;
}

/**
 * Aggregated module status for all registered modules.
 */
export interface PipelineModuleStatus {
  modules: ModuleStatusEntry[];
}

// ── DefensePipeline ──────────────────────────────────────────────

/**
 * The DefensePipeline is the top-level orchestrator for multi-stage
 * governance enforcement on LLM requests. It coordinates:
 *
 * 1. Pre-execution stage: evaluate request → block if DENY
 * 2. Execution stage: forward to LLM provider via ObserveProxy
 * 3. Post-execution stage: evaluate response → remediate if DENY
 *
 * Each stage produces a StageDecision optionally enriched with
 * TEEC v2.1 cryptographic provenance fields.
 */
export class DefensePipeline {
  private readonly config: PipelineConfig;
  private readonly preStage: StageEvaluator;
  private readonly postStage: StageEvaluator;
  private readonly executionStage: ExecutionStage;
  private readonly hookRunner: HookRunner;
  private readonly decisionBuilder: StageDecisionBuilder;
  private readonly remediationHandler: RemediationHandler;

  constructor(config: PipelineConfig) {
    // Validate modules implement TealModule interface
    this.validateModules(config);

    // Validate that either observeProxy or providerClient is provided
    if (!config.observeProxy && !config.providerClient) {
      throw new PipelineConfigError(
        'Either observeProxy or providerClient must be provided in PipelineConfig',
      );
    }

    this.config = config;

    const failClosed = config.fail_closed ?? true;
    const timeoutMs = config.module_timeout_ms ?? 5000;
    const resampleBudget = config.resample_budget ?? 2;

    // Initialize internal components
    this.preStage = new StageEvaluator(Stage.PRE_EXECUTION, failClosed, timeoutMs);
    this.postStage = new StageEvaluator(Stage.POST_EXECUTION, failClosed, timeoutMs);

    // Resolve ObserveProxy: use provided or wrap providerClient
    const observeProxy = config.observeProxy ?? config.providerClient;
    this.executionStage = new ExecutionStage(observeProxy);

    this.hookRunner = new HookRunner(config.hooks);
    this.decisionBuilder = new StageDecisionBuilder(config.seal_secret, config.agent_id);
    this.remediationHandler = new RemediationHandler(resampleBudget);
  }

  /**
   * Execute the full multi-stage defense pipeline for a request.
   *
   * Flow: hooks → pre-stage → execution → post-stage → remediation → result
   */
  async execute(request: PipelineRequest): Promise<PipelineResult> {
    // Record pipeline entry timestamp
    const pipelineEntry = Date.now();

    // Generate correlation_id if not provided
    const correlationId = request.correlation_id ?? crypto.randomUUID();
    const resolvedRequest: PipelineRequest = {
      ...request,
      correlation_id: correlationId,
    };

    // Build module context for evaluation
    const ctx = this.buildModuleContext(resolvedRequest);

    // Initialize timing metadata
    const timing: PipelineTimingMetadata = {
      pipeline_entry: pipelineEntry,
      pre_execution_start: 0,
      pre_execution_end: 0,
      execution_start: null,
      execution_end: null,
      post_execution_start: null,
      post_execution_end: null,
      hook_time_ms: 0,
      remediation_attempts: [],
    };

    const decisions: StageDecision[] = [];

    // ── PRE-EXECUTION STAGE ────────────────────────────────────────

    // Run beforePreExecution hook
    await this.hookRunner.run('beforePreExecution', resolvedRequest);

    // Evaluate pre-execution stage
    timing.pre_execution_start = Date.now();
    const preEvalResult = await this.preStage.evaluate(
      this.config.preExecutionModules,
      this.buildEvaluationRequest(resolvedRequest),
      ctx,
      null,
    );
    timing.pre_execution_end = Date.now();

    // Build pre-execution StageDecision
    const preDecision = this.decisionBuilder.build({
      action: preEvalResult.action,
      reason_codes: preEvalResult.reason_codes,
      stage: Stage.PRE_EXECUTION,
      latency_ms: preEvalResult.latency_ms,
      module_details: preEvalResult.module_details,
      payload: resolvedRequest.payload,
    });
    decisions.push(preDecision);

    // Run afterPreExecution hook
    await this.hookRunner.run('afterPreExecution', preDecision);

    // If pre-decision is DENY (severity >= 70): return blocked result
    const preSeverity = ACTION_SEVERITY[preDecision.action] ?? 0;
    if (preSeverity >= 70) {
      timing.hook_time_ms = this.hookRunner.getHookTime();
      return this.buildResult({
        allowed: false,
        response: null,
        pre_decision: preDecision,
        post_decision: null,
        blocked_stage: Stage.PRE_EXECUTION,
        total_latency_ms: Date.now() - pipelineEntry,
        resample_count: 0,
        remediation_action: null,
        redacted: false,
        remediation_exhausted: false,
        provider_error: false,
        decisions,
        timing,
      });
    }

    // ── EXECUTION STAGE ────────────────────────────────────────────

    // Run beforeExecution hook
    await this.hookRunner.run('beforeExecution', resolvedRequest);

    // Execute via ExecutionStage (ObserveProxy delegation)
    timing.execution_start = Date.now();
    const executionResult = await this.executionStage.execute(resolvedRequest);
    timing.execution_end = Date.now();

    // Run afterExecution hook
    await this.hookRunner.run(
      'afterExecution',
      executionResult.response,
      executionResult.metadata,
    );

    // If provider error: return provider_error result
    if (!executionResult.success) {
      timing.hook_time_ms = this.hookRunner.getHookTime();
      const resultParams: Parameters<typeof this.buildResult>[0] = {
        allowed: false,
        response: null,
        pre_decision: preDecision,
        post_decision: null,
        blocked_stage: null,
        total_latency_ms: Date.now() - pipelineEntry,
        resample_count: 0,
        remediation_action: null,
        redacted: false,
        remediation_exhausted: false,
        provider_error: true,
        decisions,
        timing,
      };
      if (executionResult.error !== undefined) {
        resultParams.provider_error_details = executionResult.error;
      }
      return this.buildResult(resultParams);
    }

    // ── POST-EXECUTION STAGE ───────────────────────────────────────

    // Run beforePostExecution hook
    await this.hookRunner.run('beforePostExecution', executionResult.response, resolvedRequest);

    // Evaluate post-execution stage
    timing.post_execution_start = Date.now();
    const postEvalResult = await this.postStage.evaluate(
      this.config.postExecutionModules,
      this.buildPostEvaluationRequest(resolvedRequest, executionResult.response),
      ctx,
      null,
    );
    timing.post_execution_end = Date.now();

    // Build post-execution StageDecision
    const postPayload = typeof executionResult.response === 'object' && executionResult.response !== null
      ? executionResult.response
      : { _response: executionResult.response };
    const postDecision = this.decisionBuilder.build({
      action: postEvalResult.action,
      reason_codes: postEvalResult.reason_codes,
      stage: Stage.POST_EXECUTION,
      latency_ms: postEvalResult.latency_ms,
      module_details: postEvalResult.module_details,
      payload: postPayload,
    });
    decisions.push(postDecision);

    // Run afterPostExecution hook
    await this.hookRunner.run('afterPostExecution', postDecision);

    // If post-decision is DENY (severity >= 70): run remediation logic
    const postSeverity = ACTION_SEVERITY[postDecision.action] ?? 0;
    if (postSeverity >= 70) {
      return this.handleRemediation(
        resolvedRequest,
        preDecision,
        postDecision,
        executionResult.response,
        ctx,
        decisions,
        timing,
        pipelineEntry,
      );
    }

    // ── SUCCESS: Response passes all stages ────────────────────────
    timing.hook_time_ms = this.hookRunner.getHookTime();
    return this.buildResult({
      allowed: true,
      response: executionResult.response,
      pre_decision: preDecision,
      post_decision: postDecision,
      blocked_stage: null,
      total_latency_ms: Date.now() - pipelineEntry,
      resample_count: 0,
      remediation_action: null,
      redacted: false,
      remediation_exhausted: false,
      provider_error: false,
      decisions,
      timing,
    });
  }

  /**
   * Return per-module registration status information.
   */
  getModuleStatus(): PipelineModuleStatus {
    const modules: ModuleStatusEntry[] = [];

    for (const mod of this.config.preExecutionModules) {
      modules.push({
        name: mod.name,
        version: mod.version,
        stage: Stage.PRE_EXECUTION,
        registered: true,
      });
    }

    for (const mod of this.config.postExecutionModules) {
      modules.push({
        name: mod.name,
        version: mod.version,
        stage: Stage.POST_EXECUTION,
        registered: true,
      });
    }

    return { modules };
  }

  // ── Private Methods ──────────────────────────────────────────────

  /**
   * Handle post-execution remediation when the post-stage decision is DENY.
   */
  private async handleRemediation(
    request: PipelineRequest,
    preDecision: StageDecision,
    postDecision: StageDecision,
    originalResponse: any,
    ctx: ModuleContext,
    decisions: StageDecision[],
    timing: PipelineTimingMetadata,
    pipelineEntry: number,
  ): Promise<PipelineResult> {
    // Select remediation action from module metadata
    const action = this.remediationHandler.selectAction(postDecision.module_details);

    // Run onRemediation hook
    await this.hookRunner.run('onRemediation', action, postDecision, 0);

    switch (action) {
      case 'RESAMPLE': {
        // Execute resample loop
        const resampleStart = Date.now();
        const remediationResult = await this.remediationHandler.executeResampleLoop(
          request,
          this.executionStage,
          this.postStage,
          this.config.postExecutionModules,
          ctx,
          null,
          0,
        );
        const resampleEnd = Date.now();
        timing.remediation_attempts.push({ start: resampleStart, end: resampleEnd });

        timing.hook_time_ms = this.hookRunner.getHookTime();

        if (remediationResult.success) {
          return this.buildResult({
            allowed: true,
            response: remediationResult.response,
            pre_decision: preDecision,
            post_decision: postDecision,
            blocked_stage: null,
            total_latency_ms: Date.now() - pipelineEntry,
            resample_count: remediationResult.resampleCount,
            remediation_action: 'RESAMPLE' as RemediationAction,
            redacted: false,
            remediation_exhausted: false,
            provider_error: false,
            decisions,
            timing,
          });
        }

        // Budget exhausted → DENY_RESPONSE
        return this.buildResult({
          allowed: false,
          response: null,
          pre_decision: preDecision,
          post_decision: postDecision,
          blocked_stage: Stage.POST_EXECUTION,
          total_latency_ms: Date.now() - pipelineEntry,
          resample_count: remediationResult.resampleCount,
          remediation_action: 'RESAMPLE' as RemediationAction,
          redacted: false,
          remediation_exhausted: true,
          provider_error: false,
          decisions,
          timing,
        });
      }

      case 'REDACT': {
        // Apply redaction via module-provided functions
        const redactStart = Date.now();
        const redactedResponse = await this.remediationHandler.applyRedaction(
          originalResponse,
          postDecision.module_details,
        );
        const redactEnd = Date.now();
        timing.remediation_attempts.push({ start: redactStart, end: redactEnd });

        timing.hook_time_ms = this.hookRunner.getHookTime();

        return this.buildResult({
          allowed: true,
          response: redactedResponse,
          pre_decision: preDecision,
          post_decision: postDecision,
          blocked_stage: null,
          total_latency_ms: Date.now() - pipelineEntry,
          resample_count: 0,
          remediation_action: 'REDACT' as RemediationAction,
          redacted: true,
          remediation_exhausted: false,
          provider_error: false,
          decisions,
          timing,
        });
      }

      case 'DENY_RESPONSE':
      default: {
        timing.hook_time_ms = this.hookRunner.getHookTime();

        return this.buildResult({
          allowed: false,
          response: null,
          pre_decision: preDecision,
          post_decision: postDecision,
          blocked_stage: Stage.POST_EXECUTION,
          total_latency_ms: Date.now() - pipelineEntry,
          resample_count: 0,
          remediation_action: 'DENY_RESPONSE' as RemediationAction,
          redacted: false,
          remediation_exhausted: false,
          provider_error: false,
          decisions,
          timing,
        });
      }
    }
  }

  /**
   * Validate that all modules implement the TealModule interface.
   * Throws ModuleValidationError if any module is non-conforming.
   */
  private validateModules(config: PipelineConfig): void {
    const allModules = [
      ...config.preExecutionModules,
      ...config.postExecutionModules,
    ];

    for (const mod of allModules) {
      const missingFields: string[] = [];

      if (!mod || typeof mod !== 'object') {
        throw new ModuleValidationError('unknown', ['name', 'version', 'evaluate']);
      }

      if (typeof mod.name !== 'string' || mod.name.length === 0) {
        missingFields.push('name');
      }
      if (typeof mod.version !== 'string' || mod.version.length === 0) {
        missingFields.push('version');
      }
      if (typeof mod.evaluate !== 'function') {
        missingFields.push('evaluate');
      }

      if (missingFields.length > 0) {
        const moduleName = typeof mod.name === 'string' && mod.name.length > 0
          ? mod.name
          : 'unknown';
        throw new ModuleValidationError(moduleName, missingFields);
      }
    }
  }

  /**
   * Build ModuleContext for module evaluation.
   */
  private buildModuleContext(request: PipelineRequest): ModuleContext {
    const ctx: ModuleContext = {
      correlation_id: request.correlation_id!,
      policy_version: '1.4.0',
      teec_version: '2.1',
      timestamp: Date.now(),
    };

    if (this.config.agent_id !== undefined) {
      ctx.agent_id = this.config.agent_id;
    }
    if (request.context?.session_id !== undefined) {
      ctx.session_id = request.context.session_id;
    }
    if (request.context?.tenant_id !== undefined) {
      ctx.tenant_id = request.context.tenant_id;
    }
    if (request.context?.user_id !== undefined) {
      ctx.user_id = request.context.user_id;
    }

    return ctx;
  }

  /**
   * Build a ModuleEvaluationRequest from the pipeline request (pre-execution).
   */
  private buildEvaluationRequest(request: PipelineRequest): ModuleEvaluationRequest {
    return {
      content: typeof request.payload.content === 'string'
        ? request.payload.content
        : JSON.stringify(request.payload),
      ...request.payload,
    };
  }

  /**
   * Build a ModuleEvaluationRequest for post-execution (includes response).
   */
  private buildPostEvaluationRequest(
    request: PipelineRequest,
    response: any,
  ): ModuleEvaluationRequest {
    return {
      content: typeof response === 'string'
        ? response
        : JSON.stringify(response),
      ...request.payload,
      _response: response,
    };
  }

  /**
   * Build the final PipelineResult with toJSON() serialization method.
   */
  private buildResult(params: {
    allowed: boolean;
    response: any | null;
    pre_decision: StageDecision;
    post_decision: StageDecision | null;
    blocked_stage: PipelineStage | null;
    total_latency_ms: number;
    resample_count: number;
    remediation_action: RemediationAction | null;
    redacted: boolean;
    remediation_exhausted: boolean;
    provider_error: boolean;
    provider_error_details?: { message: string; code?: string };
    decisions: StageDecision[];
    timing: PipelineTimingMetadata;
  }): PipelineResult {
    const result: PipelineResult = {
      allowed: params.allowed,
      response: params.response,
      pre_decision: params.pre_decision,
      post_decision: params.post_decision,
      blocked_stage: params.blocked_stage,
      total_latency_ms: params.total_latency_ms,
      resample_count: params.resample_count,
      remediation_action: params.remediation_action,
      redacted: params.redacted,
      remediation_exhausted: params.remediation_exhausted,
      provider_error: params.provider_error,
      decisions: params.decisions,
      timing: params.timing,
      toJSON(): Record<string, unknown> {
        const json: Record<string, unknown> = {
          allowed: params.allowed,
          response: params.response,
          pre_decision: params.pre_decision,
          post_decision: params.post_decision,
          blocked_stage: params.blocked_stage,
          total_latency_ms: params.total_latency_ms,
          resample_count: params.resample_count,
          remediation_action: params.remediation_action,
          redacted: params.redacted,
          remediation_exhausted: params.remediation_exhausted,
          provider_error: params.provider_error,
          decisions: params.decisions,
          timing: params.timing,
        };
        if (params.provider_error_details !== undefined) {
          json.provider_error_details = params.provider_error_details;
        }
        return json;
      },
    };

    if (params.provider_error_details !== undefined) {
      result.provider_error_details = params.provider_error_details;
    }

    return result;
  }
}
