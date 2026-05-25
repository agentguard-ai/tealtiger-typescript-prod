import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  PolicyReloadEvent,
  PolicyReloadEventType,
  PolicyWatcher,
  TealEngine
} from '../index';
import type { PolicySourceState, TealPolicy } from '../index';

const allowDeletePolicy: TealPolicy = {
  tools: {
    file_delete: { allowed: true }
  }
};

const blockDeletePolicy: TealPolicy = {
  tools: {
    file_delete: { allowed: false }
  }
};

function evaluateDelete(engine: TealEngine): boolean {
  return engine.evaluate({
    agentId: 'agent-001',
    action: 'tool.execute',
    tool: 'file_delete'
  }).allowed;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for condition');
}

function createResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      }
    },
    text: async () => body
  } as unknown as Response;
}

describe('PolicyWatcher and TealEngine policy reload', () => {
  it('reloads policies manually and clears stale cached decisions', async () => {
    const engine = new TealEngine(allowDeletePolicy);

    expect(evaluateDelete(engine)).toBe(true);

    const result = await engine.reloadPolicies(blockDeletePolicy);

    expect(result).toMatchObject({
      success: true,
      reloaded: true,
      previousVersion: 1,
      version: 2
    });
    expect(engine.getPolicyVersion()).toBe(2);
    expect(evaluateDelete(engine)).toBe(false);
  });

  it('keeps the active policy and emits an error event when reload validation fails', async () => {
    const engine = new TealEngine(allowDeletePolicy);
    const events: PolicyReloadEvent[] = [];
    engine.onPolicyReload((event) => {
      events.push(event);
    });

    const invalidPolicy = {
      tools: {
        file_delete: {}
      }
    } as unknown as TealPolicy;

    const result = await engine.reloadPolicies(invalidPolicy);

    expect(result.success).toBe(false);
    expect(result.reloaded).toBe(false);
    expect(result.version).toBe(1);
    expect(evaluateDelete(engine)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(PolicyReloadEventType.POLICY_RELOAD_FAILED);
    expect(events[0].error).toContain('Invalid policy configuration');
  });

  it('keeps in-flight reloads isolated so current evaluations use the old policy until swap completes', async () => {
    let resolvePolicy: (policy: TealPolicy) => void = () => undefined;
    const provider = {
      name: 'delayed-provider',
      loadPolicy: (_state: Readonly<PolicySourceState>) =>
        new Promise<TealPolicy>((resolve) => {
          resolvePolicy = resolve;
        })
    };
    const engine = new TealEngine(allowDeletePolicy);

    const reloadPromise = engine.reloadPolicies({
      type: 'provider',
      provider
    });

    expect(evaluateDelete(engine)).toBe(true);

    resolvePolicy(blockDeletePolicy);
    const result = await reloadPromise;

    expect(result.success).toBe(true);
    expect(evaluateDelete(engine)).toBe(false);
  });

  it('hot-reloads a watched policy file with debounce', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tealtiger-policy-'));
    const policyPath = join(dir, 'policy.json');
    await writeFile(policyPath, JSON.stringify(allowDeletePolicy));

    const engine = new TealEngine(allowDeletePolicy);
    const events: PolicyReloadEvent[] = [];
    engine.onPolicyReload((event) => {
      events.push(event);
    });

    const watcher = engine.watchPolicies(
      { type: 'file', path: policyPath },
      { debounceMs: 20 }
    );

    try {
      await writeFile(policyPath, JSON.stringify(blockDeletePolicy));
      await waitFor(() => engine.getPolicyVersion() === 2);

      expect(evaluateDelete(engine)).toBe(false);
      expect(events.some((event) => event.type === PolicyReloadEventType.POLICY_RELOADED))
        .toBe(true);
    } finally {
      watcher.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps watched file reload decisions consistent while evaluations are in flight', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tealtiger-policy-'));
    const policyPath = join(dir, 'policy.json');
    await writeFile(policyPath, JSON.stringify(allowDeletePolicy));

    const engine = new TealEngine(allowDeletePolicy);
    const decisions: Array<{ allowed: boolean; version: number }> = [];
    let evaluating = true;

    const watcher = engine.watchPolicies(
      { type: 'file', path: policyPath },
      { debounceMs: 20 }
    );

    const evaluationLoop = (async () => {
      while (evaluating) {
        const result = engine.evaluate({
          agentId: 'agent-001',
          action: 'tool.execute',
          tool: 'file_delete'
        });

        decisions.push({
          allowed: result.allowed,
          version: result.metadata.policyVersion
        });

        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    })();

    try {
      await writeFile(policyPath, JSON.stringify(blockDeletePolicy));
      await waitFor(() => engine.getPolicyVersion() === 2);

      for (let i = 0; i < 5; i += 1) {
        const result = engine.evaluate({
          agentId: 'agent-001',
          action: 'tool.execute',
          tool: 'file_delete'
        });
        decisions.push({
          allowed: result.allowed,
          version: result.metadata.policyVersion
        });
      }
    } finally {
      evaluating = false;
      await evaluationLoop;
      watcher.stop();
      await rm(dir, { recursive: true, force: true });
    }

    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions).not.toContainEqual(
      expect.objectContaining({ allowed: false, version: 1 })
    );
    expect(decisions).not.toContainEqual(
      expect.objectContaining({ allowed: true, version: 2 })
    );
  });

  it('uses ETag validators when polling HTTP policy sources', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createResponse(
        200,
        JSON.stringify(blockDeletePolicy),
        { etag: 'policy-v2', 'last-modified': 'Sun, 24 May 2026 10:00:00 GMT' }
      ))
      .mockResolvedValueOnce(createResponse(304, ''));
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const watcher = new PolicyWatcher({
        type: 'url',
        url: 'https://example.com/policy.json'
      });

      const first = await watcher.load();
      const second = await watcher.load();

      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
      expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/policy.json', {
        headers: {
          'If-None-Match': 'policy-v2',
          'If-Modified-Since': 'Sun, 24 May 2026 10:00:00 GMT'
        }
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
