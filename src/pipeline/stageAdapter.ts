/**
 * Stage Adapter Utility
 *
 * Wraps an existing v1.2 TealModule with a pipeline stage assignment,
 * enabling composability with the multi-stage defense pipeline without
 * modifying the original module.
 *
 * @module pipeline/stageAdapter
 * @requirements 8.1, 8.2, 8.3
 */

import type { TealModule } from '../core/engine/v1.2/types';
import { PipelineStage } from './types';

/**
 * Wrap a v1.2 TealModule with a stage assignment.
 * The module is used as-is — no interface changes required.
 *
 * Creates a shallow copy of the module that preserves the original's
 * prototype chain (so instanceof checks still work) and adds a `stage`
 * property indicating which pipeline stage the module is assigned to.
 *
 * The original module is NOT modified.
 *
 * @param module - Any v1.2 TealModule (TealSecrets, TealRegistry, TealMemory, etc.)
 * @param stage - The pipeline stage to assign the module to
 * @returns A new object that implements TealModule with an additional `stage` property
 *
 * @example
 * ```typescript
 * import { assignStage } from './stageAdapter';
 * import { TealSecrets } from '../modules/TealSecrets';
 * import { PipelineStage } from './types';
 *
 * const secrets = new TealSecrets({ patterns: [...] });
 * const preSecrets = assignStage(secrets, PipelineStage.PRE_EXECUTION);
 * // preSecrets.stage === 'PRE_EXECUTION'
 * // preSecrets.evaluate() delegates to the original module
 * ```
 */
export function assignStage(module: TealModule, stage: PipelineStage): TealModule & { stage: PipelineStage } {
  return Object.assign(Object.create(Object.getPrototypeOf(module)), module, { stage });
}
