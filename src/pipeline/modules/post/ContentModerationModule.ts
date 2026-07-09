/**
 * Multi-Stage Defense Pipeline — Content Moderation Module
 *
 * Evaluates LLM response content against configurable content policies
 * (toxicity, bias, harmful content, violence, sexual) using keyword-based
 * detection. Returns DENY with `remediation: "resample"` metadata when a
 * policy violation is detected.
 *
 * @module pipeline/modules/post/ContentModerationModule
 * @requirements 7.1, 7.6, 7.7
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
 * Configuration object for ContentModerationModule.
 */
export interface ContentModerationConfig {
  /** Content categories to check (e.g., 'toxicity', 'bias', 'harmful', 'violence', 'sexual'). */
  categories?: string[];
  /** Per-category threshold (0–1). Default: 0.5 for all categories. */
  thresholds?: Record<string, number>;
  /** Category → keyword list for simple keyword-based detection. */
  keywords?: Record<string, string[]>;
}

// ── Types ────────────────────────────────────────────────────────

/**
 * A single content moderation finding detected in response content.
 */
export interface ContentModerationFinding {
  /** Category that was violated (e.g., 'toxicity', 'bias') */
  category: string;
  /** The keyword that triggered the finding */
  keyword: string;
  /** Confidence/severity score for this finding (0–1) */
  score: number;
  /** Character offset where the keyword was found */
  offset: number;
}

// ── Default Keywords ─────────────────────────────────────────────

/**
 * Built-in keyword sets for common content moderation categories.
 * These provide basic coverage; production use should supply custom keywords.
 */
const DEFAULT_KEYWORDS: Record<string, string[]> = {
  toxicity: [
    'kill yourself', 'kys', 'die in a fire', 'go die', 'i hate you',
    'worthless', 'piece of shit', 'scum', 'subhuman', 'trash person',
  ],
  bias: [
    'all women are', 'all men are', 'those people always',
    'typical of their kind', 'they are inferior', 'naturally stupid',
    'genetically predisposed to crime',
  ],
  harmful: [
    'how to make a bomb', 'how to synthesize', 'instructions for poison',
    'hack into', 'steal identity', 'bypass security',
    'exploit vulnerability', 'social engineer',
  ],
  violence: [
    'murder them', 'stab', 'shoot them', 'blow them up',
    'beat them', 'torture', 'dismember', 'behead',
  ],
  sexual: [
    'explicit sexual', 'pornographic', 'sexual acts with minors',
    'non-consensual', 'revenge porn',
  ],
};

/** Default threshold applied to all categories when not specified. */
const DEFAULT_THRESHOLD = 0.5;

/** Default categories to check when none are specified. */
const DEFAULT_CATEGORIES = ['toxicity', 'bias', 'harmful', 'violence', 'sexual'];

// ── Module Implementation ────────────────────────────────────────

/**
 * Evaluates response content against configurable content policies using
 * keyword-based detection. When a policy violation is found, returns DENY
 * with `remediation: "resample"` metadata.
 *
 * Detection approach:
 * - For each configured category, scans response content for keyword matches
 * - A match score is calculated based on keyword density (matches / total words)
 * - When any category's score exceeds its threshold, the module returns DENY
 *
 * When a violation is detected, the module returns:
 * - action: DENY
 * - reason_codes: ['CONTENT_MODERATION_<CATEGORY>'] (e.g., 'CONTENT_MODERATION_TOXICITY')
 * - metadata: { remediation: 'resample', findings: [...], categories_violated: [...] }
 */
export class ContentModerationModule implements TealModule {
  readonly name = 'ContentModerationModule';
  readonly version = '1.0.0';

  private readonly categories: string[];
  private readonly thresholds: Record<string, number>;
  private readonly keywords: Record<string, string[]>;

  constructor(config?: ContentModerationConfig) {
    this.categories = config?.categories ?? DEFAULT_CATEGORIES;
    this.thresholds = config?.thresholds ?? {};
    this.keywords = config?.keywords ?? DEFAULT_KEYWORDS;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    // Response content may come from _response field or content field
    const content = this.extractContent(request);

    if (!content) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'pipeline.content_moderation',
        metadata: {
          module: this.name,
          findings: [],
        },
      };
    }

    const findings = this.scanContent(content);
    const categoriesViolated = this.getCategoriesViolated(findings);

    if (categoriesViolated.length > 0) {
      const reasonCodes = categoriesViolated.map(
        (cat) => `CONTENT_MODERATION_${cat.toUpperCase()}`,
      );

      return {
        action: DecisionAction.DENY,
        reason_codes: reasonCodes,
        event_type: 'pipeline.content_moderation',
        metadata: {
          remediation: 'resample',
          findings,
          categories_violated: categoriesViolated,
          module: this.name,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.content_moderation',
      metadata: {
        module: this.name,
        findings,
        categories_violated: [],
      },
    };
  }

  /**
   * Extract response content from the evaluation request.
   * Checks `_response` (pipeline convention) and falls back to `content`.
   */
  private extractContent(request: ModuleEvaluationRequest): string {
    if (typeof request._response === 'string') {
      return request._response;
    }
    if (
      request._response &&
      typeof request._response === 'object' &&
      typeof (request._response as Record<string, unknown>).content === 'string'
    ) {
      return (request._response as Record<string, unknown>).content as string;
    }
    return request.content ?? '';
  }

  /**
   * Scan content against keyword lists for all configured categories.
   * Returns findings with category, matched keyword, score, and offset.
   */
  private scanContent(content: string): ContentModerationFinding[] {
    const findings: ContentModerationFinding[] = [];
    const normalizedContent = content.toLowerCase();

    for (const category of this.categories) {
      const categoryKeywords = this.keywords[category];
      if (!categoryKeywords || categoryKeywords.length === 0) {
        continue;
      }

      for (const keyword of categoryKeywords) {
        const normalizedKeyword = keyword.toLowerCase();
        let searchStart = 0;

        while (true) {
          const index = normalizedContent.indexOf(normalizedKeyword, searchStart);
          if (index === -1) break;

          // Calculate a score based on keyword length relative to content
          // Longer keyword matches receive higher confidence
          const score = Math.min(1.0, 0.6 + (normalizedKeyword.length / 50));

          findings.push({
            category,
            keyword,
            score,
            offset: index,
          });

          searchStart = index + normalizedKeyword.length;
        }
      }
    }

    return findings;
  }

  /**
   * Determine which categories have violations above their threshold.
   * A category is violated when its max finding score exceeds the category threshold.
   */
  private getCategoriesViolated(findings: ContentModerationFinding[]): string[] {
    const violated: string[] = [];

    for (const category of this.categories) {
      const categoryFindings = findings.filter((f) => f.category === category);
      if (categoryFindings.length === 0) continue;

      const maxScore = categoryFindings.reduce(
        (max, f) => Math.max(max, f.score),
        0,
      );

      const threshold = this.thresholds[category] ?? DEFAULT_THRESHOLD;

      if (maxScore > threshold) {
        violated.push(category);
      }
    }

    return violated;
  }
}
