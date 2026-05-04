/**
 * ColdStartOptimizer - Cold Start Performance Optimization
 * 
 * Implements optimizations to reduce cold start time in serverless environments:
 * - Connection pooling for warm invocations
 * - Environment variable-based configuration loading
 * - Async initialization for non-blocking startup
 * - Performance measurement utilities
 * 
 * Requirements: 1.4, 1.8, 1.10
 */

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  /**
   * Maximum number of connections to pool
   */
  maxConnections?: number;
  
  /**
   * Connection idle timeout in milliseconds
   */
  idleTimeout?: number;
  
  /**
   * Enable connection pooling (default: true in serverless)
   */
  enabled?: boolean;
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  /**
   * API key from environment variable
   */
  apiKey?: string;
  
  /**
   * Agent ID from environment variable
   */
  agentId?: string;
  
  /**
   * Provider from environment variable
   */
  provider?: string;
  
  /**
   * Custom environment variables
   */
  custom?: Record<string, string>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /**
   * Cold start time in milliseconds
   */
  coldStartTime: number;
  
  /**
   * Warm start time in milliseconds
   */
  warmStartTime?: number;
  
  /**
   * Initialization time in milliseconds
   */
  initTime: number;
  
  /**
   * Configuration load time in milliseconds
   */
  configLoadTime: number;
  
  /**
   * Connection pool setup time in milliseconds
   */
  poolSetupTime?: number;
  
  /**
   * Total invocations
   */
  invocations: number;
  
  /**
   * Warm invocations (reused connections)
   */
  warmInvocations: number;
}

/**
 * Connection pool entry
 */
interface PooledConnection {
  id: string;
  connection: any;
  created: number;
  lastUsed: number;
  useCount: number;
}

/**
 * ColdStartOptimizer manages cold start performance optimizations
 */
export class ColdStartOptimizer {
  private static instance: ColdStartOptimizer;
  private connectionPool: Map<string, PooledConnection> = new Map();
  private poolConfig: Required<ConnectionPoolConfig>;
  private metrics: PerformanceMetrics;
  private startTime: number;
  private initialized: boolean = false;
  private initPromise?: Promise<void>;

  private constructor(config: ConnectionPoolConfig = {}) {
    this.startTime = Date.now();
    this.poolConfig = {
      maxConnections: config.maxConnections ?? 10,
      idleTimeout: config.idleTimeout ?? 300000, // 5 minutes
      enabled: config.enabled ?? this.isServerlessEnvironment()
    };
    
    this.metrics = {
      coldStartTime: 0,
      initTime: 0,
      configLoadTime: 0,
      invocations: 0,
      warmInvocations: 0
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: ConnectionPoolConfig): ColdStartOptimizer {
    if (!ColdStartOptimizer.instance) {
      ColdStartOptimizer.instance = new ColdStartOptimizer(config);
    }
    return ColdStartOptimizer.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    if (ColdStartOptimizer.instance) {
      ColdStartOptimizer.instance.clearPool();
    }
    ColdStartOptimizer.instance = null as any;
  }

  /**
   * Initialize optimizer asynchronously (non-blocking)
   * 
   * This allows the function to start processing while initialization
   * completes in the background.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Return existing initialization promise if in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    const initStart = Date.now();
    
    this.initPromise = (async () => {
      // Load configuration from environment
      const configStart = Date.now();
      await this.loadEnvironmentConfig();
      this.metrics.configLoadTime = Date.now() - configStart;
      
      // Setup connection pool if enabled
      if (this.poolConfig.enabled) {
        const poolStart = Date.now();
        await this.setupConnectionPool();
        this.metrics.poolSetupTime = Date.now() - poolStart;
      }
      
      this.metrics.initTime = Date.now() - initStart;
      this.metrics.coldStartTime = Date.now() - this.startTime;
      this.initialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Get or create a pooled connection
   * 
   * @param key - Connection identifier
   * @param factory - Function to create new connection
   * @returns Pooled connection
   */
  public async getConnection<T = any>(
    key: string,
    factory: () => T | Promise<T>
  ): Promise<T> {
    this.metrics.invocations++;

    if (!this.poolConfig.enabled) {
      return factory();
    }

    // Check for existing connection
    const pooled = this.connectionPool.get(key);
    if (pooled) {
      // Check if connection is still valid (not expired)
      const age = Date.now() - pooled.lastUsed;
      if (age < this.poolConfig.idleTimeout) {
        pooled.lastUsed = Date.now();
        pooled.useCount++;
        this.metrics.warmInvocations++;
        return pooled.connection as T;
      } else {
        // Remove expired connection
        this.connectionPool.delete(key);
      }
    }

    // Create new connection
    const connection = await factory();
    
    // Add to pool
    this.addToPool(key, connection);
    
    return connection;
  }

  /**
   * Load configuration from environment variables
   * 
   * This is faster than loading from files or remote sources
   */
  public loadEnvironmentConfig(): EnvironmentConfig {
    const config: EnvironmentConfig = {};

    const apiKey = process.env.TEALTIGER_API_KEY || process.env.API_KEY;
    const agentId = process.env.TEALTIGER_AGENT_ID || process.env.AGENT_ID;
    const provider = process.env.TEALTIGER_PROVIDER || process.env.PROVIDER;

    if (apiKey) config.apiKey = apiKey;
    if (agentId) config.agentId = agentId;
    if (provider) config.provider = provider;

    // Load custom environment variables with TEALTIGER_ prefix
    const custom: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('TEALTIGER_') && !['TEALTIGER_API_KEY', 'TEALTIGER_AGENT_ID', 'TEALTIGER_PROVIDER'].includes(key)) {
        const customKey = key.replace('TEALTIGER_', '').toLowerCase();
        if (value) {
          custom[customKey] = value;
        }
      }
    }
    
