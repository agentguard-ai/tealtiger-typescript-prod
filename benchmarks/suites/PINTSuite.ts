/**
 * PINTSuite — Lakera PINT benchmark suite implementation.
 *
 * Loads the PINT (Prompt Injection Test) dataset and evaluates samples
 * against TealTiger's governance stack via the EvaluateEndpoint.
 *
 * Uses binary classification: each sample has a ground truth label
 * (true = injection, false = benign). TealTiger's DENY maps to positive
 * detection, ALLOW/MONITOR maps to negative detection.
 *
 * Computes TP/FP/TN/FN per category and aggregate, then derives
 * accuracy, precision, recall, and F1 score.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { classifySample, computeClassificationMetrics } from '../runner/metrics';
import type {
  BenchmarkSuite,
  CategoryResult,
  ClassificationMetrics,
  DatasetLoadResult,
  EvaluateEndpoint,
  ExecutionOptions,
  FormattedResult,
  SuiteResult,
} from '../runner/types';

// ─── PINT Sample Schema ─────────────────────────────────────────────────────

/**
 * Schema for a single PINT sample entry in the dataset YAML file.
 */
export interface PINTSample {
  text: string;
  category: string;
  label: boolean;
}

/**
 * Required fields for schema validation of PINT samples.
 */
const REQUIRED_SAMPLE_FIELDS: (keyof PINTSample)[] = ['text', 'category', 'label'];

/**
 * Dataset file name relative to the PINT dataset directory.
 */
const DATASET_FILE = 'pint-dataset.yaml';

// ─── PINTSuite Implementation ───────────────────────────────────────────────

export class PINTSuite implements BenchmarkSuite {
  readonly name = 'pint';
  readonly datasetVersion = '1.0.0';

  private samples: PINTSample[] = [];
  private readonly datasetDir: string;

  constructor(datasetDir?: string) {
    this.datasetDir =
      datasetDir ?? path.resolve(__dirname, '..', 'datasets', 'pint');
  }

