/**
 * TealAzureOpenAI Tests
 * 
 * Comprehensive test suite for Azure OpenAI client integration
 */

import { TealAzureOpenAI, AZURE_OPENAI_PRICING } from '../azure-openai';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealGuard } from '../../core/guard/TealGuard';
import { TealMonitor } from '../../core/monitor/TealMonitor';
import { TealCircuit } from '../../core/circuit/TealCircuit';

// Mock the openai module
jest.mock('openai', () => {
  return {
    AzureOpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn()
        }
      },
      completions: {
        create: jest.fn()
      }
    }))
  };
});

describe('TealAzureOpenAI', () => {
  let client: TealAzureOpenAI;
  let mockAzureClient: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create client
    client = new TealAzureOpenAI({
      endpoint: 'https://test-resource.openai.azure.com',
      azureApiKey: 'test-api-key',
      deployment: 'gpt-4-deployment',
      region: 'eastus',
      subscriptionId: 'test-subscription-id',
      agentId: 'test-agent'
    });

    // Get mock Azure client
    mockAzureClient = (client as any).azureClient;
  });

  describe('Constructor', () => {
    it('should initialize with required config', () => {
      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key'
      });

      expect(testClient).toBeInstanceOf(TealAzureOpenAI);
    });

    it('should initialize with full config', () => {
      expect(client).toBeInstanceOf(TealAzureOpenAI);
      expect((client as any).endpoint).toBe('https://test-resource.openai.azure.com');
      expect((client as any).deployment).toBe('gpt-4-deployment');
      expect((client as any).region).toBe('eastus');
      expect((client as any).subscriptionId).toBe('test-subscription-id');
    });

    it('should use default API version', () => {
      expect((client as any).apiVersion).toBe('2024-02-15-preview');
    });

    it('should use custom API version', () => {
      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key',
        apiVersion: '2023-12-01-preview'
      });

      expect((testClient as any).apiVersion).toBe('2023-12-01-preview');
    });
  });

  describe('Chat Completions', () => {
    it('should create chat completion successfully', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      };

      mockAzureClient.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello!' }
        ]
      });

      expect(response.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(response.metadata?.provider).toBe('azure-openai');
      expect(response.metadata?.deployment).toBe('gpt-4-deployment');
      expect(response.metadata?.cost).toBeDefined();
    });

    it('should use deployment name from config', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClient.chat.completions.create.mockResolvedValue(mockResponse);

      await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(mockAzureClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-deployment'
        })
      );
    });

    it('should use model name when no deployment configured', async () => {
      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key'
      });

      const mockAzureClientNoDeployment = (testClient as any).azureClient;
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClientNoDeployment.chat.completions.create.mockResolvedValue(mockResponse);

      await testClient.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(mockAzureClientNoDeployment.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4'
        })
      );
    });

    it('should handle chat completion with all parameters', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClient.chat.completions.create.mockResolvedValue(mockResponse);

      await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        stop: ['END']
      });

      expect(mockAzureClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          max_tokens: 100,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
          stop: ['END']
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockAzureClient.chat.completions.create.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(
        client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow('Azure OpenAI API error: Rate limit exceeded');
    });
  });

  describe('Completions', () => {
    it('should create completion successfully', async () => {
      const mockResponse = {
        id: 'cmpl-123',
        object: 'text_completion',
        created: 1677652288,
        model: 'gpt-35-turbo-instruct',
        choices: [
          {
            text: 'This is a test completion',
            index: 0,
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15
        }
      };

      mockAzureClient.completions.create.mockResolvedValue(mockResponse);

      const response = await client.completions.create({
        model: 'gpt-35-turbo-instruct',
        prompt: 'Test prompt'
      });

      expect(response.choices[0].text).toBe('This is a test completion');
      expect(response.metadata?.provider).toBe('azure-openai');
      expect(response.metadata?.cost).toBeDefined();
    });

    it('should handle completion with all parameters', async () => {
      const mockResponse = {
        id: 'cmpl-123',
        object: 'text_completion',
        created: 1677652288,
        model: 'gpt-35-turbo-instruct',
        choices: [{ text: 'Test', index: 0, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
      };

      mockAzureClient.completions.create.mockResolvedValue(mockResponse);

      await client.completions.create({
        model: 'gpt-35-turbo-instruct',
        prompt: 'Test',
        temperature: 0.8,
        max_tokens: 50,
        top_p: 0.95,
        frequency_penalty: 0.3,
        presence_penalty: 0.3,
        stop: ['\n']
      });

      expect(mockAzureClient.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          max_tokens: 50,
          top_p: 0.95,
          frequency_penalty: 0.3,
          presence_penalty: 0.3,
          stop: ['\n']
        })
      );
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for GPT-4', () => {
      const cost = (client as any).calculateAzureCost('gpt-4', {
        prompt_tokens: 1000,
        completion_tokens: 500
      });

      // GPT-4: $0.03 per 1K input, $0.06 per 1K output
      // (1000/1000 * 0.03) + (500/1000 * 0.06) = 0.03 + 0.03 = 0.06
      expect(cost).toBeCloseTo(0.06, 4);
    });

    it('should calculate cost for GPT-3.5 Turbo', () => {
      const cost = (client as any).calculateAzureCost('gpt-35-turbo', {
        prompt_tokens: 1000,
        completion_tokens: 500
      });

      // GPT-3.5 Turbo: $0.0005 per 1K input, $0.0015 per 1K output
      // (1000/1000 * 0.0005) + (500/1000 * 0.0015) = 0.0005 + 0.00075 = 0.00125
      expect(cost).toBeCloseTo(0.00125, 5);
    });

    it('should handle model name normalization', () => {
      // Azure uses gpt-35-turbo, OpenAI uses gpt-3.5-turbo
      const cost = (client as any).calculateAzureCost('gpt-3.5-turbo', {
        prompt_tokens: 1000,
        completion_tokens: 500
      });

      expect(cost).toBeCloseTo(0.00125, 5);
    });

    it('should use default pricing for unknown models', () => {
      const cost = (client as any).calculateAzureCost('unknown-model', {
        prompt_tokens: 1000,
        completion_tokens: 500
      });

      // Should default to gpt-35-turbo pricing
      expect(cost).toBeCloseTo(0.00125, 5);
    });
  });

  describe('TealEngine Integration', () => {
    it('should integrate with TealEngine', async () => {
      const engine = new TealEngine({
        tools: { 'chat': { allowed: true } },
        identity: { agentId: 'test-agent', role: 'user', permissions: ['chat'] }
      });

      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      const mockAzureClientWithEngine = (testClient as any).azureClient;
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClientWithEngine.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.policyEvaluation).toBe('enabled');
    });

    it('should enforce policy restrictions', async () => {
      const engine = new TealEngine({
        tools: { 'chat': { allowed: false } },
        identity: { agentId: 'test-agent', role: 'user', permissions: [] }
      });

      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      await expect(
        testClient.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow();
    });
  });

  describe('TealGuard Integration', () => {
    it('should integrate with TealGuard', async () => {
      const guard = new TealGuard({});

      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key',
        guard
      });

      const mockAzureClientWithGuard = (testClient as any).azureClient;
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClientWithGuard.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'gpt-4',
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

      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key',
        monitor
      });

      const mockAzureClientWithMonitor = (testClient as any).azureClient;
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClientWithMonitor.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'gpt-4',
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

      const testClient = new TealAzureOpenAI({
        endpoint: 'https://test.openai.azure.com',
        azureApiKey: 'test-key',
        circuit
      });

      const mockAzureClientWithCircuit = (testClient as any).azureClient;
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClientWithCircuit.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await testClient.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.circuitState).toBe('closed');
    });
  });

  describe('Metadata', () => {
    it('should include Azure-specific metadata', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClient.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.metadata?.provider).toBe('azure-openai');
      expect(response.metadata?.endpoint).toBe('https://test-resource.openai.azure.com');
      expect(response.metadata?.apiVersion).toBe('2024-02-15-preview');
      expect(response.metadata?.deployment).toBe('gpt-4-deployment');
    });

    it('should include optional metadata when provided', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      mockAzureClient.chat.completions.create.mockResolvedValue(mockResponse);

      await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      });

      const metadata = (client as any).getComponentMetadata();
      expect(metadata.region).toBe('eastus');
      expect(metadata.subscriptionId).toBe('test-subscription-id');
    });
  });

  describe('Pricing Table', () => {
    it('should have correct pricing for all models', () => {
      expect(AZURE_OPENAI_PRICING['gpt-4']).toEqual({
        prompt: 0.03,
        completion: 0.06
      });

      expect(AZURE_OPENAI_PRICING['gpt-35-turbo']).toEqual({
        prompt: 0.0005,
        completion: 0.0015
      });

      expect(AZURE_OPENAI_PRICING['gpt-4o']).toEqual({
        prompt: 0.005,
        completion: 0.015
      });

      expect(AZURE_OPENAI_PRICING['gpt-4o-mini']).toEqual({
        prompt: 0.00015,
        completion: 0.0006
      });
    });
  });
});
