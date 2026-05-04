/**
 * TealReliability Module — Unit Tests
 *
 * Covers: bounded retry (maxAttempts, budgetMs, transient codes, backoff),
 * fallback chain (priority order, exhaustion), deterministic degrade,
 * circuit breaker (state transitions, per-provider isolation).
 */

import { TealReliability } from '../TealReliability';
import { TransientError } from '../types';
import { DecisionAction, ReasonCode } from '../../core/engine/types';
import type { ModuleContext } from '../../core/engine/v1.2/types';
import type { TealReliabilityConfig } from '../types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (overrides?: Partial<ModuleContext>): ModuleContext => ({
  correlation_id: 'test-corr-001',
  policy_version: '1.2.0',
  teec_version: '0.1.0',
  timestamp: Date.now(),
  ...overrides,
});

const makeConfig = (overrides?: Partial<TealReliabilityConfig>): TealReliabilityConfig => ({
  retry: {
    enabled: true,
    maxAttempts: 3,
    budgetMs: 10000,
    transientCodes: [429, 500, 502, 503],
    backoff: 'fixed',
    baseDelayMs: 10, // fast for tests
  },
  circuit: {
    enabled: true,
    failureThreshold: 5,
    cooldownMs: 30000,
    halfOpenProbes: 1,
  },
  ...overrides,
});

/** Create a TealReliability instance with a fake clock for deterministic tests */
function makeReliability(config?: TealReliabilityConfig) {
  let clock = 0;
  const rel = new TealReliability(config ?? makeConfig());
  rel.now = () => clock;
  rel.sleep = async () => {}; // no-op sleep for fast tests
  return {
    rel,
    advanceClock: (ms: number) => { clock += ms; },
    setClock: (ms: number) => { clock = ms; },
  };
}

// ── Retry: maxAttempts ───────────────────────────────────────────

describe('TealReliability — Bounded Retry', () => {
  test('retry respects maxAttempts (stops after N attempts)', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 3,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
    }));

    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new TransientError('fail', 500);
    };

    const { decision, events } = await rel.executeWithReliability(fn, makeCtx());
    expect(callCount).toBe(3);
    expect(decision.action).not.toBe(DecisionAction.ALLOW);
    expect(events.some(e => e.reason_code === ReasonCode.RETRY_BUDGET_EXCEEDED)).toBe(true);
  });

  test('retry respects budgetMs (stops when time exceeded)', async () => {
    const config = makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 100,
        budgetMs: 50,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
    });
    let clock = 0;
    const rel = new TealReliability(config);
    rel.now = () => clock;
    rel.sleep = async () => { clock += 20; }; // each sleep advances 20ms

    let callCount = 0;
    const fn = async () => {
      callCount++;
      clock += 10; // each call takes 10ms
      throw new TransientError('fail', 500);
    };

    const { events } = await rel.executeWithReliability(fn, makeCtx());
    expect(callCount).toBeLessThan(100);
    expect(events.some(e => e.reason_code === ReasonCode.RETRY_BUDGET_EXCEEDED)).toBe(true);
  });

  test('retry only on configured transient codes', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 5,
        budgetMs: 100000,
        transientCodes: [429, 503],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
    }));

    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new TransientError('not found', 404);
    };

    const { decision } = await rel.executeWithReliability(fn, makeCtx());
    // 404 is not transient → should not retry
    expect(callCount).toBe(1);
    expect(decision.action).toBe(DecisionAction.DENY);
  });

  test('retry backoff delays increase correctly (exponential)', async () => {
    const delays: number[] = [];
    const config = makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 4,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'exponential',
        baseDelayMs: 100,
      },
    });
    const rel = new TealReliability(config);
    rel.now = () => 0;
    rel.sleep = async (ms) => { delays.push(ms); };

    const fn = async () => { throw new TransientError('fail', 500); };
    await rel.executeWithReliability(fn, makeCtx());

    // exponential: base * 2^attempt → 200, 400, 800 (3 sleeps for 4 attempts)
    expect(delays).toEqual([200, 400, 800]);
  });

  test('retry emits RETRY_BUDGET_EXCEEDED when exhausted', async () => {
    const { rel } = makeReliability();
    const fn = async () => { throw new TransientError('fail', 500); };

    const { events } = await rel.executeWithReliability(fn, makeCtx());
    expect(events.some(e => e.reason_code === ReasonCode.RETRY_BUDGET_EXCEEDED)).toBe(true);
  });

  test('successful call returns ALLOW with result', async () => {
    const { rel } = makeReliability();
    const fn = async () => 42;

    const { result, decision } = await rel.executeWithReliability(fn, makeCtx());
    expect(result).toBe(42);
    expect(decision.action).toBe(DecisionAction.ALLOW);
  });
});

// ── Fallback Chain ───────────────────────────────────────────────

