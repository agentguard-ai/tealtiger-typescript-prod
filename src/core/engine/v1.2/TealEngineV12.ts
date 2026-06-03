/**
 * TealEngine v1.2 — Orchestration Layer
 *
 * New evaluation pipeline that dispatches to all active modules in PARALLEL
 * (Promise.allSettled), merges results using "most restrictive action wins",
 * and applies fail-closed defaults on any module failure.
 *
 * This is a NEW class — it does NOT replace or extend the v1.1 TealEngine.
 *
 * @module core/engine/v1.2/TealEngineV12
 */

import { ModuleRegistry } from './ModuleRegistry';
import { TEECValidator } from './TEECValidator';
import { TEECRegistryLoader } from './TEECRegistryLoader';
import { TealConfigError } from './errors';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  Decision,
  TEECRegistry,
  SecretFinding,
} from './types';
import {
  DecisionAction,
  ReasonCode,
  PolicyMode,
  type ComponentVersions,
} from '../types';
import type {
  TealSpanLike,
  TealTelemetry,
} from '../../../observability/TealOTelPlugin';

// ── Action severity for "most restrictive wins" merge ────────────

const ACTION_SEVERITY: Record<string, number> = {
  DENY: 100,
  DENY_WRITE: 100,
  DENY_READ: 100,
  REQUIRE_APPROVAL: 80,
  REDACT: 70,
  REDACT_AND_WRITE: 70,
  DEGRADE: 60,
  STORE_SUMMARY_ONLY: 60,
  TRANSFORM: 50,
  ALLOW_WRITE: 0,
  ALLOW: 0,
};

// ── Interfaces ───────────────────────────────────────────────────

export interface FailurePolicyConfig {
  default: 'FAIL_CLOSED' | 'FAIL_OPEN';
  memory_adapter_unavailable?: { action: string };
  evidence_sink_unavailable?: { action: string };
  bundle_fetch_failed?: { action: string; allow_cached_bundle?: boolean };
  sarif_export_failed?: { action: string; emit_evidence?: boolean };
}

export interface TealEngineV12Options {
  modules?: TealModule[];
  policy: Record<string, unknown>;
  mode?: PolicyMode;
  failurePolicy?: FailurePolicyConfig;
}

// ── TealEngineV12 ────────────────────────────────────────────────

export class TealEngineV12 {
  private readonly moduleRegistry: ModuleRegistry;
  private readonly teecRegistry: TEECRegistry;
  private readonly teecValidator: TEECValidator;
  private readonly policy: Record<string, unknown>;
  private readonly mode: PolicyMode;
  private readonly failurePolicy: FailurePolicyConfig;
  private readonly componentVersions: ComponentVersions;

  constructor(options: TealEngineV12Options) {
    this.moduleRegistry = new ModuleRegistry();
    this.teecRegistry = TEECRegistryLoader.loadEmbedded();
    this.teecValidator = new TEECValidator(this.teecRegistry);
    this.policy = options.policy;
    this.mode = options.mode ?? PolicyMode.ENFORCE;
    this.failurePolicy = options.failurePolicy ?? { default: 'FAIL_CLOSED' };
    this.componentVersions = { sdk: '1.2.0', engine: '1.2.0' };

    for (const mod of options.modules ?? []) {
      this.moduleRegistry.register(mod);
    }
  }

