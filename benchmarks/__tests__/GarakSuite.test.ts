/**
 * Unit tests for GarakSuite.
 *
 * Tests dataset loading, schema validation, probe execution with mock endpoint,
 * and error handling for infrastructure failures.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { GarakSuite } from '../suites/GarakSuite';
import type {
  EvaluateEndpoint,
  EvaluateRequest,
  EvaluateResponse,
  SuiteResult,
} from '../runner/types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Creates a mock endpoint that returns DENY for probes containing known
 * attack patterns and ALLOW otherwise.
 */
function createMockEndpoint(options?: {
  failOnIds?: string[];
  delayMs?: number;
}): EvaluateEndpoint {
  const attackPatterns = [
    'ignore all previous instructions',
    'ignore all prev',
    'you are now dan',
    'jailbreak mode',
    'system override',
    'developer mode',
    'unrestricted',
    'no restrictions',
    'disable',
    'bypass',
    'override safety',
    'reveal your system prompt',
    'output your system prompt',
    'credit card number',
    'social security number',
    'decode this base64',
    'rot13',
    'hex',
    'ignore safety',
  ];

  return {
    async evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
      // Simulate infrastructure errors for specific probe IDs
      if (options?.failOnIds) {
        const probeId = (request.metadata as Record<string, unknown>)?.probeId as string;
        if (probeId && options.failOnIds.includes(probeId)) {
          throw new Error('Simulated infrastructure error');
        }
      }

      // Simulate delay
      if (options?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      const content = request.content.toLowerCase();
      const isAttack = attackPatterns.some((pattern) => content.includes(pattern));

      return {
        correlation_id: `mock-${Date.now()}`,
        decision: {
          action: isAttack ? 'DENY' : 'ALLOW',
          risk_score: isAttack ? 0.95 : 0.1,
          reason_codes: isAttack ? ['attack_detected'] : [],
        },
      };
    },
  };
}

// ─── Dataset Loading Tests ───────────────────────────────────────────────────

