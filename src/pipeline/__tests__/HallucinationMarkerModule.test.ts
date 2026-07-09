/**
 * HallucinationMarkerModule — Unit Tests
 *
 * Covers:
 * - MONITOR with HALLUCINATION_DETECTED when fabricated URLs are found
 * - MONITOR with HALLUCINATION_DETECTED when unsupported citations are found
 * - MONITOR with HALLUCINATION_DETECTED when confidence hedging is found
 * - MONITOR with HALLUCINATION_DETECTED when fabricated statistics are found
 * - ALLOW when no hallucination indicators are detected
 * - ALLOW when indicators are below confidence threshold
 * - Custom indicators support
 * - Module NEVER returns DENY
 * - Flagged segments array is populated with match details
 * - TealModule interface compliance
 *
 * @requirements 7.3, 7.6, 7.7
 */

import { HallucinationMarkerModule } from '../modules/post/HallucinationMarkerModule';
import type {
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-hallucination-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
});

const makeRequest = (
  overrides: Partial<ModuleEvaluationRequest> = {},
): ModuleEvaluationRequest => ({
  content: 'Hello world',
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe('HallucinationMarkerModule', () => {
  describe('fabricated URL detection', () => {
    it('should return MONITOR when fabricated URLs with fake TLDs are found', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'Visit https://research-data.xyz123/paper for more info',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('HALLUCINATION_DETECTED');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments.length).toBeGreaterThan(0);
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'fabricated_url' }),
        ]),
      );
    });

    it('should detect URLs with notreal TLD', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'Source: http://academic-papers.notreal/study/2024',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'fabricated_url' }),
        ]),
      );
    });

    it('should detect suspicious URL patterns with overly deep paths', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content:
            'According to https://www.example.com/research/papers/2024/ai/safety/hallucination-detection',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'suspicious_url_pattern' }),
        ]),
      );
    });
  });

  describe('unsupported citation detection', () => {
    it('should return MONITOR when academic citations are found', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content:
            'Research shows that AI systems can hallucinate [Smith, 2023] and produce unreliable outputs.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      expect(result.reason_codes).toContain('HALLUCINATION_DETECTED');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indicator: 'unsupported_citation',
            confidence: 0.7,
          }),
        ]),
      );
    });

    it('should detect "et al." citations', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'As documented by [Johnson et al., 2022], the phenomenon...',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'unsupported_citation' }),
        ]),
      );
    });

    it('should detect multi-author citations', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'The study [Chen & Wang, 2021] demonstrated...',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'unsupported_citation' }),
        ]),
      );
    });
  });

  describe('confidence hedging detection', () => {
    it('should return MONITOR when "I\'m not sure but" is found', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: "I'm not sure but the answer might be 42.",
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'confidence_hedging' }),
        ]),
      );
    });

    it('should detect "I believe" phrases', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'I believe the capital of Australia is Canberra.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'confidence_hedging' }),
        ]),
      );
    });

    it('should detect "if I recall correctly"', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'If I recall correctly, the event happened in 1999.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'confidence_hedging' }),
        ]),
      );
    });
  });

  describe('fabricated statistics detection', () => {
    it('should return MONITOR when highly specific statistics are found', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'Studies show that exactly 73.847% of users prefer AI.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indicator: 'fabricated_statistic',
            confidence: 0.6,
          }),
        ]),
      );
    });

    it('should detect overly precise percentages', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'The success rate is 94.237% across all trials.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'fabricated_statistic' }),
        ]),
      );
    });
  });

  describe('threshold behavior', () => {
    it('should return ALLOW when indicator confidence is below threshold', async () => {
      // Set threshold above all indicator confidences
      const module = new HallucinationMarkerModule({ confidence_threshold: 0.99 });

      const result = await module.evaluate(
        makeRequest({
          content:
            "I'm not sure but here's a citation [Smith, 2023]",
        }),
        makeCtx(),
        undefined,
      );

      // All default indicators have confidence < 0.99
      // unsupported_citation: 0.7, confidence_hedging: 0.35 — both below 0.99
      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should use default threshold of 0.3 when not configured', async () => {
      const module = new HallucinationMarkerModule();

      // confidence_hedging has confidence 0.35, above default threshold 0.3
      const result = await module.evaluate(
        makeRequest({
          content: 'I believe the answer is correct.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
    });

    it('should return ALLOW when no indicators match', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'The capital of France is Paris. This is a well-known fact.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments.length).toBe(0);
    });
  });

  describe('empty/missing content', () => {
    it('should return ALLOW when content is empty', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({ content: '' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when content is not provided', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        { model: 'gpt-4' },
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('custom indicators', () => {
    it('should use custom indicators when provided', async () => {
      const module = new HallucinationMarkerModule({
        indicators: [
          {
            name: 'doi_missing',
            regex: /DOI:\s*10\.\d{4,}\/[^\s]+/g,
            confidence: 0.8,
            description: 'DOI references that may be fabricated',
          },
        ],
      });

      const result = await module.evaluate(
        makeRequest({
          content: 'See DOI: 10.1234/fake-journal.2024.001 for details.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const segments = result.metadata?.flagged_segments as any[];
      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ indicator: 'doi_missing', confidence: 0.8 }),
        ]),
      );
    });

    it('should not use default indicators when custom indicators are provided', async () => {
      const module = new HallucinationMarkerModule({
        indicators: [
          {
            name: 'custom_only',
            regex: /CUSTOM_MARKER/g,
            confidence: 0.9,
          },
        ],
      });

      // Default citation pattern should NOT be detected
      const result = await module.evaluate(
        makeRequest({ content: 'As shown in [Smith, 2023]...' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('never returns DENY', () => {
    it('should return MONITOR (not DENY) even with multiple high-confidence indicators', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content:
            "I'm not sure but according to https://data.xyz123/study [Smith et al., 2023], exactly 87.394% of users experienced this.",
        }),
        makeCtx(),
        undefined,
      );

      // Multiple indicators matched — should still be MONITOR, never DENY
      expect(result.action).toBe('MONITOR');
      expect(result.action).not.toBe('DENY');
      expect(result.reason_codes).toContain('HALLUCINATION_DETECTED');
    });
  });

  describe('metadata', () => {
    it('should include flagged_segments with offset and length', async () => {
      const module = new HallucinationMarkerModule();
      const content = 'According to [Smith, 2023], the data is clear.';

      const result = await module.evaluate(
        makeRequest({ content }),
        makeCtx(),
        undefined,
      );

      const segments = result.metadata?.flagged_segments as any[];
      expect(segments.length).toBeGreaterThan(0);
      const citation = segments.find(
        (s: any) => s.indicator === 'unsupported_citation',
      );
      expect(citation).toBeDefined();
      expect(citation.offset).toBe(content.indexOf('[Smith, 2023]'));
      expect(citation.length).toBe('[Smith, 2023]'.length);
      expect(citation.text).toBe('[Smith, 2023]');
    });

    it('should include max_confidence and confidence_threshold in metadata', async () => {
      const module = new HallucinationMarkerModule({ confidence_threshold: 0.5 });

      const result = await module.evaluate(
        makeRequest({
          content: 'See [Johnson, 2021] for details.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.metadata?.max_confidence).toBe(0.7);
      expect(result.metadata?.confidence_threshold).toBe(0.5);
    });

    it('should include indicator_counts in metadata on MONITOR', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content: 'Per [Smith, 2023] and [Jones, 2022], the results are clear.',
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      const counts = result.metadata?.indicator_counts as Record<string, number>;
      expect(counts['unsupported_citation']).toBe(2);
    });

    it('should include total_flags count in metadata on MONITOR', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(
        makeRequest({
          content:
            "I believe [Smith, 2023] showed exactly 73.847% improvement.",
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('MONITOR');
      expect(result.metadata?.total_flags).toBeGreaterThanOrEqual(2);
    });
  });

  describe('TealModule interface compliance', () => {
    it('should have correct name and version', () => {
      const module = new HallucinationMarkerModule();

      expect(module.name).toBe('HallucinationMarkerModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should have an async evaluate method', () => {
      const module = new HallucinationMarkerModule();

      expect(typeof module.evaluate).toBe('function');
    });

    it('should return a valid ModuleResult structure', async () => {
      const module = new HallucinationMarkerModule();

      const result = await module.evaluate(makeRequest(), makeCtx(), undefined);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason_codes');
      expect(result).toHaveProperty('event_type');
      expect(result.event_type).toBe('pipeline.hallucination_scan');
    });
  });
});
