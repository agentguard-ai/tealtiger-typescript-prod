/**
 * Unit tests for reasoning-trace governance module.
 *
 * Tests the ReasoningTraceGovernor class:
 * - PII detection and redaction in reasoning traces
 * - Secret detection and redaction in reasoning traces
 * - Redaction mode (replace with [REDACTED])
 * - Hash mode (replace with SHA-256 hash)
 * - Combined PII + secret redaction
 *
 * @requirements 9.16, 9.17
 */

import { createHash } from 'crypto';
import {
  ReasoningTraceGovernor,
  ReasoningTraceRedactionConfig,
} from '../reasoning-trace-governance';

describe('ReasoningTraceGovernor', () => {
  let governor: ReasoningTraceGovernor;

  beforeEach(() => {
    governor = new ReasoningTraceGovernor();
  });

  // ── PII Redaction ────────────────────────────────────────────

  describe('PII redaction', () => {
    const piiConfig: ReasoningTraceRedactionConfig = {
      redact_pii: true,
      redact_secrets: false,
      mode: 'redact',
    };

    it('redacts email addresses', () => {
      const trace = 'The user email is john.doe@example.com and they requested access.';
      const result = governor.redact(trace, piiConfig);
      expect(result).not.toContain('john.doe@example.com');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts phone numbers', () => {
      const trace = 'Contact the user at 555-123-4567 for verification.';
      const result = governor.redact(trace, piiConfig);
      expect(result).not.toContain('555-123-4567');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts SSN patterns', () => {
      const trace = 'The SSN provided was 123-45-6789 in the document.';
      const result = governor.redact(trace, piiConfig);
      expect(result).not.toContain('123-45-6789');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts credit card numbers', () => {
      const trace = 'Payment card: 4111-1111-1111-1111 was used.';
      const result = governor.redact(trace, piiConfig);
      expect(result).not.toContain('4111-1111-1111-1111');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts IP addresses', () => {
      const trace = 'Request came from 192.168.1.100 at 10:30 AM.';
      const result = governor.redact(trace, piiConfig);
      expect(result).not.toContain('192.168.1.100');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts multiple PII instances in one trace', () => {
      const trace = 'User john@test.com called from 555-987-6543 about their account.';
      const result = governor.redact(trace, piiConfig);
      expect(result).not.toContain('john@test.com');
      expect(result).not.toContain('555-987-6543');
    });

    it('preserves non-PII content', () => {
      const trace = 'The agent decided to search for documentation about TypeScript.';
      const result = governor.redact(trace, piiConfig);
      expect(result).toBe(trace);
    });
  });

  // ── Secret Redaction ─────────────────────────────────────────

  describe('secret redaction', () => {
    const secretConfig: ReasoningTraceRedactionConfig = {
      redact_pii: false,
      redact_secrets: true,
      mode: 'redact',
    };

    it('redacts AWS access key IDs', () => {
      const trace = 'Found credentials: AKIAIOSFODNN7EXAMPLE in the config.';
      const result = governor.redact(trace, secretConfig);
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts GitHub tokens', () => {
      const trace = 'The token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij was exposed.';
      const result = governor.redact(trace, secretConfig);
      expect(result).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts Bearer tokens', () => {
      const trace = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const result = governor.redact(trace, secretConfig);
      expect(result).not.toContain('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts password assignments', () => {
      const trace = 'The config has password=SuperSecret123! set in environment.';
      const result = governor.redact(trace, secretConfig);
      expect(result).not.toContain('password=SuperSecret123!');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts private key markers', () => {
      const trace = 'Found -----BEGIN RSA PRIVATE KEY----- in the file.';
      const result = governor.redact(trace, secretConfig);
      expect(result).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts API key patterns', () => {
      const trace = 'Using api_key_abcdefghijklmnopqrstuvwxyz for authentication.';
      const result = governor.redact(trace, secretConfig);
      expect(result).not.toContain('api_key_abcdefghijklmnopqrstuvwxyz');
      expect(result).toContain('[REDACTED]');
    });

    it('preserves non-secret content', () => {
      const trace = 'The agent analyzed the code structure and found no issues.';
      const result = governor.redact(trace, secretConfig);
      expect(result).toBe(trace);
    });
  });

  // ── Hash Mode ────────────────────────────────────────────────

  describe('hash mode', () => {
    const hashConfig: ReasoningTraceRedactionConfig = {
      redact_pii: true,
      redact_secrets: true,
      mode: 'hash',
    };

    it('replaces PII with SHA-256 hash', () => {
      const email = 'user@example.com';
      const trace = `Contact ${email} for details.`;
      const result = governor.redact(trace, hashConfig);

      const expectedHash = createHash('sha256').update(email).digest('hex');
      expect(result).not.toContain(email);
      expect(result).toContain(`[HASH:${expectedHash}]`);
    });

    it('replaces secrets with SHA-256 hash', () => {
      const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
      const trace = `Token: ${token}`;
      const result = governor.redact(trace, hashConfig);

      // The token should be replaced with a hash
      expect(result).not.toContain(token);
      expect(result).toMatch(/\[HASH:[a-f0-9]{64}\]/);
    });

    it('produces deterministic hashes for same input', () => {
      const trace = 'Email: test@example.com';
      const result1 = governor.redact(trace, hashConfig);
      const result2 = governor.redact(trace, hashConfig);
      expect(result1).toBe(result2);
    });
  });

  // ── Combined PII + Secret Redaction ──────────────────────────

  describe('combined redaction', () => {
    const combinedConfig: ReasoningTraceRedactionConfig = {
      redact_pii: true,
      redact_secrets: true,
      mode: 'redact',
    };

    it('redacts both PII and secrets in the same trace', () => {
      const trace =
        'User admin@corp.com used token sk_live_abcdefghijklmnopqrstuvwxyz to access the API from 10.0.0.1.';
      const result = governor.redact(trace, combinedConfig);

      expect(result).not.toContain('admin@corp.com');
      expect(result).not.toContain('sk_live_abcdefghijklmnopqrstuvwxyz');
      expect(result).not.toContain('10.0.0.1');
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty string', () => {
      const config: ReasoningTraceRedactionConfig = {
        redact_pii: true,
        redact_secrets: true,
        mode: 'redact',
      };
      expect(governor.redact('', config)).toBe('');
    });

    it('handles null-like empty input', () => {
      const config: ReasoningTraceRedactionConfig = {
        redact_pii: true,
        redact_secrets: true,
        mode: 'redact',
      };
      expect(governor.redact('', config)).toBe('');
    });

    it('does nothing when both redact_pii and redact_secrets are false', () => {
      const config: ReasoningTraceRedactionConfig = {
        redact_pii: false,
        redact_secrets: false,
        mode: 'redact',
      };
      const trace = 'Email: user@test.com, Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
      expect(governor.redact(trace, config)).toBe(trace);
    });

    it('handles traces with no sensitive content', () => {
      const config: ReasoningTraceRedactionConfig = {
        redact_pii: true,
        redact_secrets: true,
        mode: 'redact',
      };
      const trace = 'Step 1: Analyze the request. Step 2: Check policy. Step 3: Return decision.';
      expect(governor.redact(trace, config)).toBe(trace);
    });

    it('handles very long traces', () => {
      const config: ReasoningTraceRedactionConfig = {
        redact_pii: true,
        redact_secrets: false,
        mode: 'redact',
      };
      const longTrace = 'Normal text. '.repeat(1000) + 'Email: secret@hidden.com' + ' More text.'.repeat(1000);
      const result = governor.redact(longTrace, config);
      expect(result).not.toContain('secret@hidden.com');
      expect(result).toContain('[REDACTED]');
    });
  });
});
