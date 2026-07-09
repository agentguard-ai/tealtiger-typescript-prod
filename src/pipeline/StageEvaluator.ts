/**
 * Multi-Stage Defense Pipeline — Stage Evaluator
 *
 * Responsible for parallel module evaluation within a single pipeline stage,
 * timeout enforcement per module, and result merging using MostRestrictiveWins.
 *
 * @module pipeline/StageEvaluator
 * @requirements 2.1, 2.2, 2.6, 2.7, 4.1, 4.2, 4.8, 12.1, 12.2, 12.3, 12.4, 12.6
 */

import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../core/engine/v1.2/types';
import { PipelineStage, ACTION_SEVERITY } from './types';
import type { ModuleEvalDetail } from './types';
import { ModuleTimeoutError } from './errors';

// ── Result Interfaces ────────────────────────────────────────────

/**
 * A module result enriched with timing and identity metadata.
 */
export interface ModuleResultWithMeta {
  /** Module name */
  name: string;
  /** Module version */
  version: string;
  /** Evaluation latency in milliseconds */
  latency_ms: number;
  /** The module's evaluation result */
  result: ModuleResult;
  /** Error message if module threw or timed out */
  error?: string;
}

/**
 * The merged result of all modules at a stage.
 */
export interface MergedResult {
  /** The most restrictive action across all module results */
  action: string;
  /** All reason codes collected from all modules */
  reason_codes: string[];
}

/**
 * Complete evaluation result for a single pipeline stage.
 */
export interface StageEvaluationResult {
  /** The merged action (most restrictive wins) */
  action: string;
  /** All reason codes collected from evaluated modules */
  reason_codes: string[];
  /** Per-module evaluation details for audit trail */
  module_details: ModuleEvalDetail[];
  /** Total stage evaluation latency in milliseconds */
  latency_ms: number;
}

// ── StageEvaluator ───────────────────────────────────────────────

/**
 * Evaluates all modules registered at a single pipeline stage in parallel,
 * enforces per-module timeouts, and merges results using MostRestrictiveWins.
 *
 * Fail-closed behavior:
 * - When `failClosed` is true: module errors/timeouts → DENY
 * - When `failClosed` is false:
 *   - PRE_EXECUTION stage: module errors/timeouts → MONITOR
 *   - POST_EXECUTION stage: module errors/timeouts → ALLOW (per Req 12.4)
 */
export class StageEvaluator {
  constructor(
    private readonly stage: PipelineStage,
    private readonly failClosed: boolean,
    private readonly timeoutMs: number = 5000,
  ) {}

  /**
   * Evaluate all modules in parallel with timeout enforcement.
   * Returns per-module results and the merged stage action.
   */
  async evaluate(
    modules: TealModule[],
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<StageEvaluationResult> {
    const stageStart = Date.now();

    // No modules registered → pass-through (ALLOW)
    if (modules.length === 0) {
      return {
        action: 'ALLOW',
        reason_codes: [],
        module_details: [],
        latency_ms: Date.now() - stageStart,
      };
    }

    // Evaluate all modules in parallel with timeout enforcement
    const settledResults = await Promise.allSettled(
      modules.map((mod) => this.evaluateModule(mod, request, ctx, policy)),
    );

    // Process settled results into ModuleResultWithMeta
    const moduleResults: ModuleResultWithMeta[] = settledResults.map(
      (settled, index) => {
        const mod = modules[index];
        if (settled.status === 'fulfilled') {
          return settled.value;
        }
        // Promise.allSettled rejection — should not normally happen since
        // evaluateModule catches internally, but handle as safety net
        return this.buildErrorResult(mod, settled.reason);
      },
    );

    // Merge results using MostRestrictiveWins
    const merged = this.mergeResults(moduleResults);

    // Build per-module detail records for audit trail
    const module_details: ModuleEvalDetail[] = moduleResults.map((mr) => {
      const detail: ModuleEvalDetail = {
        name: mr.name,
        version: mr.version,
        latency_ms: mr.latency_ms,
        action: mr.result.action as string,
        reason_codes: mr.result.reason_codes,
      };
      if (mr.error !== undefined) {
        detail.error = mr.error;
      }
      if (mr.result.metadata !== undefined) {
        detail.metadata = mr.result.metadata;
      }
      return detail;
    });

    return {
      action: merged.action,
      reason_codes: merged.reason_codes,
      module_details,
      latency_ms: Date.now() - stageStart,
    };
  }

  /**
   * Evaluate a single module with timeout enforcement.
   * Catches errors and applies fail-closed/fail-open policy.
   */
  private async evaluateModule(
    mod: TealModule,
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<ModuleResultWithMeta> {
    const start = Date.now();

    try {
      const result = await this.withTimeout(
        mod.evaluate(request, ctx, policy),
        mod.name,
      );
      return {
        name: mod.name,
        version: mod.version,
        latency_ms: Date.now() - start,
        result,
      };
    } catch (error: unknown) {
      const latency_ms = Date.now() - start;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Determine fallback action based on fail-closed policy and stage
      const fallbackAction = this.getErrorFallbackAction();

      return {
        name: mod.name,
        version: mod.version,
        latency_ms,
        result: {
          action: fallbackAction as ModuleResult['action'],
          reason_codes: ['PIPELINE_FAIL_CLOSED'],
          event_type: 'pipeline.module_error',
          metadata: { error: errorMessage, module: mod.name },
        },
        error: errorMessage,
      };
    }
  }

  /**
   * Wrap a module evaluation with timeout enforcement.
   * Races the module's evaluate() against a timer.
   * On timeout, throws ModuleTimeoutError.
   */
  private withTimeout(
    modulePromise: Promise<ModuleResult>,
    moduleName: string,
  ): Promise<ModuleResult> {
    return new Promise<ModuleResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ModuleTimeoutError(moduleName, this.timeoutMs));
      }, this.timeoutMs);

