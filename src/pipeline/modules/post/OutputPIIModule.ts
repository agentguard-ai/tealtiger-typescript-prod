/**
 * Multi-Stage Defense Pipeline — Output PII Module
 *
 * Scans LLM response content for PII patterns (email addresses, phone numbers,
 * SSN, credit card numbers) and returns DENY with reason code PII_IN_RESPONSE
 * and `remediation: "redact"` metadata when PII confidence exceeds a
 * configurable threshold.
 *
 * This is the post-execution counterpart to the pre-execution PIIScannerModule.
 * While PIIScannerModule scans request content before it reaches the LLM,
 * OutputPIIModule scans the LLM's response before it reaches the caller.
 *
 * @module pipeline/modules/post/OutputPIIModule
 * @requirements 7.2, 7.6, 7.7
 */

import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';
import { DecisionAction } from '../../../core/engine/types';

// ── Configuration ────────────────────────────────────────────────

/**
 * A single PII detection pattern with associated confidence score.
 */
export interface PIIPattern {
  /** Human-readable name for this pattern (e.g., "email", "ssn") */
  name: string;
  /** Regular expression to match PII instances */
  regex: RegExp;
  /** Confidence score (0–1) assigned to each match of this pattern */
  confidence: number;
}

/**
 * A single PII finding detected in response content.
 */
export interface PIIFinding {
  /** Pattern name that matched */
  pattern: string;
  /** Confidence score of this finding */
  confidence: number;
  /** Character offset where the match was found */
  offset: number;
  /** Length of the matched text */
  length: number;
}

/**
 * Configuration object for OutputPIIModule.
 */
export interface OutputPIIConfig {
  /** Confidence threshold (0–1) above which PII triggers DENY. Default: 0.5 */
  threshold?: number;
  /** Custom patterns to scan for. If omitted, uses default patterns. */
  patterns?: PIIPattern[];
}

// ── Default Patterns ─────────────────────────────────────────────

/**
 * Built-in PII detection patterns covering common sensitive data types.
 */
const DEFAULT_PII_PATTERNS: PIIPattern[] = [
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    confidence: 0.9,
  },
  {
    name: 'phone',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    confidence: 0.8,
  },
  {
    name: 'ssn',
    regex: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    confidence: 0.95,
  },
  {
    name: 'credit_card',
    regex: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    confidence: 0.9,
  },
];

// ── Module Implementation ────────────────────────────────────────

/**
 * Scans LLM response content for PII patterns and returns DENY with
 * `remediation: "redact"` metadata when the maximum confidence of detected
 * PII exceeds the configured threshold.
 *
 * Default patterns detect:
 * - Email addresses (confidence: 0.9)
 * - Phone numbers (confidence: 0.8)
 * - Social Security Numbers (confidence: 0.95)
 * - Credit card numbers (confidence: 0.9)
 *
 * When PII is detected above threshold, the module returns:
 * - action: DENY
 * - reason_codes: ['PII_IN_RESPONSE']
 * - metadata: { remediation: 'redact', findings: [...] }
 */
export class OutputPIIModule implements TealModule {
  readonly name = 'OutputPIIModule';
  readonly version = '1.0.0';

  private readonly threshold: number;
  private readonly patterns: PIIPattern[];

  constructor(config?: OutputPIIConfig) {
    this.threshold = config?.threshold ?? 0.5;
    this.patterns = config?.patterns ?? DEFAULT_PII_PATTERNS;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    // In post-execution context, response content may be in _response or content
    const content = this.extractResponseContent(request);

    if (!content) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'pipeline.output_pii_scan',
        metadata: {
          module: this.name,
          findings: [],
        },
      };
    }

    const findings = this.scanContent(content);

    // Determine max confidence across all findings
    const maxConfidence = findings.reduce(
      (max, f) => Math.max(max, f.confidence),
      0,
    );

    if (maxConfidence > this.threshold) {
      return {
        action: DecisionAction.DENY,
        reason_codes: ['PII_IN_RESPONSE'],
        event_type: 'pipeline.output_pii_scan',
        metadata: {
          remediation: 'redact',
          findings,
          max_confidence: maxConfidence,
          threshold: this.threshold,
          module: this.name,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.output_pii_scan',
      metadata: {
        module: this.name,
        findings,
        max_confidence: maxConfidence,
        threshold: this.threshold,
      },
    };
  }

  /**
   * Extract response content from the evaluation request.
   * In post-execution context, the response may be provided via:
   * - `request._response` (pipeline passes response here)
   * - `request.content` (fallback, standard field)
   */
  private extractResponseContent(request: ModuleEvaluationRequest): string {
    if (typeof request._response === 'string') {
      return request._response;
    }
    return request.content ?? '';
  }

  /**
   * Scan content against all configured PII patterns.
   * Returns an array of findings with pattern name, confidence, offset, and length.
   */
  private scanContent(content: string): PIIFinding[] {
    const findings: PIIFinding[] = [];

    for (const pattern of this.patterns) {
      // Reset regex state for global patterns
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        findings.push({
          pattern: pattern.name,
          confidence: pattern.confidence,
          offset: match.index,
          length: match[0].length,
        });
      }
    }

    return findings;
  }
}
