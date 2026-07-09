/**
 * Unit tests for ObserveProxy governance integration (TEEC v2.1).
 *
 * Validates that observe() with governance: true produces v2.1 decisions,
 * governance: false preserves Phase 1 behavior, and error cases are handled.
 *
 * @module observe/__tests__/observe-governance.test
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.7
 */

import { observe } from '../observe';
import { SealConfigurationError } from '../../core/engine/v2.1/errors';
import { validateGovernanceDecision } from '../../core/engine/v2.1/validateGovernanceDecision';
import type { ProviderSignature } from '../types';

// Mock the provider-detector to avoid needing a real provider client
jest.mock('../provider-detector', () => ({
  detectProvider: jest.fn(),
}));

import { detectProvider } from '../provider-detector';

const mockedDetectProvider = detectProvider as jest.MockedFunction<typeof detectProvider>;

/**
 * Create a mock provider signature that looks like OpenAI.
 */
function createMockProviderSignature(): ProviderSignature {
  return {
    provider: 'openai',
    interceptMethods: ['chat.completions.create'],
    usageExtractor: () => ({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    }),
    modelExtractor: () => 'gpt-4o',
    toolCallExtractor: () => [],
  };
}

/**
 * Create a mock OpenAI-like client with nested chat.completions.create method.
 */
function createMockClient() {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          id: 'chatcmpl-mock-1',
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello!' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      },
    },
  };
}

