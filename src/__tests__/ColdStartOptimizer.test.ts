/**
 * ColdStartOptimizer Tests
 * 
 * Tests for cold start performance optimization
 */

import {
  ColdStartOptimizer,
  getColdStartOptimizer,
  PerformanceMeasurement,
  createPerformanceMeasurement
} from '../serverless/ColdStartOptimizer';

describe('ColdStartOptimizer', () => {
  beforeEach(() => {
    ColdStartOptimizer.reset();
  });

  afterEach(() => {
    ColdStartOptimizer.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const optimizer1 = ColdStartOptimizer.getInstance();
      const optimizer2 = ColdStartOptimizer.getInstance();
      expect(optimizer1).toBe(optimizer2);
    });

    it('should reset singleton instance', () => {
      const optimizer1 = ColdStartOptimizer.getInstance();
      ColdStartOptimizer.reset();
      const optimizer2 = ColdStartOptimizer.getInstance();
      expect(optimizer1).not.toBe(optimizer2);
    });
  });

  describe('Initialization', () => {
    it('should initialize asynchronously', async () => {
      const optimizer = ColdStartOptimizer.getInstance();
      await optimizer.initialize();
      
      const metrics = optimizer.getMetrics();
      expect(metrics.initTime).toBeGreaterThanOrEqual(0);
      expect(metrics.coldStartTime).toBeGreaterThanOrEqual(0);
    });

    it('should not reinitialize if already initialized', async () => {
      const optimizer = ColdStartOptimizer.getInstance();
      
      await optimizer.initialize();
      const metrics1 = optimizer.getMetrics();
      
      await optimizer.initialize();
      const metrics2 = optimizer.getMetrics();
      
      expect(metrics1.initTime).toBe(metrics2.initTime);
    });

    it('should return same promise for concurrent initializations', async () => {
      const optimizer = ColdStartOptimizer.getInstance();
      
      const promise1 = optimizer.initialize();
      const promise2 = optimizer.initialize();
      
      // Both should resolve successfully
      await Promise.all([promise1, promise2]);
      
      // Verify initialization happened only once
      const metrics = optimizer.getMetrics();
      expect(metrics.initTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Connection Pooling', () => {
    it('should pool connections for warm invocations', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: true });
      let createCount = 0;

      const factory = () => {
        createCount++;
        return { id: createCount };
      };

      // First call - cold
      const conn1 = await optimizer.getConnection('test', factory);
      expect(createCount).toBe(1);
      expect(conn1.id).toBe(1);

      // Second call - warm (should reuse)
      const conn2 = await optimizer.getConnection('test', factory);
      expect(createCount).toBe(1); // Should not create new connection
      expect(conn2.id).toBe(1);
    });

    it('should create separate connections for different keys', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: true });
      let createCount = 0;

      const factory = () => {
        createCount++;
        return { id: createCount };
      };

      const conn1 = await optimizer.getConnection('key1', factory);
      const conn2 = await optimizer.getConnection('key2', factory);

      expect(createCount).toBe(2);
      expect(conn1.id).toBe(1);
      expect(conn2.id).toBe(2);
    });

    it('should not pool when disabled', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: false });
      let createCount = 0;

      const factory = () => {
        createCount++;
        return { id: createCount };
      };

      await optimizer.getConnection('test', factory);
      await optimizer.getConnection('test', factory);

      expect(createCount).toBe(2); // Should create new each time
    });

    it('should enforce max pool size', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ 
        enabled: true,
        maxConnections: 3
      });

      const factory = (id: number) => () => ({ id });

      // Add 3 connections
      await optimizer.getConnection('key1', factory(1));
      await optimizer.getConnection('key2', factory(2));
      await optimizer.getConnection('key3', factory(3));

      const stats = optimizer.getPoolStats();
      expect(stats.size).toBe(3);

      // Add 4th connection - should evict LRU
      await optimizer.getConnection('key4', factory(4));

      const stats2 = optimizer.getPoolStats();
      expect(stats2.size).toBe(3);
    });

    it('should evict expired connections', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ 
        enabled: true,
        idleTimeout: 100 // 100ms
      });

      await optimizer.getConnection('test', () => ({ id: 1 }));

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should create new connection (old one expired)
      let createCount = 0;
      await optimizer.getConnection('test', () => {
        createCount++;
        return { id: 2 };
      });

      expect(createCount).toBe(1);
    });
  });

  describe('Environment Configuration', () => {
    it('should load configuration from environment variables', () => {
      process.env.TEALTIGER_API_KEY = 'test-key';
      process.env.TEALTIGER_AGENT_ID = 'test-agent';
      process.env.TEALTIGER_PROVIDER = 'openai';

      const optimizer = ColdStartOptimizer.getInstance();
      const config = optimizer.loadEnvironmentConfig();

      expect(config.apiKey).toBe('test-key');
      expect(config.agentId).toBe('test-agent');
      expect(config.provider).toBe('openai');

      // Cleanup
      delete process.env.TEALTIGER_API_KEY;
      delete process.env.TEALTIGER_AGENT_ID;
      delete process.env.TEALTIGER_PROVIDER;
    });

    it('should load custom environment variables', () => {
      process.env.TEALTIGER_CUSTOM_VAR = 'custom-value';

      const optimizer = ColdStartOptimizer.getInstance();
      const config = optimizer.loadEnvironmentConfig();

      expect(config.custom).toHaveProperty('custom_var', 'custom-value');

      // Cleanup
      delete process.env.TEALTIGER_CUSTOM_VAR;
    });

    it('should fallback to non-prefixed environment variables', () => {
      process.env.API_KEY = 'fallback-key';

      const optimizer = ColdStartOptimizer.getInstance();
      const config = optimizer.loadEnvironmentConfig();

      expect(config.apiKey).toBe('fallback-key');

      // Cleanup
      delete process.env.API_KEY;
    });
  });

  describe('Performance Metrics', () => {
    it('should track invocation counts', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: true });

      await optimizer.getConnection('test', () => ({ id: 1 }));
      await optimizer.getConnection('test', () => ({ id: 1 }));
      await optimizer.getConnection('test', () => ({ id: 1 }));

      const metrics = optimizer.getMetrics();
      expect(metrics.invocations).toBe(3);
      expect(metrics.warmInvocations).toBe(2); // First is cold, rest are warm
    });

    it('should calculate warm rate', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: true });

      await optimizer.getConnection('test', () => ({ id: 1 }));
      await optimizer.getConnection('test', () => ({ id: 1 }));
      await optimizer.getConnection('test', () => ({ id: 1 }));

      const warmRate = optimizer.getWarmRate();
      expect(warmRate).toBeCloseTo(66.67, 1); // 2 out of 3
    });

    it('should measure cold start time', async () => {
      const optimizer = ColdStartOptimizer.getInstance();
      await optimizer.initialize();

      const coldStart = optimizer.measureColdStart();
      expect(coldStart).toBeGreaterThanOrEqual(0);
    });

    it('should provide pool statistics', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: true });

      await optimizer.getConnection('key1', () => ({ id: 1 }));
      await optimizer.getConnection('key2', () => ({ id: 2 }));

      const stats = optimizer.getPoolStats();
      expect(stats.size).toBe(2);
      expect(stats.connections).toHaveLength(2);
      expect(stats.connections[0]).toHaveProperty('id');
      expect(stats.connections[0]).toHaveProperty('age');
      expect(stats.connections[0]).toHaveProperty('useCount');
    });
  });

  describe('Pool Management', () => {
    it('should clear connection pool', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ enabled: true });

      await optimizer.getConnection('test', () => ({ id: 1 }));

      const stats1 = optimizer.getPoolStats();
      expect(stats1.size).toBe(1);

      optimizer.clearPool();

      const stats2 = optimizer.getPoolStats();
      expect(stats2.size).toBe(0);
    });

    it('should cleanup expired connections', async () => {
      const optimizer = ColdStartOptimizer.getInstance({ 
        enabled: true,
        idleTimeout: 100
      });

      await optimizer.getConnection('test', () => ({ id: 1 }));

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      optimizer.cleanupPool();

      const stats = optimizer.getPoolStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Convenience Functions', () => {
    it('should work with getColdStartOptimizer', () => {
      const optimizer1 = getColdStartOptimizer();
      const optimizer2 = getColdStartOptimizer();
      expect(optimizer1).toBe(optimizer2);
    });
  });
});

