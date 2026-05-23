import { V13ReasonCode } from '../types';
import type { GovernanceRequest, ZSPConfig } from '../types';
import type { PreEvalDenyResult } from './types';

export function evaluateZSP(
  request: GovernanceRequest,
  zspConfig?: ZSPConfig,
): PreEvalDenyResult | null {
  if (!zspConfig || !zspConfig.enabled) {
    return null;
  }

  const grant = request.jit_grant;

  if (!grant) {
    return {
      reason_code: V13ReasonCode.ACCESS_STANDING_PRIVILEGE_DENIED,
      reason: 'Zero Standing Privilege mode is enabled. A valid JIT grant is required for all tool/resource access.',
      metadata: {
        zsp_enabled: true,
        agent_id: request.nhi_identity?.agent_id,
      },
    };
  }

  const now = Date.now();
  if (grant.expires_at <= now) {
    return {
      reason_code: V13ReasonCode.ACCESS_GRANT_EXPIRED,
      reason: `JIT grant '${grant.grant_id}' has expired. Request a new grant to continue.`,
      metadata: {
        grant_id: grant.grant_id,
        agent_id: grant.agent_id,
        expired_at: grant.expires_at,
        current_time: now,
      },
    };
  }

  return null;
}
