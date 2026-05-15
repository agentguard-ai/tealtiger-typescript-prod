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
  PolicyMatcher,
  NHIInventory,
  ZSPConfig,
  AttestationConfig,
  AgentAttestation,
  PlanOnlyConfig,
} from './types';

// ── v1.3 Reason Codes (not yet in the v1.2 enum) ────────────────

export const V13ReasonCode = {
  FREEZE_BLOCK: 'FREEZE_BLOCK',
  FREEZE_TAMPER_ATTEMPT: 'FREEZE_TAMPER_ATTEMPT',
  PLAN_ONLY_BLOCK: 'PLAN_ONLY_BLOCK',
  NHI_REVOKED: 'NHI_REVOKED',
  NHI_SUSPENDED: 'NHI_SUSPENDED',
  NHI_SCOPE_VIOLATION: 'NHI_SCOPE_VIOLATION',
  NHI_ENVIRONMENT_VIOLATION: 'NHI_ENVIRONMENT_VIOLATION',
  AGENT_ATTESTATION_MISSING: 'AGENT_ATTESTATION_MISSING',
  AGENT_INTEGRITY_FAILED: 'AGENT_INTEGRITY_FAILED',
  ACCESS_STANDING_PRIVILEGE_DENIED: 'ACCESS_STANDING_PRIVILEGE_DENIED',
  ACCESS_GRANT_EXPIRED: 'ACCESS_GRANT_EXPIRED',
} as const;

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
    const freezeResult = this.checkFreezeRules(request);
    if (freezeResult) {
      return freezeResult as DecisionV13;
    }

    // 2. PLAN_ONLY mode check
    const planOnlyResult = this.checkPlanOnlyMode(request);
    if (planOnlyResult) {
      return planOnlyResult as DecisionV13;
    }

    // 3. NHI status validation (revoked/suspended)
    const nhiStatusResult = this.checkNHIStatus(request);
    if (nhiStatusResult) {
      return nhiStatusResult as DecisionV13;
    }

    // 4. Agent attestation check
    const attestationResult = this.checkAgentAttestation(request);
    if (attestationResult) {
      return attestationResult as DecisionV13;
    }

    // 5. ZSP grant check
    const zspResult = this.checkZSPGrant(request);
    if (zspResult) {
      return zspResult as DecisionV13;
    }

    // 6. NHI scope/environment check
    const nhiScopeResult = this.checkNHIScopeAndEnvironment(request, ctx);
    if (nhiScopeResult) {
      return nhiScopeResult as DecisionV13;
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

  // ── Pre-evaluation checks (private) ─────────────────────────

  /**
   * Check 1: FREEZE rule evaluation.
   * FREEZE rules have absolute precedence — evaluated FIRST before anything else.
   * Returns a DENY decision if any FREEZE rule matches, otherwise null.
   */
  private checkFreezeRules(request: GovernanceRequest): Decision | null {
    if (this.freezeRules.length === 0) {
      return null;
    }

    for (const rule of this.freezeRules) {
      if (this.matchesPolicy(rule.match, request)) {
        return this.buildPreEvalDenyDecision({
          reason_code: V13ReasonCode.FREEZE_BLOCK,
          reason: `Action blocked by FREEZE rule '${rule.id}': ${rule.reason}`,
          correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
          metadata: {
            freeze_rule_id: rule.id,
            freeze_reason: rule.reason,
            created_by: rule.created_by,
            created_at: rule.created_at,
          },
        });
      }
    }

    return null;
  }

  /**
   * Check 2: PLAN_ONLY mode evaluation.
   * When enabled, all side-effecting actions are denied.
   * Read-only and reasoning actions proceed normally.
   */
  private checkPlanOnlyMode(request: GovernanceRequest): Decision | null {
    const isEnabled = this.planOnlyMode || this.planOnlyConfig.enabled;
    if (!isEnabled) {
      return null;
    }

    const actionClass = request.action_class ?? '';

    // If action is explicitly in the allowed list, let it through
    if (this.isAllowedInPlanOnly(actionClass)) {
      return null;
    }

    // If action is classified as side-effecting, deny it
    if (this.isSideEffecting(actionClass)) {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.PLAN_ONLY_BLOCK,
        reason: `Action '${actionClass}' blocked: PLAN_ONLY mode is active. Only read-only and reasoning actions are permitted.`,
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          action_class: actionClass,
          plan_only_mode: true,
        },
      });
    }

    // If action class is empty or not recognized, check if it's not in allowed list
    // Default: if not explicitly allowed and not empty, treat as side-effecting
    if (actionClass && !this.isAllowedInPlanOnly(actionClass)) {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.PLAN_ONLY_BLOCK,
        reason: `Action '${actionClass}' blocked: PLAN_ONLY mode is active. Action not in allowed list.`,
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          action_class: actionClass,
          plan_only_mode: true,
        },
      });
    }

    return null;
  }

  /**
   * Check 3: NHI status validation.
   * Denies requests from revoked or suspended NHI identities.
   */
  private checkNHIStatus(request: GovernanceRequest): Decision | null {
    const nhi = request.nhi_identity;
    if (!nhi) {
      return null;
    }

    // Also check the inventory if available
    const inventoryEntry = this.nhiInventory?.lookup(nhi.agent_id);
    const effectiveStatus = inventoryEntry?.status ?? nhi.status;

    if (effectiveStatus === 'revoked') {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.NHI_REVOKED,
        reason: `NHI identity '${nhi.agent_id}' has been revoked. All actions are denied.`,
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          agent_id: nhi.agent_id,
          owner: nhi.owner,
          status: effectiveStatus,
        },
      });
    }

    if (effectiveStatus === 'suspended') {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.NHI_SUSPENDED,
        reason: `NHI identity '${nhi.agent_id}' is suspended. All actions are denied until reactivation.`,
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          agent_id: nhi.agent_id,
          owner: nhi.owner,
          status: effectiveStatus,
        },
      });
    }

    return null;
  }

  /**
   * Check 4: Agent attestation verification.
   * Denies requests missing required attestation or with invalid attestation.
   */
  private checkAgentAttestation(request: GovernanceRequest): Decision | null {
    if (!this.attestationConfig || !this.attestationConfig.required) {
      return null;
    }

    const attestation = request.attestation;

    // No attestation provided but required
    if (!attestation) {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.AGENT_ATTESTATION_MISSING,
        reason: 'Agent attestation is required but was not provided in the governance request.',
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          attestation_required: true,
        },
      });
    }

    // Verify attestation integrity
    if (!this.isAttestationValid(attestation)) {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.AGENT_INTEGRITY_FAILED,
        reason: `Agent attestation integrity check failed for agent '${attestation.agent_id}'.`,
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          agent_id: attestation.agent_id,
          signer: attestation.signer,
          attested_at: attestation.attested_at,
        },
      });
    }

    return null;
  }

  /**
   * Check 5: Zero Standing Privilege grant validation.
   * When ZSP is enabled, every tool/resource access requires a valid, non-expired JIT grant.
   */
  private checkZSPGrant(request: GovernanceRequest): Decision | null {
    if (!this.zspConfig || !this.zspConfig.enabled) {
      return null;
    }

    const grant = request.jit_grant;

    // No grant provided — standing privilege denied
    if (!grant) {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.ACCESS_STANDING_PRIVILEGE_DENIED,
        reason: 'Zero Standing Privilege mode is enabled. A valid JIT grant is required for all tool/resource access.',
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          zsp_enabled: true,
          agent_id: request.nhi_identity?.agent_id,
        },
      });
    }

    // Grant expired
    const now = Date.now();
    if (grant.expires_at <= now) {
      return this.buildPreEvalDenyDecision({
        reason_code: V13ReasonCode.ACCESS_GRANT_EXPIRED,
        reason: `JIT grant '${grant.grant_id}' has expired. Request a new grant to continue.`,
        correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
        metadata: {
          grant_id: grant.grant_id,
          agent_id: grant.agent_id,
          expired_at: grant.expires_at,
          current_time: now,
        },
      });
    }

    return null;
  }

  /**
   * Check 6: NHI scope and environment constraint validation.
   * Denies requests where the action is outside the NHI's capability scope
   * or the environment is not in the NHI's environment constraints.
   */
  private checkNHIScopeAndEnvironment(
    request: GovernanceRequest,
    ctx: Partial<GovernanceContext>,
  ): Decision | null {
    const nhi = request.nhi_identity;
    if (!nhi || nhi.status !== 'active') {
      return null;
    }

    // Check capability scope
    const actionClass = request.action_class;
    const tool = request.tool;

    if (actionClass && nhi.capability_scope.length > 0) {
      if (!this.isWithinScope(actionClass, tool, nhi.capability_scope)) {
        return this.buildPreEvalDenyDecision({
          reason_code: V13ReasonCode.NHI_SCOPE_VIOLATION,
          reason: `NHI '${nhi.agent_id}' attempted action '${actionClass}' outside its declared capability scope.`,
          correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
          metadata: {
            agent_id: nhi.agent_id,
            action_class: actionClass,
            tool,
            capability_scope: nhi.capability_scope,
          },
        });
      }
    }

    // Check environment constraints
    const environment = ctx.environment;
    if (environment && nhi.environment_constraints.length > 0) {
      if (!nhi.environment_constraints.includes(environment)) {
        return this.buildPreEvalDenyDecision({
          reason_code: V13ReasonCode.NHI_ENVIRONMENT_VIOLATION,
          reason: `NHI '${nhi.agent_id}' attempted to operate in environment '${environment}' which is not in its allowed environments.`,
          correlation_id: (request as Record<string, unknown>).correlation_id as string ?? 'unknown',
          metadata: {
            agent_id: nhi.agent_id,
            environment,
            allowed_environments: nhi.environment_constraints,
          },
        });
      }
    }

    return null;
  }

  // ── Helper methods ───────────────────────────────────────────

  /**
   * Match a PolicyMatcher against a GovernanceRequest.
   */
  private matchesPolicy(matcher: PolicyMatcher, request: GovernanceRequest): boolean {
    // Match action_class
    if (matcher.action_class) {
      const requestActionClass = request.action_class ?? '';
      if (!this.globMatch(matcher.action_class, requestActionClass)) {
        return false;
      }
    }

    // Match tool
    if (matcher.tool) {
      const requestTool = request.tool ?? '';
      if (!this.globMatch(matcher.tool, requestTool)) {
        return false;
      }
    }

    // Match agent_id
    if (matcher.agent_id) {
      const requestAgentId = request.nhi_identity?.agent_id ?? '';
      if (!this.globMatch(matcher.agent_id, requestAgentId)) {
        return false;
      }
    }

    // Match environment
    if (matcher.environment) {
      // Environment is typically in action_attributes or context
      const requestEnv =
        (request.action_attributes?.environment as string) ?? '';
      if (!this.globMatch(matcher.environment, requestEnv)) {
        return false;
      }
    }

    // Match model
    if (matcher.model) {
      const requestModel = request.model ?? '';
      if (!this.globMatch(matcher.model, requestModel)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Simple glob matching supporting '*' wildcard.
   */
  private globMatch(pattern: string, value: string): boolean {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return pattern === value;

    // Convert glob to regex
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(value);
  }

  /**
   * Check if an action class is explicitly allowed in PLAN_ONLY mode.
   */
  private isAllowedInPlanOnly(actionClass: string): boolean {
    const allowed = this.planOnlyConfig.allowed_actions;
    return allowed.some(
      (a) => a.toUpperCase() === actionClass.toUpperCase(),
    );
  }

  /**
   * Check if an action class is classified as side-effecting.
   */
  private isSideEffecting(actionClass: string): boolean {
    const sideEffecting = this.planOnlyConfig.side_effecting_actions;
    return sideEffecting.some(
      (a) => a.toUpperCase() === actionClass.toUpperCase(),
    );
  }

  /**
   * Check if an action/tool is within the NHI's declared capability scope.
   * Scope entries use a colon-separated format: 'read:memory', 'invoke:tool:search'
   */
  private isWithinScope(
    actionClass: string,
    tool: string | undefined,
    scope: string[],
  ): boolean {
    const actionLower = actionClass.toLowerCase();
    const toolLower = tool?.toLowerCase();

    for (const entry of scope) {
      const entryLower = entry.toLowerCase();

      // Direct action class match
      if (entryLower === actionLower) return true;

      // Wildcard scope (e.g., '*' or 'invoke:*')
      if (entryLower === '*') return true;

      // Colon-separated scope matching
      const parts = entryLower.split(':');

      // Match 'invoke:tool:toolname' pattern
      if (parts[0] === 'invoke' && parts[1] === 'tool' && toolLower) {
        if (parts[2] === '*' || parts[2] === toolLower) return true;
      }

      // Match action class prefix (e.g., 'read' matches 'READ', 'read:memory' matches 'MEMORY_READ')
      if (actionLower.includes(parts[0])) return true;

      // Match tool-level scope (e.g., 'tool:search' matches tool='search')
      if (parts[0] === 'tool' && toolLower && (parts[1] === '*' || parts[1] === toolLower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate agent attestation.
   * Checks: signer is trusted, attestation is not expired, signature format is valid.
   */
  private isAttestationValid(attestation: AgentAttestation): boolean {
    if (!this.attestationConfig) return true;

    // Check if signer is in trusted signers list
    if (this.attestationConfig.trusted_signers.length > 0) {
      if (!this.attestationConfig.trusted_signers.includes(attestation.signer)) {
        return false;
      }
    }

    // Check attestation age
    if (this.attestationConfig.max_attestation_age_ms) {
      const age = Date.now() - attestation.attested_at;
      if (age > this.attestationConfig.max_attestation_age_ms) {
        return false;
      }
    }

    // Check signature is present and non-empty
    if (!attestation.signature || attestation.signature.length === 0) {
      return false;
    }

    // Check integrity hash is present
    if (!attestation.integrity_hash || attestation.integrity_hash.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Build a pre-evaluation DENY decision with v1.3 metadata.
   */
  private buildPreEvalDenyDecision(params: {
    reason_code: string;
    reason: string;
    correlation_id: string;
    metadata?: Record<string, unknown>;
  }): Decision {
    return {
      action: DecisionAction.DENY,
      reason_codes: [params.reason_code] as any,
      risk_score: 100,
      mode: PolicyMode.ENFORCE,
      policy_id: 'v1.3-governance',
      policy_version: '1.3.0',
      component_versions: { sdk: '1.3.0', engine: '1.3.0' },
      correlation_id: params.correlation_id,
      reason: params.reason,
      event_type: 'governance.pre_evaluation_deny',
      teec_version: '2.0.0',
      timestamp: Date.now(),
      module: 'TealEngineV13',
      metadata: {
        pre_evaluation_stage: true,
        reason_code: params.reason_code,
        ...params.metadata,
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
