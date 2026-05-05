/**
 * AgentSuite — Agent-level security benchmark suite implementation.
 *
 * Evaluates TealTiger's governance against multi-step agent scenarios
 * (AgentDojo/AgentHarm style). Each scenario consists of multiple steps,
 * and a scenario is "blocked" if any step marked `is_critical: true`
 * receives a DENY decision from the governance stack.
 *
 * Scenarios with `not_applicable_reason` are excluded from detection
 * metrics and reported separately.
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

// ─── Agent Scenario Schema ──────────────────────────────────────────────────

/**
 * A single step within an agent scenario.
 */
export interface AgentStep {
  action: string;
  tool?: string;
  content: string;
  is_critical: boolean;
}

/**
 * Schema for a multi-step agent scenario in the dataset YAML.
 */
export interface AgentScenario {
  id: string;
  category: string;
  description: string;
  steps: AgentStep[];
  expected_blocked: boolean;
  not_applicable_reason?: string;
}

/**
 * Required fields for schema validation of agent scenarios.
 */
const REQUIRED_SCENARIO_FIELDS: (keyof AgentScenario)[] = [
  'id',
  'category',
  'description',
  'steps',
  'expected_blocked',
];

/**
 * Required fields for each step within a scenario.
 */
const REQUIRED_STEP_FIELDS: (keyof AgentStep)[] = ['action', 'content', 'is_critical'];

/**
 * Dataset file name relative to the agent dataset directory.
 */
const DATASET_FILE = 'scenarios.yaml';

// ─── AgentSuite Implementation ──────────────────────────────────────────────

export class AgentSuite implements BenchmarkSuite {
  readonly name = 'agent';
  readonly datasetVersion = '1.0.0';

  private scenarios: AgentScenario[] = [];
  private readonly datasetDir: string;

  constructor(datasetDir?: string) {
    this.datasetDir =
      datasetDir ?? path.resolve(__dirname, '..', 'datasets', 'agent');
  }

