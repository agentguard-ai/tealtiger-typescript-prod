import { V13ReasonCode } from '../../types';
import { evaluateNHIStatus } from '../nhi-status';
import type { GovernanceRequest, NHIInventory, NHIDescriptor } from '../../types';

describe('evaluateNHIStatus', () => {
  const activeIdentity: NHIDescriptor = {
    agent_id: 'agent-001',
    owner: 'team-alpha',
    created_at: Date.now(),
    capability_scope: ['*'],
    environment_constraints: ['production'],
    status: 'active',
  };

  const revokedIdentity: NHIDescriptor = {
    agent_id: 'agent-002',
    owner: 'team-beta',
    created_at: Date.now(),
    capability_scope: ['*'],
    environment_constraints: ['production'],
    status: 'revoked',
  };

  const suspendedIdentity: NHIDescriptor = {
    agent_id: 'agent-003',
    owner: 'team-gamma',
    created_at: Date.now(),
    capability_scope: ['*'],
    environment_constraints: ['production'],
    status: 'suspended',
  };

  describe('table-driven: status checks', () => {
    const cases = [
      { name: 'returns null when no NHI identity', identity: undefined, expected: null },
      { name: 'allows active NHI', identity: activeIdentity, expected: null },
      { name: 'denies revoked NHI', identity: revokedIdentity, expected: V13ReasonCode.NHI_REVOKED },
      { name: 'denies suspended NHI', identity: suspendedIdentity, expected: V13ReasonCode.NHI_SUSPENDED },
    ];

    it.each(cases)('$name', ({ identity, expected }) => {
      const request: GovernanceRequest = identity ? { nhi_identity: identity } : {};
      const result = evaluateNHIStatus(request);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  describe('NHI inventory overrides request status', () => {
    it('uses inventory status over request status', () => {
      const inventory: NHIInventory = {
        agents: new Map([
          ['agent-004', {
            agent_id: 'agent-004',
            owner: 'team-delta',
            created_at: Date.now(),
            capability_scope: ['*'],
            environment_constraints: ['production'],
            status: 'revoked',
          } as NHIDescriptor],
        ]),
        lookup(id: string) { return this.agents.get(id); },
        updateStatus(id: string, status: any) {
          const entry = this.agents.get(id);
          if (entry) entry.status = status;
        },
      };

      const request: GovernanceRequest = {
        nhi_identity: {
          agent_id: 'agent-004',
          owner: 'team-delta',
          created_at: Date.now(),
          capability_scope: ['*'],
          environment_constraints: ['production'],
          status: 'active',
        },
      };

      const result = evaluateNHIStatus(request, inventory);
      expect(result).not.toBeNull();
      expect(result!.reason_code).toBe(V13ReasonCode.NHI_REVOKED);
    });

    it('falls back to request status when not in inventory', () => {
      const emptyInventory: NHIInventory = {
        agents: new Map(),
        lookup() { return undefined; },
        updateStatus() {},
      };

      const request: GovernanceRequest = { nhi_identity: revokedIdentity };
      const result = evaluateNHIStatus(request, emptyInventory);
      expect(result).not.toBeNull();
      expect(result!.reason_code).toBe(V13ReasonCode.NHI_REVOKED);
    });
  });

  describe('result metadata', () => {
    it('includes agent details in revocation result', () => {
      const result = evaluateNHIStatus({ nhi_identity: revokedIdentity } as GovernanceRequest);
      expect(result!.metadata).toMatchObject({
        agent_id: 'agent-002',
        owner: 'team-beta',
        status: 'revoked',
      });
    });

    it('includes agent details in suspension result', () => {
      const result = evaluateNHIStatus({ nhi_identity: suspendedIdentity } as GovernanceRequest);
      expect(result!.metadata).toMatchObject({
        agent_id: 'agent-003',
        owner: 'team-gamma',
        status: 'suspended',
      });
    });
  });
});
