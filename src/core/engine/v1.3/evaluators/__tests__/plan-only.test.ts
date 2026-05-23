import { V13ReasonCode } from '../../types';
import { evaluatePlanOnly } from '../plan-only';
import type { GovernanceRequest, PlanOnlyConfig } from '../../types';

describe('evaluatePlanOnly', () => {
  const defaultConfig: PlanOnlyConfig = {
    enabled: false,
    side_effecting_actions: ['CODE_CHANGE', 'DATABASE_WRITE', 'PRODUCTION_DEPLOY', 'API_MUTATION'],
    allowed_actions: ['READ', 'REASONING', 'PLAN', 'QUERY', 'SEARCH', 'ANALYZE', 'SUMMARIZE'],
  };

  describe('table-driven: enabled/disabled', () => {
    const cases = [
      { name: 'returns null when disabled', planOnlyMode: false, config: { ...defaultConfig, enabled: false }, actionClass: 'CODE_CHANGE', expected: null },
      { name: 'blocks side-effecting when enabled via mode', planOnlyMode: true, config: defaultConfig, actionClass: 'CODE_CHANGE', expected: V13ReasonCode.PLAN_ONLY_BLOCK },
      { name: 'blocks side-effecting when enabled via config', planOnlyMode: false, config: { ...defaultConfig, enabled: true }, actionClass: 'CODE_CHANGE', expected: V13ReasonCode.PLAN_ONLY_BLOCK },
    ];

    it.each(cases)('$name', ({ planOnlyMode, config, actionClass, expected }) => {
      const request: GovernanceRequest = { action_class: actionClass };
      const result = evaluatePlanOnly(request, planOnlyMode, config);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  describe('table-driven: action classification', () => {
    const enabledConfig: PlanOnlyConfig = { ...defaultConfig, enabled: true };

    const cases = [
      { name: 'allows READ actions', actionClass: 'READ', expected: null },
      { name: 'allows REASONING actions', actionClass: 'REASONING', expected: null },
      { name: 'blocks CODE_CHANGE (side-effecting)', actionClass: 'CODE_CHANGE', expected: V13ReasonCode.PLAN_ONLY_BLOCK },
      { name: 'blocks DATABASE_WRITE (side-effecting)', actionClass: 'DATABASE_WRITE', expected: V13ReasonCode.PLAN_ONLY_BLOCK },
      { name: 'blocks PRODUCTION_DEPLOY (side-effecting)', actionClass: 'PRODUCTION_DEPLOY', expected: V13ReasonCode.PLAN_ONLY_BLOCK },
      { name: 'blocks unknown action', actionClass: 'SOME_ACTION', expected: V13ReasonCode.PLAN_ONLY_BLOCK },
      { name: 'allows empty action_class', actionClass: '', expected: null },
      { name: 'allows undefined action_class', actionClass: undefined, expected: null },
    ];

    it.each(cases)('$name', ({ actionClass, expected }) => {
      const request: GovernanceRequest = actionClass !== undefined ? { action_class: actionClass } : {};
      const result = evaluatePlanOnly(request, true, enabledConfig);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  describe('custom action classification', () => {
    it('uses custom config for action lists', () => {
      const customConfig: PlanOnlyConfig = {
        enabled: true,
        side_effecting_actions: ['CUSTOM_WRITE'],
        allowed_actions: ['CUSTOM_READ'],
      };

      const readResult = evaluatePlanOnly({ action_class: 'CUSTOM_READ' } as GovernanceRequest, true, customConfig);
      expect(readResult).toBeNull();

      const writeResult = evaluatePlanOnly({ action_class: 'CUSTOM_WRITE' } as GovernanceRequest, true, customConfig);
      expect(writeResult).not.toBeNull();
      expect(writeResult!.reason_code).toBe(V13ReasonCode.PLAN_ONLY_BLOCK);
    });
  });
});
