/**
 * TealGemini Unit Tests
 */

import { TealGemini, GEMINI_PRICING, HarmCategory, HarmBlockThreshold } from '../gemini';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealGuard } from '../../core/guard/TealGuard';
import { TealMonitor } from '../../core/monitor/TealMonitor';
import { TealCircuit } from '../../core/circuit/TealCircuit';
import { TealAudit } from '../../core/audit/TealAudit';

// Mock Google Generative AI
jest.mock('@google/generative-ai');

describe('TealGemini', () => {
  let mockGenerateContent: jest.Mock;
  let mockGenerateContentStream: jest.Mock;
  let mockGetGenerativeModel: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock generateContent
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: {
        text: () => 'This is a test response from Gemini',
        candidates: [{ content: { parts: [{ text: 'Test response' }] } }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30
        }
      }
    });

    // Mock generateContentStream
    mockGenerateContentStream = jest.fn().mockResolvedValue({
      stream: (async function* () {
        yield { text: () => 'Chunk 1' };
        yield { text: () => 'Chunk 2' };
      })()
    });

    // Mock getGenerativeModel
    mockGetGenerativeModel = jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream
    });

    // Mock GoogleGenerativeAI constructor
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel
    }));
  });

  describe('Constructor', () => {
    it('should create TealGemini instance with API key', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      expect(client).toBeInstanceOf(TealGemini);
    });

    it('should use default model if not specified', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      expect(client['defaultModel']).toBe('gemini-pro');
    });

    it('should use custom model if specified', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key',
        model: 'gemini-1.5-pro'
      });

      expect(client['defaultModel']).toBe('gemini-1.5-pro');
    });

    it('should initialize with safety settings', () => {
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
      ];

      const client = new TealGemini({
        apiKey: 'test-api-key',
        safetySettings
      });

      expect(client['defaultSafetySettings']).toEqual(safetySettings);
    });

    it('should initialize with generation config', () => {
      const generationConfig = {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
      };

      const client = new TealGemini({
        apiKey: 'test-api-key',
        generationConfig
      });

      expect(client['defaultGenerationConfig']).toEqual(generationConfig);
    });
  });

  describe('generateContent()', () => {
    it('should generate content with text input', async () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const response = await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'What is AI?' }]
        }]
      });

      expect(response.text).toBe('This is a test response from Gemini');
      expect(response.metadata?.provider).toBe('gemini');
      expect(response.metadata?.model).toBe('gemini-pro');
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should use custom model when specified', async () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }],
        model: 'gemini-1.5-flash'
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-1.5-flash'
        })
      );
    });

    it('should calculate cost correctly', async () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const response = await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      // Cost calculation: (10/1M * 0.50) + (20/1M * 1.50) = 0.000005 + 0.00003 = 0.000035
      expect(response.metadata?.cost).toBe('0.0000');
    });

    it('should handle multimodal input (text + image)', async () => {
      const client = new TealGemini({
        apiKey: 'test-api-key',
        model: 'gemini-pro-vision'
      });

      const response = await client.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: 'What is in this image?' },
            { inlineData: { mimeType: 'image/jpeg', data: 'base64data' } }
          ]
        }]
      });

      expect(response.text).toBe('This is a test response from Gemini');
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should pass safety settings to model', async () => {
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
      ];

      const client = new TealGemini({
        apiKey: 'test-api-key',
        safetySettings
      });

      await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          safetySettings
        })
      );
    });

    it('should pass generation config to model', async () => {
      const generationConfig = {
        temperature: 0.9,
        maxOutputTokens: 2048
      };

      const client = new TealGemini({
        apiKey: 'test-api-key',
        generationConfig
      });

      await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig
        })
      );
    });
  });

  describe('generateContentStream()', () => {
    it('should stream content chunks', async () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const chunks: string[] = [];
      const stream = client.generateContentStream({
        contents: [{
          role: 'user',
          parts: [{ text: 'Write a story' }]
        }]
      });

      for await (const chunk of stream) {
        if (!chunk.done) {
          chunks.push(chunk.text);
        }
      }

      expect(chunks).toEqual(['Chunk 1', 'Chunk 2']);
      expect(mockGenerateContentStream).toHaveBeenCalled();
    });
  });

  describe('TealEngine Integration', () => {
    it('should enforce policies with TealEngine', async () => {
      const engine = new TealEngine({
        tools: {
          'generateContent': { allowed: true }
        },
        identity: {
          agentId: 'test-agent',
          role: 'user',
          permissions: ['generate:content']
        }
      });

      const client = new TealGemini({
        apiKey: 'test-api-key',
        agentId: 'test-agent',
        engine
      });

      const response = await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      expect(response.metadata?.policyEvaluation).toBe('enabled');
    });

    it('should block requests that violate policies', async () => {
      const engine = new TealEngine({
        tools: {
          'generateContent': { allowed: false }
        },
        identity: {
          agentId: 'test-agent',
          role: 'user',
          permissions: []
        }
      });

      const client = new TealGemini({
        apiKey: 'test-api-key',
        agentId: 'test-agent',
        engine
      });

      await expect(
        client.generateContent({
          contents: [{
            role: 'user',
            parts: [{ text: 'Test' }]
          }]
        })
      ).rejects.toThrow();
    });
  });

  describe('TealGuard Integration', () => {
    it('should validate content with TealGuard', async () => {
      const guard = new TealGuard({});

      const client = new TealGemini({
        apiKey: 'test-api-key',
        guard
      });

      const response = await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'What is AI?' }]
        }]
      });

      expect(response.metadata?.guardrailResults).toBe('enabled');
    });
  });

  describe('TealMonitor Integration', () => {
    it('should track metrics with TealMonitor', async () => {
      const monitor = new TealMonitor({});

      const trackSpy = jest.spyOn(monitor, 'track');

      const client = new TealGemini({
        apiKey: 'test-api-key',
        agentId: 'test-agent',
        monitor
      });

      await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      expect(trackSpy).toHaveBeenCalled();
      expect(trackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'test-agent',
          type: 'request'
        })
      );
    });
  });

  describe('TealCircuit Integration', () => {
    it('should use circuit breaker with TealCircuit', async () => {
      const circuit = new TealCircuit({
        failureThreshold: 3,
        timeout: 5000,
        halfOpenRequests: 1
      });

      const client = new TealGemini({
        apiKey: 'test-api-key',
        circuit
      });

      const response = await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      expect(response.metadata?.circuitState).toBe('closed');
    });
  });

  describe('TealAudit Integration', () => {
    it('should log requests with TealAudit', async () => {
      const audit = new TealAudit({
        outputs: [new (require('../../core/audit/TealAudit').ConsoleOutput)()]
      });

      const logSpy = jest.spyOn(audit, 'log');

      const client = new TealGemini({
        apiKey: 'test-api-key',
        audit
      });

      await client.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: 'Test' }]
        }]
      });

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for gemini-pro', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const cost = client['calculateCost'](
        {
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 2000
          }
        },
        'gemini-pro'
      );

      // (1000/1M * 0.50) + (2000/1M * 1.50) = 0.0005 + 0.003 = 0.0035
      expect(cost).toBeCloseTo(0.0035, 4);
    });

    it('should calculate cost for gemini-1.5-pro', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const cost = client['calculateCost'](
        {
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 2000
          }
        },
        'gemini-1.5-pro'
      );

      // (1000/1M * 3.50) + (2000/1M * 10.50) = 0.0035 + 0.021 = 0.0245
      expect(cost).toBeCloseTo(0.0245, 4);
    });

    it('should return 0 if no usage metadata', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const cost = client['calculateCost']({}, 'gemini-pro');
      expect(cost).toBe(0);
    });
  });

  describe('Content Extraction', () => {
    it('should extract text from single content', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const text = client['extractContent']([
        {
          role: 'user',
          parts: [{ text: 'Hello world' }]
        }
      ]);

      expect(text).toBe('Hello world');
    });

    it('should extract text from multiple parts', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const text = client['extractContent']([
        {
          role: 'user',
          parts: [
            { text: 'Part 1' },
            { text: 'Part 2' }
          ]
        }
      ]);

      expect(text).toBe('Part 1 Part 2');
    });

    it('should handle non-text content', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const text = client['extractContent']([
        {
          role: 'user',
          parts: [
            { text: 'Text part' },
            { inlineData: { mimeType: 'image/jpeg', data: 'base64' } }
          ]
        }
      ]);

      expect(text).toBe('Text part [non-text content]');
    });

    it('should extract text from multiple contents', () => {
      const client = new TealGemini({
        apiKey: 'test-api-key'
      });

      const text = client['extractContent']([
        {
          role: 'user',
          parts: [{ text: 'First message' }]
        },
        {
          role: 'model',
          parts: [{ text: 'Response' }]
        },
        {
          role: 'user',
          parts: [{ text: 'Follow-up' }]
        }
      ]);

      expect(text).toBe('First message\nResponse\nFollow-up');
    });
  });

  describe('Pricing Table', () => {
    it('should have correct pricing for all models', () => {
      expect(GEMINI_PRICING['gemini-pro']).toEqual({
        input: 0.50,
        output: 1.50
      });

      expect(GEMINI_PRICING['gemini-pro-vision']).toEqual({
        input: 0.50,
        output: 1.50
      });

      expect(GEMINI_PRICING['gemini-1.5-pro']).toEqual({
        input: 3.50,
        output: 10.50
      });

      expect(GEMINI_PRICING['gemini-1.5-flash']).toEqual({
        input: 0.35,
        output: 1.05
      });

      expect(GEMINI_PRICING['gemini-ultra']).toEqual({
        input: 7.00,
        output: 21.00
      });
    });
  });
});
