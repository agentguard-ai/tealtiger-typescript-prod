/**
 * TealSecrets — Detection Cache
 *
 * L1 in-memory LRU cache with configurable TTL and max entries.
 * Cache key is SHA-256 of content. Invalidates on custom pattern registration.
 *
 * @module secrets/DetectionCache
 */

import { createHash } from 'crypto';
import { CacheOptions, SecretFindingFull } from './types';

interface CacheEntry {
  findings: SecretFindingFull[];
  timestamp: number;
}

const DEFAULT_OPTIONS: CacheOptions = {
  enabled: true,
  maxEntries: 10_000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

export class DetectionCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly options: CacheOptions;
  private hits = 0;
  private misses = 0;

  constructor(options?: Partial<CacheOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Generate cache key from content using SHA-256 */
  private key(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /** Get cached findings for content, or null if miss/expired */
  get(content: string): SecretFindingFull[] | null {
    if (!this.options.enabled) {
      this.misses++;
      return null;
    }

    const k = this.key(content);
    const entry = this.cache.get(k);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.options.ttlMs) {
      this.cache.delete(k);
      this.misses++;
      return null;
    }

    // Move to end for LRU (delete + re-insert)
    this.cache.delete(k);
    this.cache.set(k, entry);

    this.hits++;
    return entry.findings;
  }

  /** Store findings in cache */
  set(content: string, findings: SecretFindingFull[]): void {
    if (!this.options.enabled) return;

    const k = this.key(content);

    // Evict oldest if at capacity
    if (this.cache.size >= this.options.maxEntries && !this.cache.has(k)) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(k, { findings, timestamp: Date.now() });
  }

  /** Invalidate entire cache (e.g., on custom pattern registration) */
  invalidate(): void {
    this.cache.clear();
  }

  /** Get cache statistics */
  getStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }
}
