/**
 * TealMultiProvider Unit Tests
 */

import { TealMultiProvider, ProviderConfig, RequestContext } from '../TealMultiProvider';
import { TealOpenAI } from '../TealOpenAI';
import { TealAnthropic } from '../TealAnthropic';

// Mock clients
jest.mock('../TealOpenAI');
jest.mock('../TealAnthropic');

describe('TealMultiProvider', () => {
  let multiProvider: TealMultiProvider;
  let mockOpenAI: jest.Mocked<TealOpenAI>;
  let mockAnthropic: jest.Mocked<TealAnthropic>;
  let mockOpenAICreate: jest.Mock;
  let mockAnthropicCreate: jest.Mock;

  beforeEach(() => {
    // Create mock functions
    mockOpenAICreate = jest.fn().mockResolvedValue({
      id: 'chatcmpl-123',
      choices: [{ message: { content: 'OpenAI response' } }],
      security: {
        costRecord: { actualCost: 0.002 }
      }
    });

    mockAnthropicCreate = jest.fn().mockResolvedValue({
      id: 'msg_123',
      content: [{ text: 'Anthropic response' }],
      security: {
        costRecord: { actualCost: 0.003 }
      }
    });

    // Create mock clients
    mockOpenAI = {
      chat: {
        completions: {
          create: mockOpenAICreate
        }
      }
    } as any;

    mockAnthropic = {
      messages: {
        create: mockAnthropicCreate
      }
    } as any;

    multiProvider = new TealMultiProvider();
  });

  describe('Provider Registration', () => {
    it('should register a provider', () => {
      const config: ProviderConfig = {
        type: 'openai',
        name: 'openai-primary',
        client: mockOpenAI,
        priority: 10
      };

      multiProvider.registerProvider(config);
      const providers = multiProvider.getProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('openai-primary');
      expect(providers[0].type).toBe('openai');
      expect(providers[0].priority).toBe(10);
    });

    it('should register multiple providers', () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-primary',
        client: mockOpenAI,
        priority: 10
      });

      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic-backup',
        client: mockAnthropic,
        priority: 5
      });

      const providers = multiProvider.getProviders();
      expect(providers).toHaveLength(2);
    });

    it('should set default values for optional fields', () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-test',
        client: mockOpenAI
      });

      const provider = multiProvider.getProviders()[0];
      expect(provider.priority).toBe(0);
      expect(provider.enabled).toBe(true);
      expect(provider.useCases).toEqual([]);
      expect(provider.costWeight).toBe(1.0);
    });

    it('should unregister a provider', () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-test',
        client: mockOpenAI
      });

      expect(multiProvider.getProviders()).toHaveLength(1);

      multiProvider.unregisterProvider('openai-test');
      expect(multiProvider.getProviders()).toHaveLength(0);
    });

    it('should get only enabled providers', () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-enabled',
        client: mockOpenAI,
        enabled: true
      });

      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic-disabled',
        client: mockAnthropic,
        enabled: false
      });

      const enabledProviders = multiProvider.getEnabledProviders();
      expect(enabledProviders).toHaveLength(1);
      expect(enabledProviders[0].name).toBe('openai-enabled');
    });
  });

  describe('Routing Strategies', () => {
    beforeEach(() => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-high',
        client: mockOpenAI,
        priority: 10,
        costWeight: 1.5
      });

      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic-medium',
        client: mockAnthropic,
        priority: 5,
        costWeight: 1.0
      });
    });

    it('should route by priority (default)', async () => {
      const response = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(response.provider).toBe('openai-high');
      expect(response.providerType).toBe('openai');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should route round-robin', async () => {
      multiProvider.updateConfig({ strategy: 'round-robin' });

      // First request -> openai-high
      const response1 = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test1' }]
      });
      expect(response1.provider).toBe('openai-high');

      // Second request -> anthropic-medium
      const response2 = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test2' }]
      });
      expect(response2.provider).toBe('anthropic-medium');

      // Third request -> back to openai-high
      const response3 = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test3' }]
      });
      expect(response3.provider).toBe('openai-high');
    });

    it('should route by cost', async () => {
      multiProvider.updateConfig({ strategy: 'cost' });

      const response = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      // anthropic-medium has lower costWeight (1.0 vs 1.5)
      expect(response.provider).toBe('anthropic-medium');
      expect(mockAnthropic.messages.create).toHaveBeenCalled();
    });

    it('should route by use case', async () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-coding',
        client: mockOpenAI,
        priority: 8,
        useCases: ['code-generation', 'code-review']
      });

      multiProvider.updateConfig({ strategy: 'use-case' });

      const response = await multiProvider.execute(
        'chat',
        { messages: [{ role: 'user', content: 'write code' }] },
        { useCase: 'code-generation' }
      );

      expect(response.provider).toBe('openai-coding');
    });

    it('should fallback to priority when use case not found', async () => {
      multiProvider.updateConfig({ strategy: 'use-case' });

      const response = await multiProvider.execute(
        'chat',
        { messages: [{ role: 'user', content: 'test' }] },
        { useCase: 'non-existent-use-case' }
      );

      expect(response.provider).toBe('openai-high');
    });

    it('should use custom routing function', async () => {
      const customRouter = jest.fn((_context: RequestContext, providers: ProviderConfig[]) => {
        return providers.find(p => p.name === 'anthropic-medium')!;
      });

      multiProvider.updateConfig({
        strategy: 'custom',
        customRouter
      });

      const response = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(customRouter).toHaveBeenCalled();
      expect(response.provider).toBe('anthropic-medium');
    });
  });

  describe('Failover Logic', () => {
    beforeEach(() => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-primary',
        client: mockOpenAI,
        priority: 10
      });

      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic-backup',
        client: mockAnthropic,
        priority: 5
      });
    });

    it('should failover to backup provider on error', async () => {
      // Make primary provider fail
      mockOpenAICreate.mockRejectedValueOnce(
        new Error('Primary provider failed')
      );

      const response = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(response.provider).toBe('anthropic-backup');
      expect(response.failover).toBeDefined();
      expect(response.failover?.attempted).toContain('openai-primary');
      expect(response.failover?.reason).toContain('Primary provider failed');
    });

    it('should respect maxFailoverAttempts', async () => {
      multiProvider.updateConfig({ maxFailoverAttempts: 1 });

      // Make both providers fail
      mockOpenAICreate.mockRejectedValue(
        new Error('OpenAI failed')
      );
      mockAnthropicCreate.mockRejectedValue(
        new Error('Anthropic failed')
      );

      await expect(
        multiProvider.execute('chat', {
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrow('All providers failed');
    });

    it('should disable failover when configured', async () => {
      multiProvider.updateConfig({ enableFailover: false });

      mockOpenAICreate.mockRejectedValue(
        new Error('Primary failed')
      );

      await expect(
        multiProvider.execute('chat', {
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrow('All providers failed');

      // Should not have tried backup
      expect(mockAnthropic.messages.create).not.toHaveBeenCalled();
    });

    it('should throw error when no providers available', async () => {
      const emptyProvider = new TealMultiProvider();

      await expect(
        emptyProvider.execute('chat', {
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrow('No enabled providers available');
    });
  });

  describe('Metrics Aggregation', () => {
    beforeEach(() => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-test',
        client: mockOpenAI,
        priority: 10
      });
    });

    it('should track requests per provider', async () => {
      await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test1' }]
      });

      await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test2' }]
      });

      const metrics = multiProvider.getMetrics();
      expect(metrics.requestsByProvider['openai-test']).toBe(2);
      expect(metrics.totalRequests).toBe(2);
    });

    it('should track cost per provider', async () => {
      await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      const metrics = multiProvider.getMetrics();
      expect(metrics.costByProvider['openai-test']).toBe(0.002);
      expect(metrics.totalCost).toBe(0.002);
    });

    it('should track success rate', async () => {
      // Successful request
      await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test1' }]
      });

      // Failed request
      mockOpenAICreate.mockRejectedValueOnce(
        new Error('Failed')
      );

      try {
        await multiProvider.execute('chat', {
          messages: [{ role: 'user', content: 'test2' }]
        });
      } catch (e) {
        // Expected
      }

      const metrics = multiProvider.getMetrics();
      expect(metrics.successRateByProvider['openai-test']).toBe(0.5);
    });

    it('should track average latency', async () => {
      await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      const metrics = multiProvider.getMetrics();
      expect(metrics.latencyByProvider['openai-test']).toBeGreaterThanOrEqual(0);
    });

    it('should reset metrics', async () => {
      await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      let metrics = multiProvider.getMetrics();
      expect(metrics.totalRequests).toBe(1);

      multiProvider.resetMetrics();

      metrics = multiProvider.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.requestsByProvider['openai-test']).toBe(0);
    });

    it('should disable metrics when configured', async () => {
      const noMetricsProvider = new TealMultiProvider({
        enableMetrics: false
      });

      noMetricsProvider.registerProvider({
        type: 'openai',
        name: 'openai-test',
        client: mockOpenAI
      });

      await noMetricsProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      const metrics = noMetricsProvider.getMetrics();
      expect(metrics.totalRequests).toBe(0);
    });
  });

  describe('Provider-Specific Execution', () => {
    it('should execute OpenAI chat request', async () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-test',
        client: mockOpenAI
      });

      const response = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'test' }]
      });
      expect(response.response.choices[0].message.content).toBe('OpenAI response');
    });

    it('should execute Anthropic chat request', async () => {
      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic-test',
        client: mockAnthropic
      });

      const response = await multiProvider.execute('chat', {
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'test' }]
      });
      expect(response.response.content[0].text).toBe('Anthropic response');
    });

    it('should throw error for unsupported provider type', async () => {
      multiProvider.registerProvider({
        type: 'unknown' as any,
        name: 'unknown-test',
        client: {} as any
      });

      await expect(
        multiProvider.execute('chat', {
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrow('Unsupported provider type');
    });

    it('should throw error for unsupported method', async () => {
      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai-test',
        client: mockOpenAI
      });

      await expect(
        multiProvider.execute('unsupportedMethod', {})
      ).rejects.toThrow('Unsupported method');
    });
  });

  describe('Configuration Management', () => {
    it('should get current configuration', () => {
      const config = multiProvider.getConfig();
      expect(config.strategy).toBe('priority');
      expect(config.enableFailover).toBe(true);
      expect(config.maxFailoverAttempts).toBe(3);
    });

    it('should update configuration', () => {
      multiProvider.updateConfig({
        strategy: 'round-robin',
        maxFailoverAttempts: 5
      });

      const config = multiProvider.getConfig();
      expect(config.strategy).toBe('round-robin');
      expect(config.maxFailoverAttempts).toBe(5);
    });
  });
});
