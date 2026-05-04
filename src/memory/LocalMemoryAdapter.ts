/**
 * LocalMemoryAdapter — In-memory Map-based adapter for testing
 *
 * Implements the MemoryAdapter interface using a simple Map store.
 * Not intended for production use.
 *
 * @module memory/LocalMemoryAdapter
 */

import type {
  MemoryAdapter,
  MemoryRecord,
  MemoryQuery,
  MemoryDelete,
  MemoryOperationContext,
} from './types';

export class LocalMemoryAdapter implements MemoryAdapter {
  private store: Map<string, MemoryRecord> = new Map();
  private counter = 0;

  async put(record: MemoryRecord, _ctx: MemoryOperationContext): Promise<{ id: string }> {
    const id = record.id ?? `mem-${++this.counter}`;
    const stored: MemoryRecord = { ...record, id };
    this.store.set(id, stored);
    return { id };
  }

  async get(query: MemoryQuery, _ctx: MemoryOperationContext): Promise<MemoryRecord[]> {
    const results: MemoryRecord[] = [];
    const max = query.maxResults ?? Infinity;

    for (const record of this.store.values()) {
      if (results.length >= max) break;
      if (record.scope !== query.scope) continue;

      if (query.selector) {
        const { tags, prefix, contains } = query.selector;
        if (tags && tags.length > 0) {
          const recordTags = record.tags ?? [];
          if (!tags.some((t) => recordTags.includes(t))) continue;
        }
        if (prefix && !record.value.startsWith(prefix)) continue;
        if (contains && !record.value.includes(contains)) continue;
      }

      results.push({ ...record });
    }

    return results;
  }

  async delete(selector: MemoryDelete, _ctx: MemoryOperationContext): Promise<void> {
    const toDelete: string[] = [];

    for (const [id, record] of this.store.entries()) {
      if (record.scope !== selector.scope) continue;

      if (selector.selector) {
        if (selector.selector.id && id !== selector.selector.id) continue;
        if (selector.selector.tags && selector.selector.tags.length > 0) {
          const recordTags = record.tags ?? [];
          if (!selector.selector.tags.some((t) => recordTags.includes(t))) continue;
        }
      }

      toDelete.push(id);
    }

    for (const id of toDelete) {
      this.store.delete(id);
    }
  }
}
