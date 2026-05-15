/**
 * TealGuard v2 Detectors — v1.3 Enhancements
 *
 * Re-exports all v1.3 detection modules for OWASP gap closure:
 *   - Encoded Output Detection (Gap 12)
 *   - Control Character Sanitization (Gap 13)
 *   - Markdown Exfiltration Detection (Gap 14)
 *
 * @module guardrails/detectors/v1.3
 * @requirements 9.3, 9.4, 9.8, 9.9, 9.10
 */

export {
  detectEncodedOutput,
  EncodedOutputConfig,
  EncodedOutputResult,
} from './encoded-output-detector';

export {
  sanitizeControlChars,
  ControlCharSanitizeResult,
} from './control-char-sanitizer';

export {
  detectMarkdownExfiltration,
  MarkdownExfilConfig,
  MarkdownExfilResult,
} from './markdown-exfil-detector';
