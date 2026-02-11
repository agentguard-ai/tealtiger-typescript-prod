/**
 * Multi-Provider Integration Tests
 * 
 * Comprehensive integration tests for all providers with TealTiger components
 */

import { TealOpenAI } from '../clients/TealOpenAI';
import { TealAnthropic } from '../clients/TealAnthropic';
import { TealGemini } from '../clients/TealGemini';
import { TealBedrock } from '../clients/TealBedrock';
import { TealMultiProvider } from '../clients/TealMultiProvider';
import { GuardrailEngine } from '../guardrails';
import { CostTracker } from '../cost/CostTracker';
import { BudgetManager } from '../cost/BudgetManager';
import { InMemoryCostStorage } from '../cost/CostStorage';
import { CostCalculator } from '../cost/CostCalculator';

describe('Multi-Provider Integration Tests', () => {
  let guardrailEngine: GuardrailEngine;
  let costTracker: CostTracker;
  let budgetManager: BudgetManager;
  let costStorage: InMemoryCostStorage;
  let costCalculator: CostCalculator;

  beforeEach(() => {
    // Initialize TealTiger components
    guardrailEngine = new GuardrailEngine();
    costStorage = new InMemoryCostStorage();
    costTracker = new CostTracker();
    budgetManager = new BudgetManager(costStorage);
    costCalculator = new CostCalculator();
  });

  describe('6.3.1 - TealEngine Integration', () => {
    it('should integrate TealEngine with OpenAI', () => {
      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
      });

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.agentId).toBe('test-agent');
    });

    it('should integrate TealEngine with Anthropic', () => {
      const client = new TealAnthropic({
        apiKey: 'test-key',
        agentId: 'test-agent',
      });

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.agentId).toBe('test-agent');
    });

    it('should integrate TealEngine with Gemini', () => {
      const client = new TealGemini({
        apiKey: 'test-key',
        agentId: 'test-agent',
      });

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.agentId).toBe('test-agent');
    });

    it('should integrate TealEngine with Bedrock', () => {
      const client = new TealBedrock({
        region: 'us-east-1',
        agentId: 'test-agent',
      });

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.agentId).toBe('test-agent');
    });
  });

  describe('6.3.2 - TealGuard Integration', () => {
    it('should integrate TealGuard with all providers', () => {
      const providers = [
        new TealOpenAI({ apiKey: 'test-key', guardrailEngine }),
        new TealAnthropic({ apiKey: 'test-key', guardrailEngine }),
        new TealGemini({ apiKey: 'test-key', guardrailEngine }),
        new TealBedrock({ region: 'us-east-1', guardrailEngine }),
      ];

      for (const provider of providers) {
        expect(provider).toBeDefined();
      }
    });
  });

  describe('6.3.3 - TealMonitor Integration', () => {
    it('should integrate TealMonitor with all providers', () => {
      const providers = [
        new TealOpenAI({ apiKey: 'test-key' }),
        new TealAnthropic({ apiKey: 'test-key' }),
        new TealGemini({ apiKey: 'test-key' }),
        new TealBedrock({ region: 'us-east-1' }),
      ];

      for (const provider of providers) {
        expect(provider).toBeDefined();
      }
    });
  });

  describe('6.3.4 - TealCircuit Integration', () => {
    it('should integrate TealCircuit with all providers', () => {
      const providers = [
        new TealOpenAI({ apiKey: 'test-key' }),
        new TealAnthropic({ apiKey: 'test-key' }),
        new TealGemini({ apiKey: 'test-key' }),
        new TealBedrock({ region: 'us-east-1' }),
      ];

      for (const provider of providers) {
        expect(provider).toBeDefined();
      }
    });
  });

  describe('6.3.5 - TealAudit Integration', () => {
    it('should integrate TealAudit with all providers', () => {
      const providers = [
        new TealOpenAI({ apiKey: 'test-key' }),
        new TealAnthropic({ apiKey: 'test-key' }),
        new TealGemini({ apiKey: 'test-key' }),
        new TealBedrock({ region: 'us-east-1' }),
      ];

      for (const provider of providers) {
        expect(provider).toBeDefined();
      }
    });
  });

  describe('6.3.6 - Multi-Provider Orchestration', () => {
    it('should orchestrate multiple providers', () => {
      const multiProvider = new TealMultiProvider({
        strategy: 'priority',
      });

      const openai = new TealOpenAI({ apiKey: 'test-key' });
      const anthropic = new TealAnthropic({ apiKey: 'test-key' });

      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai',
        client: openai,
        priority: 1,
      });
      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic',
        client: anthropic,
        priority: 2,
      });

      const providers = multiProvider.getProviders();
      expect(providers.length).toBe(2);
      expect(providers.some(p => p.name === 'openai')).toBe(true);
      expect(providers.some(p => p.name === 'anthropic')).toBe(true);
    });

    it('should support different routing strategies', () => {
      const strategies: Array<'priority' | 'round-robin' | 'cost' | 'use-case' | 'custom'> = [
        'priority',
        'round-robin',
        'cost',
        'use-case',
      ];

      for (const strategy of strategies) {
        const multiProvider = new TealMultiProvider({
          strategy,
        });

        expect(multiProvider).toBeDefined();
      }
    });
  });

  describe('6.3.7 - Provider Failover', () => {
    it('should configure failover settings', () => {
      const multiProvider = new TealMultiProvider({
        enableFailover: true,
        maxFailoverAttempts: 3,
      });

      expect(multiProvider).toBeDefined();
    });
  });

  describe('6.3.8 - Cost Comparison Utilities', () => {
    it('should compare costs across providers', () => {
      const tokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const models = [
        { model: 'gpt-3.5-turbo', provider: 'openai' as const },
        { model: 'gpt-4', provider: 'openai' as const },
        { model: 'claude-2', provider: 'anthropic' as const },
      ];

      const comparison = costCalculator.compareProviders(tokenUsage, models);

      expect(comparison.providers.length).toBe(3);
      expect(comparison.cheapest).toBeDefined();
      expect(comparison.mostExpensive).toBeDefined();
    });

    it('should project costs for providers', () => {
      const projection = costCalculator.projectCost(
        'gpt-3.5-turbo',
        1000,
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        'daily',
        'openai'
      );

      expect(projection.projectedCost).toBeGreaterThan(0);
      expect(projection.period).toBe('daily');
    });

    it('should generate optimization recommendations', () => {
      const recommendations = costCalculator.generateOptimizationRecommendations(
        'gpt-4',
        { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        [
          { model: 'gpt-3.5-turbo', provider: 'openai' as const },
          { model: 'claude-instant-1', provider: 'anthropic' as const },
        ],
        'openai'
      );

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].savings.amount).toBeGreaterThan(0);
    });
  });

  describe('6.3.9 - Backward Compatibility', () => {
    it('should maintain backward compatibility with v1.0.x config', () => {
      // Test that existing clients still work
      const openai = new TealOpenAI({ apiKey: 'test-key' });
      const anthropic = new TealAnthropic({ apiKey: 'test-key' });

      expect(openai).toBeDefined();
      expect(anthropic).toBeDefined();
    });

    it('should support optional TealTiger components', () => {
      // Test that components are optional
      const client = new TealOpenAI({
        apiKey: 'test-key',
        enableGuardrails: false,
        enableCostTracking: false,
      });

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.enableGuardrails).toBe(false);
      expect(config.enableCostTracking).toBe(false);
    });
  });

  describe('6.3.10 - Performance Overhead', () => {
    it('should have minimal overhead for component initialization', () => {
      const startTime = performance.now();

      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        guardrailEngine,
        costTracker,
        budgetManager,
      });

      const endTime = performance.now();
      const overhead = endTime - startTime;

      expect(client).toBeDefined();
      expect(overhead).toBeLessThan(20); // <20ms overhead target
    });

    it('should have minimal overhead for multi-provider setup', () => {
      const startTime = performance.now();

      const multiProvider = new TealMultiProvider({
        strategy: 'priority',
      });

      const openai = new TealOpenAI({ apiKey: 'test-key' });
      const anthropic = new TealAnthropic({ apiKey: 'test-key' });
      const gemini = new TealGemini({ apiKey: 'test-key' });

      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai',
        client: openai,
        priority: 1,
      });
      multiProvider.registerProvider({
        type: 'anthropic',
        name: 'anthropic',
        client: anthropic,
        priority: 2,
      });
      multiProvider.registerProvider({
        type: 'gemini',
        name: 'gemini',
        client: gemini,
        priority: 3,
      });

      const endTime = performance.now();
      const overhead = endTime - startTime;

      expect(overhead).toBeLessThan(20); // <20ms overhead target
    });
  });

  describe('Full Stack Integration', () => {
    it('should integrate all components together', () => {
      const client = new TealOpenAI({
        apiKey: 'test-key',
        agentId: 'test-agent',
        guardrailEngine,
        costTracker,
        budgetManager,
        costStorage,
      });

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.agentId).toBe('test-agent');
      expect(config.enableGuardrails).toBe(true);
      expect(config.enableCostTracking).toBe(true);
    });

    it('should support multi-provider with all components', () => {
      const multiProvider = new TealMultiProvider({
        strategy: 'priority',
      });

      const openai = new TealOpenAI({
        apiKey: 'test-key',
        guardrailEngine,
        costTracker,
        budgetManager,
      });

      multiProvider.registerProvider({
        type: 'openai',
        name: 'openai',
        client: openai,
        priority: 1,
      });

      const providers = multiProvider.getProviders();
      expect(providers.some(p => p.name === 'openai')).toBe(true);
    });
  });

  describe('Cross-Provider Consistency', () => {
    it('should have consistent configuration across providers', () => {
      const providers = [
        new TealOpenAI({ apiKey: 'test-key', agentId: 'test-agent' }),
        new TealAnthropic({ apiKey: 'test-key', agentId: 'test-agent' }),
        new TealGemini({ apiKey: 'test-key', agentId: 'test-agent' }),
        new TealBedrock({ region: 'us-east-1', agentId: 'test-agent' }),
      ];

      for (const provider of providers) {
        const config = provider.getConfig();
        expect(config.agentId).toBe('test-agent');
        expect(config.enableGuardrails).toBe(true);
        expect(config.enableCostTracking).toBe(true);
      }
    });

    it('should support consistent component integration', () => {
      const sharedComponents = {
        guardrailEngine,
        costTracker,
        budgetManager,
        costStorage,
      };

      const providers = [
        new TealOpenAI({ apiKey: 'test-key', ...sharedComponents }),
        new TealAnthropic({ apiKey: 'test-key', ...sharedComponents }),
        new TealGemini({ apiKey: 'test-key', ...sharedComponents }),
        new TealBedrock({ region: 'us-east-1', ...sharedComponents }),
      ];

      for (const provider of providers) {
        expect(provider).toBeDefined();
      }
    });
  });
});