describe('ObserveProxy governance integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDetectProvider.mockReturnValue(createMockProviderSignature());
  });

  describe('governance: true produces v2.1 decisions', () => {
    it('should produce DecisionV21 with all six v2.1 fields on each intercepted call', async () => {
      const mockClient = createMockClient();
      const sealSecret = 'test-seal-secret-for-governance';

      const proxy = observe(mockClient, {
        governance: true,
        governance_seal_secret: sealSecret,
        agentId: 'test-agent-001',
        sessionId: 'test-session-001',
      });

      // Make a call through the proxy
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const decisions = proxy.getDecisions();

      expect(decisions).toHaveLength(1);
      const decision = decisions[0];

      // Verify all v2.1 fields are present
      expect(decision.intent_ref).toBeDefined();
      expect(typeof decision.intent_ref).toBe('string');
      expect(decision.intent_ref).toHaveLength(64); // SHA-256 hex

      expect(decision.receipt_ref).toBeDefined();
      expect(typeof decision.receipt_ref).toBe('string');
      expect(decision.receipt_ref).toHaveLength(64);

      expect(decision.seq).toBe(1);
      expect(decision.running_count).toBe(1);

      expect(decision.normalization_id).toBeDefined();
      expect(typeof decision.normalization_id).toBe('string');
      expect(decision.normalization_id).toHaveLength(64);

      expect(decision.governance_seal).toBeDefined();
      expect(typeof decision.governance_seal.hmac).toBe('string');
      expect(decision.governance_seal.hmac).toHaveLength(64);
      expect(typeof decision.governance_seal.timestamp).toBe('number');
      expect(decision.governance_seal.agent_id).toBe('test-agent-001');

      expect(decision.teec_version).toBe('2.1');
    });

    it('should populate base decision fields (action, mode, etc.)', async () => {
      const mockClient = createMockClient();

      const proxy = observe(mockClient, {
        governance: true,
        governance_seal_secret: 'secret-123',
        agentId: 'agent-base-fields',
      });

      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Test' }],
      });

      const decisions = proxy.getDecisions();
      const decision = decisions[0];

      expect(decision.action).toBe('ALLOW');
      expect(decision.mode).toBe('MONITOR');
      expect(decision.policy_id).toBe('observe-governance');
      expect(decision.policy_version).toBe('2.1');
      expect(decision.event_type).toBe('llm.request');
      expect(decision.module).toBe('observe');
    });
  });

  describe('governance: false is identical to Phase 1 behavior', () => {
    it('should return empty decisions array when governance is not enabled', async () => {
      const mockClient = createMockClient();

      const proxy = observe(mockClient, {
        agentId: 'test-agent-no-gov',
        sessionId: 'test-session-no-gov',
      });

      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const decisions = proxy.getDecisions();
      expect(decisions).toHaveLength(0);
    });

    it('should return empty decisions array when governance is explicitly false', async () => {
      const mockClient = createMockClient();

      const proxy = observe(mockClient, {
        governance: false,
        agentId: 'test-agent-false-gov',
      });

      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const decisions = proxy.getDecisions();
      expect(decisions).toHaveLength(0);
    });

    it('should still forward calls to the provider when governance is disabled', async () => {
      const mockClient = createMockClient();

      const proxy = observe(mockClient, {
        governance: false,
        agentId: 'test-agent-forward',
      });

      const result = await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(result.choices[0].message.content).toBe('Hello!');
    });
  });

  describe('missing governance_seal_secret throws SealConfigurationError at init', () => {
    it('should throw SealConfigurationError when governance is true but no seal_secret', () => {
      const mockClient = createMockClient();

      expect(() => {
        observe(mockClient, {
          governance: true,
          // governance_seal_secret intentionally omitted
        });
      }).toThrow(SealConfigurationError);
    });

    it('should throw SealConfigurationError with descriptive message', () => {
      const mockClient = createMockClient();

      expect(() => {
        observe(mockClient, {
          governance: true,
        });
      }).toThrow(/seal_secret is required for TEEC v2.1 governance/);
    });

    it('should throw at initialization, not at first call', () => {
      const mockClient = createMockClient();

      // The error is thrown synchronously during observe() initialization
      let thrown = false;
      try {
        observe(mockClient, { governance: true });
      } catch (e) {
        thrown = true;
        expect(e).toBeInstanceOf(SealConfigurationError);
      }
      expect(thrown).toBe(true);
    });
  });

  describe('getDecisions() returns decisions that pass validate_governance_decision', () => {
    it('should produce decisions that pass validation with the original request and seal_secret', async () => {
      const mockClient = createMockClient();
      const sealSecret = 'validation-test-secret';
      const requestPayload = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Validate me' }],
      };

      const proxy = observe(mockClient, {
        governance: true,
        governance_seal_secret: sealSecret,
        agentId: 'validation-agent',
      });

      await proxy.chat.completions.create(requestPayload);

      const decisions = proxy.getDecisions();
      expect(decisions).toHaveLength(1);

      const decision = decisions[0];
      const result = validateGovernanceDecision(decision as unknown as Record<string, unknown>, {
        request_payload: requestPayload,
        seal_secret: sealSecret,
        reference_time: decision.governance_seal.timestamp,
        timestamp_tolerance_ms: 60000,
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.intent_ref).toBe(decision.intent_ref);
        expect(result.receipt_ref).toBe(decision.receipt_ref);
      }
    });
  });

  describe('multiple calls produce sequential decisions', () => {
    it('should produce sequential seq values 1, 2, 3 for three calls', async () => {
      const mockClient = createMockClient();
      const sealSecret = 'sequential-test-secret';

      const proxy = observe(mockClient, {
        governance: true,
        governance_seal_secret: sealSecret,
        agentId: 'seq-agent',
      });

      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'First' }],
      });
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Second' }],
      });
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Third' }],
      });

      const decisions = proxy.getDecisions();
      expect(decisions).toHaveLength(3);

      expect(decisions[0].seq).toBe(1);
      expect(decisions[1].seq).toBe(2);
      expect(decisions[2].seq).toBe(3);
    });

    it('should produce sequential running_count values 1, 2, 3', async () => {
      const mockClient = createMockClient();
      const sealSecret = 'running-count-test-secret';

      const proxy = observe(mockClient, {
        governance: true,
        governance_seal_secret: sealSecret,
        agentId: 'rc-agent',
      });

      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'A' }],
      });
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'B' }],
      });
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'C' }],
      });

      const decisions = proxy.getDecisions();
      expect(decisions).toHaveLength(3);

      expect(decisions[0].running_count).toBe(1);
      expect(decisions[1].running_count).toBe(2);
      expect(decisions[2].running_count).toBe(3);
    });

    it('should chain receipt_refs correctly across sequential decisions', async () => {
      const mockClient = createMockClient();
      const sealSecret = 'chain-test-secret';

      const proxy = observe(mockClient, {
        governance: true,
        governance_seal_secret: sealSecret,
        agentId: 'chain-agent',
      });

      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'One' }],
      });
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Two' }],
      });
      await proxy.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Three' }],
      });

      const decisions = proxy.getDecisions();
      expect(decisions).toHaveLength(3);

      // Each decision should have a unique receipt_ref
      const receiptRefs = decisions.map((d) => d.receipt_ref);
      const uniqueRefs = new Set(receiptRefs);
      expect(uniqueRefs.size).toBe(3);

      // All receipt_refs should be valid SHA-256 hex strings
      for (const ref of receiptRefs) {
        expect(ref).toHaveLength(64);
        expect(ref).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });
});
