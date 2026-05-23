/**
 * TealEngine v1.3 — Governance Bundle Engine
 *
 * Extends TealEngineV12 with pre-evaluation and post-evaluation hook stages.
 * When no v1.3-specific features are configured, behavior is identical to v1.2.
 *
 * Pre-evaluation stage (sequential, short-circuit on deny):
 *   1. FREEZE rule check → FREEZE_BLOCK
 *   2. PLAN_ONLY mode check → PLAN_ONLY_BLOCK
 *   3. NHI status validation → NHI_REVOKED, NHI_SUSPENDED
 *   4. Agent attestation check → AGENT_ATTESTATION_MISSING, AGENT_INTEGRITY_FAILED
 *   5. ZSP grant check → ACCESS_STANDING_PRIVILEGE_DENIED, ACCESS_GRANT_EXPIRED
 *   6. NHI scope/environment check → NHI_SCOPE_VIOLATION, NHI_ENVIRONMENT_VIOLATION
 *
 * If none short-circuit, proceeds to the v1.2 parallel module evaluation pipeline.
 *
 * @module core/engine/v1.3/TealEngineV13
 */

import { TealEngineV12 } from '../v1.2/TealEngineV12';
import { DecisionAction, PolicyMode } from '../types';
import type { Decision } from '../v1.2/types';
import type {
  TealEngineV13Options,
  GovernanceRequest,
  GovernanceContext,
  DecisionV13,
  FreezeRule,
  NHIInventory,
  ZSPConfig,
  AttestationConfig,
  PlanOnlyConfig,
} from './types';
import type { PreEvalDenyResult } from './evaluators';
import {
  evaluateFreezeRules,
  evaluatePlanOnly,
  evaluateNHIStatus,
  evaluateAttestation,
  evaluateZSP,
  evaluateNHIScopeAndEnvironment,
} from './evaluators';

// ── v1.3 Reason Codes ─────────────────────────────────────────────

import { V13ReasonCode } from './types';
export { V13ReasonCode };

// ── Default PLAN_ONLY side-effecting action classes ──────────────

const DEFAULT_SIDE_EFFECTING_ACTIONS = [
  'CODE_CHANGE',
  'DATABASE_WRITE',
  'INFRASTRUCTURE_MUTATION',
  'PRODUCTION_DEPLOY',
  'SECRETS_REVEAL',
  'CODE_MERGE',
  'TOOL_INVOKE',
  'MEMORY_WRITE',
  'FILE_WRITE',
  'API_MUTATION',
];

const DEFAULT_ALLOWED_ACTIONS = [
  'READ',
  'REASONING',
  'PLAN',
  'QUERY',
  'SEARCH',
  'ANALYZE',
  'SUMMARIZE',
];

// ── Event types ──────────────────────────────────────────────────

export interface GovernanceEvent {
  type: string;
  timestamp: number;
  details: Record<string, unknown>;
}

export type GovernanceEventListener = (event: GovernanceEvent) => void;

// ── TealEngineV13 ────────────────────────────────────────────────

export class TealEngineV13 extends TealEngineV12 {
  private readonly freezeRules: ReadonlyArray<FreezeRule>;
  private readonly planOnlyMode: boolean;
  private readonly planOnlyConfig: PlanOnlyConfig;
  private readonly nhiInventory: NHIInventory | undefined;
  private readonly zspConfig: ZSPConfig | undefined;
  private readonly attestationConfig: AttestationConfig | undefined;
  private readonly eventListeners: GovernanceEventListener[] = [];

