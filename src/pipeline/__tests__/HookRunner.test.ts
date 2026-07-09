/**
 * Unit tests for HookRunner — non-blocking lifecycle hook execution.
 *
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { HookRunner } from '../HookRunner';
import type { PipelineHooks } from '../types';

describe('HookRunner', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should accept no hooks and default to empty object', () => {
      const runner = new HookRunner();
      expect(runner.getHookTime()).toBe(0);
    });

    it('should accept undefined hooks', () => {
      const runner = new HookRunner(undefined);
      expect(runner.getHookTime()).toBe(0);
    });

    it('should accept a PipelineHooks object', () => {
      const hooks: PipelineHooks = {
        beforePreExecution: jest.fn(),
      };
      const runner = new HookRunner(hooks);
      expect(runner.getHookTime()).toBe(0);
    });
  });

  describe('run()', () => {
    it('should do nothing when hook is not registered', async () => {
      const runner = new HookRunner({});
      await runner.run('beforePreExecution', { payload: {} });
      // Should not throw and should complete immediately
      expect(runner.getHookTime()).toBe(0);
    });

    it('should invoke a registered sync hook with the correct arguments', async () => {
      const mockHook = jest.fn();
      const hooks: PipelineHooks = { beforePreExecution: mockHook };
      const runner = new HookRunner(hooks);
      const request = { payload: { model: 'gpt-4' } };

      await runner.run('beforePreExecution', request);

      expect(mockHook).toHaveBeenCalledTimes(1);
      expect(mockHook).toHaveBeenCalledWith(request);
    });

    it('should invoke a registered async hook and await it', async () => {
      let resolved = false;
      const asyncHook = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolved = true;
      });
      const hooks: PipelineHooks = { afterPreExecution: asyncHook };
      const runner = new HookRunner(hooks);

      await runner.run('afterPreExecution', { action: 'ALLOW', reason_codes: [], stage: 'PRE_EXECUTION', latency_ms: 5, module_details: [] });

      expect(resolved).toBe(true);
      expect(asyncHook).toHaveBeenCalledTimes(1);
    });

    it('should pass multiple arguments to onRemediation hook', async () => {
      const mockHook = jest.fn();
      const hooks: PipelineHooks = { onRemediation: mockHook };
      const runner = new HookRunner(hooks);

      const action = 'RESAMPLE';
      const decision = { action: 'DENY', reason_codes: ['TEST'], stage: 'POST_EXECUTION' as any, latency_ms: 10, module_details: [] };
      const attempt = 1;

      await runner.run('onRemediation', action, decision, attempt);

      expect(mockHook).toHaveBeenCalledWith(action, decision, attempt);
    });

    it('should catch and log sync hook exceptions without propagating', async () => {
      const error = new Error('hook failed');
      const throwingHook = jest.fn(() => { throw error; });
      const hooks: PipelineHooks = { beforeExecution: throwingHook as any };
      const runner = new HookRunner(hooks);

      // Should NOT throw
      await expect(runner.run('beforeExecution', { payload: {} })).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HookRunner] Hook "beforeExecution" threw an error:',
        'hook failed',
      );
    });

    it('should catch and log async hook rejections without propagating', async () => {
      const asyncThrowingHook = jest.fn(async () => {
        throw new Error('async hook failed');
      });
      const hooks: PipelineHooks = { afterExecution: asyncThrowingHook as any };
      const runner = new HookRunner(hooks);

      await expect(runner.run('afterExecution', {}, { model: 'gpt-4', latency_ms: 100, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }, cost_usd: 0.01 })).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HookRunner] Hook "afterExecution" threw an error:',
        'async hook failed',
      );
    });

    it('should log non-Error exceptions correctly', async () => {
      const throwingHook = jest.fn(() => { throw 'string error'; });
      const hooks: PipelineHooks = { beforePreExecution: throwingHook as any };
      const runner = new HookRunner(hooks);

      await runner.run('beforePreExecution', { payload: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HookRunner] Hook "beforePreExecution" threw an error:',
        'string error',
      );
    });

    it('should accumulate hook execution time', async () => {
      const slowHook = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      const hooks: PipelineHooks = { beforePreExecution: slowHook };
      const runner = new HookRunner(hooks);

      await runner.run('beforePreExecution', { payload: {} });

      // Should have accumulated at least some time (>= 40ms allowing for timing jitter)
      expect(runner.getHookTime()).toBeGreaterThanOrEqual(40);
    });

    it('should accumulate time across multiple hook invocations', async () => {
      const hookA = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      const hookB = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      const hooks: PipelineHooks = {
        beforePreExecution: hookA,
        afterPreExecution: hookB,
      };
      const runner = new HookRunner(hooks);

      await runner.run('beforePreExecution', { payload: {} });
      await runner.run('afterPreExecution', { action: 'ALLOW', reason_codes: [], stage: 'PRE_EXECUTION' as any, latency_ms: 5, module_details: [] });

      // Combined time should be at least 30ms (allowing for jitter)
      expect(runner.getHookTime()).toBeGreaterThanOrEqual(30);
    });

    it('should still accumulate time even when hook throws', async () => {
      const slowThrowingHook = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 20));
        throw new Error('delayed failure');
      });
      const hooks: PipelineHooks = { beforePostExecution: slowThrowingHook as any };
      const runner = new HookRunner(hooks);

      await runner.run('beforePostExecution', {}, { payload: {} });

      expect(runner.getHookTime()).toBeGreaterThanOrEqual(15);
    });
  });

  describe('getHookTime()', () => {
    it('should return 0 when no hooks have been run', () => {
      const runner = new HookRunner({});
      expect(runner.getHookTime()).toBe(0);
    });

    it('should return 0 when only undefined hooks are called', async () => {
      const runner = new HookRunner({});
      await runner.run('beforePreExecution', { payload: {} });
      await runner.run('afterPreExecution', {});
      expect(runner.getHookTime()).toBe(0);
    });
  });

  describe('reset()', () => {
    it('should reset the accumulated hook time to zero', async () => {
      const slowHook = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      const hooks: PipelineHooks = { beforePreExecution: slowHook };
      const runner = new HookRunner(hooks);

      await runner.run('beforePreExecution', { payload: {} });
      expect(runner.getHookTime()).toBeGreaterThan(0);

      runner.reset();
      expect(runner.getHookTime()).toBe(0);
    });

    it('should allow re-accumulation after reset', async () => {
      const hook = jest.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      const hooks: PipelineHooks = { beforePreExecution: hook };
      const runner = new HookRunner(hooks);

      await runner.run('beforePreExecution', { payload: {} });
      runner.reset();
      await runner.run('beforePreExecution', { payload: {} });

      // Should reflect only the second run
      expect(runner.getHookTime()).toBeGreaterThanOrEqual(5);
    });
  });
});
