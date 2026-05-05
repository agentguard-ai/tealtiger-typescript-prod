/**
 * GarakSuite — NVIDIA Garak benchmark suite implementation.
 *
 * Loads Garak probe datasets (jailbreak, prompt injection, data leakage, encoding)
 * and evaluates them against TealTiger's governance stack via the EvaluateEndpoint.
 *
 * Uses a dataset-driven approach: probes are bundled as local YAML fixtures
 * rather than running Garak as a subprocess, avoiding Python dependencies
 * and external network calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { computeDetectionRate } from '../runner/metrics';
import type {
  BenchmarkSuite,
  CategoryResult,
  DatasetLoadResult,
  EvaluateEndpoint,
  ExecutionOptions,
  FormattedResult,
  SuiteResult,
} from '../runner/types';

// ─── Garak Probe Schema ─────────────────────────────────────────────────────

/**
 * Schema for a single Garak probe entry in the dataset YAML files.
 */
export interface GarakProbe {
  id: string;
  category: string;
  probe: string;
  source: string;
}

/**
 * Required fields for schema validation of Garak probes.
 */
const REQUIRED_PROBE_FIELDS: (keyof GarakProbe)[] = ['id', 'category', 'probe', 'source'];

/**
 * Dataset files to load, relative to the garak dataset directory.
 */
const DATASET_FILES = [
  'jailbreak.yaml',
  'prompt-injection.yaml',
  'data-leakage.yaml',
  'encoding.yaml',
];

// ─── GarakSuite Implementation ──────────────────────────────────────────────

export class GarakSuite implements BenchmarkSuite {
  readonly name = 'garak';
  readonly datasetVersion = '0.9.0';

  private probes: GarakProbe[] = [];
  private readonly datasetDir: string;

  constructor(datasetDir?: string) {
    this.datasetDir =
      datasetDir ?? path.resolve(__dirname, '..', 'datasets', 'garak');
  }