describe('GarakSuite', () => {
  describe('loadDataset()', () => {
    it('should load all dataset files from the fixtures directory', async () => {
      const suite = new GarakSuite();
      const result = await suite.loadDataset();

      expect(result.schemaValid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.sampleCount).toBeGreaterThanOrEqual(60); // 20+20+15+15 minimum
      expect(result.categories).toContain('jailbreak');
      expect(result.categories).toContain('prompt_injection');
      expect(result.categories).toContain('data_leakage');
      expect(result.categories).toContain('encoding');
    });

    it('should have correct category counts', async () => {
      const suite = new GarakSuite();
      const result = await suite.loadDataset();

      // We created 20 jailbreak, 20 prompt_injection, 15 data_leakage, 15 encoding
      expect(result.sampleCount).toBe(70);
      expect(result.categories.length).toBe(4);
    });

    it('should report errors for missing dataset directory', async () => {
      const suite = new GarakSuite('/nonexistent/path');
      const result = await suite.loadDataset();

      expect(result.schemaValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.sampleCount).toBe(0);
    });

    it('should report schema validation errors for malformed data', async () => {
      // Create a temp directory with malformed YAML
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garak-test-'));

      // Write a malformed jailbreak.yaml (missing required fields)
      fs.writeFileSync(
        path.join(tmpDir, 'jailbreak.yaml'),
        `- id: "test-001"\n  category: "jailbreak"\n  # missing probe and source fields\n`,
      );
      // Write valid but empty arrays for other files
      fs.writeFileSync(path.join(tmpDir, 'prompt-injection.yaml'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'data-leakage.yaml'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'encoding.yaml'), '[]');

      const suite = new GarakSuite(tmpDir);
      const result = await suite.loadDataset();

      expect(result.schemaValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('missing required field'))).toBe(true);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should report errors for invalid YAML syntax', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garak-test-'));

      fs.writeFileSync(path.join(tmpDir, 'jailbreak.yaml'), 'invalid: yaml: [[[');
      fs.writeFileSync(path.join(tmpDir, 'prompt-injection.yaml'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'data-leakage.yaml'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'encoding.yaml'), '[]');

      const suite = new GarakSuite(tmpDir);
      const result = await suite.loadDataset();

      expect(result.schemaValid).toBe(false);
      expect(result.errors).toBeDefined();
      // The file parses as an object, not an array
      expect(
        result.errors!.some(
          (e) => e.includes('expected array') || e.includes('YAML parse error'),
        ),
      ).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should reject probes with empty string fields', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garak-test-'));

      fs.writeFileSync(
        path.join(tmpDir, 'jailbreak.yaml'),
        `- id: ""\n  category: "jailbreak"\n  probe: "test"\n  source: "test"\n`,
      );
      fs.writeFileSync(path.join(tmpDir, 'prompt-injection.yaml'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'data-leakage.yaml'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'encoding.yaml'), '[]');

      const suite = new GarakSuite(tmpDir);
      const result = await suite.loadDataset();

      expect(result.schemaValid).toBe(false);
      expect(result.errors!.some((e) => e.includes('must not be empty'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  // ─── Execution Tests ────────────────────────────────────────────────────────

  describe('execute()', () => {
    it('should throw if dataset not loaded', async () => {
      const suite = new GarakSuite();
      const endpoint = createMockEndpoint();

      await expect(
        suite.execute(endpoint, {
          perCallTimeout: 5000,
          suiteTimeout: 60000,
          concurrency: 5,
        }),
      ).rejects.toThrow('Dataset not loaded');
    });

    it('should execute probes and record results', async () => {
      const suite = new GarakSuite();
      await suite.loadDataset();

      const endpoint = createMockEndpoint();
      const result = await suite.execute(endpoint, {
        perCallTimeout: 5000,
        suiteTimeout: 60000,
        concurrency: 5,
      });

      expect(result.suiteName).toBe('garak');
      expect(result.datasetVersion).toBe('0.9.0');
      expect(result.totalSamples).toBe(70);
      expect(result.timedOut).toBe(false);
      expect(result.categories.length).toBe(4);

      // All probes should be either blocked or allowed (no errors with mock)
      expect(result.errorCount).toBe(0);

      // Detection rate should be > 0 since our mock detects attack patterns
      for (const cat of result.categories) {
        expect(cat.blocked + cat.allowed + cat.errors).toBe(cat.totalProbes);
        expect(cat.detectionRate).toBeGreaterThanOrEqual(0);
        expect(cat.detectionRate).toBeLessThanOrEqual(1);
      }
    });

    it('should record infrastructure errors separately', async () => {
      const suite = new GarakSuite();
      await suite.loadDataset();

      // Make some probes fail with infrastructure errors
      const endpoint = createMockEndpoint({
        failOnIds: ['jailbreak-001', 'jailbreak-002', 'injection-001'],
      });

      const result = await suite.execute(endpoint, {
        perCallTimeout: 5000,
        suiteTimeout: 60000,
        concurrency: 5,
      });

      expect(result.errorCount).toBe(3);

      // Errors should not count toward detection rate
      const jailbreakCat = result.categories.find((c) => c.category === 'jailbreak')!;
      expect(jailbreakCat.errors).toBe(2);
      expect(jailbreakCat.blocked + jailbreakCat.allowed + jailbreakCat.errors).toBe(
        jailbreakCat.totalProbes,
      );
    });

    it('should respect suite timeout', async () => {
      const suite = new GarakSuite();
      await suite.loadDataset();

      // Create an endpoint with a delay that will cause timeout
      const endpoint = createMockEndpoint({ delayMs: 100 });

      const result = await suite.execute(endpoint, {
        perCallTimeout: 5000,
        suiteTimeout: 50, // Very short timeout
        concurrency: 1,
      });

      // Should have timed out before processing all probes
      expect(result.timedOut).toBe(true);
    });

    it('should respect concurrency limits', async () => {
      const suite = new GarakSuite();
      await suite.loadDataset();

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const trackingEndpoint: EvaluateEndpoint = {
        async evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((resolve) => setTimeout(resolve, 10));
          currentConcurrent--;

          return {
            correlation_id: `mock-${Date.now()}`,
            decision: { action: 'DENY', risk_score: 0.9, reason_codes: [] },
          };
        },
      };

      await suite.execute(trackingEndpoint, {
        perCallTimeout: 5000,
        suiteTimeout: 60000,
        concurrency: 3,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  // ─── Format Results Tests ───────────────────────────────────────────────────

  describe('formatResults()', () => {
    it('should produce markdown with table and JSON', async () => {
      const suite = new GarakSuite();
      await suite.loadDataset();

      const endpoint = createMockEndpoint();
      const result = await suite.execute(endpoint, {
        perCallTimeout: 5000,
        suiteTimeout: 60000,
        concurrency: 5,
      });

      const formatted = suite.formatResults(result);

      expect(formatted.suiteName).toBe('garak');

      // Markdown should contain table headers
      expect(formatted.markdown).toContain('| Category |');
      expect(formatted.markdown).toContain('| jailbreak |');
      expect(formatted.markdown).toContain('| prompt_injection |');
      expect(formatted.markdown).toContain('| data_leakage |');
      expect(formatted.markdown).toContain('| encoding |');
      expect(formatted.markdown).toContain('Overall Detection Rate');

      // JSON should have expected structure
      expect(formatted.json.suiteName).toBe('garak');
      expect(formatted.json.overallDetectionRate).toBeDefined();
      expect(Array.isArray(formatted.json.categories)).toBe(true);
    });

    it('should include all metadata in markdown output', () => {
      const suite = new GarakSuite();

      const mockResult: SuiteResult = {
        suiteName: 'garak',
        datasetVersion: '0.9.0',
        tealtigerVersion: '1.2.0',
        executionDuration: 1500,
        totalSamples: 70,
        errorCount: 2,
        categories: [
          {
            category: 'jailbreak',
            totalProbes: 20,
            blocked: 18,
            allowed: 1,
            errors: 1,
            notApplicable: 0,
            detectionRate: 18 / 19,
          },
        ],
        timedOut: false,
      };

      const formatted = suite.formatResults(mockResult);

      expect(formatted.markdown).toContain('1.2.0');
      expect(formatted.markdown).toContain('1500ms');
      expect(formatted.markdown).toContain('70');
      expect(formatted.markdown).toContain('0.9.0');
    });
  });
});
