import { observe } from '../observe';

describe('observe', () => {
  it('reports elapsed session duration from proxy creation time', () => {
    let now = 1_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const client = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    try {
      const proxy = observe(client);
      now = 6_000;

      const cost = proxy.getCost();

      expect(cost.sessionDurationMs).toBeGreaterThan(0);
      expect(cost.sessionDurationMs).toBe(5_000);
      expect(proxy.getAgentCost().sessionDurationMs).toBe(5_000);
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});
