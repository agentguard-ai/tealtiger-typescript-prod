/**
 * TealBedrock Tests
 */

import { TealBedrock, BEDROCK_PRICING } from '../bedrock';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealGuard } from '../../core/guard/TealGuard';
import { TealMonitor } from '../../core/monitor/TealMonitor';
import { TealCircuit } from '../../core/circuit/TealCircuit';
import { TealAudit } from '../../core/audit/TealAudit';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

describe('TealBedrock', () => {
  const mockCredentials = {
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create TealBedrock instance with minimal config', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      expect(client).toBeInstanceOf(TealBedrock);
      expect(client.getConfig()).toEqual({});
    });

    it('should create TealBedrock instance with custom region', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        region: 'us-west-2',
        credentials: mockCredentials
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });

    it('should create TealBedrock instance with default model', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        defaultModel: 'anthropic.claude-instant-v1'
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });

    it('should create TealBedrock instance with TealEngine', () => {
      const engine = new TealEngine({
        tools: {
          'invokeModel': { allowed: true }
        },
        identity: {
          agentId: 'test-agent',
          role: 'user',
          permissions: ['invoke:model']
        }
      });

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        engine
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });

    it('should create TealBedrock instance with all components', () => {
      const engine = new TealEngine({
        tools: {
          'invokeModel': { allowed: true }
        },
        identity: {
          agentId: 'test-agent',
          role: 'user',
          permissions: ['invoke:model']
        }
      });
      const guard = new TealGuard({});
      const monitor = new TealMonitor({});
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 60000,
        halfOpenRequests: 3
      });
      const audit = new TealAudit({
        outputs: []
      });

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        engine,
        guard,
        monitor,
        circuit,
        audit
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });
  });

  describe('invokeModel()', () => {
    it('should invoke Anthropic Claude model', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'This is a test response',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 20
          }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Hello, world!'
      });

      expect(response.text).toBe('This is a test response');
      expect(response.stopReason).toBe('end_turn');
      expect(response.inputTokens).toBe(10);
      expect(response.outputTokens).toBe(20);
      expect(response.metadata?.provider).toBe('bedrock');
      expect(response.metadata?.model).toBe('anthropic.claude-v2');
    });

    it('should invoke Amazon Titan model', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          results: [{
            outputText: 'Titan response',
            tokenCount: 15
          }],
          inputTextTokenCount: 8
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'amazon.titan-text-express-v1',
        prompt: 'Test prompt'
      });

      expect(response.text).toBe('Titan response');
      expect(response.inputTokens).toBe(8);
      expect(response.outputTokens).toBe(15);
    });

    it('should invoke AI21 Jurassic model', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completions: [{
            data: { text: 'Jurassic response' },
            finishReason: { reason: 'endoftext' }
          }]
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'ai21.j2-ultra-v1',
        prompt: 'Test prompt'
      });

      expect(response.text).toBe('Jurassic response');
      expect(response.stopReason).toBe('endoftext');
    });

    it('should invoke Cohere Command model', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          generations: [{
            text: 'Cohere response',
            finish_reason: 'COMPLETE'
          }]
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'cohere.command-text-v14',
        prompt: 'Test prompt'
      });

      expect(response.text).toBe('Cohere response');
      expect(response.stopReason).toBe('COMPLETE');
    });

    it('should invoke Meta Llama model', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          generation: 'Llama response',
          stop_reason: 'stop',
          prompt_token_count: 12,
          generation_token_count: 18
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'meta.llama2-13b-chat-v1',
        prompt: 'Test prompt'
      });

      expect(response.text).toBe('Llama response');
      expect(response.stopReason).toBe('stop');
      expect(response.inputTokens).toBe(12);
      expect(response.outputTokens).toBe(18);
    });

    it('should use default model when not specified', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Default model response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        defaultModel: 'anthropic.claude-instant-v1'
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-instant-v1',
        prompt: 'Test'
      });

      expect(response.text).toBe('Default model response');
      expect(response.metadata?.model).toBe('anthropic.claude-instant-v1');
    });

    it('should apply custom parameters', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Custom params response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test',
        maxTokens: 500,
        temperature: 0.9,
        topP: 0.95,
        stopSequences: ['STOP']
      });

      // Verify the method was called and returned expected response
      expect(BedrockRuntimeClient.prototype.send).toHaveBeenCalled();
      expect(response.text).toBe('Custom params response');
      expect(response.metadata?.model).toBe('anthropic.claude-v2');
    });
  });

  describe('Component Integration', () => {
    it('should integrate with TealEngine', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const engine = new TealEngine({
        tools: {
          'invokeModel': { allowed: true }
        },
        identity: {
          agentId: 'test-agent',
          role: 'user',
          permissions: ['invoke:model']
        }
      });

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        agentId: 'test-agent',
        engine
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test'
      });

      expect(response.text).toBe('Response');
      expect(response.metadata?.policyEvaluation).toBe('enabled');
    });

    it('should integrate with TealGuard', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Safe response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const guard = new TealGuard({});

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        guard
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Safe prompt'
      });

      expect(response.text).toBe('Safe response');
      expect(response.metadata?.guardrailResults).toBe('enabled');
    });

    it('should integrate with TealMonitor', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Monitored response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const monitor = new TealMonitor({});

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        monitor
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test'
      });

      expect(response.text).toBe('Monitored response');
      expect(response.metadata?.monitoringMetrics).toBe('enabled');
    });

    it('should integrate with TealCircuit', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Circuit response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 60000,
        halfOpenRequests: 3
      });

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        circuit
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test'
      });

      expect(response.text).toBe('Circuit response');
      expect(response.metadata?.circuitState).toBe('closed');
    });

    it('should integrate with TealAudit', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Audited response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const audit = new TealAudit({
        outputs: []
      });

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        audit
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test'
      });

      expect(response.text).toBe('Audited response');
    });

    it('should integrate with all components', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Full stack response',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 10 }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const engine = new TealEngine({
        tools: {
          'invokeModel': { allowed: true }
        },
        identity: {
          agentId: 'test-agent',
          role: 'user',
          permissions: ['invoke:model']
        }
      });
      const guard = new TealGuard({});
      const monitor = new TealMonitor({});
      const circuit = new TealCircuit({
        failureThreshold: 5,
        timeout: 60000,
        halfOpenRequests: 3
      });
      const audit = new TealAudit({
        outputs: []
      });

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials,
        agentId: 'test-agent',
        engine,
        guard,
        monitor,
        circuit,
        audit
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test'
      });

      expect(response.text).toBe('Full stack response');
      expect(response.metadata?.policyEvaluation).toBe('enabled');
      expect(response.metadata?.guardrailResults).toBe('enabled');
      expect(response.metadata?.monitoringMetrics).toBe('enabled');
      expect(response.metadata?.circuitState).toBe('closed');
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for Anthropic Claude', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completion: 'Response',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1000,
            output_tokens: 2000
          }
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'anthropic.claude-v2',
        prompt: 'Test'
      });

      // Cost = (1000/1000 * 0.008) + (2000/1000 * 0.024) = 0.008 + 0.048 = 0.056
      expect(response.metadata?.cost).toBe('0.056000');
    });

    it('should calculate cost for Amazon Titan', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          results: [{
            outputText: 'Response',
            tokenCount: 500
          }],
          inputTextTokenCount: 300
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'amazon.titan-text-express-v1',
        prompt: 'Test'
      });

      // Cost = (300/1000 * 0.0008) + (500/1000 * 0.0016) = 0.00024 + 0.0008 = 0.00104
      expect(response.metadata?.cost).toBe('0.001040');
    });

    it('should calculate cost for Meta Llama', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          generation: 'Response',
          stop_reason: 'stop',
          prompt_token_count: 800,
          generation_token_count: 1200
        }))
      };

      (BedrockRuntimeClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      const response = await client.invokeModel({
        modelId: 'meta.llama2-13b-chat-v1',
        prompt: 'Test'
      });

      // Cost = (800/1000 * 0.00075) + (1200/1000 * 0.001) = 0.0006 + 0.0012 = 0.0018
      expect(response.metadata?.cost).toBe('0.001800');
    });
  });

  describe('Pricing Table', () => {
    it('should have pricing for all supported models', () => {
      const expectedModels = [
        'anthropic.claude-v2',
        'anthropic.claude-v2:1',
        'anthropic.claude-instant-v1',
        'anthropic.claude-3-sonnet-20240229-v1:0',
        'anthropic.claude-3-haiku-20240307-v1:0',
        'amazon.titan-text-lite-v1',
        'amazon.titan-text-express-v1',
        'amazon.titan-embed-text-v1',
        'ai21.j2-ultra-v1',
        'ai21.j2-mid-v1',
        'cohere.command-text-v14',
        'cohere.command-light-text-v14',
        'meta.llama2-13b-chat-v1',
        'meta.llama2-70b-chat-v1'
      ];

      expectedModels.forEach(model => {
        const pricing = BEDROCK_PRICING[model as keyof typeof BEDROCK_PRICING];
        expect(pricing).toBeDefined();
        expect(pricing.input).toBeGreaterThan(0);
        expect(pricing.output).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      (BedrockRuntimeClient.prototype.send as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      await expect(
        client.invokeModel({
          modelId: 'anthropic.claude-v2',
          prompt: 'Test'
        })
      ).rejects.toThrow('API Error');
    });

    it('should handle unknown provider', async () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      await expect(
        client.invokeModel({
          modelId: 'unknown.model-v1',
          prompt: 'Test'
        })
      ).rejects.toThrow('Unknown provider for model');
    });
  });

  describe('Regional Support', () => {
    it('should support us-east-1 region', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        region: 'us-east-1',
        credentials: mockCredentials
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });

    it('should support us-west-2 region', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        region: 'us-west-2',
        credentials: mockCredentials
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });

    it('should support eu-west-1 region', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        region: 'eu-west-1',
        credentials: mockCredentials
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });

    it('should default to us-east-1 when region not specified', () => {
      const client = new TealBedrock({
        apiKey: 'test-key',
        credentials: mockCredentials
      });

      expect(client).toBeInstanceOf(TealBedrock);
    });
  });
});
