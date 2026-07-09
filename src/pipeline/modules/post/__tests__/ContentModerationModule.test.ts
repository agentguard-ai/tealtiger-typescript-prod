/**
 * Unit tests for ContentModerationModule.
 *
 * Validates: Requirements 7.1, 7.6, 7.7
 */

import { ContentModerationModule } from '../ContentModerationModule';
import type { ModuleContext, ModuleEvaluationRequest } from '../../../../core/engine/v1.2/types';

describe('ContentModerationModule', () => {
  const defaultCtx: ModuleContext = {
    correlation_id: 'test-corr-id',
    policy_version: '1.0.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };

  describe('TealModule interface', () => {
    it('should have correct name and version', () => {
      const module = new ContentModerationModule();
      expect(module.name).toBe('ContentModerationModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should implement evaluate as an async function', () => {
      const module = new ContentModerationModule();
      expect(typeof module.evaluate).toBe('function');
    });
  });

  describe('ALLOW for clean content', () => {
    it('should return ALLOW for empty content', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = { content: '' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect(result.event_type).toBe('pipeline.content_moderation');
    });

    it('should return ALLOW for undefined content', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {};

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW for benign content', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'Here is a helpful summary of the latest research findings.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect(result.metadata).toBeDefined();
      expect((result.metadata as any).categories_violated).toEqual([]);
    });
  });

  describe('DENY for toxic content', () => {
    it('should return DENY with CONTENT_MODERATION_TOXICITY for toxic keywords', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'You should kill yourself immediately.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_TOXICITY');
      expect(result.event_type).toBe('pipeline.content_moderation');
      expect((result.metadata as any).remediation).toBe('resample');
      expect((result.metadata as any).categories_violated).toContain('toxicity');
    });
  });

  describe('DENY for harmful content', () => {
    it('should return DENY with CONTENT_MODERATION_HARMFUL for harmful keywords', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'Here are instructions for how to make a bomb at home.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_HARMFUL');
      expect((result.metadata as any).remediation).toBe('resample');
    });
  });

  describe('DENY for biased content', () => {
    it('should return DENY with CONTENT_MODERATION_BIAS for bias keywords', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'Studies show they are inferior in every way.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_BIAS');
      expect((result.metadata as any).remediation).toBe('resample');
    });
  });

  describe('DENY for violent content', () => {
    it('should return DENY with CONTENT_MODERATION_VIOLENCE for violent keywords', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'The best way is to murder them in their sleep.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_VIOLENCE');
      expect((result.metadata as any).remediation).toBe('resample');
    });
  });

  describe('content extraction from _response field', () => {
    it('should extract content from _response string', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        _response: 'You are worthless and should go die.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_TOXICITY');
    });

    it('should extract content from _response.content object', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        _response: { content: 'Here are instructions for how to make a bomb.' },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_HARMFUL');
    });
  });

  describe('custom configuration', () => {
    it('should only check specified categories', async () => {
      const module = new ContentModerationModule({
        categories: ['toxicity'],
      });
      // "hack into" is harmful but not toxic
      const request: ModuleEvaluationRequest = {
        content: 'Try to hack into the server.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });

    it('should use custom keywords', async () => {
      const module = new ContentModerationModule({
        categories: ['custom_category'],
        keywords: {
          custom_category: ['forbidden phrase'],
        },
      });
      const request: ModuleEvaluationRequest = {
        content: 'This contains the forbidden phrase in context.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_CUSTOM_CATEGORY');
      expect((result.metadata as any).remediation).toBe('resample');
    });

    it('should use custom thresholds', async () => {
      const module = new ContentModerationModule({
        categories: ['toxicity'],
        // Set threshold impossibly high so nothing triggers
        thresholds: { toxicity: 1.5 },
      });
      const request: ModuleEvaluationRequest = {
        content: 'Kill yourself right now.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('case insensitivity', () => {
    it('should detect keywords regardless of case', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'KILL YOURSELF immediately!',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_TOXICITY');
    });
  });

  describe('multiple category violations', () => {
    it('should report all violated categories in reason_codes', async () => {
      const module = new ContentModerationModule();
      const request: ModuleEvaluationRequest = {
        content: 'Kill yourself and also learn how to make a bomb.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_TOXICITY');
      expect(result.reason_codes).toContain('CONTENT_MODERATION_HARMFUL');
      expect((result.metadata as any).categories_violated).toContain('toxicity');
      expect((result.metadata as any).categories_violated).toContain('harmful');
    });
  });

  describe('metadata includes remediation: "resample"', () => {
    it('should always include remediation: "resample" on DENY', async () => {
      const module = new ContentModerationModule({
        categories: ['violence'],
      });
      const request: ModuleEvaluationRequest = {
        content: 'I want to torture someone.',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect((result.metadata as any).remediation).toBe('resample');
    });
  });

  describe('findings detail', () => {
    it('should include findings with category, keyword, score, and offset', async () => {
      const module = new ContentModerationModule({
        categories: ['toxicity'],
        keywords: { toxicity: ['bad word'] },
      });
      const request: ModuleEvaluationRequest = {
        content: 'prefix bad word suffix',
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      const findings = (result.metadata as any).findings;
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('toxicity');
      expect(findings[0].keyword).toBe('bad word');
      expect(findings[0].offset).toBe(7); // "prefix " is 7 chars
      expect(findings[0].score).toBeGreaterThan(0);
    });
  });
});
