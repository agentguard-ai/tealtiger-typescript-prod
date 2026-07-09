/**
 * Multi-Stage Defense Pipeline — Hallucination Marker Module
 *
 * Flags response content containing hallucination indicators such as fabricated
 * URLs, unsupported citations, low-confidence markers, and made-up statistics.
 * Returns MONITOR (never DENY) with flagged segments in metadata.
 *
 * @module pipeline/modules/post/HallucinationMarkerModule
 * @requirements 7.3, 7.6, 7.7
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
 * A single hallucination detection indicator with an associated regex pattern.
 */
export interface HallucinationIndicator {
  /** Human-readable name for this indicator (e.g., "fabricated_url", "unsupported_citation") */
  name: string;
  /** Regular expression to detect the indicator */
  regex: RegExp;
  /** Confidence weight (0–1) — how likely this match indicates hallucination */
  confidence: number;
  /** Description of what this indicator detects */
  description?: string;
}

/**
 * A flagged segment in the response that may indicate hallucination.
 */
export interface HallucinationSegment {
  /** Indicator name that matched */
  indicator: string;
  /** The matched text */
  text: string;
  /** Confidence score for this finding */
  confidence: number;
  /** Character offset where the match was found */
  offset: number;
  /** Length of the matched text */
  length: number;
}

/**
 * Configuration object for HallucinationMarkerModule.
 */
export interface HallucinationMarkerConfig {
  /** Custom indicators to scan for. If omitted, uses default indicators. */
  indicators?: HallucinationIndicator[];
  /** Confidence threshold (0–1) above which the module flags for MONITOR. Default: 0.3 */
  confidence_threshold?: number;
}

// ── Default Indicators ───────────────────────────────────────────

/**
 * Built-in hallucination detection indicators covering common patterns.
 */
const DEFAULT_INDICATORS: HallucinationIndicator[] = [
  {
    name: 'fabricated_url',
    description: 'URLs with non-existent TLDs or suspicious patterns',
    regex: /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.(?:xyz123|fakeTLD|example\.fake|notreal|zzz|qqqq|internal-only)\b[^\s]*/gi,
    confidence: 0.85,
  },
  {
    name: 'suspicious_url_pattern',
    description: 'URLs with hallmark patterns of fabrication (overly specific paths with random segments)',
    regex: /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-z]{2,6}\/(?:[a-z0-9-]+\/){4,}[a-z0-9-]+/gi,
    confidence: 0.4,
  },
  {
    name: 'unsupported_citation',
    description: 'Academic citations in [Author, Year] format without supporting data',
    regex: /\[(?:[A-Z][a-z]+(?:\s(?:et\s+al\.?|&\s+[A-Z][a-z]+))?),?\s+\d{4}\]/g,
    confidence: 0.7,
  },
  {
    name: 'confidence_hedging',
    description: 'Phrases indicating low confidence or uncertainty',
    regex: /\b(?:I(?:'m|\sam)\s+not\s+(?:sure|certain)\s+but|I\s+believe|I\s+think\s+(?:that|it)|if\s+I\s+recall\s+correctly|as\s+far\s+as\s+I\s+know|to\s+the\s+best\s+of\s+my\s+knowledge)\b/gi,
    confidence: 0.35,
  },
  {
    name: 'fabricated_statistic',
    description: 'Made-up statistics with high specificity (e.g., "exactly 73.847%")',
    regex: /\b\d{1,3}\.\d{3,}%|\bexactly\s+\d+\.\d{2,}\s*(?:%|percent|million|billion|thousand)\b/gi,
    confidence: 0.6,
  },
];

// ── Module Implementation ────────────────────────────────────────

/**
 * Flags response content containing hallucination indicators and returns MONITOR
 * with flagged segments in metadata. This module NEVER returns DENY — it only
 * flags content for observation and audit.
 *
 * Default indicators detect:
 * - Fabricated URLs with non-existent TLDs or suspicious patterns (confidence: 0.85)
 * - Suspicious URL patterns with overly deep paths (confidence: 0.4)
 * - Academic citations in [Author, Year] format (confidence: 0.7)
 * - Confidence hedging phrases (confidence: 0.35)
 * - Fabricated statistics with high decimal specificity (confidence: 0.6)
 *
 * When hallucination indicators are detected above threshold:
 * - action: MONITOR
 * - reason_codes: ['HALLUCINATION_DETECTED']
 * - metadata: { flagged_segments: [...], max_confidence, indicator_counts }
 *
 * When no indicators are found:
 * - action: ALLOW
 * - reason_codes: []
 */
export class HallucinationMarkerModule implements TealModule {
  readonly name = 'HallucinationMarkerModule';
  readonly version = '1.0.0';

  private readonly confidenceThreshold: number;
  private readonly indicators: HallucinationIndicator[];

  constructor(config?: HallucinationMarkerConfig) {
    this.confidenceThreshold = config?.confidence_threshold ?? 0.3;
    this.indicators = config?.indicators ?? DEFAULT_INDICATORS;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    const content = request.content ?? '';

    if (!content) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'pipeline.hallucination_scan',
        metadata: {
          module: this.name,
          flagged_segments: [],
        },
      };
    }

    const segments = this.scanContent(content);

    // Determine max confidence across all flagged segments
    const maxConfidence = segments.reduce(
      (max, s) => Math.max(max, s.confidence),
      0,
    );

    // Build indicator counts for observability
    const indicatorCounts: Record<string, number> = {};
    for (const segment of segments) {
      indicatorCounts[segment.indicator] =
        (indicatorCounts[segment.indicator] ?? 0) + 1;
    }

    if (maxConfidence >= this.confidenceThreshold && segments.length > 0) {
      return {
        action: 'MONITOR' as any,
        reason_codes: ['HALLUCINATION_DETECTED'],
        event_type: 'pipeline.hallucination_scan',
        metadata: {
          module: this.name,
          flagged_segments: segments,
          max_confidence: maxConfidence,
          confidence_threshold: this.confidenceThreshold,
          indicator_counts: indicatorCounts,
          total_flags: segments.length,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.hallucination_scan',
      metadata: {
        module: this.name,
        flagged_segments: [],
        max_confidence: maxConfidence,
        confidence_threshold: this.confidenceThreshold,
      },
    };
  }

  /**
   * Scan content against all configured hallucination indicators.
   * Returns an array of flagged segments with indicator name, matched text,
   * confidence, offset, and length.
   */
  private scanContent(content: string): HallucinationSegment[] {
    const segments: HallucinationSegment[] = [];

    for (const indicator of this.indicators) {
      // Reset regex state for global patterns
      const regex = new RegExp(indicator.regex.source, indicator.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        segments.push({
          indicator: indicator.name,
          text: match[0],
          confidence: indicator.confidence,
          offset: match.index,
          length: match[0].length,
        });
      }
    }

    return segments;
  }
}
