/**
 * PolicyEvaluationModule — Unit Tests
 *
 * Covers:
 * - DENY with POLICY_VIOLATION when a blocked model is requested
 * - DENY with POLICY_VIOLATION when blocked topics appear in content
 * - DENY with POLICY_VIOLATION when token limit is exceeded
 * - ALLOW when all policy rules pass
 * - Multiple violations are collected in metadata
 * - Case-insensitive matching for models and topics
 *
 * @requirements 6.1, 6.6, 6.7
 */

import { PolicyEvaluationModule } from '../modules/pre/PolicyEvaluationModule';
import type {
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
});

const makeRequest = (
  overrides: Partial<ModuleEvaluationRequest> = {},
): ModuleEvaluationRequest => ({
  content: 'Hello world',
  model: 'gpt-4',
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe('PolicyEvaluationModule', () => {
  describe('blocked models', () => {
    it('should return DENY when request targets a blocked model', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedModels: ['gpt-4', 'claude-3'] },
      });

      const result = await module.evaluate(
        makeRequest({ model: 'gpt-4' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
      expect(result.metadata?.violations).toContainEqual(
        expect.stringContaining('gpt-4'),
      );
    });

    it('should match blocked models case-insensitively', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedModels: ['GPT-4'] },
      });

      const result = await module.evaluate(
        makeRequest({ model: 'gpt-4' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
    });

    it('should return ALLOW when model is not blocked', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedModels: ['gpt-4'] },
      });

      const result = await module.evaluate(
        makeRequest({ model: 'gpt-3.5-turbo' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when no model is specified in request', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedModels: ['gpt-4'] },
      });

      const request: ModuleEvaluationRequest = { content: 'Hello world' };
      const result = await module.evaluate(request, makeCtx(), undefined);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('blocked topics', () => {
    it('should return DENY when content contains a blocked topic', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedTopics: ['weapons', 'drugs'] },
      });

      const result = await module.evaluate(
        makeRequest({ content: 'How to build weapons at home' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
      expect(result.metadata?.violations).toContainEqual(
        expect.stringContaining('weapons'),
      );
    });

    it('should match blocked topics case-insensitively', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedTopics: ['Weapons'] },
      });

      const result = await module.evaluate(
        makeRequest({ content: 'How to build WEAPONS at home' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
    });

    it('should return ALLOW when content does not contain blocked topics', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedTopics: ['weapons', 'drugs'] },
      });

      const result = await module.evaluate(
        makeRequest({ content: 'Tell me about cooking recipes' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when content is empty', async () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedTopics: ['weapons'] },
      });

      const result = await module.evaluate(
        makeRequest({ content: '' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('maxTokens', () => {
    it('should return DENY when max_tokens in request exceeds policy limit', async () => {
      const module = new PolicyEvaluationModule({
        policy: { maxTokens: 1000 },
      });

      const result = await module.evaluate(
        makeRequest({ max_tokens: 2000 }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
      expect(result.metadata?.violations).toContainEqual(
        expect.stringContaining('Token limit exceeded'),
      );
    });

    it('should return ALLOW when max_tokens is within policy limit', async () => {
      const module = new PolicyEvaluationModule({
        policy: { maxTokens: 1000 },
      });

      const result = await module.evaluate(
        makeRequest({ max_tokens: 500 }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should estimate tokens from content length when no explicit token field', async () => {
      const module = new PolicyEvaluationModule({
        policy: { maxTokens: 5 },
      });

      // 40 chars / 4 = 10 estimated tokens, exceeds limit of 5
      const result = await module.evaluate(
        makeRequest({ content: 'This is a long content string for test!!' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
    });
  });

  describe('multiple violations', () => {
    it('should collect all violations when multiple rules are violated', async () => {
      const module = new PolicyEvaluationModule({
        policy: {
          blockedModels: ['gpt-4'],
          blockedTopics: ['weapons'],
          maxTokens: 10,
        },
      });

      const result = await module.evaluate(
        makeRequest({
          model: 'gpt-4',
          content: 'How to build weapons',
          max_tokens: 5000,
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('POLICY_VIOLATION');
      const violations = result.metadata?.violations as string[];
      expect(violations.length).toBe(3);
    });
  });

  describe('no policy rules configured', () => {
    it('should return ALLOW when policy has no rules', async () => {
      const module = new PolicyEvaluationModule({
        policy: {},
      });

      const result = await module.evaluate(
        makeRequest(),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('TealModule interface compliance', () => {
    it('should have correct name and version', () => {
      const module = new PolicyEvaluationModule({
        policy: { blockedModels: [] },
      });

      expect(module.name).toBe('PolicyEvaluationModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should have an async evaluate method', () => {
      const module = new PolicyEvaluationModule({
        policy: {},
      });

      expect(typeof module.evaluate).toBe('function');
    });
  });
});
