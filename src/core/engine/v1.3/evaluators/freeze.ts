import { V13ReasonCode } from '../types';
import type { FreezeRule, GovernanceRequest } from '../types';
import { matchesPolicy } from './shared';
import type { PreEvalDenyResult } from './types';

export function evaluateFreezeRules(
  request: GovernanceRequest,
  freezeRules: ReadonlyArray<FreezeRule>,
): PreEvalDenyResult | null {
  if (freezeRules.length === 0) {
    return null;
  }

  for (const rule of freezeRules) {
    if (matchesPolicy(rule.match, request)) {
      return {
        reason_code: V13ReasonCode.FREEZE_BLOCK,
        reason: `Action blocked by FREEZE rule '${rule.id}': ${rule.reason}`,
        metadata: {
          freeze_rule_id: rule.id,
          freeze_reason: rule.reason,
          created_by: rule.created_by,
          created_at: rule.created_at,
        },
      };
    }
  }

  return null;
}