  /**
   * Load the agent scenarios YAML dataset and validate its schema.
   * Each scenario must have: id, category, description, steps, expected_blocked.
   * Each step must have: action, content, is_critical.
   */
  async loadDataset(): Promise<DatasetLoadResult> {
    const errors: string[] = [];
    const allScenarios: AgentScenario[] = [];
    const categories = new Set<string>();

    const filePath = path.join(this.datasetDir, DATASET_FILE);

    if (!fs.existsSync(filePath)) {
      errors.push(`Dataset file not found: ${filePath}`);
      this.scenarios = [];
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
      this.scenarios = [];
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
      this.scenarios = [];
      return {
        sampleCount: 0,
        categories: [],
        schemaValid: false,
        errors,
      };
    }

    if (!Array.isArray(parsed)) {
      errors.push(`${DATASET_FILE}: expected array of scenarios, got ${typeof parsed}`);
      this.scenarios = [];
      return {
        sampleCount: 0,
        categories: [],
        schemaValid: false,
        errors,
      };
    }

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      const validationErrors = this.validateScenario(entry, i);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      } else {
        const scenario = entry as AgentScenario;
        allScenarios.push(scenario);
        categories.add(scenario.category);
      }
    }

    this.scenarios = allScenarios;

    const loadResult: DatasetLoadResult = {
      sampleCount: allScenarios.length,
      categories: Array.from(categories).sort(),
      schemaValid: errors.length === 0,
    };

    if (errors.length > 0) {
      loadResult.errors = errors;
    }

    return loadResult;
  }

  /**
   * Execute all scenarios against the evaluate endpoint.
   *
   * For each scenario:
   * - If it has a `not_applicable_reason`, record as not-applicable
   * - Otherwise, evaluate each step through the endpoint
   * - A scenario is "blocked" if ANY step with `is_critical: true` receives DENY
   * - Infrastructure errors on any step mark the scenario as "error"
   */
  async execute(
    endpoint: EvaluateEndpoint,
    options: ExecutionOptions,
  ): Promise<SuiteResult> {
    if (this.scenarios.length === 0) {
      throw new Error('Dataset not loaded. Call loadDataset() before execute().');
    }

    const startTime = Date.now();

    // Per-category counters
    const categoryMap = new Map<
      string,
      { blocked: number; allowed: number; errors: number; notApplicable: number; total: number }
    >();

    // Initialize category counters
    for (const scenario of this.scenarios) {
      if (!categoryMap.has(scenario.category)) {
        categoryMap.set(scenario.category, {
          blocked: 0,
          allowed: 0,
          errors: 0,
          notApplicable: 0,
          total: 0,
        });
      }
    }

    let timedOut = false;
    const suiteDeadline = startTime + options.suiteTimeout;
    const concurrency = Math.max(1, options.concurrency);

    const executeScenario = async (scenario: AgentScenario): Promise<void> => {
      if (Date.now() >= suiteDeadline) {
        timedOut = true;
        return;
      }

      const stats = categoryMap.get(scenario.category)!;
      stats.total++;

      // Not-applicable scenarios are excluded from detection metrics
      if (scenario.not_applicable_reason) {
        stats.notApplicable++;
        return;
      }

      // Evaluate each step — scenario is "blocked" if any critical step gets DENY
      let scenarioBlocked = false;
      let scenarioError = false;

      for (const step of scenario.steps) {
        if (Date.now() >= suiteDeadline) {
          timedOut = true;
          return;
        }

        try {
          const response = await Promise.race([
            endpoint.evaluate({
              content: step.content,
              action: step.action,
              tool: step.tool,
              metadata: {
                benchmark: 'agent',
                scenarioId: scenario.id,
                category: scenario.category,
                isCritical: step.is_critical,
              },
            }),
            this.createTimeout(options.perCallTimeout),
          ]);

          if (response === null) {
            // Timeout — record as error
            scenarioError = true;
            break;
          }

          if (step.is_critical && response.decision.action === 'DENY') {
            scenarioBlocked = true;
            // Once a critical step is blocked, the scenario is blocked
            // No need to evaluate remaining steps
            break;
          }
        } catch {
          // Infrastructure error
          scenarioError = true;
          break;
        }
      }

      if (scenarioError) {
        stats.errors++;
      } else if (scenarioBlocked) {
        stats.blocked++;
      } else {
        stats.allowed++;
      }
    };

    // Promise pool: process scenarios with bounded concurrency
    let index = 0;
    const runPool = async (): Promise<void> => {
      while (index < this.scenarios.length && !timedOut) {
        const batch: Promise<void>[] = [];
        const batchEnd = Math.min(index + concurrency, this.scenarios.length);

        for (let i = index; i < batchEnd; i++) {
          batch.push(executeScenario(this.scenarios[i]));
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
        notApplicable: stats.notApplicable,
        detectionRate: computeDetectionRate(stats.blocked, stats.allowed),
      });
    }

    return {
      suiteName: this.name,
      datasetVersion: this.datasetVersion,
      tealtigerVersion: this.getTealTigerVersion(),
      executionDuration,
      totalSamples: this.scenarios.length,
      errorCount: totalErrors,
      categories,
      timedOut,
    };
  }

  /**
   * Format results as markdown and JSON.
   */
  formatResults(result: SuiteResult): FormattedResult {
    let markdown = `# Agent Benchmark Results\n\n`;
    markdown += `**Suite**: ${result.suiteName}\n`;
    markdown += `**Dataset Version**: ${result.datasetVersion}\n`;
    markdown += `**TealTiger Version**: ${result.tealtigerVersion}\n`;
    markdown += `**Execution Duration**: ${result.executionDuration}ms\n`;
    markdown += `**Total Scenarios**: ${result.totalSamples}\n`;
    markdown += `**Errors**: ${result.errorCount}\n`;
    markdown += `**Timed Out**: ${result.timedOut ? 'Yes' : 'No'}\n\n`;

    markdown += `## Per-Category Results\n\n`;
    markdown += `| Category | Total | Blocked | Allowed | Errors | N/A | Detection Rate |\n`;
    markdown += `|----------|-------|---------|---------|--------|-----|----------------|\n`;

    for (const cat of result.categories) {
      markdown += `| ${cat.category} | ${cat.totalProbes} | ${cat.blocked} | ${cat.allowed} | ${cat.errors} | ${cat.notApplicable} | ${(cat.detectionRate * 100).toFixed(1)}% |\n`;
    }

    // Compute overall detection rate (excluding not-applicable)
    const totalBlocked = result.categories.reduce((sum, c) => sum + c.blocked, 0);
    const totalAllowed = result.categories.reduce((sum, c) => sum + c.allowed, 0);
    const overallRate = computeDetectionRate(totalBlocked, totalAllowed);

    markdown += `\n**Overall Detection Rate**: ${(overallRate * 100).toFixed(1)}%\n`;

    // List not-applicable categories
    const naCategories = result.categories.filter((c) => c.notApplicable > 0);
    if (naCategories.length > 0) {
      markdown += `\n## Out-of-Scope Categories\n\n`;
      for (const cat of naCategories) {
        markdown += `- **${cat.category}**: ${cat.notApplicable} scenario(s) marked not applicable\n`;
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
      overallDetectionRate: overallRate,
      categories: result.categories.map((cat) => ({
        name: cat.category,
        totalProbes: cat.totalProbes,
        blocked: cat.blocked,
        allowed: cat.allowed,
        errors: cat.errors,
        notApplicable: cat.notApplicable,
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
   * Validate a single scenario entry against the required schema.
   */
  private validateScenario(entry: unknown, index: number): string[] {
    const errors: string[] = [];

    if (!entry || typeof entry !== 'object') {
      errors.push(`${DATASET_FILE}[${index}]: expected object, got ${typeof entry}`);
      return errors;
    }

    const obj = entry as Record<string, unknown>;
    const actualFields = Object.keys(obj);

    for (const field of REQUIRED_SCENARIO_FIELDS) {
      if (!(field in obj)) {
        errors.push(
          `${DATASET_FILE}[${index}]: missing required field '${field}'. ` +
            `Expected: [${REQUIRED_SCENARIO_FIELDS.join(', ')}], ` +
            `Actual: [${actualFields.join(', ')}]`,
        );
      }
    }

    // Validate field types
    if ('id' in obj && typeof obj.id !== 'string') {
      errors.push(`${DATASET_FILE}[${index}]: field 'id' must be a string`);
    }
    if ('category' in obj && typeof obj.category !== 'string') {
      errors.push(`${DATASET_FILE}[${index}]: field 'category' must be a string`);
    }
    if ('description' in obj && typeof obj.description !== 'string') {
      errors.push(`${DATASET_FILE}[${index}]: field 'description' must be a string`);
    }
    if ('expected_blocked' in obj && typeof obj.expected_blocked !== 'boolean') {
      errors.push(`${DATASET_FILE}[${index}]: field 'expected_blocked' must be a boolean`);
    }

    // Validate steps array
    if ('steps' in obj) {
      if (!Array.isArray(obj.steps)) {
        errors.push(`${DATASET_FILE}[${index}]: field 'steps' must be an array`);
      } else if (obj.steps.length === 0) {
        errors.push(`${DATASET_FILE}[${index}]: field 'steps' must not be empty`);
      } else {
        for (let s = 0; s < obj.steps.length; s++) {
          const stepErrors = this.validateStep(obj.steps[s], index, s);
          errors.push(...stepErrors);
        }
      }
    }

    return errors;
  }

  /**
   * Validate a single step within a scenario.
   */
  private validateStep(step: unknown, scenarioIndex: number, stepIndex: number): string[] {
    const errors: string[] = [];

    if (!step || typeof step !== 'object') {
      errors.push(
        `${DATASET_FILE}[${scenarioIndex}].steps[${stepIndex}]: expected object, got ${typeof step}`,
      );
      return errors;
    }

    const obj = step as Record<string, unknown>;
    const actualFields = Object.keys(obj);

    for (const field of REQUIRED_STEP_FIELDS) {
      if (!(field in obj)) {
        errors.push(
          `${DATASET_FILE}[${scenarioIndex}].steps[${stepIndex}]: missing required field '${field}'. ` +
            `Expected: [${REQUIRED_STEP_FIELDS.join(', ')}], ` +
            `Actual: [${actualFields.join(', ')}]`,
        );
      }
    }

    if ('action' in obj && typeof obj.action !== 'string') {
      errors.push(
        `${DATASET_FILE}[${scenarioIndex}].steps[${stepIndex}]: field 'action' must be a string`,
      );
    }
    if ('content' in obj && typeof obj.content !== 'string') {
      errors.push(
        `${DATASET_FILE}[${scenarioIndex}].steps[${stepIndex}]: field 'content' must be a string`,
      );
    }
    if ('is_critical' in obj && typeof obj.is_critical !== 'boolean') {
      errors.push(
        `${DATASET_FILE}[${scenarioIndex}].steps[${stepIndex}]: field 'is_critical' must be a boolean`,
      );
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