    if (Object.keys(custom).length > 0) {
      config.custom = custom;
    }

    return config;
  }

  /**
   * Get performance metrics
   * 
   * @returns Current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Measure cold start time
   * 
   * @returns Cold start time in milliseconds
   */
  public measureColdStart(): number {
    return this.metrics.coldStartTime;
  }

  /**
   * Measure warm start time
   * 
   * @returns Average warm start time in milliseconds
   */
  public measureWarmStart(): number {
    if (this.metrics.warmInvocations === 0) {
      return 0;
    }
    return this.metrics.warmStartTime || 0;
  }

  /**
   * Calculate warm invocation rate
   * 
   * @returns Percentage of warm invocations (0-100)
   */
  public getWarmRate(): number {
    if (this.metrics.invocations === 0) {
      return 0;
    }
    return (this.metrics.warmInvocations / this.metrics.invocations) * 100;
  }

  /**
   * Get connection pool statistics
   * 
   * @returns Pool statistics
   */
  public getPoolStats(): {
    size: number;
    maxSize: number;
    connections: Array<{
      id: string;
      age: number;
      useCount: number;
    }>;
  } {
    const now = Date.now();
    const connections = Array.from(this.connectionPool.entries()).map(([id, pooled]) => ({
      id,
      age: now - pooled.created,
      useCount: pooled.useCount
    }));

    return {
      size: this.connectionPool.size,
      maxSize: this.poolConfig.maxConnections,
      connections
    };
  }

  /**
   * Clear connection pool
   */
  public clearPool(): void {
    this.connectionPool.clear();
  }

  /**
   * Remove expired connections from pool
   */
  public cleanupPool(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, pooled] of this.connectionPool.entries()) {
      const age = now - pooled.lastUsed;
      if (age >= this.poolConfig.idleTimeout) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.connectionPool.delete(key);
    }
  }

  /**
   * Check if running in serverless environment
   */
  private isServerlessEnvironment(): boolean {
    return !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AZURE_FUNCTIONS_ENVIRONMENT ||
      process.env.FUNCTION_NAME || // GCP Cloud Functions
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.CLOUDFLARE_WORKERS ||
      process.env.DENO_DEPLOYMENT_ID
    );
  }

  /**
   * Setup connection pool
   */
  private async setupConnectionPool(): Promise<void> {
    // Pre-warm the pool if needed
    // This is a placeholder for future implementation
    return Promise.resolve();
  }

  /**
   * Add connection to pool
   */
  private addToPool(key: string, connection: any): void {
    // Enforce max pool size using LRU eviction
    if (this.connectionPool.size >= this.poolConfig.maxConnections) {
      this.evictLRU();
    }

    this.connectionPool.set(key, {
      id: key,
      connection,
      created: Date.now(),
      lastUsed: Date.now(),
      useCount: 1
    });
  }

  /**
   * Evict least recently used connection
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, pooled] of this.connectionPool.entries()) {
      if (pooled.lastUsed < oldestTime) {
        oldestTime = pooled.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.connectionPool.delete(oldestKey);
    }
  }
}

/**
 * Performance measurement utility
 */
export class PerformanceMeasurement {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Start measuring an operation
   * 
   * @returns Start time
   */
  public start(): number {
    return Date.now();
  }

  /**
   * End measuring an operation
   * 
   * @param name - Operation name
   * @param startTime - Start time from start()
   */
  public end(name: string, startTime: number): number {
    const duration = Date.now() - startTime;
    
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    
    this.measurements.get(name)!.push(duration);
    
    return duration;
  }

  /**
   * Get statistics for an operation
   * 
   * @param name - Operation name
   * @returns Statistics
   */
  public getStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const measurements = this.measurements.get(name);
    
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    };
  }

  /**
   * Get all measurements
   * 
   * @returns All measurements
   */
  public getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const stats: Record<string, ReturnType<typeof this.getStats>> = {};
    
    for (const name of this.measurements.keys()) {
      stats[name] = this.getStats(name);
    }
    
    return stats;
  }

  /**
   * Clear all measurements
   */
  public clear(): void {
    this.measurements.clear();
  }
}

/**
 * Convenience function to get ColdStartOptimizer instance
 */
export function getColdStartOptimizer(config?: ConnectionPoolConfig): ColdStartOptimizer {
  return ColdStartOptimizer.getInstance(config);
}

/**
 * Convenience function to create performance measurement utility
 */
export function createPerformanceMeasurement(): PerformanceMeasurement {
  return new PerformanceMeasurement();
}
