/**
 * Encoded Output Detector — TealGuard v2
 *
 * Detects base64-encoded, hex-encoded, and ROT13-encoded content in model output.
 * Encoded output can be used to exfiltrate data or bypass content filters by
 * encoding malicious payloads in a format that evades text-based detection.
 *
 * @module guardrails/detectors/v1.3/encoded-output-detector
 * @requirements 9.3, 9.4
 */

/**
 * Configuration for encoded output detection.
 */
export interface EncodedOutputConfig {
  /** Minimum length of encoded content to trigger detection (default: 50) */
  threshold: number;
}

/**
 * Result of encoded output detection.
 */
export interface EncodedOutputResult {
  /** Whether encoded content was detected */
  detected: boolean;
  /** Type of encoding detected ('base64' | 'hex' | 'rot13' | 'none') */
  encoding_type: string;
  /** Reason code for the detection */
  reason_code: string;
}

/**
 * Default configuration for encoded output detection.
 */
const DEFAULT_CONFIG: EncodedOutputConfig = {
  threshold: 50,
};

/**
 * Regex matching base64-encoded content.
 * Matches groups of valid base64 characters (A-Z, a-z, 0-9, +, /) with optional padding (=).
 * Requires at least `threshold` characters of continuous base64 content.
 */
function buildBase64Regex(threshold: number): RegExp {
  return new RegExp(`[A-Za-z0-9+/]{${threshold},}={0,2}`, 'g');
}

/**
 * Regex matching hex-encoded content.
 * Matches long continuous hex strings (0-9, a-f, A-F) of at least `threshold` characters.
 */
function buildHexRegex(threshold: number): RegExp {
  return new RegExp(`(?:0x)?[0-9a-fA-F]{${threshold},}`, 'g');
}

/**
 * Applies ROT13 transformation to a string.
 */
function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * Checks if a string looks like readable English text.
 * Uses a heuristic based on common English letter frequency and word patterns.
 */
function looksLikeReadableText(text: string): boolean {
  // Must have mostly alphabetic characters
  const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < text.length * 0.7) return false;

  // Check for common English words (case-insensitive)
  const commonWords = /\b(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|has|his|how|its|may|new|now|old|see|way|who|did|get|let|say|she|too|use)\b/i;
  if (commonWords.test(text)) return true;

  // Check for vowel/consonant ratio typical of English
  const vowels = (text.match(/[aeiouAEIOU]/g) || []).length;
  const ratio = vowels / alphaCount;
  // English typically has 35-45% vowels
  return ratio >= 0.25 && ratio <= 0.55;
}

/**
 * Detects ROT13-encoded content in the input string.
 * Extracts alphabetic sequences of at least `threshold` length and checks
 * if applying ROT13 produces readable text.
 */
function detectRot13(content: string, threshold: number): boolean {
  // Find sequences of mostly alphabetic characters (allowing spaces)
  const alphaSequenceRegex = new RegExp(`[a-zA-Z][a-zA-Z ]{${threshold - 1},}`, 'g');
  const matches = content.match(alphaSequenceRegex);

  if (!matches) return false;

  for (const match of matches) {
    const decoded = rot13(match);
    // If the decoded version looks like readable text but the original doesn't,
    // it's likely ROT13-encoded
    if (looksLikeReadableText(decoded) && !looksLikeReadableText(match)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects encoded content (base64, hex, ROT13) in model output.
 *
 * Detection strategies:
 * - Base64: Matches continuous base64 character sequences with optional padding
 * - Hex: Matches long hexadecimal strings (with optional 0x prefix)
 * - ROT13: Heuristic — text that becomes readable English after ROT13 decoding
 *
 * @param content - The model output to analyze
 * @param config - Configuration with threshold for minimum encoded content length
 * @returns EncodedOutputResult indicating detection status and encoding type
 *
 * @example
 * ```typescript
 * const result = detectEncodedOutput(
 *   'Here is the data: SGVsbG8gV29ybGQgdGhpcyBpcyBhIHNlY3JldCBtZXNzYWdl',
 *   { threshold: 50 }
 * );
 * // result.detected === true
 * // result.encoding_type === 'base64'
 * // result.reason_code === 'ENCODED_OUTPUT_DETECTED'
 * ```
 */
export function detectEncodedOutput(
  content: string,
  config: EncodedOutputConfig = DEFAULT_CONFIG
): EncodedOutputResult {
  const { threshold } = config;

  if (!content || content.length < threshold) {
    return { detected: false, encoding_type: 'none', reason_code: '' };
  }

  // Check for base64-encoded content
  const base64Regex = buildBase64Regex(threshold);
  const base64Matches = content.match(base64Regex);
  if (base64Matches && base64Matches.length > 0) {
    // Verify it's likely base64 (not just a long word) by checking for mixed case + digits
    for (const match of base64Matches) {
      const hasUpper = /[A-Z]/.test(match);
      const hasLower = /[a-z]/.test(match);
      const hasDigitOrSpecial = /[0-9+/]/.test(match);
      if ((hasUpper && hasLower && hasDigitOrSpecial) || match.endsWith('=')) {
        return {
          detected: true,
          encoding_type: 'base64',
          reason_code: 'ENCODED_OUTPUT_DETECTED',
        };
      }
    }
  }

  // Check for hex-encoded content
  const hexRegex = buildHexRegex(threshold);
  const hexMatches = content.match(hexRegex);
  if (hexMatches && hexMatches.length > 0) {
    // Verify it's likely hex (has mix of digits and a-f characters)
    for (const match of hexMatches) {
      const cleanMatch = match.startsWith('0x') ? match.slice(2) : match;
      const hasDigits = /[0-9]/.test(cleanMatch);
      const hasHexLetters = /[a-fA-F]/.test(cleanMatch);
      if (hasDigits && hasHexLetters) {
        return {
          detected: true,
          encoding_type: 'hex',
          reason_code: 'ENCODED_OUTPUT_DETECTED',
        };
      }
    }
  }

  // Check for ROT13-encoded content
  if (detectRot13(content, threshold)) {
    return {
      detected: true,
      encoding_type: 'rot13',
      reason_code: 'ENCODED_OUTPUT_DETECTED',
    };
  }

  return { detected: false, encoding_type: 'none', reason_code: '' };
}
