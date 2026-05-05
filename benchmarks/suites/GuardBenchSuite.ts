/**
 * GuardBenchSuite — EU JRC GuardBench benchmark suite implementation.
 *
 * Evaluates TealTiger's governance against the GuardBench safety evaluation
 * datasets. Categories that align with TealTiger's deterministic scope are
 * evaluated normally. Categories requiring ML inference are marked as
 * "not applicable" with rationale.
 *
 * Uses binary classification: each sample has a ground truth label
 * (true = harmful, false = benign). TealTiger's DENY maps to positive
 * detection, ALLOW/MONITOR maps to negative detection.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import {
  classifySample,
  computeClassificationMetrics,
  computeDetectionRate,
} from '../runner/metrics';
import type {
  BenchmarkSuite,
  CategoryResult,
  DatasetLoadResult,
  EvaluateEndpoint,
  ExecutionOptions,
  FormattedResult,
  SuiteResult,
} from '../runner/types';

// ─── GuardBench Sample Schema ───────────────────────────────────────────────

/**
 * Schema for a single GuardBench sample entry in the dataset YAML.
 */
export interface GuardBenchSample {
  id: string;
  category: string;
  text: string;
  label: boolean;
  not_applicable_reason?: string;
}

/**
 * Required fields for schema validation of GuardBench samples.
 */
const REQUIRED_SAMPLE_FIELDS: (keyof GuardBenchSample)[] = ['id', 'category', 'text', 'label'];

/**
 * Dataset file name relative to the guardbench dataset directory.
 */
const DATASET_FILE = 'datasets.yaml';

// ─── GuardBenchSuite Implementation ─────────────────────────────────────────

export class GuardBenchSuite implements BenchmarkSuite {
  readonly name = 'guardbench';
  readonly datasetVersion = '1.0.0';

  private samples: GuardBenchSample[] = [];
  private readonly datasetDir: string;

  constructor(datasetDir?: string) {
    this.datasetDir =
      datasetDir ?? path.resolve(__dirname, '..', 'datasets', 'guardbench');
  }

  /**
   * Load the GuardBench YAML dataset and validate its schema.
   * Each sample must have: id, category, text, label.
   */
  async loadDataset(): Promise<DatasetLoadResult> {
    const errors: string[] = [];
    const allSamples: GuardBenchSample[] = [];
    const categories = new Set<string>();

    const filePath = path.join(this.datasetDir, DATASET_FILE);

    if (!fs.existsSync(filePath)) {
      errors.push(`Dataset file not found: ${filePath}`);
      this.samples = [];
      return {
        sampleCount: 0,
        categories: [],
        schemaValid: false,
        errors,
      };
    }

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      errors.push(`Failed to read ${DATASET_FILE}: ${(err as Error).message}`);
      this.samples = [];
      return {
        sampleCount: 0,
        categories: [],
        schemaValid: false,
        errors,
      };
    }

    let parsed: unknown;
    try {
      parsed = yaml.load(rawContent);
    } catch (err) {
      errors.push(`YAML parse error in ${DATASET_FILE}: ${(err as Error).message}`);
      this.samples = [];
      return {
        sampleCount: 0,
        categories: [],
        schemaValid: false,
        errors,
      };
    }

