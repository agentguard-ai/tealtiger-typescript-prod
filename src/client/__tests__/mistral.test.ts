/**
 * TealMistral Tests
 * 
 * Comprehensive test suite for Mistral AI client integration
 */

import { TealMistral, MISTRAL_PRICING } from '../mistral';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealGuard } from '../../core/guard/TealGuard';
import { TealMonitor } from '../../core/monitor/TealMonitor';
import { TealCircuit } from '../../core/circuit/TealCircuit';

// Mock the @mistralai/mistralai module
jest.mock('@mistralai/mistralai', () => {
  const mockComplete = jest.fn();
  return {
    Mistral: jest.fn().mockImplementation(() => ({
      chat: {
        complete: mockComplete
      }
    }))
  };
});

describe('TealMistral', () => {
  let client: TealMistral;
  let mockMistralClient: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create client
    client = new TealMistral({
      mistralApiKey: 'test-api-key',
      model: 'mistral-large-latest',
      region: 'eu-west',
      agentId: 'test-agent'
    });

    // Get mock Mistral client
    mockMistralClient = (client as any).mistralClient;
  });

  describe('Constructor', () => {
    it('should initialize with required config', () => {
      const testClient = new TealMistral({
        mistralApiKey: 'test-key'
      });

      expect(testClient).toBeInstanceOf(TealMistral);
    });

    it('should initialize with full config', () => {
      expect(client).toBeInstanceOf(TealMistral);
      expect((client as any).endpoint).toBe('https://api.mistral.ai/v1');
      expect((client as any).defaultModel).toBe('mistral-large-latest');
      expect((client as any).region).toBe('eu-west');
    });

    it('should use default endpoint', () => {
      expect((client as any).endpoint).toBe('https://api.mistral.ai/v1');
    });

    it('should use custom endpoint', () => {
      const testClient = new TealMistral({
        mistralApiKey: 'test-key',
        endpoint: 'https://custom.mistral.ai/v1'
      });

      expect((testClient as any).endpoint).toBe('https://custom.mistral.ai/v1');
    });
  });

  describe('Chat Completions', () => {
    it('should create chat completion successfully', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?'
            },
            finishReason: 'stop'
          }
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      const response = await client.chat.create({
        model: 'mistral-large-latest',
        messages: [
          { role: 'user', content: 'Hello!' }
        ]
      });

      expect(response.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(response.metadata?.provider).toBe('mistral');
      expect(response.metadata?.dataResidency).toBe('EU');
      expect(response.metadata?.cost).toBeDefined();
    });

    it('should use default model from config', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      await client.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(mockMistralClient.chat.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mistral-large-latest'
        })
      );
    });

    it('should handle chat completion with all parameters', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      await client.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
        stop: ['END']
      });

      expect(mockMistralClient.chat.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 100,
          topP: 0.9,
          stop: ['END']
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockMistralClient.chat.complete.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(
        client.chat.create({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow('Mistral AI API error: Rate limit exceeded');
    });

    it('should support all Mistral models', async () => {
      const models = [
        'mistral-large-latest',
        'mistral-medium-latest',
        'mistral-small-latest',
        'open-mixtral-8x7b',
        'open-mixtral-8x22b',
        'mistral-tiny'
      ];

      for (const model of models) {
        const mockResponse = {
          id: 'mistral-123',
          created: 1677652288,
          choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
        };

        mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

        const response = await client.chat.create({
          model,
          messages: [{ role: 'user', content: 'Test' }]
        });

        expect(response.model).toBe(model);
      }
    });
  });

  describe('Completions', () => {
    it('should create completion successfully', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is a test completion'
            },
            finishReason: 'stop'
          }
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 10,
          totalTokens: 15
        }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      const response = await client.completions.create({
        model: 'mistral-small-latest',
        prompt: 'Test prompt'
      });

      expect(response.choices[0].text).toBe('This is a test completion');
      expect(response.metadata?.provider).toBe('mistral');
      expect(response.metadata?.cost).toBeDefined();
    });

    it('should handle completion with all parameters', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      await client.completions.create({
        model: 'mistral-small-latest',
        prompt: 'Test',
        temperature: 0.8,
        max_tokens: 50,
        top_p: 0.95,
        stop: ['\n']
      });

      expect(mockMistralClient.chat.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          maxTokens: 50,
          topP: 0.95,
          stop: ['\n']
        })
      );
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for Mistral Large', () => {
      const cost = (client as any).calculateMistralCost('mistral-large-latest', {
        prompt_tokens: 1000000,
        completion_tokens: 500000
      });

      // Mistral Large: $4.40 per 1M input, $13.20 per 1M output
      // (1000000/1000000 * 4.40) + (500000/1000000 * 13.20) = 4.40 + 6.60 = 11.00
      expect(cost).toBeCloseTo(11.00, 2);
    });

    it('should calculate cost for Mistral Medium', () => {
      const cost = (client as any).calculateMistralCost('mistral-medium-latest', {
        prompt_tokens: 1000000,
        completion_tokens: 500000
      });

      // Mistral Medium: $2.97 per 1M input, $8.91 per 1M output
      // (1000000/1000000 * 2.97) + (500000/1000000 * 8.91) = 2.97 + 4.455 = 7.425
      expect(cost).toBeCloseTo(7.425, 2);
    });

    it('should calculate cost for Mistral Small', () => {
      const cost = (client as any).calculateMistralCost('mistral-small-latest', {
        prompt_tokens: 1000000,
        completion_tokens: 500000
      });

      // Mistral Small: $1.10 per 1M input, $3.30 per 1M output
      // (1000000/1000000 * 1.10) + (500000/1000000 * 3.30) = 1.10 + 1.65 = 2.75
      expect(cost).toBeCloseTo(2.75, 2);
    });

    it('should calculate cost for Mixtral', () => {
      const cost = (client as any).calculateMistralCost('open-mixtral-8x7b', {
        prompt_tokens: 1000000,
        completion_tokens: 500000
      });

      // Mixtral 8x7b: $0.77 per 1M input/output
      // (1000000/1000000 * 0.77) + (500000/1000000 * 0.77) = 0.77 + 0.385 = 1.155
      expect(cost).toBeCloseTo(1.155, 2);
    });

    it('should use default pricing for unknown models', () => {
      const cost = (client as any).calculateMistralCost('unknown-model', {
        prompt_tokens: 1000000,
        completion_tokens: 500000
      });

      // Should default to mistral-large-latest pricing
      expect(cost).toBeCloseTo(11.00, 2);
    });
  });

  describe('TealEngine Integration', () => {
    it('should integrate with TealEngine', async () => {
      const engine = new TealEngine({
        tools: { 'chat': { allowed: true } },
        identity: { agentId: 'test-agent', role: 'user', permissions: ['chat'] }
      });

      const testClient = new TealMistral({
        mistralApiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      const mockMistralClientWithEngine = (testClient as any).mistralClient;
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClientWithEngine.chat.complete.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.policyEvaluation).toBe('enabled');
    });

    it('should enforce policy restrictions', async () => {
      const engine = new TealEngine({
        tools: { 'chat': { allowed: false } },
        identity: { agentId: 'test-agent', role: 'user', permissions: [] }
      });

      const testClient = new TealMistral({
        mistralApiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      await expect(
        testClient.chat.create({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow();
    });
  });

  describe('TealGuard Integration', () => {
    it('should integrate with TealGuard', async () => {
      const guard = new TealGuard({});

      const testClient = new TealMistral({
        mistralApiKey: 'test-key',
        guard
      });

      const mockMistralClientWithGuard = (testClient as any).mistralClient;
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClientWithGuard.chat.complete.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.guardrailResults).toBe('enabled');
    });
  });

  describe('TealMonitor Integration', () => {
    it('should integrate with TealMonitor', async () => {
      const monitor = new TealMonitor({
        anomalyThreshold: 2.0,
        autoBaseline: true
      });

      const testClient = new TealMistral({
        mistralApiKey: 'test-key',
        monitor
      });

      const mockMistralClientWithMonitor = (testClient as any).mistralClient;
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClientWithMonitor.chat.complete.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.monitoringMetrics).toBe('enabled');
    });
  });

  describe('TealCircuit Integration', () => {
    it('should integrate with TealCircuit', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 60000,
        halfOpenRequests: 3
      });

      const testClient = new TealMistral({
        mistralApiKey: 'test-key',
        circuit
      });

      const mockMistralClientWithCircuit = (testClient as any).mistralClient;
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClientWithCircuit.chat.complete.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.circuitState).toBe('closed');
    });
  });

  describe('Metadata', () => {
    it('should include Mistral-specific metadata', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      const response = await client.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.provider).toBe('mistral');
      expect(response.metadata?.endpoint).toBe('https://api.mistral.ai/v1');
      expect(response.metadata?.dataResidency).toBe('EU');
    });

    it('should include optional metadata when provided', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      await client.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      const metadata = (client as any).getComponentMetadata();
      expect(metadata.region).toBe('eu-west');
      expect(metadata.dataResidency).toBe('EU');
    });
  });

  describe('European Data Residency', () => {
    it('should indicate EU data residency', async () => {
      const mockResponse = {
        id: 'mistral-123',
        created: 1677652288,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finishReason: 'stop' }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      };

      mockMistralClient.chat.complete.mockResolvedValue(mockResponse);

      const response = await client.chat.create({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.dataResidency).toBe('EU');
    });

    it('should support EU regions', () => {
      const euWestClient = new TealMistral({
        mistralApiKey: 'test-key',
        region: 'eu-west'
      });

      const euCentralClient = new TealMistral({
        mistralApiKey: 'test-key',
        region: 'eu-central'
      });

      expect((euWestClient as any).region).toBe('eu-west');
      expect((euCentralClient as any).region).toBe('eu-central');
    });
  });

  describe('Pricing Table', () => {
    it('should have correct pricing for all models', () => {
      expect(MISTRAL_PRICING['mistral-large-latest']).toEqual({
        input: 4.40,
        output: 13.20
      });

      expect(MISTRAL_PRICING['mistral-medium-latest']).toEqual({
        input: 2.97,
        output: 8.91
      });

      expect(MISTRAL_PRICING['mistral-small-latest']).toEqual({
        input: 1.10,
        output: 3.30
      });

      expect(MISTRAL_PRICING['open-mixtral-8x7b']).toEqual({
        input: 0.77,
        output: 0.77
      });

      expect(MISTRAL_PRICING['mistral-tiny']).toEqual({
        input: 0.33,
        output: 0.33
      });
    });
  });
});
