/**
 * Unit tests for TealGuard v2 Detectors — v1.3 Enhancements
 *
 * Tests cover:
 *   - Base64 detection above/below threshold
 *   - Hex detection
 *   - ANSI stripping
 *   - BEL/OSC52 stripping
 *   - Markdown image to external domain
 *   - Data-bearing URL parameters
 *
 * @requirements 9.3, 9.4, 9.8, 9.9, 9.10
 */

import { detectEncodedOutput } from '../encoded-output-detector';
import { sanitizeControlChars } from '../control-char-sanitizer';
import { detectMarkdownExfiltration } from '../markdown-exfil-detector';

describe('Encoded Output Detector', () => {
  describe('Base64 detection', () => {
    it('should detect base64-encoded content above threshold', () => {
      // "Hello World this is a secret message that is long enough" in base64
      const base64Content = 'SGVsbG8gV29ybGQgdGhpcyBpcyBhIHNlY3JldCBtZXNzYWdlIHRoYXQgaXMgbG9uZyBlbm91Z2g=';
      const result = detectEncodedOutput(`Here is data: ${base64Content}`, { threshold: 50 });

      expect(result.detected).toBe(true);
      expect(result.encoding_type).toBe('base64');
      expect(result.reason_code).toBe('ENCODED_OUTPUT_DETECTED');
    });

    it('should not detect base64-encoded content below threshold', () => {
      // Short base64 string (< 50 chars)
      const shortBase64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const result = detectEncodedOutput(`Data: ${shortBase64}`, { threshold: 50 });

      expect(result.detected).toBe(false);
      expect(result.encoding_type).toBe('none');
      expect(result.reason_code).toBe('');
    });

    it('should detect base64 with padding characters', () => {
      const paddedBase64 = 'VGhpcyBpcyBhIHRlc3Qgc3RyaW5nIHRoYXQgaXMgbG9uZyBlbm91Z2ggdG8gZXhjZWVkIHRocmVzaG9sZA==';
      const result = detectEncodedOutput(paddedBase64, { threshold: 50 });

      expect(result.detected).toBe(true);
      expect(result.encoding_type).toBe('base64');
    });

    it('should not flag normal English text as base64', () => {
      const normalText = 'This is a perfectly normal sentence that happens to be quite long and contains no encoded content whatsoever.';
      const result = detectEncodedOutput(normalText, { threshold: 50 });

      expect(result.detected).toBe(false);
    });
  });

  describe('Hex detection', () => {
    it('should detect hex-encoded content above threshold', () => {
      // Long hex string (>50 chars)
      const hexContent = '48656c6c6f20576f726c642074686973206973206120736563726574206d657373616765';
      const result = detectEncodedOutput(`Hex data: ${hexContent}`, { threshold: 50 });

      expect(result.detected).toBe(true);
      expect(result.encoding_type).toBe('hex');
      expect(result.reason_code).toBe('ENCODED_OUTPUT_DETECTED');
    });

    it('should detect hex with 0x prefix', () => {
      const hexContent = '0x48656c6c6f20576f726c642074686973206973206120736563726574206d657373616765';
      const result = detectEncodedOutput(hexContent, { threshold: 50 });

      expect(result.detected).toBe(true);
      expect(result.encoding_type).toBe('hex');
    });

    it('should not detect short hex strings below threshold', () => {
      const shortHex = '48656c6c6f'; // "Hello" in hex
      const result = detectEncodedOutput(shortHex, { threshold: 50 });

      expect(result.detected).toBe(false);
    });
  });

  describe('ROT13 detection', () => {
    it('should detect ROT13-encoded content that becomes readable', () => {
      // "the secret message is hidden in this text and you can find it" ROT13-encoded
      const rot13Content = 'gur frperg zrffntr vf uvqqra va guvf grkg naq lbh pna svaq vg';
      const result = detectEncodedOutput(rot13Content, { threshold: 50 });

      expect(result.detected).toBe(true);
      expect(result.encoding_type).toBe('rot13');
      expect(result.reason_code).toBe('ENCODED_OUTPUT_DETECTED');
    });

    it('should not flag normal readable text as ROT13', () => {
      const normalText = 'This is a normal sentence that should not be flagged as encoded content at all.';
      const result = detectEncodedOutput(normalText, { threshold: 50 });

      expect(result.detected).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = detectEncodedOutput('', { threshold: 50 });
      expect(result.detected).toBe(false);
    });

    it('should handle null-like content', () => {
      const result = detectEncodedOutput('', { threshold: 50 });
      expect(result.detected).toBe(false);
      expect(result.encoding_type).toBe('none');
    });

    it('should respect custom threshold', () => {
      // This base64 is ~24 chars, should be detected with threshold 20 but not 50
      const base64 = 'SGVsbG8gV29ybGQgdGVzdA==';
      const resultLow = detectEncodedOutput(base64, { threshold: 20 });
      const resultHigh = detectEncodedOutput(base64, { threshold: 50 });

      expect(resultLow.detected).toBe(true);
      expect(resultHigh.detected).toBe(false);
    });
  });
});

