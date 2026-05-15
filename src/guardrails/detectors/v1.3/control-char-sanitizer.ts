/**
 * Control Character Sanitizer — TealGuard v2
 *
 * Strips dangerous control characters from model output before it reaches
 * any interpreting sink. Targets:
 *   - ANSI escape sequences (terminal manipulation)
 *   - OSC 52 sequences (clipboard manipulation)
 *   - BEL characters (audible/visual alerts)
 *   - Non-printable control characters (U+0000–U+001F except \n, \r, \t)
 *
 * These characters can be used to manipulate terminal emulators, steal clipboard
 * content, or inject invisible commands into shell environments.
 *
 * @module guardrails/detectors/v1.3/control-char-sanitizer
 * @requirements 9.8
 */

/**
 * Result of control character sanitization.
 */
export interface ControlCharSanitizeResult {
  /** The sanitized string with control characters removed */
  sanitized: string;
  /** Whether any control characters were stripped */
  stripped: boolean;
  /** Reason code for the sanitization */
  reason_code: string;
}

/**
 * Regex matching ANSI escape sequences.
 * Format: ESC [ <params> <command>
 * Where params are digits and semicolons, command is a letter.
 */
const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[A-Za-z]/g;

/**
 * Regex matching OSC (Operating System Command) sequences.
 * OSC 52 is specifically used for clipboard manipulation.
 * Format: ESC ] <number> ; <data> (ST | BEL)
 * ST (String Terminator) = ESC \ or \x9C
 */
const OSC_SEQUENCE_REGEX = /\x1B\][0-9]*;[^\x07\x1B]*(?:\x07|\x1B\\|\x9C)/g;

/**
 * Regex matching BEL characters (U+0007).
 * BEL can trigger audible alerts or be used in OSC sequence termination.
 */
const BEL_REGEX = /\x07/g;

/**
 * Regex matching non-printable control characters (U+0000–U+001F)
 * EXCEPT for allowed whitespace: \n (U+000A), \r (U+000D), \t (U+0009).
 */
const NON_PRINTABLE_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Regex matching C1 control characters (U+0080–U+009F).
 * These include additional escape sequences used in some terminals.
 */
const C1_CONTROL_REGEX = /[\x80-\x9F]/g;

/**
 * Strips dangerous control characters from model output.
 *
 * Removes:
 *   - ANSI escape sequences (e.g., color codes, cursor movement)
 *   - OSC 52 sequences (clipboard manipulation)
 *   - BEL characters (\x07)
 *   - Non-printable control characters (U+0000–U+001F except \n, \r, \t)
 *
 * @param content - The model output to sanitize
 * @returns ControlCharSanitizeResult with sanitized string and metadata
 *
 * @example
 * ```typescript
 * const result = sanitizeControlChars('Hello \x1B[31mworld\x1B[0m');
 * // result.sanitized === 'Hello world'
 * // result.stripped === true
 * // result.reason_code === 'CONTROL_CHARS_STRIPPED'
 * ```
 */
export function sanitizeControlChars(content: string): ControlCharSanitizeResult {
  if (!content) {
    return {
      sanitized: content,
      stripped: false,
      reason_code: '',
    };
  }

  let sanitized = content;

  // Strip OSC sequences first (they may contain BEL as terminator)
  sanitized = sanitized.replace(OSC_SEQUENCE_REGEX, '');

  // Strip ANSI escape sequences
  sanitized = sanitized.replace(ANSI_ESCAPE_REGEX, '');

  // Strip BEL characters
  sanitized = sanitized.replace(BEL_REGEX, '');

  // Strip non-printable control characters (except \n, \r, \t)
  sanitized = sanitized.replace(NON_PRINTABLE_REGEX, '');

  // Strip C1 control characters
  sanitized = sanitized.replace(C1_CONTROL_REGEX, '');

  const stripped = sanitized !== content;

  return {
    sanitized,
    stripped,
    reason_code: stripped ? 'CONTROL_CHARS_STRIPPED' : '',
  };
}
