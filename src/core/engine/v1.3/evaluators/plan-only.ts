import { V13ReasonCode } from '../types';
import type { GovernanceRequest, PlanOnlyConfig } from '../types';
import type { PreEvalDenyResult } from './types';

export function evaluatePlanOnly(
  request: GovernanceRequest,
  planOnlyMode: boolean,
  planOnlyConfig: PlanOnlyConfig,
): PreEvalDenyResult | null {
  const isEnabled = planOnlyMode || planOnlyConfig.enabled;
  if (!isEnabled) {
    return null;
  }

  const actionClass = request.action_class ?? '';

  if (isAllowedInPlanOnly(actionClass, planOnlyConfig)) {
    return null;
  }

  if (isSideEffecting(actionClass, planOnlyConfig)) {
    return {
      reason_code: V13ReasonCode.PLAN_ONLY_BLOCK,
      reason: `Action '${actionClass}' blocked: PLAN_ONLY mode is active. Only read-only and reasoning actions are permitted.`,
      metadata: {
        action_class: actionClass,
        plan_only_mode: true,
      },
    };
  }

  if (actionClass && !isAllowedInPlanOnly(actionClass, planOnlyConfig)) {
    return {
      reason_code: V13ReasonCode.PLAN_ONLY_BLOCK,
      reason: `Action '${actionClass}' blocked: PLAN_ONLY mode is active. Action not in allowed list.`,
      metadata: {
        action_class: actionClass,
        plan_only_mode: true,
      },
    };
  }

  return null;
}

function isAllowedInPlanOnly(actionClass: string, config: PlanOnlyConfig): boolean {
  return config.allowed_actions.some(
    (a) => a.toUpperCase() === actionClass.toUpperCase(),
  );
}

function isSideEffecting(actionClass: string, config: PlanOnlyConfig): boolean {
  return config.side_effecting_actions.some(
    (a) => a.toUpperCase() === actionClass.toUpperCase(),
  );
}