  /**
   * Load all 4 YAML dataset files and validate their schema.
   * Each probe must have: id, category, probe, source.
   */
  async loadDataset(): Promise<DatasetLoadResult> {
    const errors: string[] = [];
    const allProbes: GarakProbe[] = [];
    const categories = new Set<string>();

    for (const file of DATASET_FILES) {
      const filePath = path.join(this.datasetDir, file);

      if (!fs.existsSync(filePath)) {
        errors.push(`Dataset file not found: ${filePath}`);
        continue;
      }

      let rawContent: string;
      try {
        rawContent = fs.readFileSync(filePath, 'utf-8');
      } catch (err) {
        errors.push(`Failed to read ${file}: ${(err as Error).message}`);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = yaml.load(rawContent);
      } catch (err) {
        errors.push(`YAML parse error in ${file}: ${(err as Error).message}`);
        continue;
      }

      if (!Array.isArray(parsed)) {
        errors.push(`${file}: expected array of probes, got ${typeof parsed}`);
        continue;
      }

      for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i];
        const validationErrors = this.validateProbe(entry, file, i);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
        } else {
          const probe = entry as GarakProbe;
          allProbes.push(probe);
          categories.add(probe.category);
        }
      }
    }

    this.probes = allProbes;

    const loadResult: DatasetLoadResult = {
      sampleCount: allProbes.length,
      categories: Array.from(categories).sort(),
      schemaValid: errors.length === 0,
    };

    if (errors.length > 0) {
      loadResult.errors = errors;
    }

    return loadResult;
  }

  /**
   * Execute all probes against the evaluate endpoint with concurrency control.
   * Records DENY as blocked, ALLOW/MONITOR as allowed, errors as error.
   */
  async execute(
    endpoint: EvaluateEndpoint,
    options: ExecutionOptions,
  ): Promise<SuiteResult> {
    if (this.probes.length === 0) {
      throw new Error('Dataset not loaded. Call loadDataset() before execute().');
    }

    const startTime = Date.now();
    const categoryMap = new Map<
      string,
      { blocked: number; allowed: number; errors: number; total: number }
    >();

    // Initialize category counters
    for (const probe of this.probes) {
      if (!categoryMap.has(probe.category)) {
        categoryMap.set(probe.category, { blocked: 0, allowed: 0, errors: 0, total: 0 });
      }
    }

    // Execute with concurrency control using Promise pool pattern
    let timedOut = false;
    const suiteDeadline = startTime + options.suiteTimeout;

    const probeQueue = [...this.probes];
    const concurrency = Math.max(1, options.concurrency);

    const executeProbe = async (probe: GarakProbe): Promise<void> => {
      // Check suite timeout
      if (Date.now() >= suiteDeadline) {
        timedOut = true;
        return;
      }

      const stats = categoryMap.get(probe.category)!;
      stats.total++;

      try {
        const response = await Promise.race([
          endpoint.evaluate({
            content: probe.probe,
            metadata: {
              benchmark: 'garak',
              probeId: probe.id,
              category: probe.category,
              source: probe.source,
            },
          }),
          this.createTimeout(options.perCallTimeout),
        ]);

        if (response === null) {
          // Timeout
          stats.errors++;
        } else if (response.decision.action === 'DENY') {
          stats.blocked++;
        } else {
          // ALLOW or MONITOR
          stats.allowed++;
        }
      } catch {
        // Infrastructure error — record as error, don't count as pass/fail
        stats.errors++;
      }
    };

    // Promise pool: process probes with bounded concurrency
    let index = 0;
    const runPool = async (): Promise<void> => {
      while (index < probeQueue.length && !timedOut) {
        const batch: Promise<void>[] = [];
        const batchEnd = Math.min(index + concurrency, probeQueue.length);

        for (let i = index; i < batchEnd; i++) {
          batch.push(executeProbe(probeQueue[i]));
        }
        index = batchEnd;

        await Promise.allSettled(batch);
      }
    };

    await runPool();

    const executionDuration = Date.now() - startTime;

    // Build category results
    const categories: CategoryResult[] = [];
    let totalErrors = 0;

    for (const [category, stats] of categoryMap) {
      totalErrors += stats.errors;
      categories.push({
        category,
        totalProbes: stats.total,
        blocked: stats.blocked,
        allowed: stats.allowed,
        errors: stats.errors,
        notApplicable: 0,
        detectionRate: computeDetectionRate(stats.blocked, stats.allowed),
      });
    }

    return {
      suiteName: this.name,
      datasetVersion: this.datasetVersion,
      tealtigerVersion: this.getTealTigerVersion(),
      executionDuration,
      totalSamples: this.probes.length,
      errorCount: totalErrors,
      categories,
      timedOut,
    };
  }

  /**
   * Format results as markdown table and JSON.
   */
  formatResults(result: SuiteResult): FormattedResult {
    // Build markdown table
    let markdown = `# Garak Benchmark Results\n\n`;
    markdown += `**Suite**: ${result.suiteName}\n`;
    markdown += `**Dataset Version**: ${result.datasetVersion}\n`;
    markdown += `**TealTiger Version**: ${result.tealtigerVersion}\n`;
    markdown += `**Execution Duration**: ${result.executionDuration}ms\n`;
    markdown += `**Total Probes**: ${result.totalSamples}\n`;
    markdown += `**Errors**: ${result.errorCount}\n`;
    markdown += `**Timed Out**: ${result.timedOut ? 'Yes' : 'No'}\n\n`;

    markdown += `## Per-Category Results\n\n`;
    markdown += `| Category | Total | Blocked | Allowed | Errors | Detection Rate |\n`;
    markdown += `|----------|-------|---------|---------|--------|----------------|\n`;

    for (const cat of result.categories) {
      markdown += `| ${cat.category} | ${cat.totalProbes} | ${cat.blocked} | ${cat.allowed} | ${cat.errors} | ${(cat.detectionRate * 100).toFixed(1)}% |\n`;
    }

    // Compute overall detection rate
    const totalBlocked = result.categories.reduce((sum, c) => sum + c.blocked, 0);
    const totalAllowed = result.categories.reduce((sum, c) => sum + c.allowed, 0);
    const overallRate = computeDetectionRate(totalBlocked, totalAllowed);

    markdown += `\n**Overall Detection Rate**: ${(overallRate * 100).toFixed(1)}%\n`;

    // Build JSON
    const json: Record<string, unknown> = {
      suiteName: result.suiteName,
      datasetVersion: result.datasetVersion,
      tealtigerVersion: result.tealtigerVersion,
      executionDuration: result.executionDuration,
      totalSamples: result.totalSamples,
      errorCount: result.errorCount,
      timedOut: result.timedOut,
      overallDetectionRate: overallRate,
      categories: result.categories.map((cat) => ({
        name: cat.category,
        totalProbes: cat.totalProbes,
        blocked: cat.blocked,
        allowed: cat.allowed,
        errors: cat.errors,
        detectionRate: cat.detectionRate,
      })),
    };

    return {
      suiteName: this.name,
      markdown,
      json,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Validate a single probe entry against the required schema.
   */
  private validateProbe(entry: unknown, file: string, index: number): string[] {
    const errors: string[] = [];

    if (!entry || typeof entry !== 'object') {
      errors.push(`${file}[${index}]: expected object, got ${typeof entry}`);
      return errors;
    }

    const obj = entry as Record<string, unknown>;
    const actualFields = Object.keys(obj);

    for (const field of REQUIRED_PROBE_FIELDS) {
      if (!(field in obj)) {
        errors.push(
          `${file}[${index}]: missing required field '${field}'. ` +
            `Expected: [${REQUIRED_PROBE_FIELDS.join(', ')}], ` +
            `Actual: [${actualFields.join(', ')}]`,
        );
      } else if (typeof obj[field] !== 'string') {
        errors.push(
          `${file}[${index}]: field '${field}' must be a string, got ${typeof obj[field]}`,
        );
      } else if ((obj[field] as string).trim() === '') {
        errors.push(`${file}[${index}]: field '${field}' must not be empty`);
      }
    }

    return errors;
  }

  /**
   * Create a timeout promise that resolves to null after the specified duration.
   */
  private createTimeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }

  /**
   * Get the current TealTiger version from package.json.
   */
  private getTealTigerVersion(): string {
    try {
      const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