  /**
   * Load the PINT YAML dataset file and validate its schema.
   * Each sample must have: text, category, label.
   */
  async loadDataset(): Promise<DatasetLoadResult> {
    const errors: string[] = [];
    const allSamples: PINTSample[] = [];
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
        const sample = entry as PINTSample;
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
   * Execute all samples against the evaluate endpoint with concurrency control.
   * Maps DENY → positive detection, ALLOW/MONITOR → negative detection.
   * Computes TP/FP/TN/FN per category and aggregate classification metrics.
   */
  async execute(
    endpoint: EvaluateEndpoint,
    options: ExecutionOptions,
  ): Promise<SuiteResult> {
    if (this.samples.length === 0) {
      throw new Error('Dataset not loaded. Call loadDataset() before execute().');
    }

    const startTime = Date.now();

    // Per-category confusion matrix counters
    const categoryMap = new Map<
      string,
      { tp: number; fp: number; tn: number; fn: number; errors: number; total: number }
    >();

    // Initialize category counters
    for (const sample of this.samples) {
      if (!categoryMap.has(sample.category)) {
        categoryMap.set(sample.category, { tp: 0, fp: 0, tn: 0, fn: 0, errors: 0, total: 0 });
      }
    }

    // Execute with concurrency control
    let timedOut = false;
    const suiteDeadline = startTime + options.suiteTimeout;
    const concurrency = Math.max(1, options.concurrency);

    const executeSample = async (sample: PINTSample): Promise<void> => {
      if (Date.now() >= suiteDeadline) {
        timedOut = true;
        return;
      }

      const stats = categoryMap.get(sample.category)!;
      stats.total++;

      try {
        const response = await Promise.race([
          endpoint.evaluate({
            content: sample.text,
            metadata: {
              benchmark: 'pint',
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

    // Build category results with classification metrics
    const categories: CategoryResult[] = [];
    let totalErrors = 0;

    // Aggregate confusion matrix
    let aggTp = 0;
    let aggFp = 0;
    let aggTn = 0;
    let aggFn = 0;

    for (const [category, stats] of categoryMap) {
      totalErrors += stats.errors;
      aggTp += stats.tp;
      aggFp += stats.fp;
      aggTn += stats.tn;
      aggFn += stats.fn;

      const metrics = computeClassificationMetrics(stats.tp, stats.fp, stats.tn, stats.fn);
      const blocked = stats.tp + stats.fp;
      const allowed = stats.tn + stats.fn;

      categories.push({
        category,
        totalProbes: stats.total,
        blocked,
        allowed,
        errors: stats.errors,
        notApplicable: 0,
        detectionRate: blocked + allowed > 0 ? blocked / (blocked + allowed) : 0,
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
   * Format results as markdown with classification metrics table and JSON.
   */
  formatResults(result: SuiteResult): FormattedResult {
    // Compute aggregate metrics from category results
    let aggTp = 0;
    let aggFp = 0;
    let aggTn = 0;
    let aggFn = 0;

    for (const cat of result.categories) {
      if (cat.metrics) {
        aggTp += cat.metrics.truePositives;
        aggFp += cat.metrics.falsePositives;
        aggTn += cat.metrics.trueNegatives;
        aggFn += cat.metrics.falseNegatives;
      }
    }

    const aggregateMetrics = computeClassificationMetrics(aggTp, aggFp, aggTn, aggFn);

    // Build markdown
    let markdown = `# PINT Benchmark Results\n\n`;
    markdown += `**Suite**: ${result.suiteName}\n`;
    markdown += `**Dataset Version**: ${result.datasetVersion}\n`;
    markdown += `**TealTiger Version**: ${result.tealtigerVersion}\n`;
    markdown += `**Execution Duration**: ${result.executionDuration}ms\n`;
    markdown += `**Total Samples**: ${result.totalSamples}\n`;
    markdown += `**Errors**: ${result.errorCount}\n`;
    markdown += `**Timed Out**: ${result.timedOut ? 'Yes' : 'No'}\n\n`;

    markdown += `## Aggregate Classification Metrics\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Accuracy | ${(aggregateMetrics.accuracy * 100).toFixed(1)}% |\n`;
    markdown += `| Precision | ${(aggregateMetrics.precision * 100).toFixed(1)}% |\n`;
    markdown += `| Recall | ${(aggregateMetrics.recall * 100).toFixed(1)}% |\n`;
    markdown += `| F1 Score | ${(aggregateMetrics.f1Score * 100).toFixed(1)}% |\n`;
    markdown += `| True Positives | ${aggTp} |\n`;
    markdown += `| False Positives | ${aggFp} |\n`;
    markdown += `| True Negatives | ${aggTn} |\n`;
    markdown += `| False Negatives | ${aggFn} |\n\n`;

    markdown += `## Per-Category Results\n\n`;
    markdown += `| Category | Total | TP | FP | TN | FN | Errors | Precision | Recall | F1 |\n`;
    markdown += `|----------|-------|----|----|----|----|--------|-----------|--------|----|\n`;

    for (const cat of result.categories) {
      const m = cat.metrics;
      if (m) {
        markdown += `| ${cat.category} | ${cat.totalProbes} | ${m.truePositives} | ${m.falsePositives} | ${m.trueNegatives} | ${m.falseNegatives} | ${cat.errors} | ${(m.precision * 100).toFixed(1)}% | ${(m.recall * 100).toFixed(1)}% | ${(m.f1Score * 100).toFixed(1)}% |\n`;
      } else {
        markdown += `| ${cat.category} | ${cat.totalProbes} | - | - | - | - | ${cat.errors} | - | - | - |\n`;
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
        truePositives: aggTp,
        falsePositives: aggFp,
        trueNegatives: aggTn,
        falseNegatives: aggFn,
      },
      categories: result.categories.map((cat) => ({
        name: cat.category,
        totalProbes: cat.totalProbes,
        blocked: cat.blocked,
        allowed: cat.allowed,
        errors: cat.errors,
        detectionRate: cat.detectionRate,
        metrics: cat.metrics
          ? {
              accuracy: cat.metrics.accuracy,
              precision: cat.metrics.precision,
              recall: cat.metrics.recall,
              f1Score: cat.metrics.f1Score,
              truePositives: cat.metrics.truePositives,
              falsePositives: cat.metrics.falsePositives,
              trueNegatives: cat.metrics.trueNegatives,
              falseNegatives: cat.metrics.falseNegatives,
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
   * Validate a single PINT sample entry against the required schema.
   * Reports expected vs actual field names on validation failure.
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

    // Type validation for present fields
    if ('text' in obj) {
      if (typeof obj.text !== 'string') {
        errors.push(
          `${DATASET_FILE}[${index}]: field 'text' must be a string, got ${typeof obj.text}`,
        );
      } else if ((obj.text as string).trim() === '') {
        errors.push(`${DATASET_FILE}[${index}]: field 'text' must not be empty`);
      }
    }

    if ('category' in obj) {
      if (typeof obj.category !== 'string') {
        errors.push(
          `${DATASET_FILE}[${index}]: field 'category' must be a string, got ${typeof obj.category}`,
        );
      } else if ((obj.category as string).trim() === '') {
        errors.push(`${DATASET_FILE}[${index}]: field 'category' must not be empty`);
      }
    }

    if ('label' in obj) {
      if (typeof obj.label !== 'boolean') {
        errors.push(
          `${DATASET_FILE}[${index}]: field 'label' must be a boolean, got ${typeof obj.label}`,
        );
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
