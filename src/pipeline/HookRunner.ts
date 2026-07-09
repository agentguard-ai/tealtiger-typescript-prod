/**
 * HookRunner — Non-blocking lifecycle hook execution with error isolation.
 *
 * Executes pipeline lifecycle hooks safely: exceptions are logged but never
 * propagated, and hook execution time is measured and accumulated separately
 * from stage evaluation time.
 *
 * @module pipeline/HookRunner
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import type { PipelineHooks } from './types';

export class HookRunner {
  private readonly hooks: PipelineHooks;
  private totalHookTime: number = 0;

  constructor(hooks?: PipelineHooks) {
    this.hooks = hooks ?? {};
  }

  /**
   * Run a named hook safely.
   *
   * - If the hook is not registered (undefined), returns immediately.
   * - If the hook is sync or async, it is awaited.
   * - If the hook throws, the error is logged via console.error but never propagated.
   * - Execution time is measured and accumulated in `totalHookTime`.
   *
   * @param hookName - The key of the hook to invoke from PipelineHooks
   * @param args - Arguments to pass to the hook function
   */
  async run(hookName: keyof PipelineHooks, ...args: any[]): Promise<void> {
    const hook = this.hooks[hookName];
    if (!hook) {
      return;
    }

    const start = Date.now();
    try {
      await (hook as (...a: any[]) => void | Promise<void>)(...args);
    } catch (error) {
      // Hooks are non-blocking and non-fatal — log and continue
      console.error(
        `[HookRunner] Hook "${hookName}" threw an error:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      const elapsed = Date.now() - start;
      this.totalHookTime += elapsed;
    }
  }

  /**
   * Get the total accumulated hook execution time in milliseconds.
   */
  getHookTime(): number {
    return this.totalHookTime;
  }

  /**
   * Reset the accumulated hook time counter to zero.
   * Useful for reusing the HookRunner across multiple pipeline executions.
   */
  reset(): void {
    this.totalHookTime = 0;
  }
}
