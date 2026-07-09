/**
 * InputValidationModule — Unit Tests
 *
 * Covers:
 * - DENY with INPUT_INVALID when required fields are missing
 * - DENY with INPUT_INVALID when type checks fail
 * - DENY with INPUT_INVALID when max token limit is exceeded
 * - ALLOW when all validation checks pass
 * - Multiple failures are collected in metadata
 * - Only configured checks are enforced
 *
 * @requirements 6.2, 6.6, 6.7
 */

import { InputValidationModule } from '../modules/pre/InputValidationModule';
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

describe('InputValidationModule', () => {
  describe('required fields', () => {
    it('should return DENY when a required field is missing', async () => {
      const module = new InputValidationModule({
        requiredFields: ['content', 'model'],
      });

      // Create a request without 'model' field
      const request = { content: 'Hello' } as any;

      const result = await module.evaluate(
        request,
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('INPUT_INVALID');
      expect(result.metadata?.failures).toContainEqual(
        expect.stringContaining('model'),
      );
    });

    it('should return DENY when a required field is null', async () => {
      const module = new InputValidationModule({
        requiredFields: ['content'],
      });

      const request = { content: null, model: 'gpt-4' } as any;

      const result = await module.evaluate(
        request,
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('INPUT_INVALID');
    });

    it('should return ALLOW when all required fields are present', async () => {
      const module = new InputValidationModule({
        requiredFields: ['content', 'model'],
      });

      const result = await module.evaluate(
        makeRequest({ content: 'Hello', model: 'gpt-4' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should collect all missing required fields', async () => {
      const module = new InputValidationModule({
        requiredFields: ['content', 'model', 'tool'],
      });

      // Create a request with none of the required fields
      const request = {} as any;

      const result = await module.evaluate(
        request,
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const failures = result.metadata?.failures as string[];
      expect(failures.length).toBe(3);
    });
  });

  describe('type checks', () => {
    it('should return DENY when a field has the wrong type', async () => {
      const module = new InputValidationModule({
        typeChecks: { model: 'string', max_tokens: 'number' },
      });

      const result = await module.evaluate(
        makeRequest({ model: 'gpt-4', max_tokens: 'not-a-number' as any }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('INPUT_INVALID');
      expect(result.metadata?.failures).toContainEqual(
        expect.stringContaining("'max_tokens'"),
      );
    });

    it('should return ALLOW when all fields match expected types', async () => {
      const module = new InputValidationModule({
        typeChecks: { model: 'string', content: 'string' },
      });

      const result = await module.evaluate(
        makeRequest({ model: 'gpt-4', content: 'Hello' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should skip type check for undefined/null fields', async () => {
      const module = new InputValidationModule({
        typeChecks: { tool: 'string' },
      });

      // Field is not present — type check should not fail
      const result = await module.evaluate(
        makeRequest(),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should include expected and actual type in metadata', async () => {
      const module = new InputValidationModule({
        typeChecks: { model: 'number' },
      });

      const result = await module.evaluate(
        makeRequest({ model: 'gpt-4' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const failures = result.metadata?.failures as string[];
      expect(failures[0]).toContain('expected number');
      expect(failures[0]).toContain('got string');
    });
  });

  describe('maxTokens', () => {
    it('should return DENY when estimated tokens exceed max', async () => {
      const module = new InputValidationModule({
        maxTokens: 5,
      });

      // 40 chars / 4 = 10 estimated tokens, exceeds limit of 5
      const result = await module.evaluate(
        makeRequest({ content: 'This is a long content string for test!!' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('INPUT_INVALID');
      expect(result.metadata?.failures).toContainEqual(
        expect.stringContaining('Token limit exceeded'),
      );
    });

    it('should return DENY when explicit max_tokens field exceeds limit', async () => {
      const module = new InputValidationModule({
        maxTokens: 1000,
      });

      const result = await module.evaluate(
        makeRequest({ max_tokens: 2000 }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('INPUT_INVALID');
    });

    it('should return ALLOW when tokens are within limit', async () => {
      const module = new InputValidationModule({
        maxTokens: 1000,
      });

      const result = await module.evaluate(
        makeRequest({ content: 'Short', max_tokens: 500 }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should use content length estimation when no explicit token field', async () => {
      const module = new InputValidationModule({
        maxTokens: 3,
      });

      // 12 chars / 4 = 3 tokens — exactly at limit, should pass
      const result = await module.evaluate(
        makeRequest({ content: 'Hello World!' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('multiple validation failures', () => {
    it('should collect all failures when multiple checks fail', async () => {
      const module = new InputValidationModule({
        requiredFields: ['tool'],
        typeChecks: { model: 'number' },
        maxTokens: 5,
      });

      const result = await module.evaluate(
        makeRequest({
          model: 'gpt-4',
          content: 'A long content string that is over five tokens',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('INPUT_INVALID');
      const failures = result.metadata?.failures as string[];
      expect(failures.length).toBe(3);
      expect(result.metadata?.failure_count).toBe(3);
    });
  });

  describe('no validation configured', () => {
    it('should return ALLOW when no validation rules are configured', async () => {
      const module = new InputValidationModule({});

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
      const module = new InputValidationModule({});

      expect(module.name).toBe('InputValidationModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should have an async evaluate method', () => {
      const module = new InputValidationModule({});

      expect(typeof module.evaluate).toBe('function');
    });

    it('should produce INPUT_INVALID reason code on failure', async () => {
      const module = new InputValidationModule({
        requiredFields: ['nonexistent'],
      });

      const result = await module.evaluate(
        makeRequest(),
        makeCtx(),
        undefined,
      );

      expect(result.reason_codes).toEqual(['INPUT_INVALID']);
    });
  });
});
