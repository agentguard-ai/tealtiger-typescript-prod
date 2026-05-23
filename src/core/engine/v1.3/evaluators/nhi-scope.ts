import { V13ReasonCode } from '../types';
import type { GovernanceRequest, GovernanceContext } from '../types';
import type { PreEvalDenyResult } from './types';

export function evaluateNHIScopeAndEnvironment(
  request: GovernanceRequest,
  ctx: Partial<GovernanceContext>,
): PreEvalDenyResult | null {
  const nhi = request.nhi_identity;
  if (!nhi || nhi.status !== 'active') {
    return null;
  }

  const actionClass = request.action_class;
  const tool = request.tool;

  if (actionClass && nhi.capability_scope.length > 0) {
    if (!isWithinScope(actionClass, tool, nhi.capability_scope)) {
      return {
        reason_code: V13ReasonCode.NHI_SCOPE_VIOLATION,
        reason: `NHI '${nhi.agent_id}' attempted action '${actionClass}' outside its declared capability scope.`,
        metadata: {
          agent_id: nhi.agent_id,
          action_class: actionClass,
          tool,
          capability_scope: nhi.capability_scope,
        },
      };
    }
  }

  const environment = ctx.environment;
  if (environment && nhi.environment_constraints.length > 0) {
    if (!nhi.environment_constraints.includes(environment)) {
      return {
        reason_code: V13ReasonCode.NHI_ENVIRONMENT_VIOLATION,
        reason: `NHI '${nhi.agent_id}' attempted to operate in environment '${environment}' which is not in its allowed environments.`,
        metadata: {
          agent_id: nhi.agent_id,
          environment,
          allowed_environments: nhi.environment_constraints,
        },
      };
    }
  }

  return null;
}

function isWithinScope(
  actionClass: string,
  tool: string | undefined,
  scope: string[],
): boolean {
  const actionLower = actionClass.toLowerCase();
  const toolLower = tool?.toLowerCase();

  for (const entry of scope) {
    const entryLower = entry.toLowerCase();

    if (entryLower === actionLower) return true;

    if (entryLower === '*') return true;

    const parts = entryLower.split(':');

    if (parts[0] === 'invoke' && parts[1] === 'tool' && toolLower) {
      if (parts[2] === '*' || parts[2] === toolLower) return true;
    }

    if (actionLower.includes(parts[0])) return true;

    if (parts[0] === 'tool' && toolLower && (parts[1] === '*' || parts[1] === toolLower)) {
      return true;
    }
  }

  return false;
}
