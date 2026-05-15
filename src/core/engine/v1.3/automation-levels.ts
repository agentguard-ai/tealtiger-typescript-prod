/**
 * Automation Level Evaluation Logic
 *
 * Implements the automation level processing for TealEngine v1.3.
 * Resolves which automation level applies to a governance request,
 * produces the corresponding Decision or PendingDecision, and
 * handles approval token validation for pending decisions.
 *
 * @module core/engine/v1.3/automation-levels
 */

import { generateUUIDv4 } from '../../context/ContextManager';
import type {
  AutomationLevel,
  AutomationLevelConfig,
  PolicyMatcher,
  GovernanceRequest,
  PendingDecision,
} from './types';

// ── Constants ────────────────────────────────────────────────────

/** Default approval TTL: 5 minutes in milliseconds */
const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;

// ── Result Types ─────────────────────────────────────────────────

/**
 * Core decision fields produced by automation level evaluation.
 * The engine is responsible for merging these with context fields
 * (mode, policy_id, policy_version, component_versions, correlation_id).
 */
export interface AutomationDecision {
  action: string;
  reason_codes: string[];
  risk_score: number;
  automation_level: AutomationLevel;
  /** Sanitized content placeholder (for auto_sanitize) */
  sanitized_content?: string;
}

/**
 * Pending decision produced when approval_required level is matched.
 * Contains approval token and expiry for external approval flow.
 */
export interface AutomationPendingDecision {
  action: 'PENDING';
  requires_approval: true;
  approval_token: string;
  expires_at: number;
  reason_codes: string[];
  risk_score: number;
  automation_level: AutomationLevel;
}

// ── Matcher Logic ────────────────────────────────────────────────

/**
 * Checks whether a governance request matches a PolicyMatcher.
 * All specified fields in the matcher must match (AND logic).
 * Unspecified fields are treated as wildcards (always match).
 */
function matchesPolicy(request: GovernanceRequest, matcher: PolicyMatcher): boolean {
  if (matcher.action_class !== undefined) {
    if (request.action_class !== matcher.action_class) {
      return false;
    }
  }

  if (matcher.tool !== undefined) {
    if (request.tool !== matcher.tool) {
      return false;
    }
  }

  if (matcher.agent_id !== undefined) {
    if (request.nhi_identity?.agent_id !== matcher.agent_id) {
      return false;
    }
  }

  if (matcher.environment !== undefined) {
    const requestEnv =
      (request.action_attributes?.environment as string | undefined) ??
      (request as Record<string, unknown>).environment as string | undefined;
    if (requestEnv !== matcher.environment) {
      return false;
    }
  }

  if (matcher.model !== undefined) {
    if (request.model !== matcher.model) {
      return false;
    }
  }

  if (matcher.risk_score_above !== undefined) {
    const riskScore = (request.action_attributes?.risk_score as number | undefined) ?? 0;
    if (riskScore < matcher.risk_score_above) {
      return false;
    }
  }

  if (matcher.attributes !== undefined) {
    for (const [key, value] of Object.entries(matcher.attributes)) {
      if (request.action_attributes?.[key] !== value) {
        return false;
      }
    }
  }

  return true;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Resolves the automation level for a governance request by evaluating
 * rules in order (first match wins).
 *
 * @param request - The governance request to evaluate
 * @param config - Automation level configuration with ordered rules
 * @returns The matched automation level, or undefined if no rule matches
 *          and no default_level is configured
 */
export function resolveAutomationLevel(
  request: GovernanceRequest,
  config: AutomationLevelConfig,
): AutomationLevel | undefined {
  for (const rule of config.rules) {
    if (matchesPolicy(request, rule.match)) {
      return rule.automation_level;
    }
  }

  return config.default_level;
}

/**
 * Applies an automation level to produce the appropriate decision.
 *
 * - `auto_allow` → AutomationDecision with action 'ALLOW'
 * - `auto_deny` → AutomationDecision with action 'DENY'
 * - `auto_sanitize` → AutomationDecision with action 'MODIFY' (sanitized content placeholder)
 * - `approval_required` → AutomationPendingDecision with approval_token and expires_at
 *
 * @param level - The automation level to apply
 * @param _request - The governance request (reserved for future context use)
 * @param options - Optional configuration (approval TTL)
 * @returns AutomationDecision, AutomationPendingDecision, or null if level is unrecognized
 */
export function applyAutomationLevel(
  level: AutomationLevel,
  _request: GovernanceRequest,
  options?: { approval_ttl_ms?: number },
): AutomationDecision | AutomationPendingDecision | null {
  const ttl = options?.approval_ttl_ms ?? DEFAULT_APPROVAL_TTL_MS;

  switch (level) {
    case 'auto_allow':
      return {
        action: 'ALLOW',
        reason_codes: ['AUTOMATION_LEVEL_AUTO_ALLOW'],
        risk_score: 0,
        automation_level: 'auto_allow',
      };

    case 'auto_deny':
      return {
        action: 'DENY',
        reason_codes: ['AUTOMATION_LEVEL_AUTO_DENY'],
        risk_score: 100,
        automation_level: 'auto_deny',
      };

    case 'auto_sanitize':
      return {
        action: 'MODIFY',
        reason_codes: ['AUTOMATION_LEVEL_AUTO_SANITIZE'],
        risk_score: 50,
        automation_level: 'auto_sanitize',
        sanitized_content: '[CONTENT_SANITIZED]',
      };

    case 'approval_required': {
      const now = Date.now();
      return {
        action: 'PENDING',
        requires_approval: true,
        approval_token: generateUUIDv4(),
        expires_at: now + ttl,
        reason_codes: ['AUTOMATION_LEVEL_APPROVAL_REQUIRED'],
        risk_score: 75,
        automation_level: 'approval_required',
      };
    }

    default:
      return null;
  }
}

/**
 * Validates an approval token and returns an ALLOW decision if valid.
 *
 * Checks:
 * 1. Token exists in the pending decisions map
 * 2. Token has not expired
 *
 * @param token - The approval token to validate
 * @param pendingDecisions - Map of token → PendingDecision
 * @returns AutomationDecision with action 'ALLOW' if valid, null otherwise
 */
export function approveDecision(
  token: string,
  pendingDecisions: Map<string, PendingDecision>,
): AutomationDecision | null {
  const pending = pendingDecisions.get(token);

  if (!pending) {
    return null;
  }

  const now = Date.now();
  if (now > pending.expires_at) {
    // Token has expired — remove it and return null
    pendingDecisions.delete(token);
    return null;
  }

  // Valid approval — remove from pending and return ALLOW
  pendingDecisions.delete(token);

  return {
    action: 'ALLOW',
    reason_codes: ['APPROVAL_GRANTED'],
    risk_score: 0,
    automation_level: 'approval_required',
  };
}
