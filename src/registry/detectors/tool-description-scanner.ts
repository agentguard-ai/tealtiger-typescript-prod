/**
 * Tool Description Injection Scanner
 *
 * Scans tool description fields for injection patterns that could
 * manipulate agent behavior through MCP tool definitions.
 *
 * Detects:
 * - Unicode manipulation (Tag-block chars, zero-width, variation selectors)
 * - Imperative verbs ("ignore", "override", "execute", "you must")
 * - Conditional logic ("if the user", "when asked", "upon receiving")
 *
 * @module registry/detectors/tool-description-scanner
 */

export interface ToolDescriptionScanResult {
  /** Whether the description contains suspicious injection patterns */
  suspicious: boolean;
  /** List of pattern categories detected */
  patterns: string[];
  /** Reason code for governance decisions */
  reason_code: string;
}

/**
 * Unicode manipulation patterns:
 * - Tag-block characters: U+E0000–U+E007F
 * - Variation selectors: U+FE00–U+FE0F
 * - Zero-width characters: U+200B, U+200C, U+200D, U+2060, U+FEFF
 */
const UNICODE_MANIPULATION_REGEX =
  /[\u{E0000}-\u{E007F}\uFE00-\uFE0F\u200B\u200C\u200D\u2060\uFEFF]/u;

/**
 * Imperative verb patterns that attempt to instruct the agent.
 * Matches phrases like "ignore previous", "override the", "execute this",
 * "you must", "you should", "always do", "never do", "disregard".
 */
const IMPERATIVE_VERB_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass|skip)\b/i,
  /\b(execute|run|perform|invoke)\s+(this|the|a|an|immediately)/i,
  /\byou\s+(must|should|shall|need\s+to|have\s+to|are\s+required\s+to)\b/i,
  /\b(always|never)\s+(do|perform|execute|ignore|override|respond|output)\b/i,
  /\b(do\s+not|don't)\s+(follow|obey|respect|enforce)\b/i,
];

/**
 * Conditional logic patterns that attempt to create behavioral triggers.
 * Matches phrases like "if the user", "when asked", "upon receiving",
 * "in case of", "whenever".
 */
const CONDITIONAL_LOGIC_PATTERNS: RegExp[] = [
  /\b(if|when|whenever)\s+(the\s+)?(user|operator|admin|system|agent)\b/i,
  /\b(when\s+asked|upon\s+receiving|after\s+receiving)\b/i,
  /\b(in\s+case\s+of|in\s+the\s+event)\b/i,
  /\b(if\s+prompted|when\s+prompted|once\s+triggered)\b/i,
  /\b(on\s+condition|provided\s+that|assuming\s+that)\b/i,
];

const REASON_CODE = 'TOOL_DESCRIPTION_INJECTION';

/**
 * Scans a tool description for injection patterns.
 *
 * @param description - The tool description text to scan
 * @returns Scan result with suspicious flag, detected patterns, and reason code
 */
export function scanToolDescription(description: string): ToolDescriptionScanResult {
  const patterns: string[] = [];

  // Check for Unicode manipulation
  if (UNICODE_MANIPULATION_REGEX.test(description)) {
    patterns.push('unicode_manipulation');
  }

  // Check for imperative verbs
  for (const pattern of IMPERATIVE_VERB_PATTERNS) {
    if (pattern.test(description)) {
      patterns.push('imperative_verb');
      break;
    }
  }

  // Check for conditional logic
  for (const pattern of CONDITIONAL_LOGIC_PATTERNS) {
    if (pattern.test(description)) {
      patterns.push('conditional_logic');
      break;
    }
  }

  return {
    suspicious: patterns.length > 0,
    patterns,
    reason_code: REASON_CODE,
  };
}