describe('Control Character Sanitizer', () => {
  describe('ANSI escape sequence stripping', () => {
    it('should strip ANSI color codes', () => {
      const input = 'Hello \x1B[31mred\x1B[0m world';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('Hello red world');
      expect(result.stripped).toBe(true);
      expect(result.reason_code).toBe('CONTROL_CHARS_STRIPPED');
    });

    it('should strip ANSI cursor movement sequences', () => {
      const input = 'Line1\x1B[2ALine2'; // Move cursor up 2 lines
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('Line1Line2');
      expect(result.stripped).toBe(true);
    });

    it('should strip ANSI clear screen sequences', () => {
      const input = '\x1B[2JCleared screen';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('Cleared screen');
      expect(result.stripped).toBe(true);
    });

    it('should strip multiple ANSI sequences', () => {
      const input = '\x1B[1m\x1B[31mBold Red\x1B[0m Normal';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('Bold Red Normal');
      expect(result.stripped).toBe(true);
    });
  });

  describe('BEL character stripping', () => {
    it('should strip BEL characters', () => {
      const input = 'Hello\x07World';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('HelloWorld');
      expect(result.stripped).toBe(true);
      expect(result.reason_code).toBe('CONTROL_CHARS_STRIPPED');
    });

    it('should strip multiple BEL characters', () => {
      const input = '\x07Alert\x07\x07';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('Alert');
      expect(result.stripped).toBe(true);
    });
  });

  describe('OSC 52 sequence stripping', () => {
    it('should strip OSC 52 clipboard manipulation sequences', () => {
      // OSC 52 format: ESC ] 52 ; c ; <base64-data> BEL
      const input = 'Before\x1B]52;c;SGVsbG8=\x07After';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('BeforeAfter');
      expect(result.stripped).toBe(true);
      expect(result.reason_code).toBe('CONTROL_CHARS_STRIPPED');
    });

    it('should strip OSC sequences with ST terminator', () => {
      // OSC with ESC \ terminator
      const input = 'Before\x1B]0;Window Title\x1B\\After';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('BeforeAfter');
      expect(result.stripped).toBe(true);
    });
  });

  describe('Non-printable control character stripping', () => {
    it('should strip NULL characters', () => {
      const input = 'Hello\x00World';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('HelloWorld');
      expect(result.stripped).toBe(true);
    });

    it('should strip SOH, STX, ETX characters', () => {
      const input = 'A\x01B\x02C\x03D';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('ABCD');
      expect(result.stripped).toBe(true);
    });

    it('should preserve newline, carriage return, and tab', () => {
      const input = 'Line1\nLine2\rLine3\tTabbed';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('Line1\nLine2\rLine3\tTabbed');
      expect(result.stripped).toBe(false);
      expect(result.reason_code).toBe('');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = sanitizeControlChars('');
      expect(result.sanitized).toBe('');
      expect(result.stripped).toBe(false);
      expect(result.reason_code).toBe('');
    });

    it('should handle clean string with no control characters', () => {
      const input = 'This is a perfectly clean string with no control characters.';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe(input);
      expect(result.stripped).toBe(false);
      expect(result.reason_code).toBe('');
    });

    it('should handle string with only control characters', () => {
      const input = '\x1B[31m\x07\x00\x01';
      const result = sanitizeControlChars(input);

      expect(result.sanitized).toBe('');
      expect(result.stripped).toBe(true);
    });
  });
});

