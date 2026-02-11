/**
 * PolicyCache - LRU Cache for Policy Evaluation Results
 * 
 * Provides efficient caching of policy evaluation results with:
 * - LRU (Least Recently Used) eviction strategy
 * - TTL (Time To Live) support
 * - Automatic cleanup of expired entries
 * - Cache statistics
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 * 
 * @module core/engine/PolicyCache
 */

import { PolicyEvaluationResult, CacheEntry, RequestContext } from './types';

/**
 * PolicyCache - LRU cache for policy evaluation results
 * 
 * Implements an LRU (Least Recently Used) cache with TTL support.
 * Automatically evicts least recently used entries when cache is full.
 * Expired entries are removed on access and during periodic cleanup.
 * 
 * @example
 * ```typescript
 * const cache = new PolicyCache({
 *   maxSize: 1000,
 *   ttl: 60000 // 1 minute
 * });
 * 
 * const key = cache.generateKey(context);
 * cache.set(key, result);
 * 
 * const cached = cache.get(key);
 * if (cached) {
 *   console.log('Cache hit!');
 * }
 * ```
 */
export class PolicyCache {
  /** Cache storage */
  private cache: Map<string, CacheEntry>;

  /** LRU order tracking (most recent at end) */
  private order: string[];

  /** Maximum cache size */
  private maxSize: number;

  /** Time to live in milliseconds */
  private ttl: number;

  /** Whether cache is enabled */
  private enabled: boolean;

  /**
   * Creates a new PolicyCache instance
   * 
   * @param options - Cache configuration options
   */
  constructor(options?: {
    /** Maximum number of entries (default: 1000) */
    maxSize?: number;
    /** TTL in milliseconds (default: 60000 = 1 minute) */
    ttl?: number;
    /** Whether cache is enabled (default: true) */
    enabled?: boolean;
  }) {
    this.cache = new Map();
    this.order = [];
    this.maxSize = options?.maxSize ?? 1000;
    this.ttl = options?.ttl ?? 60000;
    this.enabled = options?.enabled ?? true;
  }

  /**
   * Gets a cached result if valid
   * 
   * @param key - Cache key
   * @returns Cached result or null if not found or expired
   */
  public get(key: string): PolicyEvaluationResult | null {
    if (!this.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.updateLRU(key);

    return entry.result;
  }

  /**
   * Stores a result in cache
   * 
   * @param key - Cache key
   * @param result - Evaluation result to cache
   */
  public set(key: string, result: PolicyEvaluationResult): void {
    if (!this.enabled) {
      return;
    }

    // If key already exists, remove from order
    if (this.cache.has(key)) {
      this.order = this.order.filter(k => k !== key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used entry
      this.evictLRU();
    }

    // Add entry
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Add to end of order (most recent)
    this.order.push(key);

    // Cleanup if cache is getting large
    if (this.cache.size > this.maxSize * 1.2) {
      this.cleanup();
    }
  }

  /**
   * Deletes an entry from cache
   * 
   * @param key - Cache key
   */
  public delete(key: string): void {
    this.cache.delete(key);
    this.order = this.order.filter(k => k !== key);
  }

  /**
   * Clears all entries from cache
   */
  public clear(): void {
    this.cache.clear();
    this.order = [];
  }

  /**
   * Gets cache statistics
   * 
   * @returns Cache statistics
   */
  public getStats(): {
    size: number;
    maxSize: number;
    enabled: boolean;
    ttl: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      enabled: this.enabled,
      ttl: this.ttl,
    };
  }

  /**
   * Generates a cache key from request context
   * 
   * Creates a deterministic key based on:
   * - Agent ID
   * - Action
   * - Tool (if applicable)
   * - Model (if applicable)
   * 
   * @param context - Request context
   * @returns Cache key
   */
  public generateKey(context: RequestContext): string {
    const parts = [
      context.agentId,
      context.action,
      context.tool || '',
      context.model || '',
    ];
    return parts.join(':');
  }

  /**
   * Enables or disables the cache
   * 
   * @param enabled - Whether cache should be enabled
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Updates the TTL
   * 
   * @param ttl - New TTL in milliseconds
   */
  public setTTL(ttl: number): void {
    this.ttl = ttl;
  }

  /**
   * Updates LRU order for a key
   * 
   * @private
   * @param key - Cache key
   */
  private updateLRU(key: string): void {
    // Remove from current position
    this.order = this.order.filter(k => k !== key);
    // Add to end (most recent)
    this.order.push(key);
  }

  /**
   * Evicts the least recently used entry
   * 
   * @private
   */
  private evictLRU(): void {
    if (this.order.length === 0) {
      return;
    }

    // Remove first entry (least recently used)
    const lruKey = this.order.shift()!;
    this.cache.delete(lruKey);
  }

  /**
   * Removes expired entries from cache
   * 
   * @private
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }
  }
}
