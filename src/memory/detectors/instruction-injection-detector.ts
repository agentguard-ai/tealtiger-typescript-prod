/**
 * TealMemory v2 — Instruction Injection Detector
 *
 * Scores candidate memory entries for instruction-likeness based on:
 * - Imperative verb patterns (e.g., "ignore previous", "you must", "execute", "run", "delete")
 * - Conditional trigger patterns (e.g., "if asked about", "when you see", "upon receiving")
 * - Role/tool reference patterns (e.g., "as an assistant", "use the tool", "call the function")
 * - Encoded payload patterns (base64, hex within text)
 *
 * Each pattern category contributes a score (0-1).
 * Total score = weighted average of category scores.
 * Configurable threshold (default: 0.6).
 * Reject entries above threshold with reason code MEMORY_INSTRUCTION_INJECTION.
 *
 * @module memory/detectors/instruction-injection-detector
 * @requirements 9.5, 9.6
 */

// ── Pattern Definitions ──────────────────────────────────────────

const IMPERATIVE_VERB_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?previous\b/i,
  /\byou\s+must\b/i,
  /\byou\s+should\b/i,
  /\byou\s+will\b/i,
  /\bexecute\s+the\b/i,
  /\brun\s+the\b/i,
  /\bdelete\s+(all|the|this|every)\b/i,
  /\boverride\s+(the|all|any)\b/i,
  /\bdisregard\s+(the|all|any|previous)\b/i,
  /\bforget\s+(all|the|previous|everything)\b/i,
  /\bdo\s+not\s+(follow|obey|listen)\b/i,
  /\bnever\s+(reveal|disclose|share|mention)\b/i,
  /\balways\s+(respond|reply|answer|say)\b/i,
  /\brespond\s+(only\s+)?with\b/i,
  /\boutput\s+(only|the)\b/i,
  /\bprint\s+(the|this|out)\b/i,
  /\breturn\s+(the|only|this)\b/i,
  /\bsend\s+(the|this|all)\b/i,
  /\bwrite\s+(the|this|to)\b/i,
];

const CONDITIONAL_TRIGGER_PATTERNS: RegExp[] = [
  /\bif\s+(asked|prompted|queried)\s+(about|for|to)\b/i,
  /\bwhen\s+you\s+(see|receive|encounter|get|are)\b/i,
  /\bupon\s+(receiving|seeing|encountering)\b/i,
  /\bwhenever\s+(a|the|someone|anyone)\b/i,
  /\bin\s+case\s+(of|someone|the|a)\b/i,
  /\bif\s+the\s+user\s+(asks|says|types|mentions)\b/i,
  /\bafter\s+(receiving|the|this|you)\b/i,
  /\bbefore\s+(responding|answering|replying)\b/i,
  /\bonce\s+you\s+(receive|see|get|have)\b/i,
  /\btrigger\s+(when|if|on)\b/i,
];

const ROLE_TOOL_REFERENCE_PATTERNS: RegExp[] = [
  /\bas\s+an?\s+(assistant|ai|bot|agent|model|system)\b/i,
  /\byour\s+(role|purpose|function|job|task)\s+is\b/i,
  /\buse\s+the\s+(tool|function|api|endpoint)\b/i,
  /\bcall\s+the\s+(function|api|tool|method)\b/i,
  /\binvoke\s+(the|this)\b/i,
  /\byou\s+are\s+(a|an|now|the)\b/i,
  /\bsystem\s+prompt\b/i,
  /\bact\s+as\s+(a|an|if|though)\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  /\brole[-\s]?play\b/i,
  /\bnew\s+instructions?\b/i,
  /\bupdated?\s+instructions?\b/i,
];

// ── Encoded Payload Detection ────────────────────────────────────

/**
 * Detects base64-encoded segments within text.
 * Looks for strings that appear to be base64 (min 20 chars, valid charset, padding).
 */
const BASE64_PATTERN = /(?:[A-Za-z0-9+/]{4}){5,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;

/**
 * Detects hex-encoded segments within text (min 16 hex chars in a row).
 */
const HEX_PATTERN = /(?:0x)?[0-9a-fA-F]{16,}/g;

// ── Category Weights ─────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
  imperative_verbs: 0.35,
  conditional_triggers: 0.25,
  role_references: 0.25,
  encoded_payloads: 0.15,
};

// ── Scoring Functions ────────────────────────────────────────────

function scoreCategory(content: string, patterns: RegExp[]): number {
  let matchCount = 0;
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      matchCount++;
    }
  }
  // Normalize: 1 match = 0.5, 2 matches = 0.8, 3+ matches = 1.0
  if (matchCount === 0) return 0;
  if (matchCount === 1) return 0.5;
  if (matchCount === 2) return 0.8;
  return 1.0;
}

function scoreEncodedPayloads(content: string): number {
  const base64Matches = content.match(BASE64_PATTERN) ?? [];
  const hexMatches = content.match(HEX_PATTERN) ?? [];

  // Filter base64 matches to those that look suspicious (not common words)
  const suspiciousBase64 = base64Matches.filter((m) => m.length >= 20);
  const suspiciousHex = hexMatches.filter((m) => m.length >= 16);

  const totalSuspicious = suspiciousBase64.length + suspiciousHex.length;
  if (totalSuspicious === 0) return 0;
  if (totalSuspicious === 1) return 0.5;
  return 1.0;
}

// ── Public API ───────────────────────────────────────────────────

export interface InstructionLikenessResult {
  score: number;
  categories: Record<string, number>;
}

export interface InstructionInjectionDetectionResult {
  detected: boolean;
  score: number;
  reason_code: string;
}

/**
 * Scores a content string for instruction-likeness.
 * Returns a total score (0-1) and per-category breakdown.
 */
export function scoreInstructionLikeness(content: string): InstructionLikenessResult {
  const categories: Record<string, number> = {
    imperative_verbs: scoreCategory(content, IMPERATIVE_VERB_PATTERNS),
    conditional_triggers: scoreCategory(content, CONDITIONAL_TRIGGER_PATTERNS),
    role_references: scoreCategory(content, ROLE_TOOL_REFERENCE_PATTERNS),
    encoded_payloads: scoreEncodedPayloads(content),
  };

  // Weighted sum of category scores
  let weightedSum = 0;
  for (const [category, weight] of Object.entries(DEFAULT_WEIGHTS)) {
    weightedSum += (categories[category] ?? 0) * weight;
  }

  // Multi-category boost: when 3+ categories fire, apply a multiplier
  const activeCategories = Object.values(categories).filter((v) => v > 0).length;
  const multiCategoryBoost = activeCategories >= 3 ? 1.4 : activeCategories >= 2 ? 1.2 : 1.0;

  const score = Math.min(1.0, weightedSum * multiCategoryBoost);

  return { score, categories };
}

/**
 * Detects instruction injection in memory content.
 * Returns whether injection was detected based on the configured threshold.
 */
export function detectMemoryInstructionInjection(
  content: string,
  config: { threshold: number } = { threshold: 0.6 },
): InstructionInjectionDetectionResult {
  const { score, categories: _categories } = scoreInstructionLikeness(content);
  const detected = score >= config.threshold;

  return {
    detected,
    score,
    reason_code: detected ? 'MEMORY_INSTRUCTION_INJECTION' : '',
  };
}