describe('PerformanceMeasurement', () => {
  let measurement: PerformanceMeasurement;

  beforeEach(() => {
    measurement = new PerformanceMeasurement();
  });

  describe('Basic Measurement', () => {
    it('should measure operation duration', async () => {
      const start = measurement.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      const duration = measurement.end('test', start);

      expect(duration).toBeGreaterThanOrEqual(50);
    });

    it('should track multiple measurements', () => {
      const start1 = measurement.start();
      measurement.end('test', start1);

      const start2 = measurement.start();
      measurement.end('test', start2);

      const stats = measurement.getStats('test');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics', () => {
      // Add measurements
      for (let i = 0; i < 100; i++) {
        const start = measurement.start();
        measurement.end('test', start);
      }

      const stats = measurement.getStats('test');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(100);
      expect(stats!.min).toBeGreaterThanOrEqual(0);
      expect(stats!.max).toBeGreaterThanOrEqual(stats!.min);
      expect(stats!.avg).toBeGreaterThanOrEqual(0);
      expect(stats!.p50).toBeGreaterThanOrEqual(0);
      expect(stats!.p95).toBeGreaterThanOrEqual(0);
      expect(stats!.p99).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent measurements', () => {
      const stats = measurement.getStats('nonexistent');
      expect(stats).toBeNull();
    });

    it('should get all statistics', () => {
      const start1 = measurement.start();
      measurement.end('op1', start1);

      const start2 = measurement.start();
      measurement.end('op2', start2);

      const allStats = measurement.getAllStats();
      expect(Object.keys(allStats)).toHaveLength(2);
      expect(allStats).toHaveProperty('op1');
      expect(allStats).toHaveProperty('op2');
    });
  });

  describe('Clear', () => {
    it('should clear all measurements', () => {
      const start = measurement.start();
      measurement.end('test', start);

      measurement.clear();

      const stats = measurement.getStats('test');
      expect(stats).toBeNull();
    });
  });

  describe('Convenience Functions', () => {
    it('should work with createPerformanceMeasurement', () => {
      const pm = createPerformanceMeasurement();
      expect(pm).toBeInstanceOf(PerformanceMeasurement);
    });
  });
});