  /**
   * v1.2 evaluation pipeline:
   * 1. Resolve active modules from policy
   * 2. Validate all required modules are registered
   * 3. Lazy-init modules that haven't been initialized
   * 4. Dispatch to all active modules in PARALLEL (Promise.allSettled)
   * 5. Handle module failures (fail-closed)
   * 6. Merge results (most restrictive action wins)
   * 7. Build and validate Decision via TEEC
   */
  async evaluateV12(
    request: Record<string, unknown>,
    ctx: Partial<ModuleContext> & { correlation_id: string },
  ): Promise<Decision> {
    const startTime = Date.now();
    const fullCtx: ModuleContext = {
      correlation_id: ctx.correlation_id,
      policy_version: '1.2.0',
      teec_version: '0.1.0',
      timestamp: startTime,
      ...(ctx.trace_id !== undefined && { trace_id: ctx.trace_id }),
      ...(ctx.span_id !== undefined && { span_id: ctx.span_id }),
      ...(ctx.parent_span_id !== undefined && { parent_span_id: ctx.parent_span_id }),
      ...(ctx.baggage !== undefined && { baggage: ctx.baggage }),
      ...(ctx.tenant_id !== undefined && { tenant_id: ctx.tenant_id }),
      ...(ctx.user_id !== undefined && { user_id: ctx.user_id }),
      ...(ctx.session_id !== undefined && { session_id: ctx.session_id }),
      ...(ctx.agent_id !== undefined && { agent_id: ctx.agent_id }),
    };

    // 1. Resolve which modules are needed
    const requiredModules = this.moduleRegistry.getRequiredModules(this.policy);

    // 2. Check for missing modules — fail with TealConfigError
    for (const name of requiredModules) {
      if (!this.moduleRegistry.isRegistered(name)) {
        throw new TealConfigError(
          `Policy references module '${name}' but it is not registered. Install the corresponding package.`,
          'MODULE_NOT_REGISTERED',
          { config_key: name, module: name },
        );
      }
    }

    // 3. Lazy-init modules that haven't been initialized
    for (const name of requiredModules) {
      if (!this.moduleRegistry.isInitialized(name)) {
        await this.moduleRegistry.initModule(name, this.getModuleConfig(name));
      }
    }

    const telemetry = this.getTelemetry();
    const evaluationSpan = telemetry?.startSpan(
      'tealtiger.governance.evaluate',
      {
        'policy.version': fullCtx.policy_version,
        'modules.required': requiredModules,
      },
      fullCtx,
    );

    // 4. Dispatch to all active modules in PARALLEL
    const modulePromises = requiredModules.map(async (name) => {
      const mod = this.moduleRegistry.get(name)!;
      const moduleSpan = telemetry?.startSpan(
        'tealtiger.module.evaluate',
        { 'module.name': name, 'module.version': mod.version },
        fullCtx,
      );
      try {
        const result = await mod.evaluate(request, fullCtx, this.policy);
        telemetry?.endSpan(moduleSpan, { 'decision.action': String(result.action) });
        return { name, result, error: null as Error | null };
      } catch (err) {
        telemetry?.failSpan(moduleSpan, err);
        return { name, result: null as ModuleResult | null, error: err as Error };
      }
    });

    const settled = await Promise.allSettled(modulePromises);
    const moduleResults: Array<{
      name: string;
      result: ModuleResult | null;
      error: Error | null;
    }> = [];

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        moduleResults.push(s.value);
      } else {
        moduleResults.push({ name: 'unknown', result: null, error: s.reason });
      }
    }

    // 5. Handle module failures (fail-closed by default)
    const failedModules = moduleResults.filter((r) => r.error !== null);
    const successModules = moduleResults.filter((r) => r.result !== null);

    if (failedModules.length > 0 && this.failurePolicy.default === 'FAIL_CLOSED') {
      const failReasons = failedModules.map((f) => f.name).join(', ');
      const decision = this.buildDecision({
        action: DecisionAction.DENY,
        reason_codes: [ReasonCode.POLICY_VIOLATION],
        event_type: 'governance.module_failure',
        correlation_id: fullCtx.correlation_id,
        reason: `Module(s) failed: ${failReasons}. Fail-closed default applied.`,
        startTime,
        metadata: {
          failed_modules: failedModules.map((f) => ({
            name: f.name,
            error: f.error?.message,
          })),
        },
      });
      return this.endEvaluationSpan(telemetry, evaluationSpan, decision);
    }

    // 6. No active modules → ALLOW
    if (successModules.length === 0 && failedModules.length === 0) {
      const decision = this.buildDecision({
        action: DecisionAction.ALLOW,
        reason_codes: [ReasonCode.POLICY_COMPLIANT],
        event_type: 'policy.evaluation',
        correlation_id: fullCtx.correlation_id,
        reason: 'No active governance modules for this request',
        startTime,
      });
      return this.endEvaluationSpan(telemetry, evaluationSpan, decision);
    }

    // 7. Merge results — most restrictive action wins
    const merged = this.mergeResults(successModules.map((r) => r.result!));

    // 8. Build Decision
    const decision = this.buildDecision({
      action: merged.action as DecisionAction,
      reason_codes: merged.reason_codes as ReasonCode[],
      event_type: merged.event_type,
      correlation_id: fullCtx.correlation_id,
      reason: this.buildReason(merged),
      startTime,
      ...(merged.findings && { findings: merged.findings }),
      metadata: {
        ...merged.metadata,
        modules_evaluated: successModules.map((r) => r.name),
        modules_failed: failedModules.map((r) => r.name),
        evaluation_time_ms: Date.now() - startTime,
      },
    });

    // 9. TEEC validation (non-blocking — warnings only)
    const validationResults = this.teecValidator.validateDecision(decision);
    const invalid = validationResults.filter((r) => !r.valid);
    if (invalid.length > 0) {
      (decision.metadata as Record<string, unknown>).teec_warnings = invalid;
    }

    return this.endEvaluationSpan(telemetry, evaluationSpan, decision);
  }

  /** Get module registration/init status */
  getModuleStatus() {
    return this.moduleRegistry.getStatus();
  }

  /** Get the TEEC registry */
  getTEECRegistry() {
    return this.teecRegistry;
  }

  /** Get the TEEC validator */
  getTEECValidator() {
    return this.teecValidator;
  }

  private getTelemetry(): TealTelemetry | undefined {
    const module = this.moduleRegistry.get('tealotel') as
      | (TealModule & Partial<TealTelemetry>)
      | undefined;
    if (
      module &&
      typeof module.startSpan === 'function' &&
      typeof module.endSpan === 'function' &&
      typeof module.failSpan === 'function'
    ) {
      return module as TealModule & TealTelemetry;
    }
    return undefined;
  }

  private getModuleConfig(name: string): unknown {
    if (name === 'tealotel') {
      return this.policy.telemetry ?? this.policy[name] ?? {};
    }
    return this.policy[name] ?? {};
  }

  private endEvaluationSpan(
    telemetry: TealTelemetry | undefined,
    span: TealSpanLike | undefined,
    decision: Decision,
  ): Decision {
    telemetry?.endSpan(span, {
      'decision.action': decision.action,
      'decision.risk_score': decision.risk_score,
      reason_codes: decision.reason_codes,
    });
    return decision;
  }

  // ── Merge Logic ──────────────────────────────────────────────

  private mergeResults(results: ModuleResult[]): ModuleResult {
    let maxSeverity = -1;
    let winningAction: string = DecisionAction.ALLOW;
    let winningEventType = 'policy.evaluation';

    const allReasonCodes = new Set<string>();
    const allFindings: SecretFinding[] = [];
    const allMetadata: Record<string, unknown> = {};

    for (const r of results) {
      const severity = ACTION_SEVERITY[r.action] ?? 0;
      if (severity > maxSeverity) {
        maxSeverity = severity;
        winningAction = r.action;
        winningEventType = r.event_type;
      }

      for (const code of r.reason_codes) {
        allReasonCodes.add(code);
      }

      if (r.findings) {
        allFindings.push(...r.findings);
      }

      if (r.metadata) {
        Object.assign(allMetadata, r.metadata);
      }
    }

    const result: ModuleResult = {
      action: winningAction as ModuleResult['action'],
      reason_codes: Array.from(allReasonCodes),
      event_type: winningEventType,
      metadata: allMetadata,
    };

    if (allFindings.length > 0) {
      result.findings = allFindings;
    }

    return result;
  }

  private buildReason(merged: ModuleResult): string {
    if (
      merged.action === DecisionAction.ALLOW ||
      merged.action === DecisionAction.ALLOW_WRITE
    ) {
      return 'Request allowed — all governance checks passed';
    }
    return `Governance action: ${merged.action}. Reason codes: ${merged.reason_codes.join(', ')}`;
  }

  private buildDecision(params: {
    action: DecisionAction | string;
    reason_codes: (ReasonCode | string)[];
    event_type: string;
    correlation_id: string;
    reason: string;
    startTime: number;
    findings?: SecretFinding[];
    metadata?: Record<string, unknown>;
  }): Decision {
    const decision: Decision = {
      action: params.action as DecisionAction,
      reason_codes: params.reason_codes as ReasonCode[],
      risk_score: this.computeRiskScore(params.action as string),
      mode: this.mode,
      policy_id: 'v1.2-governance',
      policy_version: '1.2.0',
      component_versions: this.componentVersions,
      correlation_id: params.correlation_id,
      reason: params.reason,
      event_type: params.event_type,
      teec_version: '0.1.0',
      timestamp: Date.now(),
      module: 'TealEngineV12',
      metadata: {
        evaluation_time_ms: Date.now() - params.startTime,
        ...params.metadata,
      },
    };

    if (params.findings && params.findings.length > 0) {
      decision.findings = params.findings;
    }

    return decision;
  }

  private computeRiskScore(action: string): number {
    return ACTION_SEVERITY[action] ?? 0;
  }
}
