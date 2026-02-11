/**
 * TealCohere Tests
 * 
 * Comprehensive test suite for Cohere AI client integration
 */

import { TealCohere, COHERE_PRICING } from '../cohere';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealGuard } from '../../core/guard/TealGuard';
import { TealMonitor } from '../../core/monitor/TealMonitor';
import { TealCircuit } from '../../core/circuit/TealCircuit';

// Mock the cohere-ai module
jest.mock('cohere-ai', () => {
  const mockChat = jest.fn();
  const mockEmbed = jest.fn();
  return {
    CohereClient: jest.fn().mockImplementation(() => ({
      chat: mockChat,
      embed: mockEmbed
    }))
  };
});

describe('TealCohere', () => {
  let client: TealCohere;
  let mockCohereClient: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create client
    client = new TealCohere({
      cohereApiKey: 'test-api-key',
      model: 'command-r-plus',
      embedModel: 'embed-english-v3.0',
      agentId: 'test-agent'
    });

    // Get mock Cohere client
    mockCohereClient = (client as any).cohereClient;
  });

  describe('Constructor', () => {
    it('should initialize with required config', () => {
      const testClient = new TealCohere({
        cohereApiKey: 'test-key'
      });

      expect(testClient).toBeInstanceOf(TealCohere);
    });

    it('should initialize with full config', () => {
      expect(client).toBeInstanceOf(TealCohere);
      expect((client as any).defaultModel).toBe('command-r-plus');
      expect((client as any).defaultEmbedModel).toBe('embed-english-v3.0');
    });
  });

  describe('Chat', () => {
    it('should create chat completion successfully', async () => {
      const mockResponse = {
        text: 'Hello! How can I help you today?',
        generationId: 'gen-123',
        chatHistory: [],
        meta: {
          billedUnits: {
            inputTokens: 10,
            outputTokens: 20
          }
        }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      const response = await client.chat({
        message: 'Hello!'
      });

      expect(response.text).toBe('Hello! How can I help you today?');
      expect(response.metadata?.provider).toBe('cohere');
      expect(response.metadata?.cost).toBeDefined();
    });

    it('should use default model from config', async () => {
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      await client.chat({
        message: 'Test'
      });

      expect(mockCohereClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'command-r-plus'
        })
      );
    });

    it('should handle chat with all parameters', async () => {
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      await client.chat({
        message: 'Test',
        model: 'command-r',
        temperature: 0.7,
        maxTokens: 100,
        k: 5,
        p: 0.9,
        citationQuality: 'accurate'
      });

      expect(mockCohereClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 100,
          k: 5,
          p: 0.9,
          citationQuality: 'accurate'
        })
      );
    });

    it('should handle chat with documents (RAG)', async () => {
      const mockResponse = {
        text: 'Based on the documents...',
        generationId: 'gen-123',
        citations: [
          { start: 0, end: 10, text: 'Based on', documentIds: ['doc1'] }
        ],
        documents: [
          { id: 'doc1', text: 'Document content', title: 'Doc 1' }
        ],
        meta: { billedUnits: { inputTokens: 50, outputTokens: 30 } }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      const response = await client.chat({
        message: 'Summarize these documents',
        documents: [
          { text: 'Document content', title: 'Doc 1' }
        ]
      });

      expect(response.citations).toBeDefined();
      expect(response.citations?.length).toBeGreaterThan(0);
      expect(response.metadata?.hasCitations).toBe(true);
      expect(response.metadata?.hasDocuments).toBe(true);
    });

    it('should handle chat with connectors (web search)', async () => {
      const mockResponse = {
        text: 'According to recent sources...',
        generationId: 'gen-123',
        searchQueries: [
          { text: 'AI news', generationId: 'gen-123' }
        ],
        searchResults: [
          { searchQuery: {}, connector: {}, documentIds: ['web1'] }
        ],
        meta: { billedUnits: { inputTokens: 20, outputTokens: 40 } }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      const response = await client.chat({
        message: 'Latest AI news?',
        connectors: [{ id: 'web-search' }]
      });

      expect(response.searchQueries).toBeDefined();
      expect(response.searchResults).toBeDefined();
      expect(response.metadata?.hasSearchResults).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      mockCohereClient.chat.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(
        client.chat({
          message: 'Test'
        })
      ).rejects.toThrow('Cohere API error: Rate limit exceeded');
    });

    it('should support all Cohere chat models', async () => {
      const models = [
        'command',
        'command-light',
        'command-r',
        'command-r-plus'
      ];

      for (const model of models) {
        const mockResponse = {
          text: 'Test',
          generationId: 'gen-123',
          meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
        };

        mockCohereClient.chat.mockResolvedValue(mockResponse);

        const response = await client.chat({
          message: 'Test',
          model
        });

        expect(response.metadata?.model).toBe(model);
      }
    });
  });

  describe('Embeddings', () => {
    it('should generate embeddings successfully', async () => {
      const mockResponse = {
        id: 'embed-123',
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6]
        ],
        meta: {
          billedUnits: {
            inputTokens: 10
          }
        }
      };

      mockCohereClient.embed.mockResolvedValue(mockResponse);

      const response = await client.embed({
        texts: ['Hello world', 'Goodbye world']
      });

      expect(response.embeddings).toHaveLength(2);
      expect(response.embeddings[0]).toHaveLength(3);
      expect(response.metadata?.provider).toBe('cohere');
      expect(response.metadata?.cost).toBeDefined();
    });

    it('should use default embed model from config', async () => {
      const mockResponse = {
        id: 'embed-123',
        embeddings: [[0.1, 0.2]],
        meta: { billedUnits: { inputTokens: 5 } }
      };

      mockCohereClient.embed.mockResolvedValue(mockResponse);

      await client.embed({
        texts: ['Test']
      });

      expect(mockCohereClient.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'embed-english-v3.0'
        })
      );
    });

    it('should handle embed with all parameters', async () => {
      const mockResponse = {
        id: 'embed-123',
        embeddings: [[0.1, 0.2]],
        meta: { billedUnits: { inputTokens: 5 } }
      };

      mockCohereClient.embed.mockResolvedValue(mockResponse);

      await client.embed({
        texts: ['Test'],
        model: 'embed-multilingual-v3.0',
        inputType: 'search_document',
        truncate: 'END'
      });

      expect(mockCohereClient.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'embed-multilingual-v3.0',
          inputType: 'search_document',
          truncate: 'END'
        })
      );
    });

    it('should support all Cohere embed models', async () => {
      const models = [
        'embed-english-v3.0',
        'embed-multilingual-v3.0',
        'embed-english-light-v3.0',
        'embed-multilingual-light-v3.0'
      ];

      for (const model of models) {
        const mockResponse = {
          id: 'embed-123',
          embeddings: [[0.1, 0.2]],
          meta: { billedUnits: { inputTokens: 5 } }
        };

        mockCohereClient.embed.mockResolvedValue(mockResponse);

        const response = await client.embed({
          texts: ['Test'],
          model
        });

        expect(response.metadata?.model).toBe(model);
      }
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for Command', () => {
      const cost = (client as any).calculateCohereCost('command', {
        input_tokens: 1000000,
        output_tokens: 500000
      });

      // Command: $1 per 1M input, $2 per 1M output
      // (1000000/1000000 * 1) + (500000/1000000 * 2) = 1 + 1 = 2
      expect(cost).toBeCloseTo(2.00, 2);
    });

    it('should calculate cost for Command Light', () => {
      const cost = (client as any).calculateCohereCost('command-light', {
        input_tokens: 1000000,
        output_tokens: 500000
      });

      // Command Light: $0.30 per 1M input, $0.60 per 1M output
      // (1000000/1000000 * 0.30) + (500000/1000000 * 0.60) = 0.30 + 0.30 = 0.60
      expect(cost).toBeCloseTo(0.60, 2);
    });

    it('should calculate cost for Command R', () => {
      const cost = (client as any).calculateCohereCost('command-r', {
        input_tokens: 1000000,
        output_tokens: 500000
      });

      // Command R: $0.50 per 1M input, $1.50 per 1M output
      // (1000000/1000000 * 0.50) + (500000/1000000 * 1.50) = 0.50 + 0.75 = 1.25
      expect(cost).toBeCloseTo(1.25, 2);
    });

    it('should calculate cost for Command R Plus', () => {
      const cost = (client as any).calculateCohereCost('command-r-plus', {
        input_tokens: 1000000,
        output_tokens: 500000
      });

      // Command R Plus: $3 per 1M input, $15 per 1M output
      // (1000000/1000000 * 3) + (500000/1000000 * 15) = 3 + 7.5 = 10.5
      expect(cost).toBeCloseTo(10.5, 2);
    });

    it('should calculate cost for embeddings', () => {
      const cost = (client as any).calculateCohereCost('embed-english-v3.0', {
        input_tokens: 1000000,
        output_tokens: 0
      });

      // Embeddings: $0.10 per 1M input, $0 output
      // (1000000/1000000 * 0.10) + 0 = 0.10
      expect(cost).toBeCloseTo(0.10, 2);
    });

    it('should use default pricing for unknown models', () => {
      const cost = (client as any).calculateCohereCost('unknown-model', {
        input_tokens: 1000000,
        output_tokens: 500000
      });

      // Should default to command-r-plus pricing
      expect(cost).toBeCloseTo(10.5, 2);
    });
  });

  describe('TealEngine Integration', () => {
    it('should integrate with TealEngine', async () => {
      const engine = new TealEngine({
        tools: { 'chat': { allowed: true } },
        identity: { agentId: 'test-agent', role: 'user', permissions: ['chat'] }
      });

      const testClient = new TealCohere({
        cohereApiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      const mockCohereClientWithEngine = (testClient as any).cohereClient;
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClientWithEngine.chat.mockResolvedValue(mockResponse);

      const response = await testClient.chat({
        message: 'Test'
      });

      expect(response.metadata?.policyEvaluation).toBe('enabled');
    });

    it('should enforce policy restrictions', async () => {
      const engine = new TealEngine({
        tools: { 'chat': { allowed: false } },
        identity: { agentId: 'test-agent', role: 'user', permissions: [] }
      });

      const testClient = new TealCohere({
        cohereApiKey: 'test-key',
        agentId: 'test-agent',
        engine
      });

      await expect(
        testClient.chat({
          message: 'Test'
        })
      ).rejects.toThrow();
    });
  });

  describe('TealGuard Integration', () => {
    it('should integrate with TealGuard', async () => {
      const guard = new TealGuard({});

      const testClient = new TealCohere({
        cohereApiKey: 'test-key',
        guard
      });

      const mockCohereClientWithGuard = (testClient as any).cohereClient;
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClientWithGuard.chat.mockResolvedValue(mockResponse);

      const response = await testClient.chat({
        message: 'Test'
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

      const testClient = new TealCohere({
        cohereApiKey: 'test-key',
        monitor
      });

      const mockCohereClientWithMonitor = (testClient as any).cohereClient;
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClientWithMonitor.chat.mockResolvedValue(mockResponse);

      const response = await testClient.chat({
        message: 'Test'
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

      const testClient = new TealCohere({
        cohereApiKey: 'test-key',
        circuit
      });

      const mockCohereClientWithCircuit = (testClient as any).cohereClient;
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClientWithCircuit.chat.mockResolvedValue(mockResponse);

      const response = await testClient.chat({
        message: 'Test'
      });

      expect(response.metadata?.circuitState).toBe('closed');
    });
  });

  describe('Metadata', () => {
    it('should include Cohere-specific metadata', async () => {
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      const response = await client.chat({
        message: 'Test'
      });

      expect(response.metadata?.provider).toBe('cohere');
      expect(response.metadata?.model).toBe('command-r-plus');
    });

    it('should include RAG metadata when documents provided', async () => {
      const mockResponse = {
        text: 'Test',
        generationId: 'gen-123',
        citations: [{ start: 0, end: 4, text: 'Test', documentIds: ['doc1'] }],
        documents: [{ id: 'doc1', text: 'Doc content' }],
        meta: { billedUnits: { inputTokens: 10, outputTokens: 10 } }
      };

      mockCohereClient.chat.mockResolvedValue(mockResponse);

      const response = await client.chat({
        message: 'Test',
        documents: [{ text: 'Doc content' }]
      });

      expect(response.metadata?.hasCitations).toBe(true);
      expect(response.metadata?.hasDocuments).toBe(true);
    });
  });

  describe('Pricing Table', () => {
    it('should have correct pricing for all models', () => {
      expect(COHERE_PRICING['command']).toEqual({
        input: 1.00,
        output: 2.00
      });

      expect(COHERE_PRICING['command-light']).toEqual({
        input: 0.30,
        output: 0.60
      });

      expect(COHERE_PRICING['command-r']).toEqual({
        input: 0.50,
        output: 1.50
      });

      expect(COHERE_PRICING['command-r-plus']).toEqual({
        input: 3.00,
        output: 15.00
      });

      expect(COHERE_PRICING['embed-english-v3.0']).toEqual({
        input: 0.10,
        output: 0.00
      });
    });
  });
});
