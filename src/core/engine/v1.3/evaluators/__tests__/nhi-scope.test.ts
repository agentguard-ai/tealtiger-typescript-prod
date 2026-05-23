import { V13ReasonCode } from '../../types';
import { evaluateNHIScopeAndEnvironment } from '../nhi-scope';
import type { GovernanceRequest, GovernanceContext, NHIDescriptor } from '../../types';

describe('evaluateNHIScopeAndEnvironment', () => {
  const prodCtx: Partial<GovernanceContext> & { correlation_id: string } = {
    correlation_id: 'test-001',
    environment: 'production',
  };

  const limitedIdentity: NHIDescriptor = {
    agent_id: 'agent-010',
    owner: 'team-epsilon',
    created_at: Date.now(),
    capability_scope: ['read:memory', 'invoke:tool:search'],
    environment_constraints: ['staging', 'development', 'production'],
    status: 'active',
  };

  const wildcardIdentity: NHIDescriptor = {
    agent_id: 'agent-013',
    owner: 'team-theta',
    created_at: Date.now(),
    capability_scope: ['*'],
    environment_constraints: ['staging', 'development', 'production'],
    status: 'active',
  };

  describe('edge cases: no scope check', () => {
    it('returns null when no NHI identity', () => {
      const result = evaluateNHIScopeAndEnvironment({ action_class: 'READ' } as GovernanceRequest, prodCtx);
      expect(result).toBeNull();
    });

    it('returns null when NHI is not active', () => {
      const request: GovernanceRequest = {
        action_class: 'READ',
        nhi_identity: { ...limitedIdentity, status: 'revoked' },
      };
      const result = evaluateNHIScopeAndEnvironment(request, prodCtx);
      expect(result).toBeNull();
    });

    it('skips scope check when no action_class', () => {
      const envCtx: Partial<GovernanceContext> & { correlation_id: string } = {
        correlation_id: 'test-002',
        environment: 'staging',
      };
      const request: GovernanceRequest = { nhi_identity: limitedIdentity };
      const result = evaluateNHIScopeAndEnvironment(request, envCtx);
      expect(result).toBeNull();
    });
  });

  describe('table-driven: scope violations', () => {
    const cases = [
      { name: 'denies action outside scope', identity: limitedIdentity, actionClass: 'DATABASE_WRITE', expected: V13ReasonCode.NHI_SCOPE_VIOLATION },
      { name: 'allows action within scope (read:memory)', identity: limitedIdentity, actionClass: 'READ', expected: null },
      { name: 'allows action within scope (invoke:tool:search)', identity: limitedIdentity, actionClass: 'TOOL_INVOKE', tool: 'search', expected: null },
      { name: 'wildcard scope allows everything', identity: wildcardIdentity, actionClass: 'DATABASE_WRITE', expected: null },
    ];

    it.each(cases)('$name', ({ identity, actionClass, tool, expected }) => {
      const request: GovernanceRequest = {
        action_class: actionClass,
        ...(tool !== undefined && { tool }),
        nhi_identity: identity,
      };
      const envCtx: Partial<GovernanceContext> & { correlation_id: string } = {
        correlation_id: 'test-scope',
        environment: 'staging',
      };
      const result = evaluateNHIScopeAndEnvironment(request, envCtx);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  const restrictedIdentity: NHIDescriptor = {
    agent_id: 'agent-020',
    owner: 'team-restricted',
    created_at: Date.now(),
    capability_scope: ['*'],
    environment_constraints: ['staging', 'development'],
    status: 'active',
  };

  describe('table-driven: environment violations', () => {
    const cases = [
      {
        name: 'denies environment not in constraints',
        identity: restrictedIdentity,
        environment: 'production',
        expected: V13ReasonCode.NHI_ENVIRONMENT_VIOLATION,
      },
      {
        name: 'allows environment in constraints',
        identity: restrictedIdentity,
        environment: 'staging',
        expected: null,
      },
      {
        name: 'skips environment check when no env in context',
        identity: restrictedIdentity,
        environment: undefined,
        expected: null,
      },
    ];

    it.each(cases)('$name', ({ identity, environment, expected }) => {
      const localCtx: Partial<GovernanceContext> & { correlation_id: string } = {
        correlation_id: 'test-env',
        ...(environment !== undefined && { environment }),
      };
      const request: GovernanceRequest = {
        action_class: 'READ',
        nhi_identity: identity,
      };
      const result = evaluateNHIScopeAndEnvironment(request, localCtx);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });
});