  constructor(options: TealEngineV13Options) {
    // Pass v1.2-compatible options to the parent
    super(options);

    // Deep-freeze the FREEZE rules — they are immutable at runtime
    this.freezeRules = Object.freeze(
      (options.freeze_rules ?? []).map((rule) => Object.freeze({ ...rule })),
    );

    this.planOnlyMode = options.plan_only_mode ?? false;
    this.planOnlyConfig = options.plan_only_config ?? {
      enabled: options.plan_only_mode ?? false,
      side_effecting_actions: DEFAULT_SIDE_EFFECTING_ACTIONS,
      allowed_actions: DEFAULT_ALLOWED_ACTIONS,
    };

    this.nhiInventory = options.nhi_inventory;
    this.zspConfig = options.zsp_config;
    this.attestationConfig = options.attestation_config;
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * v1.3 evaluation entry point.
   * Wraps the v1.2 pipeline with pre-evaluation and post-evaluation stages.
   *
   * When no v1.3 features are configured, this delegates directly to evaluateV12()
   * producing identical behavior to v1.2.
   */
  async evaluate(
    request: GovernanceRequest,
    ctx: Partial<GovernanceContext> & { correlation_id: string },
  ): Promise<DecisionV13> {
    // ── Pre-evaluation stage (sequential, short-circuit on deny) ──

    // 1. FREEZE rule check
    const freezeResult = evaluateFreezeRules(request, this.freezeRules);
    if (freezeResult) {
      return this.buildPreEvalDenyDecision(freezeResult, request) as DecisionV13;
    }

    // 2. PLAN_ONLY mode check
    const planOnlyResult = evaluatePlanOnly(request, this.planOnlyMode, this.planOnlyConfig);
    if (planOnlyResult) {
      return this.buildPreEvalDenyDecision(planOnlyResult, request) as DecisionV13;
    }

    // 3. NHI status validation (revoked/suspended)
    const nhiStatusResult = evaluateNHIStatus(request, this.nhiInventory);
    if (nhiStatusResult) {
      return this.buildPreEvalDenyDecision(nhiStatusResult, request) as DecisionV13;
    }

    // 4. Agent attestation check
    const attestationResult = evaluateAttestation(request, this.attestationConfig);
    if (attestationResult) {
      return this.buildPreEvalDenyDecision(attestationResult, request) as DecisionV13;
    }

    // 5. ZSP grant check
    const zspResult = evaluateZSP(request, this.zspConfig);
    if (zspResult) {
      return this.buildPreEvalDenyDecision(zspResult, request) as DecisionV13;
    }

    // 6. NHI scope/environment check
    const nhiScopeResult = evaluateNHIScopeAndEnvironment(request, ctx);
    if (nhiScopeResult) {
      return this.buildPreEvalDenyDecision(nhiScopeResult, request) as DecisionV13;
    }

    // ── Proceed to v1.2 parallel module evaluation pipeline ──

    const v12Decision = await this.evaluateV12(request as Record<string, unknown>, ctx);

    // Extend with v1.3 context if NHI identity is present
    const decision: DecisionV13 = { ...v12Decision };
    if (request.nhi_identity) {
      decision.nhi_context = {
        agent_id: request.nhi_identity.agent_id,
        scope_used: request.nhi_identity.capability_scope,
      };
    }

    return decision;
  }

  /**
   * Register an event listener for governance events.
   * Used for observing FREEZE_TAMPER_ATTEMPT and other security events.
   */
  onEvent(listener: GovernanceEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Get the currently active FREEZE rules (read-only).
   */
  getFreezeRules(): ReadonlyArray<FreezeRule> {
    return this.freezeRules;
  }

  /**
   * Attempt to modify FREEZE rules at runtime.
   * This is ALWAYS rejected — FREEZE rules are immutable.
   * Logs a FREEZE_TAMPER_ATTEMPT event.
   */
  modifyFreezeRules(_rules: FreezeRule[]): void {
    this.emitEvent({
      type: V13ReasonCode.FREEZE_TAMPER_ATTEMPT,
      timestamp: Date.now(),
      details: {
        message: 'Attempted to modify FREEZE rules at runtime. Operation rejected.',
        attempted_rules: _rules.map((r) => r.id),
      },
    });
  }

  /**
   * Attempt to remove a FREEZE rule at runtime.
   * This is ALWAYS rejected — FREEZE rules are immutable.
   * Logs a FREEZE_TAMPER_ATTEMPT event.
   */
  removeFreezeRule(ruleId: string): void {
    this.emitEvent({
      type: V13ReasonCode.FREEZE_TAMPER_ATTEMPT,
      timestamp: Date.now(),
      details: {
        message: 'Attempted to remove a FREEZE rule at runtime. Operation rejected.',
        rule_id: ruleId,
      },
    });
  }

  /**
   * Attempt to disable a FREEZE rule at runtime.
   * This is ALWAYS rejected — FREEZE rules are immutable.
   * Logs a FREEZE_TAMPER_ATTEMPT event.
   */
  disableFreezeRule(ruleId: string): void {
    this.emitEvent({
      type: V13ReasonCode.FREEZE_TAMPER_ATTEMPT,
      timestamp: Date.now(),
      details: {
        message: 'Attempted to disable a FREEZE rule at runtime. Operation rejected.',
        rule_id: ruleId,
      },
    });
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Build a pre-evaluation DENY decision with v1.3 metadata.
   */
  private buildPreEvalDenyDecision(
    result: PreEvalDenyResult,
    request: GovernanceRequest,
  ): Decision {
    const correlationId = (request as Record<string, unknown>).correlation_id as string ?? 'unknown';

    return {
      action: DecisionAction.DENY,
      reason_codes: [result.reason_code] as any,
      risk_score: 100,
      mode: PolicyMode.ENFORCE,
      policy_id: 'v1.3-governance',
      policy_version: '1.3.0',
      component_versions: { sdk: '1.3.0', engine: '1.3.0' },
      correlation_id: correlationId,
      reason: result.reason,
      event_type: 'governance.pre_evaluation_deny',
      teec_version: '2.0.0',
      timestamp: Date.now(),
      module: 'TealEngineV13',
      metadata: {
        pre_evaluation_stage: true,
        reason_code: result.reason_code,
        ...result.metadata,
      },
    };
  }

  /**
   * Emit a governance event to all registered listeners.
   */
  private emitEvent(event: GovernanceEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Event listeners should not break the engine
      }
    }
  }
}
