/**
 * Multi-Stage Defense Pipeline — RemediationHandler
 *
 * Manages remediation logic for failed post-execution evaluations:
 * action selection (RESAMPLE > REDACT > DENY_RESPONSE), resample loop
 * with budget enforcement, and redaction delegation.
 *
 * @module pipeline/RemediationHandler
 * @requirements 4.4, 4.5, 4.6, 4.7
 */

import type { TealModule, ModuleContext } from '../core/engine/v1.2/types';
import type {
  ModuleEvalDetail,
  PipelineRequest,
  StageDecision,
} from './types';
import { RemediationAction, ACTION_SEVERITY } from './types';

// ── Interfaces ───────────────────────────────────────────────────

/**
 * Interface for the ExecutionStage dependency (used for resample loop).
 * Declared here to avoid circular imports — the actual ExecutionStage
 * class implements this shape.
 */
export interface ExecutionStageInterface {
  execute(request: PipelineRequest): Promise<{ success: boolean; response: any | null; metadata: any | null; error?: { message: string; code?: string } }>;
}

/**
 * Interface for the StageEvaluator dependency (used for post-stage re-evaluation).
 */
export interface StageEvaluatorInterface {
  evaluate(
    modules: TealModule[],
    request: any,
    ctx: ModuleContext,
    policy: unknown,
  ): Promise<{ action: string; reason_codes: string[]; module_details: ModuleEvalDetail[]; latency_ms: number }>;
}

/**
 * Result of a remediation operation.
 */
export interface RemediationResult {
  /** Whether remediation produced a passing response */
  success: boolean;
  /** The response (new from resample, or redacted, or null) */
  response: any | null;
  /** Number of resample attempts made */
  resampleCount: number;
  /** Whether the resample budget was exhausted */
  exhausted: boolean;
  /** The final post-execution stage decision (from last evaluation) */
  finalDecision?: StageDecision;
}

// ── RemediationHandler ───────────────────────────────────────────

/**
 * Handles post-execution remediation when a module reports a policy violation.
 *
 * Action selection priority (from module metadata):
 *   RESAMPLE > REDACT > DENY_RESPONSE (default)
 *
 * Resample loop re-invokes the LLM provider and re-evaluates the post-execution
 * stage until the response passes or the budget is exhausted.
 *
 * Redaction delegates to the module-provided redaction function to strip
 * violating content from the response.
 */
export class RemediationHandler {
  constructor(private readonly resampleBudget: number) {}

  /**
   * Determine the remediation action from module metadata.
   *
   * Scans all module details with a DENY-level action for a `remediation` field
   * in their metadata. Priority order:
   *   1. If any module specifies "resample" → RESAMPLE
   *   2. If any module specifies "redact" → REDACT
   *   3. Otherwise → DENY_RESPONSE (default)
   *
   * @param moduleDetails - Per-module evaluation details from the post-stage
   * @returns The selected RemediationAction
   */
  selectAction(moduleDetails: ModuleEvalDetail[]): RemediationAction {
    let hasRedact = false;

    for (const detail of moduleDetails) {
      // Only consider modules that produced a DENY-level action
      const severity = ACTION_SEVERITY[detail.action] ?? 0;
      if (severity < 70) {
        continue;
      }

      const remediation = detail.metadata?.remediation as string | undefined;
      if (!remediation) {
        continue;
      }

      const normalized = remediation.toLowerCase();

      // RESAMPLE has highest priority — return immediately
      if (normalized === 'resample') {
        return RemediationAction.RESAMPLE;
      }

      if (normalized === 'redact') {
        hasRedact = true;
      }
    }

    if (hasRedact) {
      return RemediationAction.REDACT;
    }

    return RemediationAction.DENY_RESPONSE;
  }

  /**
   * Execute the resample loop: re-invoke the LLM provider and re-evaluate
   * the post-execution stage until the response passes or the budget is exhausted.
   *
   * @param request - The original pipeline request
   * @param executionStage - The execution stage for re-invoking the provider
   * @param postStageEvaluator - The post-execution stage evaluator
   * @param modules - The post-execution modules to evaluate
   * @param ctx - Module evaluation context
   * @param policy - Policy configuration
   * @param currentAttempt - Current attempt count (starts at 0 for first resample)
   * @returns RemediationResult indicating success/failure and attempt count
   */
  async executeResampleLoop(
    request: PipelineRequest,
    executionStage: ExecutionStageInterface,
    postStageEvaluator: StageEvaluatorInterface,
    modules: TealModule[],
    ctx: ModuleContext,
    policy: unknown,
    currentAttempt: number,
  ): Promise<RemediationResult> {
    let attempt = currentAttempt;

    while (attempt < this.resampleBudget) {
      attempt++;

      // Re-invoke provider
      const executionResult = await executionStage.execute(request);

      if (!executionResult.success || executionResult.response == null) {
        // Provider error during resample — count as failed attempt
        continue;
      }

      // Re-evaluate post-execution stage on the new response
      const evaluationRequest = {
        content: typeof executionResult.response === 'string'
          ? executionResult.response
          : JSON.stringify(executionResult.response),
        ...request.payload,
        _response: executionResult.response,
      };

      const evalResult = await postStageEvaluator.evaluate(
        modules,
        evaluationRequest,
        ctx,
        policy,
      );

      // Check if the new response passes (merged action is not DENY-level)
      const severity = ACTION_SEVERITY[evalResult.action] ?? 0;
      if (severity < 70) {
        // Response passed — return success
        return {
          success: true,
          response: executionResult.response,
          resampleCount: attempt,
          exhausted: false,
        };
      }

      // Still DENY — continue loop if budget allows
    }

    // Budget exhausted
    return {
      success: false,
      response: null,
      resampleCount: attempt,
      exhausted: true,
    };
  }

  /**
   * Apply redaction via module-provided redaction functions.
   *
   * Searches module details for modules that have a `redact` or `redaction_fn`
   * function in their metadata. Calls the redaction function with the response
   * and returns the redacted result.
   *
   * @param response - The LLM response to redact
   * @param moduleDetails - Per-module evaluation details (may contain redaction functions)
   * @returns The redacted response, or the original response if no redaction function is found
   */
  async applyRedaction(
    response: any,
    moduleDetails: ModuleEvalDetail[],
  ): Promise<any> {
    let redactedResponse = response;

    for (const detail of moduleDetails) {
      // Only consider modules with DENY-level actions
      const severity = ACTION_SEVERITY[detail.action] ?? 0;
      if (severity < 70) {
        continue;
      }

      const metadata = detail.metadata;
      if (!metadata) {
        continue;
      }

      // Look for a redaction function in metadata
      const redactionFn = (metadata.redact ?? metadata.redaction_fn) as
        | ((resp: any) => any | Promise<any>)
        | undefined;

      if (typeof redactionFn === 'function') {
        redactedResponse = await redactionFn(redactedResponse);
      }
    }

    return redactedResponse;
  }
}
