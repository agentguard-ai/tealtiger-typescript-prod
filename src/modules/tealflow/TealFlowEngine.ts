/**
 * TealFlow — Execution Engine
 *
 * Executes TealFlow workflows by:
 * - Running steps sequentially within a job
 * - Running independent jobs in parallel (Promise.all for jobs without `needs`)
 * - Implementing `needs` dependencies (dependent jobs run after prerequisites)
 * - Evaluating `if` conditional expressions against context
 * - Handling job failures (dependent jobs are skipped)
 *
 * @module modules/tealflow/TealFlowEngine
 * @requirements 8.3, 8.4, 8.5
 */

import type {
  TealFlowWorkflow,
  Job,
  Step,
  FlowContext,
  FlowResult,
} from '../../core/engine/v1.3/module-types';

// ── Types ────────────────────────────────────────────────────────

interface JobResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
}

// ── Expression Evaluator ─────────────────────────────────────────

/**
 * Simple expression evaluator for `if` conditionals.
 * Supports:
 * - Property access: event.risk_score, env.ENVIRONMENT, etc.
 * - Comparisons: ==, !=, >, <, >=, <=
 * - Boolean literals: true, false
 * - String literals: 'value' or "value"
 * - Numeric literals: 42, 3.14
 * - Logical operators: &&, ||, !
 */
function evaluateExpression(expr: string, context: FlowContext): boolean {
  const trimmed = expr.trim();

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Negation
  if (trimmed.startsWith('!')) {
    return !evaluateExpression(trimmed.slice(1), context);
  }

  // Logical OR (lowest precedence)
  const orParts = splitLogical(trimmed, '||');
  if (orParts.length > 1) {
    return orParts.some((part) => evaluateExpression(part, context));
  }

  // Logical AND
  const andParts = splitLogical(trimmed, '&&');
  if (andParts.length > 1) {
    return andParts.every((part) => evaluateExpression(part, context));
  }

  // Parenthesized expression
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return evaluateExpression(trimmed.slice(1, -1), context);
  }

  // Comparison operators
  const comparisonOps = ['==', '!=', '>=', '<=', '>', '<'] as const;
  for (const op of comparisonOps) {
    const idx = trimmed.indexOf(op);
    if (idx !== -1) {
      const left = resolveValue(trimmed.slice(0, idx).trim(), context);
      const right = resolveValue(trimmed.slice(idx + op.length).trim(), context);
      return compareValues(left, right, op);
    }
  }

  // Truthy check on a single value
  const val = resolveValue(trimmed, context);
  return Boolean(val);
}

/**
 * Splits an expression by a logical operator, respecting parentheses.
 */
function splitLogical(expr: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;

    if (depth === 0 && expr.slice(i, i + operator.length) === operator) {
      parts.push(current);
      current = '';
      i += operator.length - 1;
    } else {
      current += expr[i];
    }
  }

  parts.push(current);
  return parts.length > 1 ? parts : [expr];
}

/**
 * Resolves a value reference from the context.
 * Supports: event.X, env.X, secrets.X, string literals, numeric literals.
 */
function resolveValue(token: string, context: FlowContext): unknown {
  const trimmed = token.trim();

  // String literal
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }

  // Numeric literal
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') {
    return num;
  }

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Context path resolution
  const parts = trimmed.split('.');
  const root = parts[0];
  const path = parts.slice(1);

  let obj: unknown;
  if (root === 'event') {
    obj = context.event;
  } else if (root === 'env') {
    obj = context.env;
  } else if (root === 'secrets') {
    obj = context.secrets;
  } else {
    // Try resolving from event as default namespace
    obj = context.event;
    return resolvePath(obj, parts);
  }

  return resolvePath(obj, path);
}

/**
 * Resolves a dotted path on an object.
 */