describe('TealReliability — Fallback Chain', () => {
  test('fallback tries entries in priority order', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      fallback: {
        chain: [
          { provider: 'anthropic', model: 'claude-3', priority: 2 },
          { provider: 'openai', model: 'gpt-4', priority: 1 },
          { provider: 'cohere', model: 'command', priority: 3 },
        ],
        triggers: [ReasonCode.RETRY_BUDGET_EXCEEDED],
      },
    }));

    const fn = async () => { throw new TransientError('fail', 500); };
    const { events } = await rel.executeWithReliability(fn, makeCtx());

    const fallbackEvents = events.filter(e => e.reason_code === ReasonCode.FALLBACK_TRIGGERED);
    expect(fallbackEvents.length).toBe(3);
    // Sorted by priority: openai(1), anthropic(2), cohere(3)
    expect(fallbackEvents[0].provider).toBe('openai');
    expect(fallbackEvents[1].provider).toBe('anthropic');
    expect(fallbackEvents[2].provider).toBe('cohere');
  });

  test('fallback emits FALLBACK_TRIGGERED', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      fallback: {
        chain: [{ provider: 'openai', model: 'gpt-4', priority: 1 }],
        triggers: [ReasonCode.RETRY_BUDGET_EXCEEDED],
      },
    }));

    const fn = async () => { throw new TransientError('fail', 500); };
    const { events } = await rel.executeWithReliability(fn, makeCtx());

    expect(events.some(e => e.reason_code === ReasonCode.FALLBACK_TRIGGERED)).toBe(true);
  });

  test('fallback emits FALLBACK_CHAIN_EXHAUSTED when all fail', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      fallback: {
        chain: [
          { provider: 'openai', model: 'gpt-4', priority: 1 },
          { provider: 'anthropic', model: 'claude-3', priority: 2 },
        ],
        triggers: [ReasonCode.RETRY_BUDGET_EXCEEDED],
      },
    }));

    const fn = async () => { throw new TransientError('fail', 500); };
    const { events } = await rel.executeWithReliability(fn, makeCtx());

    expect(events.some(e => e.reason_code === ReasonCode.FALLBACK_CHAIN_EXHAUSTED)).toBe(true);
  });
});

// ── Deterministic Degrade ────────────────────────────────────────

describe('TealReliability — Deterministic Degrade', () => {
  test('degrade applies cheaper_model strategy', () => {
    const rel = new TealReliability(makeConfig({
      degrade: {
        strategy: 'cheaper_model',
        triggers: [ReasonCode.RETRY_BUDGET_EXCEEDED],
      },
    }));

    const request = { model: 'gpt-4', content: 'hello' };
    const degraded = rel.applyDegrade(request);
    expect(degraded.model).toBe('gpt-3.5-turbo');
    expect(degraded._degraded).toBe(true);
    expect(degraded.content).toBe('hello');
  });

  test('degrade is deterministic (same input = same output)', () => {
    const rel = new TealReliability(makeConfig({
      degrade: {
        strategy: 'disable_tools',
        triggers: [ReasonCode.RETRY_BUDGET_EXCEEDED],
      },
    }));

    const request = { model: 'gpt-4', tools: ['search'], tool: 'search' };
    const result1 = rel.applyDegrade(request);
    const result2 = rel.applyDegrade(request);
    expect(result1).toEqual(result2);
    expect(result1.tools).toBeUndefined();
    expect(result1.tool).toBeUndefined();
  });

  test('degrade emits DEGRADE_TRIGGERED', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      degrade: {
        strategy: 'summary_only',
        triggers: [ReasonCode.RETRY_BUDGET_EXCEEDED],
      },
    }));

    const fn = async () => { throw new TransientError('fail', 500); };
    const { events, decision } = await rel.executeWithReliability(fn, makeCtx());

    expect(events.some(e => e.reason_code === ReasonCode.DEGRADE_TRIGGERED)).toBe(true);
    expect(decision.action).toBe(DecisionAction.DEGRADE);
  });

  test('degrade custom handler receives and transforms request', () => {
    const rel = new TealReliability(makeConfig({
      degrade: {
        strategy: 'custom',
        triggers: [],
        customHandler: (req: any) => ({ ...req, custom: true }),
      },
    }));

    const result = rel.applyDegrade({ model: 'gpt-4' });
    expect(result.custom).toBe(true);
    expect(result.model).toBe('gpt-4');
  });
});

// ── Circuit Breaker ──────────────────────────────────────────────

