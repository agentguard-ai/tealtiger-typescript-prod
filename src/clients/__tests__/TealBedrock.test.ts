/**
 * TealBedrock Tests
 */

import { TealBedrock } from '../TealBedrock';
import { GuardrailEngine } from '../../guardrails';
import { CostTracker } from '../../cost/CostTracker';
import { BudgetManager } from '../../cost/BudgetManager';
import { InMemoryCostStorage } from '../../cost/CostStorage';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  InvokeModelCommand: jest.fn(),
}));

describe('TealBedrock', () => {
  let client: TealBedrock;
  let mockBedrockClient: any;
  let guardrailEngine: GuardrailEngine;
  let costTracker: CostTracker;
  let budgetManager: BudgetManager;
  let costStorage: InMemoryCostStorage;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create TealTiger components
    guardrailEngine = new GuardrailEngine();
    costStorage = new InMemoryCostStorage();
    costTracker = new CostTracker();
    budgetManager = new BudgetManager(costStorage);

    // Create client
    client = new TealBedrock({
      region: 'us-east-1',
      model: 'anthropic.claude-v2',
      agentId: 'test-agent',
      guardrailEngine,
      costTracker,
      budgetManager,
      costStorage,
    });

    // Get mock Bedrock client
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    mockBedrockClient = BedrockRuntimeClient.mock.results[0].value;
  });

  describe('Constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = new TealBedrock();
      const config = defaultClient.getConfig();
      
      expect(config.region).toBe('us-east-1');
      expect(config.model).toBe('anthropic.claude-v2');
      expect(config.enableGuardrails).toBe(true);
      expect(config.enableCostTracking).toBe(true);
    });

    it('should create client with custom config', () => {
      const customClient = new TealBedrock({
        region: 'eu-west-1',
        model: 'amazon.titan-text-express-v1',
        agentId: 'custom-agent',
        enableGuardrails: false,
      });
      
      const config = customClient.getConfig();
      expect(config.region).toBe('eu-west-1');
      expect(config.model).toBe('amazon.titan-text-express-v1');
      expect(config.agentId).toBe('custom-agent');
      expect(config.enableGuardrails).toBe(false);
    });
  });

  describe('invokeModel() - Claude', () => {
    it('should invoke Claude model successfully', async () => {
      // Mock Bedrock response
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Hello! How can I help you?',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 8,
          },
        })),
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Hello\n\nAssistant:',
          max_tokens_to_sample: 100,
        },
      });

      expect(response.body.completion).toBe('Hello! How can I help you?');
      expect(response.modelId).toBe('anthropic.claude-v2');
      expect(response.usage).toEqual({
        inputTokens: 10,
        outputTokens: 8,
        totalTokens: 18,
      });
      expect(response.metadata?.provider).toBe('bedrock');
      expect(response.metadata?.region).toBe('us-east-1');
    });

    it('should calculate cost correctly for Claude', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Test response',
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
          },
        })),
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Test\n\nAssistant:',
          max_tokens_to_sample: 100,
        },
      });

      // Claude v2: $8/1M input, $24/1M output
      // Cost = (1000/1M * 8) + (500/1M * 24) = 0.008 + 0.012 = 0.020
      expect(response.metadata?.cost).toBe('0.020000');
    });
  });

  describe('invokeModel() - Titan', () => {
    it('should invoke Titan model successfully', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          results: [{
            outputText: 'This is a Titan response',
            tokenCount: 6,
          }],
          inputTextTokenCount: 5,
        })),
      });

      const response = await client.invokeModel({
        modelId: 'amazon.titan-text-express-v1',
        body: {
          inputText: 'Hello Titan',
          textGenerationConfig: {
            maxTokenCount: 100,
          },
        },
      });

      expect(response.body.results[0].outputText).toBe('This is a Titan response');
      expect(response.usage).toEqual({
        inputTokens: 5,
        outputTokens: 6,
        totalTokens: 11,
      });
    });

    it('should calculate cost correctly for Titan', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          results: [{
            outputText: 'Response',
            tokenCount: 1000,
          }],
          inputTextTokenCount: 500,
        })),
      });

      const response = await client.invokeModel({
        modelId: 'amazon.titan-text-express-v1',
        body: {
          inputText: 'Test',
        },
      });

      // Titan Express: $0.2/1M input, $0.6/1M output
      // Cost = (500/1M * 0.2) + (1000/1M * 0.6) = 0.0001 + 0.0006 = 0.0007
      expect(response.metadata?.cost).toBe('0.000700');
    });
  });

  describe('invokeModel() - Jurassic', () => {
    it('should invoke Jurassic model successfully', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completions: [{
            data: {
              text: 'Jurassic response',
            },
          }],
        })),
      });

      const response = await client.invokeModel({
        modelId: 'ai21.j2-ultra-v1',
        body: {
          prompt: 'Test prompt',
          maxTokens: 100,
        },
      });

      expect(response.body.completions[0].data.text).toBe('Jurassic response');
    });
  });

  describe('invokeModel() - Cohere Command', () => {
    it('should invoke Cohere Command model successfully', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          generations: [{
            text: 'Cohere response',
          }],
          meta: {
            billed_units: {
              input_tokens: 10,
              output_tokens: 5,
            },
          },
        })),
      });

      const response = await client.invokeModel({
        modelId: 'cohere.command-text-v14',
        body: {
          prompt: 'Test prompt',
          max_tokens: 100,
        },
      });

      expect(response.body.generations[0].text).toBe('Cohere response');
      expect(response.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
    });
  });

  describe('invokeModel() - Llama', () => {
    it('should invoke Llama model successfully', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          generation: 'Llama response',
          prompt_token_count: 8,
          generation_token_count: 4,
        })),
      });

      const response = await client.invokeModel({
        modelId: 'meta.llama2-13b-chat-v1',
        body: {
          prompt: 'Test prompt',
          max_gen_len: 100,
        },
      });

      expect(response.body.generation).toBe('Llama response');
      expect(response.usage).toEqual({
        inputTokens: 8,
        outputTokens: 4,
        totalTokens: 12,
      });
    });
  });

  describe('Guardrails Integration', () => {
    it('should run guardrails on input', async () => {
      const executeSpy = jest.spyOn(guardrailEngine, 'execute');

      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Safe response',
          usage: { input_tokens: 5, output_tokens: 3 },
        })),
      });

      await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Hello\n\nAssistant:',
        },
      });

      expect(executeSpy).toHaveBeenCalledWith('\n\nHuman: Hello\n\nAssistant:');
    });

    it('should block request if input guardrails fail', async () => {
      // Mock a failing guardrail response
      jest.spyOn(guardrailEngine, 'execute').mockResolvedValueOnce({
        passed: false,
        maxRiskScore: 1.0,
        results: [{
          guardrailName: 'test-blocker',
          passed: false,
          riskScore: 1.0,
          details: 'Blocked',
        }],
        getFailedGuardrails: () => ['test-blocker'],
      } as any);

      // Re-enable guardrails for this specific test
      const clientWithFailingGuardrail = new TealBedrock({
        region: 'us-east-1',
        model: 'anthropic.claude-v2',
        agentId: 'test-agent',
        guardrailEngine,
      });

      await expect(
        clientWithFailingGuardrail.invokeModel({
          modelId: 'anthropic.claude-v2',
          body: {
            prompt: '\n\nHuman: Bad content\n\nAssistant:',
          },
        })
      ).rejects.toThrow('Guardrail check failed');

      expect(mockBedrockClient.send).not.toHaveBeenCalled();
    });

    it('should run guardrails on output', async () => {
      const executeSpy = jest.spyOn(guardrailEngine, 'execute');

      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Output response',
          usage: { input_tokens: 5, output_tokens: 3 },
        })),
      });

      await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Hello\n\nAssistant:',
        },
      });

      // Should be called twice: once for input, once for output
      expect(executeSpy).toHaveBeenCalledTimes(2);
      expect(executeSpy).toHaveBeenNthCalledWith(2, 'Output response');
    });
  });

  describe('Cost Tracking Integration', () => {
    it('should track costs', async () => {
      // Add custom pricing for Bedrock models since they're not in default pricing table
      costTracker.addCustomPricing('anthropic.claude-v2', {
        provider: 'custom',
        inputCostPer1K: 0.008,
        outputCostPer1K: 0.024,
      });

      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Response',
          usage: { input_tokens: 100, output_tokens: 50 },
        })),
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Test\n\nAssistant:',
        },
      });

      expect(response.security?.costRecord).toBeDefined();
      expect(response.security?.costRecord?.actualCost).toBeGreaterThan(0);
      expect(response.security?.costRecord?.agentId).toBe('test-agent');
    });

    it('should store cost records', async () => {
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Response',
          usage: { input_tokens: 100, output_tokens: 50 },
        })),
      });

      await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Test\n\nAssistant:',
        },
      });

      const records = await costStorage.getByAgentId('test-agent');
      expect(records.length).toBe(1);
      expect(records[0].model).toBe('anthropic.claude-v2');
    });
  });

  describe('Budget Management Integration', () => {
    it('should check budget before request', async () => {
      // Set a budget
      await budgetManager.createBudget({
        name: 'test-budget',
        scope: { type: 'agent', id: 'test-agent' },
        limit: 0.01,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'alert',
        enabled: true,
      });

      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Response',
          usage: { input_tokens: 100, output_tokens: 50 },
        })),
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        body: {
          prompt: '\n\nHuman: Test\n\nAssistant:',
        },
      });

      expect(response.security?.budgetCheck).toBeDefined();
      expect(response.security?.budgetCheck?.allowed).toBe(true);
    });

    it('should block request if budget exceeded', async () => {
      // Add custom pricing for accurate cost estimation
      costTracker.addCustomPricing('anthropic.claude-v2', {
        provider: 'custom',
        inputCostPer1K: 0.008,
        outputCostPer1K: 0.024,
      });

      // Set a very low budget
      await budgetManager.createBudget({
        name: 'low-budget',
        scope: { type: 'agent', id: 'test-agent' },
        limit: 0.000001,
        period: 'daily',
        alertThresholds: [50, 75, 90, 100],
        action: 'block',
        enabled: true,
      });

      // Mock a successful response (but it should never be called due to budget block)
      mockBedrockClient.send.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Response',
          usage: { input_tokens: 100, output_tokens: 50 },
        })),
      });

      await expect(
        client.invokeModel({
          modelId: 'anthropic.claude-v2',
          body: {
            prompt: '\n\nHuman: Test\n\nAssistant:',
          },
        })
      ).rejects.toThrow('Budget exceeded');

      expect(mockBedrockClient.send).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should get configuration', () => {
      const config = client.getConfig();
      
      expect(config.region).toBe('us-east-1');
      expect(config.model).toBe('anthropic.claude-v2');
      expect(config.agentId).toBe('test-agent');
    });

    it('should update configuration', () => {
      client.updateConfig({
        region: 'eu-west-1',
        model: 'amazon.titan-text-express-v1',
      });

      const config = client.getConfig();
      expect(config.region).toBe('eu-west-1');
      expect(config.model).toBe('amazon.titan-text-express-v1');
    });
  });

  describe('Error Handling', () => {
    it('should handle Bedrock API errors', async () => {
      mockBedrockClient.send.mockRejectedValueOnce(
        new Error('Bedrock API error')
      );

      await expect(
        client.invokeModel({
          modelId: 'anthropic.claude-v2',
          body: {
            prompt: '\n\nHuman: Test\n\nAssistant:',
          },
        })
      ).rejects.toThrow('TealBedrock error: Bedrock API error');
    });

    it('should handle invalid model ID', async () => {
      mockBedrockClient.send.mockRejectedValueOnce(
        new Error('Model not found')
      );

      await expect(
        client.invokeModel({
          modelId: 'invalid.model',
          body: {
            prompt: 'Test',
          },
        })
      ).rejects.toThrow('TealBedrock error');
    });
  });

  describe('Regional Endpoints', () => {
    it('should support different regions', () => {
      const usClient = new TealBedrock({ region: 'us-east-1' });
      const euClient = new TealBedrock({ region: 'eu-west-1' });
      const apClient = new TealBedrock({ region: 'ap-southeast-1' });

      expect(usClient.getConfig().region).toBe('us-east-1');
      expect(euClient.getConfig().region).toBe('eu-west-1');
      expect(apClient.getConfig().region).toBe('ap-southeast-1');
    });
  });

  describe('Multi-Provider Support', () => {
    it('should support all Bedrock providers', async () => {
      const providers = [
        'anthropic.claude-v2',
        'amazon.titan-text-express-v1',
        'ai21.j2-ultra-v1',
        'cohere.command-text-v14',
        'meta.llama2-13b-chat-v1',
      ];

      for (const modelId of providers) {
        mockBedrockClient.send.mockResolvedValueOnce({
          body: new TextEncoder().encode(JSON.stringify({
            completion: 'Response',
            usage: { input_tokens: 10, output_tokens: 5 },
          })),
        });

        const response = await client.invokeModel({
          modelId,
          body: { prompt: 'Test' },
        });

        expect(response.modelId).toBe(modelId);
      }
    });
  });
});
