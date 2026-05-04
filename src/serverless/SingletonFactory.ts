/**
 * SingletonFactory - Client Instance Caching System
 * 
 * Implements singleton pattern for TealTiger client instances to optimize
 * memory usage and initialization time in serverless environments.
 * 
 * Requirements: 1.6
 */

import { TealOpenAI, TealAnthropic } from '../client';
import type { TealClientConfig } from '../client/base';
import type { TealOpenAIConfig } from '../client/openai';
import type { TealAnthropicConfig } from '../client/anthropic';
import type { ProviderName } from './LazyLoader';

/**
 * Configuration for any provider client
 */
export type AnyClientConfig = 
  | TealOpenAIConfig 
  | TealAnthropicConfig 
  | (TealClientConfig & { provider?: ProviderName });

/**
 * Base provider client type
 */
export type ProviderClient = TealOpenAI | TealAnthropic | any;

/**
 * Configuration for SingletonFactory
 */
export interface SingletonFactoryConfig {
  /**
   * Maximum number of cached instances (default: 10)
   */
  maxCacheSize?: number;
  
  /**
   * Enable instance caching (default: true)
   */
  enableCache?: boolean;
  
  /**
   * TTL for cached instances in milliseconds (default: 5 minutes)
   */
  cacheTTL?: number;
}

/**
 * Cached instance with metadata
 */
interface CachedInstance {
  client: ProviderClient;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * SingletonFactory manages client instance caching and reuse
 * 
 * This factory ensures that identical configurations return the same
 * client instance, optimizing memory usage and initialization time
 * in serverless environments where warm invocations can reuse instances.
 */
export class SingletonFactory {
  private static instance: SingletonFactory;
  private instances: Map<string, CachedInstance> = new Map();
  private config: Required<SingletonFactoryConfig>;
  private cleanupInterval?: NodeJS.Timeout | undefined;

  private constructor(config: SingletonFactoryConfig = {}) {
    this.config = {
      maxCacheSize: config.maxCacheSize ?? 10,
      enableCache: config.enableCache ?? true,
      cacheTTL: config.cacheTTL ?? 300000 // 5 minutes
    };

    // Start periodic cleanup if caching is enabled
    if (this.config.enableCache && this.config.cacheTTL > 0) {
      this.startCleanupInterval();
    }
  }

  /**
   * Get singleton instance of the factory
   */
  public static getInstance(config?: SingletonFactoryConfig): SingletonFactory {
    if (!SingletonFactory.instance) {
      SingletonFactory.instance = new SingletonFactory(config);
    }
    return SingletonFactory.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    if (SingletonFactory.instance) {
      SingletonFactory.instance.stopCleanupInterval();
      SingletonFactory.instance.instances.clear();
    }
    SingletonFactory.instance = null as any;
  }

  /**
   * Get or create a client instance
   * 
   * Returns cached instance if configuration matches, otherwise creates new instance
   */
  public getClient<T extends ProviderClient = ProviderClient>(
    config: AnyClientConfig
  ): T {
    // If caching is disabled, always create new instance
    if (!this.config.enableCache) {
      return this.createClient<T>(config);
    }

    const key = this.generateKey(config);

    // Check if instance exists and is not expired
    const cached = this.instances.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      
      // Return cached instance if not expired
      if (age < this.config.cacheTTL) {
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        return cached.client as T;
      } else {
        // Remove expired instance
        this.instances.delete(key);
      }
    }

    // Create new instance
    const client = this.createClient<T>(config);

    // Cache the instance
    this.cacheInstance(key, client);

    return client;
  }

