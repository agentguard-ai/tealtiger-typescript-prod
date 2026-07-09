import fc from 'fast-check';
import { FreezeRegistry, freeze, unfreeze } from '../freeze-registry';

describe('FreezeRegistry property tests', () => {
  beforeEach(() => {
    FreezeRegistry.getInstance()._reset();
  });

  it('freezes any non-empty agent id', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (agentId) => {
        FreezeRegistry.getInstance()._reset();

        freeze(agentId);

        expect(FreezeRegistry.getInstance().isFrozen(agentId)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('freeze followed by unfreeze restores operational state', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (agentId) => {
        FreezeRegistry.getInstance()._reset();

        freeze(agentId);
        unfreeze(agentId);

        expect(FreezeRegistry.getInstance().isFrozen(agentId)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('freezing one concrete agent does not freeze another concrete agent', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((id) => id !== '*'),
        fc.string({ minLength: 1 }).filter((id) => id !== '*'),
        (firstAgentId, secondAgentId) => {
          fc.pre(firstAgentId !== secondAgentId);
          FreezeRegistry.getInstance()._reset();

          freeze(firstAgentId);

          expect(FreezeRegistry.getInstance().isFrozen(firstAgentId)).toBe(true);
          expect(FreezeRegistry.getInstance().isFrozen(secondAgentId)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