function resolvePath(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Compares two values with the given operator.
 */
function compareValues(left: unknown, right: unknown, op: string): boolean {
  switch (op) {
    case '==':
      return left == right; // eslint-disable-line eqeqeq
    case '!=':
      return left != right; // eslint-disable-line eqeqeq
    case '>':
      return Number(left) > Number(right);
    case '<':
      return Number(left) < Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<=':
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

// ── TealFlowEngine ──────────────────────────────────────────────

export class TealFlowEngine {
  /**
   * Executes a TealFlow workflow with the given context.
   *
   * - Steps within a job execute sequentially
   * - Independent jobs (no `needs`) execute in parallel
   * - Jobs with `needs` wait for their dependencies to complete
   * - If a job fails, dependent jobs are skipped
   *
   * @param workflow - The parsed TealFlowWorkflow to execute
   * @param context - The execution context (event, env, secrets)
   * @returns FlowResult with success status, completed/failed jobs, and outputs
   */
  async execute(workflow: TealFlowWorkflow, context: FlowContext): Promise<FlowResult> {
    const jobResults = new Map<string, JobResult>();
    const jobIds = Object.keys(workflow.jobs);
    const completed: string[] = [];
    const failed: string[] = [];
    const outputs: Record<string, unknown> = {};

    // Merge workflow-level env into context
    const mergedContext: FlowContext = {
      ...context,
      env: { ...context.env, ...workflow.env },
    };

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(workflow.jobs);

    // Execute jobs in topological order
    await this.executeJobsInOrder(
      jobIds,
      workflow.jobs,
      dependencyGraph,
      mergedContext,
      jobResults,
      completed,
      failed,
      outputs,
    );

    return {
      success: failed.length === 0,
      jobs_completed: completed,
      jobs_failed: failed,
      outputs,
    };
  }

  // ── Private Helpers ──────────────────────────────────────────

  private buildDependencyGraph(jobs: Record<string, Job>): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const [jobId, job] of Object.entries(jobs)) {
      graph.set(jobId, job.needs || []);
    }
    return graph;
  }

  private async executeJobsInOrder(
    jobIds: string[],
    jobs: Record<string, Job>,
    dependencyGraph: Map<string, string[]>,
    context: FlowContext,
    jobResults: Map<string, JobResult>,
    completed: string[],
    failed: string[],
    outputs: Record<string, unknown>,
  ): Promise<void> {
    const remaining = new Set(jobIds);
    const executing = new Set<string>();

    while (remaining.size > 0) {
      // Find jobs whose dependencies are all satisfied
      const ready: string[] = [];
      for (const jobId of remaining) {
        if (executing.has(jobId)) continue;
        const deps = dependencyGraph.get(jobId) || [];
        const allDepsResolved = deps.every(
          (dep) => jobResults.has(dep),
        );
        if (allDepsResolved) {
          ready.push(jobId);
        }
      }

      if (ready.length === 0 && executing.size === 0) {
        // Circular dependency or unresolvable — mark remaining as failed
        for (const jobId of remaining) {
          failed.push(jobId);
          jobResults.set(jobId, { success: false, outputs: {}, error: 'Unresolvable dependencies' });
        }
        break;
      }

      if (ready.length === 0) {
        // Wait — shouldn't happen in this synchronous loop, but safety guard
        break;
      }

      // Execute all ready jobs in parallel
      const promises = ready.map(async (jobId) => {
        executing.add(jobId);

        // Check if any dependency failed → skip this job
        const deps = dependencyGraph.get(jobId) || [];
        const depFailed = deps.some((dep) => {
          const result = jobResults.get(dep);
          return result && !result.success;
        });

        if (depFailed) {
          jobResults.set(jobId, {
            success: false,
            outputs: {},
            error: 'Skipped: dependency failed',
          });
          failed.push(jobId);
          remaining.delete(jobId);
          executing.delete(jobId);
          return;
        }

        // Evaluate job-level `if` condition
        const job = jobs[jobId];
        if (job.if !== undefined) {
          const conditionMet = evaluateExpression(job.if, context);
          if (!conditionMet) {
            // Job skipped due to condition — counts as completed (not failed)
            jobResults.set(jobId, { success: true, outputs: {} });
            completed.push(jobId);
            remaining.delete(jobId);
            executing.delete(jobId);
            return;
          }
        }

        // Execute the job
        const result = await this.executeJob(jobId, job, context);
        jobResults.set(jobId, result);

        if (result.success) {
          completed.push(jobId);
          if (Object.keys(result.outputs).length > 0) {
            outputs[jobId] = result.outputs;
          }
        } else {
          failed.push(jobId);
        }

        remaining.delete(jobId);
        executing.delete(jobId);
      });

      await Promise.all(promises);
    }
  }

  private async executeJob(
    _jobId: string,
    job: Job,
    context: FlowContext,
  ): Promise<JobResult> {
    const jobOutputs: Record<string, unknown> = {};

    // Merge job-level env into context
    const jobContext: FlowContext = {
      ...context,
      env: { ...context.env, ...job.env },
    };

    // Execute steps sequentially
    for (const step of job.steps) {
      try {
        const stepResult = await this.executeStep(step, jobContext);
        if (stepResult !== undefined) {
          jobOutputs[step.name] = stepResult;
        }
      } catch (error) {
        return {
          success: false,
          outputs: jobOutputs,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: true, outputs: jobOutputs };
  }

  private async executeStep(step: Step, context: FlowContext): Promise<unknown> {
    // Evaluate step-level `if` condition
    if (step.if !== undefined) {
      const conditionMet = evaluateExpression(step.if, context);
      if (!conditionMet) {
        // Step skipped — return undefined (no output)
        return undefined;
      }
    }

    // Merge step-level env into context
    const _stepContext: FlowContext = {
      ...context,
      env: { ...context.env, ...step.env },
    };

    // Execute the step action
    if (step.uses) {
      // Reusable action reference — resolve and execute
      return this.executeAction(step.uses, step.with || {}, _stepContext);
    }

    if (step.run) {
      // Inline command — in governance context, this is a no-op placeholder
      // Real execution would invoke a sandboxed runner
      return { ran: step.run };
    }

    return undefined;
  }

  /**
   * Executes a reusable action reference.
   * In the current implementation, this is a placeholder that returns
   * the action reference and parameters. Real implementations would
   * resolve the action from a registry and execute it.
   */
  private async executeAction(
    uses: string,
    params: Record<string, unknown>,
    _context: FlowContext,
  ): Promise<unknown> {
    // Placeholder: return action metadata
    // In production, this would resolve the action from a local/remote registry
    return {
      action: uses,
      params,
      executed: true,
    };
  }
}

// Export the expression evaluator for testing
export { evaluateExpression };
