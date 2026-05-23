import { V13ReasonCode } from '../types';
import type { GovernanceRequest, NHIInventory } from '../types';
import type { PreEvalDenyResult } from './types';

export function evaluateNHIStatus(
  request: GovernanceRequest,
  nhiInventory?: NHIInventory,
): PreEvalDenyResult | null {
  const nhi = request.nhi_identity;
  if (!nhi) {
    return null;
  }

  const inventoryEntry = nhiInventory?.lookup(nhi.agent_id);
  const effectiveStatus = inventoryEntry?.status ?? nhi.status;

  if (effectiveStatus === 'revoked') {
    return {
      reason_code: V13ReasonCode.NHI_REVOKED,
      reason: `NHI identity '${nhi.agent_id}' has been revoked. All actions are denied.`,
      metadata: {
        agent_id: nhi.agent_id,
        owner: nhi.owner,
        status: effectiveStatus,
      },
    };
  }

  if (effectiveStatus === 'suspended') {
    return {
      reason_code: V13ReasonCode.NHI_SUSPENDED,
      reason: `NHI identity '${nhi.agent_id}' is suspended. All actions are denied until reactivation.`,
      metadata: {
        agent_id: nhi.agent_id,
        owner: nhi.owner,
        status: effectiveStatus,
      },
    };
  }

  return null;
}
