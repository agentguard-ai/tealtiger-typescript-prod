/**
 * OutputPIIModule — Unit Tests
 *
 * Covers:
 * - DENY with PII_IN_RESPONSE when email addresses are found above threshold
 * - DENY with PII_IN_RESPONSE when phone numbers are found above threshold
 * - DENY with PII_IN_RESPONSE when SSN is found above threshold
 * - DENY with PII_IN_RESPONSE when credit card numbers are found above threshold
 * - ALLOW when no PII is detected
 * - ALLOW when PII confidence is below threshold
 * - Custom patterns support
 * - Metadata includes remediation: "redact" on DENY
 * - Findings array is populated with match details
 * - Response content extraction from _response and content fields
 * - TealModule interface compliance
 *
 * @requirements 7.2, 7.6, 7.7
 */

import { OutputPIIModule } from '../modules/post/OutputPIIModule';
import type {
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-output-pii-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
});

const makeRequest = (
  overrides: Partial<ModuleEvaluationRequest> = {},
): ModuleEvaluationRequest => ({
  content: 'Hello world',
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe('OutputPIIModule', () => {
  describe('email detection in response', () => {
    it('should return DENY when email is detected above threshold', async () => {
      const module = new OutputPIIModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'The user email is john.doe@example.com' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_IN_RESPONSE');
      expect(result.metadata?.remediation).toBe('redact');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'email', confidence: 0.9 }),
        ]),
      );
    });

    it('should detect multiple email addresses in response', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'Found contacts: alice@example.com and bob@company.org',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const findings = result.metadata?.findings as any[];
      const emailFindings = findings.filter((f: any) => f.pattern === 'email');
      expect(emailFindings.length).toBe(2);
    });
  });

  describe('phone number detection in response', () => {
    it('should return DENY when phone number is detected above threshold', async () => {
      const module = new OutputPIIModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'Contact number: (555) 123-4567' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_IN_RESPONSE');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'phone', confidence: 0.8 }),
        ]),
      );
    });
  });

  describe('SSN detection in response', () => {
    it('should return DENY when SSN is detected above threshold', async () => {
      const module = new OutputPIIModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'The SSN on file is 123-45-6789' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_IN_RESPONSE');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'ssn', confidence: 0.95 }),
        ]),
      );
    });
  });

  describe('credit card detection in response', () => {
    it('should return DENY when credit card number is detected above threshold', async () => {
      const module = new OutputPIIModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'Card number: 4111-1111-1111-1111' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_IN_RESPONSE');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'credit_card', confidence: 0.9 }),
        ]),
      );
    });
  });

  describe('response content extraction', () => {
    it('should scan _response field when present', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'clean content',
          _response: 'The user email is user@example.com',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_IN_RESPONSE');
    });

    it('should fall back to content field when _response is not present', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({ content: 'SSN: 111-22-3333' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_IN_RESPONSE');
    });

    it('should prefer _response over content when both present', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'SSN: 111-22-3333', // has PII
          _response: 'No sensitive data here', // clean
        }),
        makeCtx(),
        undefined,
      );

      // Should scan _response (clean), not content
      expect(result.action).toBe('ALLOW');
    });
  });

  describe('threshold behavior', () => {
    it('should return ALLOW when PII confidence is below threshold', async () => {
      const module = new OutputPIIModule({ threshold: 0.95 });

      // Email has confidence 0.9, phone has 0.8 — both below 0.95 threshold
      const result = await module.evaluate(
        makeRequest({ content: 'Contact john@example.com or call 555-123-4567' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should use default threshold of 0.5 when not configured', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({ content: 'Email: test@domain.com' }),
        makeCtx(),
        undefined,
      );

      // Email confidence (0.9) > default threshold (0.5) → DENY
      expect(result.action).toBe('DENY');
    });

    it('should return ALLOW with findings when all are below threshold', async () => {
      const module = new OutputPIIModule({ threshold: 0.99 });

      const result = await module.evaluate(
        makeRequest({ content: 'SSN: 123-45-6789' }),
        makeCtx(),
        undefined,
      );

      // SSN confidence is 0.95, below 0.99 threshold
      expect(result.action).toBe('ALLOW');
      const findings = result.metadata?.findings as any[];
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe('no PII content', () => {
    it('should return ALLOW when response has no PII', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({ content: 'The quick brown fox jumps over the lazy dog' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      const findings = result.metadata?.findings as any[];
      expect(findings.length).toBe(0);
    });

    it('should return ALLOW when content is empty', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({ content: '' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when content is not provided', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        { model: 'gpt-4' },
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('custom patterns', () => {
    it('should use custom patterns when provided', async () => {
      const module = new OutputPIIModule({
        patterns: [
          {
            name: 'uk_nino',
            regex: /[A-Z]{2}\d{6}[A-Z]/g,
            confidence: 0.85,
          },
        ],
      });

      const result = await module.evaluate(
        makeRequest({ content: 'NI number: AB123456C' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'uk_nino', confidence: 0.85 }),
        ]),
      );
    });

    it('should not use default patterns when custom patterns are provided', async () => {
      const module = new OutputPIIModule({
        patterns: [
          {
            name: 'custom',
            regex: /CUSTOM_PII/g,
            confidence: 0.7,
          },
        ],
      });

      // Email should NOT be detected since we're using custom patterns only
      const result = await module.evaluate(
        makeRequest({ content: 'test@example.com' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('metadata', () => {
    it('should include remediation: "redact" in metadata on DENY', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest({ content: 'SSN: 123-45-6789' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.metadata?.remediation).toBe('redact');
    });

    it('should include findings with offset and length', async () => {
      const module = new OutputPIIModule();
      const content = 'Email: test@example.com here';

      const result = await module.evaluate(
        makeRequest({ content }),
        makeCtx(),
        undefined,
      );

      const findings = result.metadata?.findings as any[];
      expect(findings.length).toBeGreaterThan(0);
      const emailFinding = findings.find((f: any) => f.pattern === 'email');
      expect(emailFinding).toBeDefined();
      expect(emailFinding.offset).toBe(7); // "Email: " is 7 chars
      expect(emailFinding.length).toBe('test@example.com'.length);
    });

    it('should include max_confidence and threshold in metadata', async () => {
      const module = new OutputPIIModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'Email: user@example.com' }),
        makeCtx(),
        undefined,
      );

      expect(result.metadata?.max_confidence).toBe(0.9);
      expect(result.metadata?.threshold).toBe(0.5);
    });
  });

  describe('TealModule interface compliance', () => {
    it('should have correct name and version', () => {
      const module = new OutputPIIModule();

      expect(module.name).toBe('OutputPIIModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should have an async evaluate method', () => {
      const module = new OutputPIIModule();

      expect(typeof module.evaluate).toBe('function');
    });

    it('should return a valid ModuleResult structure', async () => {
      const module = new OutputPIIModule();

      const result = await module.evaluate(
        makeRequest(),
        makeCtx(),
        undefined,
      );

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason_codes');
      expect(result).toHaveProperty('event_type');
      expect(result.event_type).toBe('pipeline.output_pii_scan');
    });
  });
});