describe('TealReliability — Circuit Breaker', () => {
  test('transitions CLOSED → OPEN after failure threshold', async () => {
    const { rel } = makeReliability(makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      circuit: {
        enabled: true,
        failureThreshold: 3,
        cooldownMs: 30000,
        halfOpenProbes: 1,
      },
    }));

    const fn = async () => { throw new TransientError('fail', 500); };

    // Each call records one failure
    expect(rel.getCircuitState('provA')).toBe('CLOSED');
    await rel.executeWithReliability(fn, makeCtx(), 'provA');
    await rel.executeWithReliability(fn, makeCtx(), 'provA');
    expect(rel.getCircuitState('provA')).toBe('CLOSED');
    await rel.executeWithReliability(fn, makeCtx(), 'provA');
    expect(rel.getCircuitState('provA')).toBe('OPEN');
  });

  test('OPEN state → zero retries, immediate CIRCUIT_OPEN', async () => {
    const config = makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      circuit: {
        enabled: true,
        failureThreshold: 1,
        cooldownMs: 60000,
        halfOpenProbes: 1,
      },
    });
    const { rel } = makeReliability(config);

    const fn = async () => { throw new TransientError('fail', 500); };

    // Trip the circuit
    await rel.executeWithReliability(fn, makeCtx(), 'provB');
    expect(rel.getCircuitState('provB')).toBe('OPEN');

    // Next call should get immediate CIRCUIT_OPEN, no retries
    let callCount = 0;
    const fn2 = async () => { callCount++; return 'ok'; };
    const { events, decision } = await rel.executeWithReliability(fn2, makeCtx(), 'provB');

    expect(callCount).toBe(0); // fn2 never called
    expect(events.some(e => e.reason_code === ReasonCode.CIRCUIT_OPEN)).toBe(true);
    expect(decision.action).not.toBe(DecisionAction.ALLOW);
  });

  test('transitions OPEN → HALF_OPEN after cooldown', () => {
    const config = makeConfig({
      circuit: {
        enabled: true,
        failureThreshold: 1,
        cooldownMs: 5000,
        halfOpenProbes: 1,
      },
    });
    let clock = 0;
    const rel = new TealReliability(config);
    rel.now = () => clock;
    rel.sleep = async () => {};

    // Manually set up an OPEN circuit
    // We need to trigger failures to open it
    const fn = async () => { throw new TransientError('fail', 500); };
    // Use executeWithReliability to record failure
    rel.executeWithReliability(fn, makeCtx(), 'provC');

    // After failure, circuit should be OPEN
    clock = 100; // small advance
    // Need to wait for the promise
    return rel.executeWithReliability(fn, makeCtx(), 'provC').then(() => {
      expect(rel.getCircuitState('provC')).toBe('OPEN');

      // Advance past cooldown
      clock = 6000;
      expect(rel.getCircuitState('provC')).toBe('HALF_OPEN');
    });
  });

  test('transitions HALF_OPEN → CLOSED on success', async () => {
    const config = makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      circuit: {
        enabled: true,
        failureThreshold: 1,
        cooldownMs: 100,
        halfOpenProbes: 1,
      },
    });
    let clock = 0;
    const rel = new TealReliability(config);
    rel.now = () => clock;
    rel.sleep = async () => {};

    // Trip the circuit
    const failFn = async () => { throw new TransientError('fail', 500); };
    await rel.executeWithReliability(failFn, makeCtx(), 'provD');
    expect(rel.getCircuitState('provD')).toBe('OPEN');

    // Advance past cooldown → HALF_OPEN
    clock = 200;
    expect(rel.getCircuitState('provD')).toBe('HALF_OPEN');

    // Successful probe → CLOSED
    const successFn = async () => 'ok';
    await rel.executeWithReliability(successFn, makeCtx(), 'provD');
    expect(rel.getCircuitState('provD')).toBe('CLOSED');
  });

  test('per-provider isolation', async () => {
    const config = makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      circuit: {
        enabled: true,
        failureThreshold: 1,
        cooldownMs: 60000,
        halfOpenProbes: 1,
      },
    });
    const { rel } = makeReliability(config);

    const failFn = async () => { throw new TransientError('fail', 500); };

    // Trip circuit for provider A
    await rel.executeWithReliability(failFn, makeCtx(), 'provA');
    expect(rel.getCircuitState('provA')).toBe('OPEN');

    // Provider B should still be CLOSED
    expect(rel.getCircuitState('provB')).toBe('CLOSED');

    // Provider B can still succeed
    const successFn = async () => 'ok';
    const { result } = await rel.executeWithReliability(successFn, makeCtx(), 'provB');
    expect(result).toBe('ok');
    expect(rel.getCircuitState('provB')).toBe('CLOSED');
  });

  test('resetCircuit forces CLOSED', async () => {
    const config = makeConfig({
      retry: {
        enabled: true,
        maxAttempts: 1,
        budgetMs: 100000,
        transientCodes: [500],
        backoff: 'fixed',
        baseDelayMs: 1,
      },
      circuit: {
        enabled: true,
        failureThreshold: 1,
        cooldownMs: 60000,
        halfOpenProbes: 1,
      },
    });
    const { rel } = makeReliability(config);

    const failFn = async () => { throw new TransientError('fail', 500); };
    await rel.executeWithReliability(failFn, makeCtx(), 'provE');
    expect(rel.getCircuitState('provE')).toBe('OPEN');

    rel.resetCircuit('provE');
    expect(rel.getCircuitState('provE')).toBe('CLOSED');
  });
});