    if (!Array.isArray(parsed)) {
      errors.push(`${DATASET_FILE}: expected array of samples, got ${typeof parsed}`);
      this.samples = [];
      return {
        sampleCount: 0,
        categories: [],
        schemaValid: false,
        errors,
      };
    }

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      const validationErrors = this.validateSample(entry, i);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      } else {
        const sample = entry as GuardBenchSample;
        allSamples.push(sample);
        categories.add(sample.category);
      }
    }

    this.samples = allSamples;

    const loadResult: DatasetLoadResult = {
      sampleCount: allSamples.length,
      categories: Array.from(categories).sort(),
      schemaValid: errors.length === 0,
    };

    if (errors.length > 0) {
      loadResult.errors = errors;
    }

    return loadResult;
  }

  /**
   * Execute all samples against the evaluate endpoint.
   *
   * Samples with `not_applicable_reason` are recorded as not-applicable
   * and excluded from detection metrics.
   *
   * For applicable samples, maps DENY → positive detection, ALLOW/MONITOR → negative.
   * Computes classification metrics per category.
   */
  async execute(
    endpoint: EvaluateEndpoint,
    options: ExecutionOptions,
  ): Promise<SuiteResult> {
    if (this.samples.length === 0) {
      throw new Error('Dataset not loaded. Call loadDataset() before execute().');
    }

    const startTime = Date.now();

    // Per-category counters
    const categoryMap = new Map<
      string,
      {
        tp: number;
        fp: number;
        tn: number;
        fn: number;
        errors: number;
        notApplicable: number;
        total: number;
      }
    >();

    // Initialize category counters
    for (const sample of this.samples) {
      if (!categoryMap.has(sample.category)) {
        categoryMap.set(sample.category, {
          tp: 0,
          fp: 0,
          tn: 0,
          fn: 0,
          errors: 0,
          notApplicable: 0,
          total: 0,
        });
      }
    }

    let timedOut = false;
    const suiteDeadline = startTime + options.suiteTimeout;
    const concurrency = Math.max(1, options.concurrency);

    const executeSample = async (sample: GuardBenchSample): Promise<void> => {
      if (Date.now() >= suiteDeadline) {
        timedOut = true;
        return;
      }

      const stats = categoryMap.get(sample.category)!;
      stats.total++;

      // Not-applicable samples are excluded from detection metrics
      if (sample.not_applicable_reason) {
        stats.notApplicable++;
        return;
      }

      try {
        const response = await Promise.race([
          endpoint.evaluate({
            content: sample.text,
            metadata: {
              benchmark: 'guardbench',
              sampleId: sample.id,
              category: sample.category,
              groundTruthLabel: sample.label,
            },
          }),
          this.createTimeout(options.perCallTimeout),
        ]);

        if (response === null) {
          // Timeout
          stats.errors++;
        } else {
          const classification = classifySample(sample.label, response.decision.action);
          switch (classification) {
            case 'TP':
              stats.tp++;
              break;
            case 'FP':
              stats.fp++;
              break;
            case 'TN':
              stats.tn++;
              break;
            case 'FN':
              stats.fn++;
              break;
          }
        }
      } catch {
        stats.errors++;
      }
    };

    // Promise pool: process samples with bounded concurrency
    let index = 0;
    const runPool = async (): Promise<void> => {
      while (index < this.samples.length && !timedOut) {
        const batch: Promise<void>[] = [];
        const batchEnd = Math.min(index + concurrency, this.samples.length);

        for (let i = index; i < batchEnd; i++) {
          batch.push(executeSample(this.samples[i]));
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

      const blocked = stats.tp + stats.fp;
      const allowed = stats.tn + stats.fn;
      const metrics = computeClassificationMetrics(stats.tp, stats.fp, stats.tn, stats.fn);

      categories.push({
        category,
        totalProbes: stats.total,
        blocked,
        allowed,
        errors: stats.errors,
        notApplicable: stats.notApplicable,
        detectionRate: computeDetectionRate(blocked, allowed),
        metrics,
      });
    }

    return {
      suiteName: this.name,
      datasetVersion: this.datasetVersion,
      tealtigerVersion: this.getTealTigerVersion(),
      executionDuration,
      totalSamples: this.samples.length,
      errorCount: totalErrors,
      categories,
      timedOut,
    };
  }

  /**
   * Format results as markdown with classification metrics and JSON.
   */
  formatResults(result: SuiteResult): FormattedResult {
    // Compute aggregate metrics (only from applicable categories)
    let aggTp = 0;
    let aggFp = 0;
    let aggTn = 0;
    let aggFn = 0;

    for (const cat of result.categories) {
      if (cat.metrics && cat.notApplicable < cat.totalProbes) {
        aggTp += cat.metrics.truePositives;
        aggFp += cat.metrics.falsePositives;
        aggTn += cat.metrics.trueNegatives;
        aggFn += cat.metrics.falseNegatives;
      }
    }

    const aggregateMetrics = computeClassificationMetrics(aggTp, aggFp, aggTn, aggFn);

    let markdown = `# GuardBench Benchmark Results\n\n`;
    markdown += `**Suite**: ${result.suiteName}\n`;
    markdown += `**Dataset Version**: ${result.datasetVersion}\n`;
    markdown += `**TealTiger Version**: ${result.tealtigerVersion}\n`;
    markdown += `**Execution Duration**: ${result.executionDuration}ms\n`;
    markdown += `**Total Samples**: ${result.totalSamples}\n`;
    markdown += `**Errors**: ${result.errorCount}\n`;
    markdown += `**Timed Out**: ${result.timedOut ? 'Yes' : 'No'}\n\n`;

    markdown += `## Aggregate Classification Metrics (Deterministic Scope Only)\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Accuracy | ${(aggregateMetrics.accuracy * 100).toFixed(1)}% |\n`;
    markdown += `| Precision | ${(aggregateMetrics.precision * 100).toFixed(1)}% |\n`;
    markdown += `| Recall | ${(aggregateMetrics.recall * 100).toFixed(1)}% |\n`;
    markdown += `| F1 Score | ${(aggregateMetrics.f1Score * 100).toFixed(1)}% |\n\n`;

    markdown += `## Per-Category Results\n\n`;
    markdown += `| Category | Total | Blocked | Allowed | N/A | Errors | Detection Rate | Scope |\n`;
    markdown += `|----------|-------|---------|---------|-----|--------|----------------|-------|\n`;

    for (const cat of result.categories) {
      const scope = cat.notApplicable === cat.totalProbes ? 'ML-dependent' : 'Deterministic';
      markdown += `| ${cat.category} | ${cat.totalProbes} | ${cat.blocked} | ${cat.allowed} | ${cat.notApplicable} | ${cat.errors} | ${(cat.detectionRate * 100).toFixed(1)}% | ${scope} |\n`;
    }

    // List ML-dependent categories
    const mlCategories = result.categories.filter((c) => c.notApplicable === c.totalProbes);
    if (mlCategories.length > 0) {
      markdown += `\n## ML-Dependent Categories (Outside Deterministic Scope)\n\n`;
      for (const cat of mlCategories) {
        markdown += `- **${cat.category}**: Requires ML inference — outside deterministic scope\n`;
      }
    }

    // Build JSON
    const json: Record<string, unknown> = {
      suiteName: result.suiteName,
      datasetVersion: result.datasetVersion,
      tealtigerVersion: result.tealtigerVersion,
      executionDuration: result.executionDuration,
      totalSamples: result.totalSamples,
      errorCount: result.errorCount,
      timedOut: result.timedOut,
      aggregateMetrics: {
        accuracy: aggregateMetrics.accuracy,
        precision: aggregateMetrics.precision,
        recall: aggregateMetrics.recall,
        f1Score: aggregateMetrics.f1Score,
      },
      categories: result.categories.map((cat) => ({
        name: cat.category,
        totalProbes: cat.totalProbes,
        blocked: cat.blocked,
        allowed: cat.allowed,
        errors: cat.errors,
        notApplicable: cat.notApplicable,
        detectionRate: cat.detectionRate,
        scope: cat.notApplicable === cat.totalProbes ? 'ml-dependent' : 'deterministic',
        metrics: cat.metrics
          ? {
              accuracy: cat.metrics.accuracy,
              precision: cat.metrics.precision,
              recall: cat.metrics.recall,
              f1Score: cat.metrics.f1Score,
            }
          : undefined,
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
   * Validate a single GuardBench sample against the required schema.
   */
  private validateSample(entry: unknown, index: number): string[] {
    const errors: string[] = [];

    if (!entry || typeof entry !== 'object') {
      errors.push(`${DATASET_FILE}[${index}]: expected object, got ${typeof entry}`);
      return errors;
    }

    const obj = entry as Record<string, unknown>;
    const actualFields = Object.keys(obj);

    for (const field of REQUIRED_SAMPLE_FIELDS) {
      if (!(field in obj)) {
        errors.push(
          `${DATASET_FILE}[${index}]: missing required field '${field}'. ` +
            `Expected: [${REQUIRED_SAMPLE_FIELDS.join(', ')}], ` +
            `Actual: [${actualFields.join(', ')}]`,
        );
      }
    }

    // Type validation
    if ('id' in obj && typeof obj.id !== 'string') {
      errors.push(`${DATASET_FILE}[${index}]: field 'id' must be a string`);
    }
    if ('category' in obj && typeof obj.category !== 'string') {
      errors.push(`${DATASET_FILE}[${index}]: field 'category' must be a string`);
    }
    if ('text' in obj) {
      if (typeof obj.text !== 'string') {
        errors.push(`${DATASET_FILE}[${index}]: field 'text' must be a string`);
      } else if ((obj.text as string).trim() === '') {
        errors.push(`${DATASET_FILE}[${index}]: field 'text' must not be empty`);
      }
    }
    if ('label' in obj && typeof obj.label !== 'boolean') {
      errors.push(`${DATASET_FILE}[${index}]: field 'label' must be a boolean`);
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
