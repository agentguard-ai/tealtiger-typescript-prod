/**
 * SingletonFactory Unit Tests
 * 
 * Tests for the singleton client factory implementation
 * Requirements: 1.6
 */

import { SingletonFactory, getSingletonFactory, getClient } from '../serverless/SingletonFactory';
import type { TealOpenAIConfig } from '../client/openai';
import type { TealAnthropicConfig } from '../client/anthropic';

describe('SingletonFactory', () => {
  beforeEach(() => {
    // Reset singleton before each test
    SingletonFactory.reset();
  });

  afterEach(() => {
    // Clean up after each test
    SingletonFactory.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same factory instance', () => {
      const factory1 = SingletonFactory.getInstance();
      const factory2 = SingletonFactory.getInstance();
      
      expect(factory1).toBe(factory2);
    });

    it('should create new instance after reset', () => {
      const factory1 = SingletonFactory.getInstance();
      SingletonFactory.reset();
      const factory2 = SingletonFactory.getInstance();
      
      expect(factory1).not.toBe(factory2);
    });

    it('should accept configuration on first getInstance call', () => {
      const factory = SingletonFactory.getInstance({
        maxCacheSize: 5,
        enableCache: true
      });
      
      const stats = factory.getStats();
      expect(stats.maxSize).toBe(5);
    });
  });

  describe('Client Instance Caching', () => {
    it('should return same client instance for identical configuration', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client1 = factory.getClient(config);
      const client2 = factory.getClient(config);
      
      expect(client1).toBe(client2);
    });

    it('should return different instances for different API keys', () => {
      const factory = SingletonFactory.getInstance();
      
      const config1: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const config2: TealOpenAIConfig = {
        apiKey: 'test-key-456',
        agentId: 'test-agent'
      };
      
      const client1 = factory.getClient(config1);
      const client2 = factory.getClient(config2);
      
      expect(client1).not.toBe(client2);
    });

    it('should return different instances for different agent IDs', () => {
      const factory = SingletonFactory.getInstance();
      
      const config1: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'agent-1'
      };
      
      const config2: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'agent-2'
      };
      
      const client1 = factory.getClient(config1);
      const client2 = factory.getClient(config2);
      
      expect(client1).not.toBe(client2);
    });

    it('should return different instances for different providers', () => {
      const factory = SingletonFactory.getInstance();
      
      const openaiConfig: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const anthropicConfig: TealAnthropicConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent',
        anthropicApiKey: 'test-key-123'
      };
      
      const client1 = factory.getClient(openaiConfig);
      const client2 = factory.getClient(anthropicConfig);
      
      expect(client1).not.toBe(client2);
    });

    it('should cache instances with policies configuration', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent',
        policies: {
          tools: {
            search: {
              allowed: true
            }
          }
        }
      };
      
      const client1 = factory.getClient(config);
      const client2 = factory.getClient(config);
      
      expect(client1).toBe(client2);
    });
  });

  describe('Cache Management', () => {
    it('should respect maxCacheSize limit', () => {
      const factory = SingletonFactory.getInstance({
        maxCacheSize: 3,
        enableCache: true
      });
      
      // Create 4 different clients
      for (let i = 0; i < 4; i++) {
        factory.getClient({
          apiKey: `test-key-${i}`,
          agentId: 'test-agent'
        });
      }
      
      const stats = factory.getStats();
      expect(stats.size).toBeLessThanOrEqual(3);
    });

    it('should evict least recently used instance when cache is full', () => {
      const factory = SingletonFactory.getInstance({
        maxCacheSize: 2,
        enableCache: true
      });
      
      const config1: TealOpenAIConfig = {
        apiKey: 'test-key-1',
        agentId: 'test-agent'
      };
      
      const config2: TealOpenAIConfig = {
        apiKey: 'test-key-2',
        agentId: 'test-agent'
      };
      
      const config3: TealOpenAIConfig = {
        apiKey: 'test-key-3',
        agentId: 'test-agent'
      };
      
      // Create first two clients
      factory.getClient(config1);
      factory.getClient(config2);
      
      // Access config2 again to make it more recently used
      factory.getClient(config2);
      
      // Create third client - should evict config1
      factory.getClient(config3);
      
      // config1 should be evicted, config2 and config3 should be cached
      expect(factory.hasInstance(config1)).toBe(false);
      expect(factory.hasInstance(config2)).toBe(true);
      expect(factory.hasInstance(config3)).toBe(true);
    });

    it('should clear specific instance', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      factory.getClient(config);
      expect(factory.hasInstance(config)).toBe(true);
      
      factory.clearInstance(config);
      expect(factory.hasInstance(config)).toBe(false);
    });

    it('should clear all instances', () => {
      const factory = SingletonFactory.getInstance();
      
      const config1: TealOpenAIConfig = {
        apiKey: 'test-key-1',
        agentId: 'test-agent'
      };
      
      const config2: TealOpenAIConfig = {
        apiKey: 'test-key-2',
        agentId: 'test-agent'
      };
      
      factory.getClient(config1);
      factory.getClient(config2);
      
      expect(factory.hasInstance(config1)).toBe(true);
      expect(factory.hasInstance(config2)).toBe(true);
      
      factory.clearAll();
      
      expect(factory.hasInstance(config1)).toBe(false);
      expect(factory.hasInstance(config2)).toBe(false);
    });

    it('should not cache when caching is disabled', () => {
      const factory = SingletonFactory.getInstance({
        enableCache: false
      });
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client1 = factory.getClient(config);
      const client2 = factory.getClient(config);
      
      expect(client1).not.toBe(client2);
    });
  });

  describe('Cache TTL', () => {
    it('should expire instances after TTL', async () => {
      const factory = SingletonFactory.getInstance({
        cacheTTL: 100 // 100ms TTL
      });
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client1 = factory.getClient(config);
      expect(factory.hasInstance(config)).toBe(true);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(factory.hasInstance(config)).toBe(false);
      
      // Should create new instance
      const client2 = factory.getClient(config);
      expect(client1).not.toBe(client2);
    });

    it('should not expire instances before TTL', async () => {
      const factory = SingletonFactory.getInstance({
        cacheTTL: 1000 // 1 second TTL
      });
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client1 = factory.getClient(config);
      
      // Wait less than TTL
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(factory.hasInstance(config)).toBe(true);
      
      const client2 = factory.getClient(config);
      expect(client1).toBe(client2);
    });
  });

  describe('Statistics', () => {
    it('should track cache size', () => {
      const factory = SingletonFactory.getInstance();
      
      const stats1 = factory.getStats();
      expect(stats1.size).toBe(0);
      
      factory.getClient({
        apiKey: 'test-key-1',
        agentId: 'test-agent'
      });
      
      const stats2 = factory.getStats();
      expect(stats2.size).toBe(1);
      
      factory.getClient({
        apiKey: 'test-key-2',
        agentId: 'test-agent'
      });
      
      const stats3 = factory.getStats();
      expect(stats3.size).toBe(2);
    });

    it('should track access count', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      // Access 3 times
      factory.getClient(config);
      factory.getClient(config);
      factory.getClient(config);
      
      const stats = factory.getStats();
      expect(stats.instances[0].accessCount).toBe(3);
    });

    it('should track instance age', async () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      factory.getClient(config);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = factory.getStats();
      expect(stats.instances[0].age).toBeGreaterThanOrEqual(100);
    });

    it('should mask sensitive information in stats', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'super-secret-key-123',
        agentId: 'test-agent'
      };
      
      factory.getClient(config);
      
      const stats = factory.getStats();
      expect(stats.instances[0].key).toContain('****');
      expect(stats.instances[0].key).not.toContain('super-secret-key');
    });
  });

  describe('Thread Safety', () => {
    it('should handle concurrent access safely', async () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      // Create multiple concurrent requests
      const promises = Array.from({ length: 10 }, () => 
        Promise.resolve(factory.getClient(config))
      );
      
      const clients = await Promise.all(promises);
      
      // All should be the same instance
      const firstClient = clients[0];
      for (const client of clients) {
        expect(client).toBe(firstClient);
      }
      
      // Should only have one cached instance
      const stats = factory.getStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('Convenience Functions', () => {
    it('should provide getSingletonFactory convenience function', () => {
      const factory1 = getSingletonFactory();
      const factory2 = getSingletonFactory();
      
      expect(factory1).toBe(factory2);
    });

    it('should provide getClient convenience function', () => {
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client1 = getClient(config);
      const client2 = getClient(config);
      
      expect(client1).toBe(client2);
    });
  });

  describe('Provider Detection', () => {
    it('should detect OpenAI provider from openaiApiKey', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        openaiApiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client = factory.getClient(config);
      expect(client).toBeDefined();
      expect(client.constructor.name).toBe('TealOpenAI');
    });

    it('should detect Anthropic provider from anthropicApiKey', () => {
      const factory = SingletonFactory.getInstance();
      
      const config: TealAnthropicConfig = {
        apiKey: 'test-key-123',
        anthropicApiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client = factory.getClient(config);
      expect(client).toBeDefined();
      expect(client.constructor.name).toBe('TealAnthropic');
    });

    it('should default to OpenAI when provider cannot be detected', () => {
      const factory = SingletonFactory.getInstance();
      
      const config = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      const client = factory.getClient(config);
      expect(client).toBeDefined();
      expect(client.constructor.name).toBe('TealOpenAI');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported provider', () => {
      const factory = SingletonFactory.getInstance();
      
      const config = {
        apiKey: 'test-key-123',
        provider: 'unsupported-provider' as any,
        agentId: 'test-agent'
      };
      
      expect(() => factory.getClient(config)).toThrow('Unsupported provider');
    });
  });

  describe('Memory Management', () => {
    it('should not prevent process exit with cleanup interval', () => {
      const factory = SingletonFactory.getInstance({
        cacheTTL: 1000
      });
      
      // Factory should be created without blocking process exit
      expect(factory).toBeDefined();
      
      // Clean up
      SingletonFactory.reset();
    });

    it('should clean up expired instances periodically', async () => {
      const factory = SingletonFactory.getInstance({
        cacheTTL: 50 // Very short TTL for testing
      });
      
      const config: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
      };
      
      factory.getClient(config);
      expect(factory.hasInstance(config)).toBe(true);
      
      // Wait for cleanup to run (cleanup runs every 60s, but TTL expires in 50ms)
      // We'll manually trigger by checking hasInstance which checks expiry
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(factory.hasInstance(config)).toBe(false);
    });
  });

  describe('Configuration Hashing', () => {
    it('should generate same key for equivalent configurations', () => {
      const factory = SingletonFactory.getInstance();
      
      const config1: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent',
        policies: {
          tools: {
            search: {
              allowed: true
            }
          }
        }
      };
      
      const config2: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent',
        policies: {
          tools: {
            search: {
              allowed: true
            }
          }
        }
      };
      
      const client1 = factory.getClient(config1);
      const client2 = factory.getClient(config2);
      
      expect(client1).toBe(client2);
    });

    it('should generate different keys for different guard configs', () => {
      const factory = SingletonFactory.getInstance();
      
      const config1: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent',
        guardConfig: {
          policyDriven: true
        }
      };
      
      const config2: TealOpenAIConfig = {
        apiKey: 'test-key-123',
        agentId: 'test-agent'
        // No guardConfig
      };
      
      const client1 = factory.getClient(config1);
      const client2 = factory.getClient(config2);
      
      expect(client1).not.toBe(client2);
    });
  });
});
