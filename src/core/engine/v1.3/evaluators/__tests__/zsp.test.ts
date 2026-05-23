import { V13ReasonCode } from '../../types';
import { evaluateZSP } from '../zsp';
import type { GovernanceRequest, ZSPConfig, JITGrant } from '../../types';

describe('evaluateZSP', () => {
  const config: ZSPConfig = { enabled: true, max_grant_ttl_ms: 300_000 };

  const validGrant: JITGrant = {
    grant_id: 'grant-002',
    agent_id: 'agent-009',
    scope: ['tool:database'],
    issued_at: Date.now() - 60_000,
    expires_at: Date.now() + 240_000,
    issued_by: 'admin',
  };

  describe('table-driven: ZSP scenarios', () => {
    const cases = [
      { name: 'returns null when not enabled', config: { enabled: false, max_grant_ttl_ms: 300_000 } as ZSPConfig, grant: undefined, expected: null },
      { name: 'returns null when config undefined', config: undefined, grant: undefined, expected: null },
      { name: 'denies when no grant provided', config, grant: undefined, expected: V13ReasonCode.ACCESS_STANDING_PRIVILEGE_DENIED },
      { name: 'allows valid non-expired grant', config, grant: validGrant, expected: null },
    ];

    it.each(cases)('$name', ({ config: cfg, grant, expected }) => {
      const request: GovernanceRequest = grant ? { jit_grant: grant } : {};
      const result = evaluateZSP(request, cfg);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  it('denies expired grants', () => {
    const expiredGrant: JITGrant = {
      grant_id: 'grant-001',
      agent_id: 'agent-008',
      scope: ['tool:database'],
      issued_at: Date.now() - 600_000,
      expires_at: Date.now() - 300_000,
      issued_by: 'admin',
    };

    const result = evaluateZSP({ jit_grant: expiredGrant } as GovernanceRequest, config);
    expect(result).not.toBeNull();
    expect(result!.reason_code).toBe(V13ReasonCode.ACCESS_GRANT_EXPIRED);
  });

  it('includes grant details in expired metadata', () => {
    const expiredGrant: JITGrant = {
      grant_id: 'grant-003',
      agent_id: 'agent-010',
      scope: ['tool:database'],
      issued_at: Date.now() - 600_000,
      expires_at: Date.now() - 300_000,
      issued_by: 'admin',
    };

    const result = evaluateZSP({ jit_grant: expiredGrant } as GovernanceRequest, config);
    expect(result!.metadata).toMatchObject({
      grant_id: 'grant-003',
      agent_id: 'agent-010',
    });
  });
});
