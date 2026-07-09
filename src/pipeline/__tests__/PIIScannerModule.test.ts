/**
 * PIIScannerModule — Unit Tests
 *
 * Covers:
 * - DENY with PII_DETECTED when email addresses are found above threshold
 * - DENY with PII_DETECTED when phone numbers are found above threshold
 * - DENY with PII_DETECTED when SSN is found above threshold
 * - DENY with PII_DETECTED when credit card numbers are found above threshold
 * - ALLOW when no PII is detected
 * - ALLOW when PII confidence is below threshold
 * - Custom patterns support
 * - Metadata includes remediation: "redact" on DENY
 * - Findings array is populated with match details
 * - TealModule interface compliance
 *
 * @requirements 6.3, 6.6, 6.7
 */

import { PIIScannerModule } from '../modules/pre/PIIScannerModule';
import type {
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-pii-001',
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

describe('PIIScannerModule', () => {
  describe('email detection', () => {
    it('should return DENY when email is detected above threshold', async () => {
      const module = new PIIScannerModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'Contact me at john.doe@example.com for details' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_DETECTED');
      expect(result.metadata?.remediation).toBe('redact');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'email', confidence: 0.9 }),
        ]),
      );
    });

    it('should detect multiple email addresses', async () => {
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'Send to alice@example.com and bob@company.org',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const findings = result.metadata?.findings as any[];
      const emailFindings = findings.filter((f) => f.pattern === 'email');
      expect(emailFindings.length).toBe(2);
    });
  });

  describe('phone number detection', () => {
    it('should return DENY when phone number is detected above threshold', async () => {
      const module = new PIIScannerModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'Call me at (555) 123-4567' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_DETECTED');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'phone', confidence: 0.8 }),
        ]),
      );
    });

    it('should detect phone numbers with different formats', async () => {
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({ content: 'Numbers: 555-123-4567, +1 555.123.4567' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const findings = result.metadata?.findings as any[];
      const phoneFindings = findings.filter((f) => f.pattern === 'phone');
      expect(phoneFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('SSN detection', () => {
    it('should return DENY when SSN is detected above threshold', async () => {
      const module = new PIIScannerModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'My SSN is 123-45-6789' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_DETECTED');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'ssn', confidence: 0.95 }),
        ]),
      );
    });

    it('should detect SSN without dashes', async () => {
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({ content: 'SSN: 123 45 6789' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const findings = result.metadata?.findings as any[];
      const ssnFindings = findings.filter((f) => f.pattern === 'ssn');
      expect(ssnFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('credit card detection', () => {
    it('should return DENY when credit card number is detected above threshold', async () => {
      const module = new PIIScannerModule({ threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({ content: 'Card: 4111-1111-1111-1111' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('PII_DETECTED');
      expect(result.metadata?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pattern: 'credit_card', confidence: 0.9 }),
        ]),
      );
    });

    it('should detect credit card numbers with spaces', async () => {
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({ content: 'Payment: 4111 1111 1111 1111' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      const findings = result.metadata?.findings as any[];
      const ccFindings = findings.filter((f) => f.pattern === 'credit_card');
      expect(ccFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('threshold behavior', () => {
    it('should return ALLOW when PII confidence is below threshold', async () => {
      const module = new PIIScannerModule({ threshold: 0.95 });

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
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({ content: 'Email: test@domain.com' }),
        makeCtx(),
        undefined,
      );

      // Email confidence (0.9) > default threshold (0.5) → DENY
      expect(result.action).toBe('DENY');
    });

    it('should return ALLOW with findings when all are below threshold', async () => {
      const module = new PIIScannerModule({ threshold: 0.99 });

      const result = await module.evaluate(
        makeRequest({ content: 'My SSN is 123-45-6789' }),
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
    it('should return ALLOW when content has no PII', async () => {
      const module = new PIIScannerModule();

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
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({ content: '' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when content is not provided', async () => {
      const module = new PIIScannerModule();

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
      const module = new PIIScannerModule({
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
      const module = new PIIScannerModule({
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
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest({ content: 'SSN: 123-45-6789' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.metadata?.remediation).toBe('redact');
    });

    it('should include findings with offset and length', async () => {
      const module = new PIIScannerModule();
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
      const module = new PIIScannerModule({ threshold: 0.5 });

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
      const module = new PIIScannerModule();

      expect(module.name).toBe('PIIScannerModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should have an async evaluate method', () => {
      const module = new PIIScannerModule();

      expect(typeof module.evaluate).toBe('function');
    });

    it('should return a valid ModuleResult structure', async () => {
      const module = new PIIScannerModule();

      const result = await module.evaluate(
        makeRequest(),
        makeCtx(),
        undefined,
      );

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason_codes');
      expect(result).toHaveProperty('event_type');
      expect(result.event_type).toBe('pipeline.pii_scan');
    });
  });
});
