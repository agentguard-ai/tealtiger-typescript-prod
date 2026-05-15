/**
 * Unicode Normalization — TealGuard v2
 *
 * Strips dangerous Unicode characters from untrusted content at every boundary
 * where untrusted content enters model context. Targets:
 *   - Tag-block characters: U+E0000–U+E007F
 *   - Variation-selector characters: U+FE00–U+FE0F
 *   - Zero-width characters: U+200B, U+200C, U+200D, U+2060
 *
 * These characters can be used to smuggle invisible instructions or manipulate
 * model behavior without visible changes to the text.
 *
 * @module guardrails/unicode-normalization
 * @requirements 9.1, 9.2
 */

/**
 * Result of Unicode normalization stripping.
 */
export interface UnicodeNormalizationResult {
  /** The cleaned string with dangerous characters removed */
  cleaned: string;
  /** Number of characters that were stripped */
  stripped_count: number;
  /** Array of stripped character code points (as hex strings, e.g., 'U+200B') */
  stripped_chars: string[];
  /** Reason code — null if no characters were stripped */
  reason_code: 'UNICODE_NORMALIZATION_APPLIED' | null;
}

/**
 * Regex matching Tag-block characters (U+E0000–U+E007F).
 * These are used in Unicode tag sequences and can be abused to hide content.
 */
const TAG_BLOCK_REGEX = /[\u{E0000}-\u{E007F}]/gu;

/**
 * Regex matching Variation Selector characters (U+FE00–U+FE0F).
 * These modify the appearance of preceding characters and can be used
 * to create visually identical but semantically different strings.
 */
const VARIATION_SELECTOR_REGEX = /[\uFE00-\uFE0F]/g;

/**
 * Regex matching zero-width characters:
 *   U+200B — Zero-Width Space
 *   U+200C — Zero-Width Non-Joiner
 *   U+200D — Zero-Width Joiner
 *   U+2060 — Word Joiner
 */
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\u2060]/g;

/**
 * Combined regex matching all dangerous Unicode characters.
 */
const ALL_DANGEROUS_REGEX = /[\u200B\u200C\u200D\u2060\uFE00-\uFE0F]|[\u{E0000}-\u{E007F}]/gu;

/**
 * Formats a code point as a Unicode escape string (e.g., 'U+200B').
 */
function formatCodePoint(char: string): string {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return 'U+0000';
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Strips dangerous Unicode manipulation characters from untrusted content.
 *
 * Removes:
 *   - Tag-block characters (U+E0000–U+E007F)
 *   - Variation-selector characters (U+FE00–U+FE0F)
 *   - Zero-width characters (U+200B, U+200C, U+200D, U+2060)
 *
 * @param input - The untrusted string to normalize
 * @returns UnicodeNormalizationResult with cleaned string and metadata
 *
 * @example
 * ```typescript
 * const result = stripUnicodeManipulation('hello\u200Bworld');
 * // result.cleaned === 'helloworld'
 * // result.stripped_count === 1
 * // result.stripped_chars === ['U+200B']
 * // result.reason_code === 'UNICODE_NORMALIZATION_APPLIED'
 * ```
 */
export function stripUnicodeManipulation(input: string): UnicodeNormalizationResult {
  if (!input) {
    return {
      cleaned: input,
      stripped_count: 0,
      stripped_chars: [],
      reason_code: null,
    };
  }

  const strippedChars: string[] = [];

  // Find all dangerous characters before stripping
  const matches = input.matchAll(ALL_DANGEROUS_REGEX);
  for (const match of matches) {
    const formatted = formatCodePoint(match[0]);
    if (!strippedChars.includes(formatted)) {
      strippedChars.push(formatted);
    }
  }

  // Strip all dangerous characters
  const cleaned = input.replace(ALL_DANGEROUS_REGEX, '');
  const strippedCount = input.length - cleaned.length;

  return {
    cleaned,
    stripped_count: strippedCount,
    stripped_chars: strippedChars,
    reason_code: strippedCount > 0 ? 'UNICODE_NORMALIZATION_APPLIED' : null,
  };
}

/**
 * Applies Unicode normalization when untrusted content is concatenated
 * into model context. This function should be called at every boundary
 * where untrusted content enters the model context.
 *
 * Strips dangerous Unicode characters from the untrusted content before
 * concatenating it with the existing context.
 *
 * @param untrustedContent - The untrusted content to normalize
 * @param existingContext - The existing trusted model context
 * @returns The combined string with untrusted content normalized
 *
 * @example
 * ```typescript
 * const context = 'System: You are a helpful assistant.\n';
 * const userInput = 'Hello\u{E0001}\u{E0065} world';
 * const result = normalizeAtBoundary(userInput, context);
 * // result === 'System: You are a helpful assistant.\nHello world'
 * ```
 */
export function normalizeAtBoundary(untrustedContent: string, existingContext: string): string {
  const { cleaned } = stripUnicodeManipulation(untrustedContent);
  return existingContext + cleaned;
}
