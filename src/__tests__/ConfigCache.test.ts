/**
 * ConfigCache Tests
 * 
 * Tests for configuration caching system with TTL support
 */

import { ConfigCache, getConfigCache, cacheConfig } from '../serverless/ConfigCache';

describe('ConfigCache', () => {
  beforeEach(() => {
    ConfigCache.reset();
  });

  afterEach(() => {
    ConfigCache.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const cache1 = ConfigCache.getInstance();
      const cache2 = ConfigCache.getInstance();
      expect(cache1).toBe(cache2);
    });

    it('should reset singleton instance', () => {
      const cache1 = ConfigCache.getInstance();
      ConfigCache.reset();
      const cache2 = ConfigCache.getInstance();
      expect(cache1).not.toBe(cache2);
    });
  });

  describe('Basic Caching', () => {
    it('should cache and retrieve values', async () => {
      const cache = ConfigCache.getInstance();
      let computeCount = 0;

      const compute = () => {
        computeCount++;
        return { value: 'test' };
      };

      // First call should compute
      const result1 = await cache.get('key1', compute);
      expect(result1).toEqual({ value: 'test' });
      expect(computeCount).toBe(1);

      // Second call should use cache
      const result2 = await cache.get('key1', compute);
      expect(result2).toEqual({ value: 'test' });
      expect(computeCount).toBe(1); // Should not compute again
    });

    it('should handle async compute functions', async () => {
      const cache = ConfigCache.getInstance();
      
      const compute = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { value: 'async' };
      };

      const result = await cache.get('key1', compute);
      expect(result).toEqual({ value: 'async' });
    });

    it('should cache different keys separately', async () => {
      const cache = ConfigCache.getInstance();

      const result1 = await cache.get('key1', () => ({ value: 'one' }));
      const result2 = await cache.get('key2', () => ({ value: 'two' }));

      expect(result1).toEqual({ value: 'one' });
      expect(result2).toEqual({ value: 'two' });
    });
  });

  describe('TTL (Time-To-Live)', () => {
    it('should expire entries after TTL', async () => {
      const cache = ConfigCache.getInstance({ ttl: 100 }); // 100ms TTL
      let computeCount = 0;

      const compute = () => {
        computeCount++;
        return { value: 'test' };
      };

      // First call
      await cache.get('key1', compute);
      expect(computeCount).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should recompute after expiration
      await cache.get('key1', compute);
      expect(computeCount).toBe(2);
    });

    it('should not expire entries before TTL', async () => {
      const cache = ConfigCache.getInstance({ ttl: 1000 }); // 1 second TTL
      let computeCount = 0;

      const compute = () => {
        computeCount++;
        return { value: 'test' };
      };

      // First call
      await cache.get('key1', compute);
      expect(computeCount).toBe(1);

      // Wait less than TTL
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should use cache
      await cache.get('key1', compute);
      expect(computeCount).toBe(1);
    });
  });

  describe('Cache Size Management', () => {
    it('should enforce max cache size with LRU eviction', async () => {
      const cache = ConfigCache.getInstance({ maxSize: 3 });

      // Add 3 entries
      await cache.get('key1', () => ({ value: '1' }));
      await cache.get('key2', () => ({ value: '2' }));
      await cache.get('key3', () => ({ value: '3' }));

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);

      // Add 4th entry - should evict least recently used (key1)
      await cache.get('key4', () => ({ value: '4' }));

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should update LRU on access', async () => {
      const cache = ConfigCache.getInstance({ maxSize: 3 });

      // Add 3 entries
      await cache.get('key1', () => ({ value: '1' }));
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await cache.get('key2', () => ({ value: '2' }));
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await cache.get('key3', () => ({ value: '3' }));

      // Access key1 to make it recently used
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await cache.get('key1', () => ({ value: '1' }));

      // Add 4th entry - should evict key2 (now least recently used)
      await cache.get('key4', () => ({ value: '4' }));

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate specific keys', async () => {
      const cache = ConfigCache.getInstance();

      await cache.get('key1', () => ({ value: '1' }));
      await cache.get('key2', () => ({ value: '2' }));

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);

      cache.invalidate('key1');

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
    });

    it('should invalidate keys matching pattern', async () => {
      const cache = ConfigCache.getInstance();

      await cache.get('user:1', () => ({ value: '1' }));
      await cache.get('user:2', () => ({ value: '2' }));
      await cache.get('config:1', () => ({ value: '3' }));

      cache.invalidatePattern(/^user:/);

      expect(cache.has('user:1')).toBe(false);
      expect(cache.has('user:2')).toBe(false);
      expect(cache.has('config:1')).toBe(true);
    });

    it('should clear all entries', async () => {
      const cache = ConfigCache.getInstance();

      await cache.get('key1', () => ({ value: '1' }));
      await cache.get('key2', () => ({ value: '2' }));

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', async () => {
      const cache = ConfigCache.getInstance();

      // First access - miss
      await cache.get('key1', () => ({ value: '1' }));
      
      // Second access - hit
      await cache.get('key1', () => ({ value: '1' }));
      
      // Third access - hit
      await cache.get('key1', () => ({ value: '1' }));

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should calculate hit rate correctly', async () => {
      const cache = ConfigCache.getInstance();

      await cache.get('key1', () => ({ value: '1' }));
      await cache.get('key1', () => ({ value: '1' }));
      await cache.get('key2', () => ({ value: '2' }));

      const hitRate = cache.getHitRate();
      expect(hitRate).toBeCloseTo(33.33, 1); // 1 hit out of 3 requests
    });

    it('should provide detailed cache statistics', async () => {
      const cache = ConfigCache.getInstance();

      await cache.get('key1', () => ({ value: '1' }));
      await cache.get('key2', () => ({ value: '2' }));

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0]).toHaveProperty('key');
      expect(stats.entries[0]).toHaveProperty('age');
      expect(stats.entries[0]).toHaveProperty('accessCount');
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys for same config', () => {
      const cache = ConfigCache.getInstance();

      const config1 = { provider: 'openai', model: 'gpt-4' };
      const config2 = { provider: 'openai', model: 'gpt-4' };

      const key1 = cache.generateKey(config1);
      const key2 = cache.generateKey(config2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different configs', () => {
      const cache = ConfigCache.getInstance();

      const config1 = { provider: 'openai', model: 'gpt-4' };
      const config2 = { provider: 'anthropic', model: 'claude-3' };

      const key1 = cache.generateKey(config1);
      const key2 = cache.generateKey(config2);

      expect(key1).not.toBe(key2);
    });

    it('should handle key order independence', () => {
      const cache = ConfigCache.getInstance();

      const config1 = { a: 1, b: 2, c: 3 };
      const config2 = { c: 3, a: 1, b: 2 };

      const key1 = cache.generateKey(config1);
      const key2 = cache.generateKey(config2);

      expect(key1).toBe(key2);
    });

    it('should handle nested objects', () => {
      const cache = ConfigCache.getInstance();

      const config1 = { 
        provider: 'openai', 
        options: { temperature: 0.7, maxTokens: 100 } 
      };
      const config2 = { 
        provider: 'openai', 
        options: { temperature: 0.7, maxTokens: 100 } 
      };

      const key1 = cache.generateKey(config1);
      const key2 = cache.generateKey(config2);

      expect(key1).toBe(key2);
    });
  });

  describe('Performance Measurement', () => {
    it('should measure performance improvement', () => {
      const cache = ConfigCache.getInstance();

      const uncachedTime = 100; // ms
      const cachedTime = 10; // ms

      const improvement = cache.measurePerformanceImprovement(uncachedTime, cachedTime);
      expect(improvement).toBe(90); // 90% improvement
    });

    it('should handle zero uncached time', () => {
      const cache = ConfigCache.getInstance();

      const improvement = cache.measurePerformanceImprovement(0, 10);
      expect(improvement).toBe(0);
    });
  });

  describe('Disabled Cache', () => {
    it('should not cache when disabled', async () => {
      const cache = ConfigCache.getInstance({ enabled: false });
      let computeCount = 0;

      const compute = () => {
        computeCount++;
        return { value: 'test' };
      };

      await cache.get('key1', compute);
      await cache.get('key1', compute);

      expect(computeCount).toBe(2); // Should compute both times
    });

    it('should not store entries when disabled', () => {
      const cache = ConfigCache.getInstance({ enabled: false });

      cache.set('key1', { value: 'test' });

      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('Convenience Functions', () => {
    it('should work with getConfigCache', () => {
      const cache1 = getConfigCache();
      const cache2 = getConfigCache();
      expect(cache1).toBe(cache2);
    });

    it('should work with cacheConfig', async () => {
      let computeCount = 0;

      const compute = () => {
        computeCount++;
        return { value: 'test' };
      };

      await cacheConfig('key1', compute);
      await cacheConfig('key1', compute);

      expect(computeCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', async () => {
      const cache = ConfigCache.getInstance();

      const result = await cache.get('key1', () => null);
      expect(result).toBeNull();
    });

    it('should handle undefined values', async () => {
      const cache = ConfigCache.getInstance();

      const result = await cache.get('key1', () => undefined);
      expect(result).toBeUndefined();
    });

    it('should handle complex objects', async () => {
      const cache = ConfigCache.getInstance();

      const complexObj = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        date: new Date('2024-01-01'),
        regex: /test/
      };

      const result = await cache.get('key1', () => complexObj);
      expect(result).toEqual(complexObj);
    });

    it('should handle errors in compute function', async () => {
      const cache = ConfigCache.getInstance();

      const compute = () => {
        throw new Error('Compute error');
      };

      await expect(cache.get('key1', compute)).rejects.toThrow('Compute error');
    });
  });
});
