import { V13ReasonCode } from '../../types';
import { evaluateFreezeRules } from '../freeze';
import type { FreezeRule, GovernanceRequest } from '../../types';

describe('evaluateFreezeRules', () => {
  const baseRule: FreezeRule = {
    id: 'freeze-prod-deploy',
    match: { action_class: 'PRODUCTION_DEPLOY' },
    reason: 'Production deployments frozen during incident',
    created_at: 1000,
    created_by: 'security-team',
    immutable: true,
  };

  const ruleWithAllFields: FreezeRule = {
    id: 'freeze-agent-specific',
    match: {
      action_class: 'CODE_CHANGE',
      tool: 'git',
      agent_id: 'agent-001',
      environment: 'production',
      model: 'gpt-4',
    },
    reason: 'Agent-specific freeze',
    created_at: 2000,
    created_by: 'admin',
    immutable: true,
  };

  const wildcardRule: FreezeRule = {
    id: 'freeze-all',
    match: { action_class: '*' },
    reason: 'Total freeze',
    created_at: 3000,
    created_by: 'admin',
    immutable: true,
  };

  describe('table-driven: action_class matching', () => {
    const cases = [
      { name: 'matches exact action_class', rules: [baseRule], request: { action_class: 'PRODUCTION_DEPLOY' } as GovernanceRequest, expected: V13ReasonCode.FREEZE_BLOCK },
      { name: 'does not match different action_class', rules: [baseRule], request: { action_class: 'READ' } as GovernanceRequest, expected: null },
      { name: 'wildcard matches any action_class', rules: [wildcardRule], request: { action_class: 'ANYTHING' } as GovernanceRequest, expected: V13ReasonCode.FREEZE_BLOCK },
      { name: 'no rules returns null', rules: [], request: { action_class: 'READ' } as GovernanceRequest, expected: null },
    ];

    it.each(cases)('$name', ({ rules, request, expected }) => {
      const result = evaluateFreezeRules(request, rules);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  describe('table-driven: multi-field matching', () => {
    const cases = [
      {
        name: 'all fields match',
        request: {
          action_class: 'CODE_CHANGE',
          tool: 'git',
          nhi_identity: { agent_id: 'agent-001' },
          action_attributes: { environment: 'production' },
          model: 'gpt-4',
        } as unknown as GovernanceRequest,
        expected: V13ReasonCode.FREEZE_BLOCK,
      },
      {
        name: 'action_class mismatch',
        request: {
          action_class: 'READ',
          tool: 'git',
          nhi_identity: { agent_id: 'agent-001' },
        } as unknown as GovernanceRequest,
        expected: null,
      },
      {
        name: 'tool mismatch',
        request: {
          action_class: 'CODE_CHANGE',
          tool: 'npm',
          nhi_identity: { agent_id: 'agent-001' },
        } as unknown as GovernanceRequest,
        expected: null,
      },
    ];

    it.each(cases)('$name', ({ request, expected }) => {
      const result = evaluateFreezeRules(request, [ruleWithAllFields]);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  describe('result metadata', () => {
    it('includes freeze rule details in metadata', () => {
      const request: GovernanceRequest = { action_class: 'PRODUCTION_DEPLOY' };
      const result = evaluateFreezeRules(request, [baseRule]);

      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual({
        freeze_rule_id: 'freeze-prod-deploy',
        freeze_reason: 'Production deployments frozen during incident',
        created_by: 'security-team',
        created_at: 1000,
      });
    });
  });
});