  /**
   * Check if a client instance exists for the given configuration
   */
  public hasInstance(config: AnyClientConfig): boolean {
    const key = this.generateKey(config);
    const cached = this.instances.get(key);
    
    if (!cached) {
      return false;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age >= this.config.cacheTTL) {
      this.instances.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear a specific cached instance
   */
  public clearInstance(config: AnyClientConfig): void {
    const key = this.generateKey(config);
    this.instances.delete(key);
  }

  /**
   * Clear all cached instances
   */
  public clearAll(): void {
    this.instances.clear();
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    maxSize: number;
    instances: Array<{
      key: string;
      age: number;
      accessCount: number;
      lastAccessed: number;
    }>;
  } {
    const now = Date.now();
    const instances = Array.from(this.instances.entries()).map(([key, cached]) => ({
      key: this.maskKey(key),
      age: now - cached.timestamp,
      accessCount: cached.accessCount,
      lastAccessed: cached.lastAccessed
    }));

    return {
      size: this.instances.size,
      maxSize: this.config.maxCacheSize,
      instances
    };
  }

  /**
   * Generate cache key from configuration
   * 
   * Uses configuration hash to determine instance identity
   */
  private generateKey(config: AnyClientConfig): string {
    // Extract key components
    const provider = this.detectProvider(config);
    const apiKey = config.apiKey || '';
    const agentId = config.agentId || 'default';
    
    // Create a stable hash of the configuration
    // Use first 8 chars of API key for uniqueness without storing full key
    const apiKeyHash = this.hashString(apiKey).substring(0, 8);
    
    // Include relevant config options that affect client behavior
    const configOptions = {
      agentId,
      // Add other relevant config fields that affect client behavior
      ...(config.policies && { hasPolicies: true }),
      ...(config.guardConfig && { hasGuardConfig: true }),
      ...(config.monitorConfig && { hasMonitorConfig: true }),
      ...(config.circuitConfig && { hasCircuitConfig: true }),
      ...(config.auditConfig && { hasAuditConfig: true })
    };
    
    const optionsHash = this.hashString(JSON.stringify(configOptions));
    
    return `${provider}:${apiKeyHash}:${optionsHash}`;
  }

  /**
   * Detect provider from configuration
   */
  private detectProvider(config: AnyClientConfig): ProviderName {
    // Check for explicit provider field
    if ('provider' in config && config.provider) {
      return config.provider;
    }

    // Detect from config type
    if ('openaiApiKey' in config || 'organization' in config) {
      return 'openai';
    }
    if ('anthropicApiKey' in config) {
      return 'anthropic';
    }
    if ('model' in config && typeof config.model === 'string') {
      // Try to detect from model name
      if (config.model.includes('gpt')) return 'openai';
      if (config.model.includes('claude')) return 'anthropic';
      if (config.model.includes('gemini')) return 'gemini';
    }

    // Default to openai
    return 'openai';
  }

  /**
   * Create a new client instance
   */
  private createClient<T extends ProviderClient>(config: AnyClientConfig): T {
    const provider = this.detectProvider(config);

    switch (provider) {
      case 'openai':
        return new TealOpenAI(config as TealOpenAIConfig) as T;
      
      case 'anthropic':
        return new TealAnthropic(config as TealAnthropicConfig) as T;
      
      // Add other providers as they become available
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Cache a client instance
   */
  private cacheInstance(key: string, client: ProviderClient): void {
    // Enforce max cache size using LRU eviction
    if (this.instances.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }

    this.instances.set(key, {
      client,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * Evict least recently used instance
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.instances.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.instances.delete(oldestKey);
    }
  }

  /**
   * Start periodic cleanup of expired instances
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
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Clean up expired instances
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.instances.entries()) {
      const age = now - cached.timestamp;
      if (age >= this.config.cacheTTL) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.instances.delete(key);
    }
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Mask sensitive parts of cache key for logging
   */
  private maskKey(key: string): string {
    const parts = key.split(':');
    if (parts.length >= 2) {
      // Mask the API key hash
      parts[1] = '****';
    }
    return parts.join(':');
  }
}

/**
 * Convenience function to get singleton factory instance
 */
export function getSingletonFactory(config?: SingletonFactoryConfig): SingletonFactory {
  return SingletonFactory.getInstance(config);
}

/**
 * Convenience function to get or create a client
 */
export function getClient<T extends ProviderClient = ProviderClient>(
  config: AnyClientConfig
): T {
  const factory = getSingletonFactory();
  return factory.getClient<T>(config);
}