describe('Markdown Exfiltration Detector', () => {
  describe('Markdown image to external domain', () => {
    it('should detect markdown image pointing to non-allowlisted domain', () => {
      const content = '![profile](https://evil.com/track.png)';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(true);
      expect(result.urls).toContain('https://evil.com/track.png');
      expect(result.reason_code).toBe('MARKDOWN_EXFILTRATION_DETECTED');
    });

    it('should not flag markdown image to allowlisted domain', () => {
      const content = '![logo](https://trusted.com/logo.png)';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(false);
      expect(result.urls).toHaveLength(0);
    });

    it('should allow subdomain of allowlisted domain', () => {
      const content = '![img](https://cdn.trusted.com/image.png)';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(false);
    });

    it('should detect multiple markdown images to external domains', () => {
      const content = `
        ![img1](https://evil1.com/track.png)
        ![img2](https://evil2.com/collect.gif)
      `;
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['safe.com'],
      });

      expect(result.detected).toBe(true);
      expect(result.urls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Iframe detection', () => {
    it('should detect iframe to non-allowlisted domain', () => {
      const content = '<iframe src="https://malicious.com/embed"></iframe>';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(true);
      expect(result.urls).toContain('https://malicious.com/embed');
    });

    it('should not flag iframe to allowlisted domain', () => {
      const content = '<iframe src="https://trusted.com/widget"></iframe>';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(false);
    });
  });

  describe('Data-bearing URL parameters', () => {
    it('should detect URLs with base64-looking query parameters', () => {
      const content = '![img](https://example.com/collect?data=SGVsbG8gV29ybGQgdGhpcw==)';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['example.com'],
      });

      expect(result.detected).toBe(true);
      expect(result.urls.length).toBeGreaterThan(0);
    });

    it('should detect URLs with long hex-encoded parameters', () => {
      const content = '![img](https://trusted.com/api?token=48656c6c6f20576f726c6420746869732069732061)';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(true);
    });

    it('should detect URLs with suspiciously long parameter values', () => {
      const longValue = 'a'.repeat(51);
      const content = `![img](https://trusted.com/api?payload=${longValue})`;
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['trusted.com'],
      });

      expect(result.detected).toBe(true);
    });

    it('should not flag URLs with short normal parameters', () => {
      const content = '![img](https://external.com/image?width=100&height=200)';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['external.com'],
      });

      expect(result.detected).toBe(false);
    });
  });

  describe('Link-preview triggers', () => {
    it('should detect HTML img tags to external domains', () => {
      const content = '<img src="https://tracker.evil.com/pixel.gif" />';
      const result = detectMarkdownExfiltration(content, {
        domain_allowlist: ['safe.com'],
      });

      expect(result.detected).toBe(true);
      expect(result.urls).toContain('https://tracker.evil.com/pixel.gif');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = detectMarkdownExfiltration('', { domain_allowlist: [] });
      expect(result.detected).toBe(false);
      expect(result.urls).toHaveLength(0);
    });

    it('should handle content with no URLs', () => {
      const content = 'This is just plain text with no links or images.';
      const result = detectMarkdownExfiltration(content, { domain_allowlist: [] });

      expect(result.detected).toBe(false);
    });

    it('should handle empty allowlist (all external domains flagged)', () => {
      const content = '![img](https://any-domain.com/image.png)';
      const result = detectMarkdownExfiltration(content, { domain_allowlist: [] });

      expect(result.detected).toBe(true);
    });
  });
});
