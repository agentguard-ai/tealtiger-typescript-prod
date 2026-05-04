/**
 * ConfigCache - Configuration Caching System
 * 
 * Implements configuration caching with TTL support to reduce parsing overhead
 * in serverless environments where warm invocations can reuse cached configurations.
 * 
 * Requirements: 1.7
 */

/**
 * Configuration cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  hash: string;
}

/**
 * Configuration for ConfigCache
 */
export interface ConfigCacheConfig {
  /**
   * Time-to-live for cached configurations in milliseconds (default: 5 minutes)
   */
  ttl?: number;
  
  /**
   * Maximum number of cached configurations (default: 50)
   */
  maxSize?: number;
  
  /**
   * Enable cache (default: true)
   */
  enabled?: boolean;
  
  /**
   * Enable automatic cleanup of expired entries (default: true)
   */
  autoCleanup?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  entries: Array<{
    key: string;
    age: number;
    accessCount: number;
    lastAccessed: number;
  }>;
}

/**
 * ConfigCache manages configuration caching with TTL support
 * 
 * This cache reduces parsing overhead by storing parsed configurations
 * and reusing them across warm invocations in serverless environments.
 */
export class ConfigCache {
  private static instance: ConfigCache;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: Required<ConfigCacheConfig>;
  private cleanupInterval?: NodeJS.Timeout | undefined;
  private stats = {
    hits: 0,
    misses: 0
  };

  private constructor(config: ConfigCacheConfig = {}) {
    this.config = {
      ttl: config.ttl ?? 300000, // 5 minutes
      maxSize: config.maxSize ?? 50,
      enabled: config.enabled ?? true,
      autoCleanup: config.autoCleanup ?? true
    };

    // Start automatic cleanup if enabled
    if (this.config.enabled && this.config.autoCleanup) {
      this.startCleanupInterval();
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: ConfigCacheConfig): ConfigCache {
    if (!ConfigCache.instance) {
      ConfigCache.instance = new ConfigCache(config);
    }
    return ConfigCache.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    if (ConfigCache.instance) {
      ConfigCache.instance.stopCleanupInterval();
      ConfigCache.instance.cache.clear();
      ConfigCache.instance.stats = { hits: 0, misses: 0 };
    }
    ConfigCache.instance = null as any;
  }

  /**
   * Get cached configuration or compute and cache it
   * 
   * @param key - Cache key
   * @param compute - Function to compute value if not cached
   * @returns Cached or computed value
   */
  public async get<T>(
    key: string,
    compute: () => T | Promise<T>
  ): Promise<T> {
    if (!this.config.enabled) {
      return compute();
    }

    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      
      // Return cached value if not expired
      if (age < this.config.ttl) {
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        this.stats.hits++;
        return cached.value as T;
      } else {
        // Remove expired entry
        this.cache.delete(key);
      }
    }

    // Cache miss - compute value
    this.stats.misses++;
    const value = await compute();
    
    // Cache the value
    this.set(key, value);
    
    return value;
  }

  /**
   * Set a value in the cache
   * 
   * @param key - Cache key
   * @param value - Value to cache
   */
  public set<T>(key: string, value: T): void {
    if (!this.config.enabled) {
      return;
    }

    // Enforce max cache size using LRU eviction
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const hash = this.hashValue(value);
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
      hash
    });
  }

  /**
   * Check if a key exists in cache and is not expired
   * 
   * @param key - Cache key
   * @returns True if key exists and is valid
   */
  public has(key: string): boolean {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return false;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age >= this.config.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific cache entry
   * 
   * @param key - Cache key to invalidate
   */
  public invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   * 
   * @param pattern - RegExp pattern to match keys
   */
  public invalidatePattern(pattern: RegExp): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache statistics including hit rate and entry details
   */
  public getStats(): CacheStats {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, cached]) => ({
      key,
      age: now - cached.timestamp,
      accessCount: cached.accessCount,
      lastAccessed: cached.lastAccessed
    }));

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      entries
    };
  }

  /**
   * Generate cache key from configuration object
   * 
   * @param config - Configuration object
   * @returns Cache key string
   */
  public generateKey(config: any): string {
    // Sort keys for consistent hashing
    const sortedConfig = this.sortObject(config);
    const configString = JSON.stringify(sortedConfig);
    return this.hashString(configString);
  }

  /**
   * Measure cache hit rate
   * 
   * @returns Hit rate as a percentage (0-100)
   */
  public getHitRate(): number {
    const totalRequests = this.stats.hits + this.stats.misses;
    if (totalRequests === 0) {
      return 0;
    }
    return (this.stats.hits / totalRequests) * 100;
  }

  /**
   * Measure performance improvement from caching
   * 
   * @param uncachedTime - Time taken without cache (ms)
   * @param cachedTime - Time taken with cache (ms)
   * @returns Performance improvement as a percentage
   */
  public measurePerformanceImprovement(
    uncachedTime: number,
    cachedTime: number
  ): number {
    if (uncachedTime === 0) {
      return 0;
    }
    return ((uncachedTime - cachedTime) / uncachedTime) * 100;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.cache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null as any;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.cache.entries()) {
      const age = now - cached.timestamp;
      if (age >= this.config.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Hash a value for comparison
   */
  private hashValue(value: any): string {
    const valueString = JSON.stringify(value);
    return this.hashString(valueString);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    // Handle null/undefined
    if (!str) {
      return '0';
    }
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObject(obj[key]);
    }

    return sorted;
  }
}

/**
 * Convenience function to get ConfigCache instance
 */
export function getConfigCache(config?: ConfigCacheConfig): ConfigCache {
  return ConfigCache.getInstance(config);
}

/**
 * Convenience function to cache a configuration
 */
export async function cacheConfig<T>(
  key: string,
  compute: () => T | Promise<T>,
  config?: ConfigCacheConfig
): Promise<T> {
  const cache = getConfigCache(config);
  return cache.get(key, compute);
}