      modulePromise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Merge module results using MostRestrictiveWins strategy.
   *
   * Uses ACTION_SEVERITY map: picks the action with highest severity.
   * - DENY (severity >= 70): Stage blocks
   * - MONITOR (severity 10–60): Stage proceeds with monitoring
   * - ALLOW (severity 0): Stage permits
   *
   * All reason codes from all modules are collected into the merged result.
   */
  private mergeResults(results: ModuleResultWithMeta[]): MergedResult {
    let highestSeverity = 0;
    let mergedAction = 'ALLOW';
    const allReasonCodes: string[] = [];

    for (const moduleResult of results) {
      const action = moduleResult.result.action as string;
      const severity = ACTION_SEVERITY[action] ?? 0;

      if (severity > highestSeverity) {
        highestSeverity = severity;
        mergedAction = action;
      }

      // Collect all reason codes
      allReasonCodes.push(...moduleResult.result.reason_codes);
    }

    // Normalize the merged action to pipeline-level categories:
    // severity >= 70 → use the specific DENY-level action as-is
    // severity 10–60 → normalize to the specific action (MONITOR, DEGRADE, etc.)
    // severity 0 → ALLOW
    // The stage-level decision uses the actual action string for specificity
    // but the pipeline orchestrator interprets the severity category.

    return {
      action: mergedAction,
      reason_codes: allReasonCodes,
    };
  }

  /**
   * Determine the fallback action when a module errors or times out.
   *
   * - fail_closed=true → DENY (for both stages)
   * - fail_closed=false, PRE_EXECUTION → MONITOR
   * - fail_closed=false, POST_EXECUTION → ALLOW (per Req 12.4)
   */
  private getErrorFallbackAction(): string {
    if (this.failClosed) {
      return 'DENY';
    }

    // fail_closed=false: stage-dependent fallback
    if (this.stage === PipelineStage.POST_EXECUTION) {
      return 'ALLOW';
    }

    // PRE_EXECUTION (or EXECUTION, though not typically used here)
    return 'MONITOR';
  }

  /**
   * Build an error result for a module that failed at the Promise.allSettled level.
   * This is a safety net — normally evaluateModule handles errors internally.
   */
  private buildErrorResult(
    mod: TealModule,
    error: unknown,
  ): ModuleResultWithMeta {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const fallbackAction = this.getErrorFallbackAction();

    return {
      name: mod.name,
      version: mod.version,
      latency_ms: 0,
      result: {
        action: fallbackAction as ModuleResult['action'],
        reason_codes: ['PIPELINE_FAIL_CLOSED'],
        event_type: 'pipeline.module_error',
        metadata: { error: errorMessage, module: mod.name },
      },
      error: errorMessage,
    };
  }
}
