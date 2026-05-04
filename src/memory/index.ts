/**
 * TealMemory Module — Public API
 *
 * @module memory
 */

export { TealMemory } from './TealMemory';
export { LocalMemoryAdapter } from './LocalMemoryAdapter';
export type {
  MemoryScope,
  Classification,
  MemoryRecord,
  MemoryQuery,
  MemoryDelete,
  MemoryAdapter,
  MemoryOperationContext,
  TealMemoryOptions,
  TealMemoryPolicy,
} from './types';
