/**
 * TealFlow — YAML Parser and Validator
 *
 * Parses TealFlow workflow YAML documents into typed TealFlowWorkflow objects
 * and validates them against the TealFlow schema.
 *
 * Supported triggers: agent_action, schedule (cron), workflow_dispatch, policy_violation
 * Supports `uses` syntax for reusable action references
 * Supports encrypted secrets references (validates they're referenced, not exposed)
 *
 * @module modules/tealflow/TealFlowParser
 * @requirements 8.1, 8.2, 8.6, 8.9
 */

import * as yaml from 'js-yaml';
import type {
  TealFlowWorkflow,
  Job,
  Step,
  TriggerConfig,
} from '../../core/engine/v1.3/module-types';

// ── Validation Result ────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Secret Pattern ───────────────────────────────────────────────

const SECRET_REF_PATTERN = /\$\{\{\s*secrets\.\w+\s*\}\}/;

// ── TealFlowParser ───────────────────────────────────────────────

export class TealFlowParser {
  /**
   * Parses a YAML string into a TealFlowWorkflow object.
   *
   * @param yamlContent - Raw YAML string representing a TealFlow workflow
   * @returns Parsed TealFlowWorkflow object
   * @throws Error if YAML is malformed or cannot be parsed
   */
  parse(yamlContent: string): TealFlowWorkflow {
    const raw = yaml.load(yamlContent) as Record<string, unknown>;

    if (!raw || typeof raw !== 'object') {
      throw new Error('TealFlow: Invalid YAML — document must be an object');
    }

    const workflow: TealFlowWorkflow = {
      name: raw['name'] as string,
      on: this.parseTriggers(raw['on']),
      jobs: this.parseJobs(raw['jobs']),
    };

    if (raw['env'] && typeof raw['env'] === 'object') {
      workflow.env = raw['env'] as Record<string, string>;
    }

    return workflow;
  }

  /**
   * Validates a TealFlowWorkflow object against the schema.
   *
   * @param workflow - The workflow object to validate
   * @returns ValidationResult with valid flag and any errors
   */
  validate(workflow: TealFlowWorkflow): ValidationResult {
    const errors: string[] = [];

    // Required: name
    if (!workflow.name || typeof workflow.name !== 'string') {
      errors.push('Workflow must have a "name" field of type string');
    }

    // Required: on (triggers)
    if (!workflow.on || typeof workflow.on !== 'object') {
      errors.push('Workflow must have an "on" field defining at least one trigger');
    } else {
      this.validateTriggers(workflow.on, errors);
    }

    // Required: jobs
    if (!workflow.jobs || typeof workflow.jobs !== 'object') {
      errors.push('Workflow must have a "jobs" field with at least one job');
    } else {
      const jobIds = Object.keys(workflow.jobs);
      if (jobIds.length === 0) {
        errors.push('Workflow must have at least one job defined');
      }

      for (const jobId of jobIds) {
        this.validateJob(jobId, workflow.jobs[jobId], jobIds, errors);
      }
    }

    // Validate env if present
    if (workflow.env !== undefined && typeof workflow.env !== 'object') {
      errors.push('Workflow "env" must be an object if provided');
    }

    // Validate secrets references are not exposing values
    this.validateSecretsNotExposed(workflow, errors);

    return { valid: errors.length === 0, errors };
  }

  // ── Private Helpers ──────────────────────────────────────────

  private parseTriggers(raw: unknown): TriggerConfig {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const triggers = raw as Record<string, unknown>;
    const config: TriggerConfig = {};

    if (triggers['agent_action']) {
      const aa = triggers['agent_action'] as Record<string, unknown>;
      config.agent_action = {
        types: (aa['types'] as string[]) || [],
      };
      if (aa['risk_score_above'] !== undefined) {
        config.agent_action.risk_score_above = aa['risk_score_above'] as number;
      }
    }

    if (triggers['schedule']) {
      const sched = triggers['schedule'] as Record<string, unknown>;
      config.schedule = {
        cron: (sched['cron'] as string) || '',
      };
    }

    if (triggers['workflow_dispatch'] !== undefined) {
      config.workflow_dispatch = {};
    }

    if (triggers['policy_violation']) {
      const pv = triggers['policy_violation'] as Record<string, unknown>;
      config.policy_violation = {};
      if (pv['reason_codes']) {
        config.policy_violation.reason_codes = pv['reason_codes'] as string[];
      }
      if (pv['severity']) {
        config.policy_violation.severity = pv['severity'] as string[];
      }
    }

    return config;
  }

  private parseJobs(raw: unknown): Record<string, Job> {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const rawJobs = raw as Record<string, unknown>;
    const jobs: Record<string, Job> = {};

    for (const [jobId, jobRaw] of Object.entries(rawJobs)) {
      const j = jobRaw as Record<string, unknown>;
      const job: Job = {
        steps: this.parseSteps(j['steps']),
      };

      if (j['needs']) {
        job.needs = Array.isArray(j['needs']) ? j['needs'] as string[] : [j['needs'] as string];
      }

      if (j['if'] !== undefined) {
        job.if = j['if'] as string;
      }

      if (j['env'] && typeof j['env'] === 'object') {
        job.env = j['env'] as Record<string, string>;
      }

      jobs[jobId] = job;
    }

    return jobs;
  }

  private parseSteps(raw: unknown): Step[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map((stepRaw: unknown) => {
      const s = stepRaw as Record<string, unknown>;
      const step: Step = {
        name: (s['name'] as string) || '',
      };

      if (s['uses'] !== undefined) {
        step.uses = s['uses'] as string;
      }

      if (s['with'] !== undefined && typeof s['with'] === 'object') {
        step.with = s['with'] as Record<string, unknown>;
      }

      if (s['if'] !== undefined) {
        step.if = s['if'] as string;
      }

      if (s['env'] !== undefined && typeof s['env'] === 'object') {
        step.env = s['env'] as Record<string, string>;
      }

      if (s['run'] !== undefined) {
        step.run = s['run'] as string;
      }

      return step;
    });
  }

  private validateTriggers(triggers: TriggerConfig, errors: string[]): void {
    const hasTrigger =
      triggers.agent_action !== undefined ||
      triggers.schedule !== undefined ||
      triggers.workflow_dispatch !== undefined ||
      triggers.policy_violation !== undefined;

    if (!hasTrigger) {
      errors.push('Workflow must define at least one trigger in "on" field');
    }

    if (triggers.agent_action) {
      if (!Array.isArray(triggers.agent_action.types)) {
        errors.push('Trigger "agent_action" must have a "types" array');
      }
    }

    if (triggers.schedule) {
      if (!triggers.schedule.cron || typeof triggers.schedule.cron !== 'string') {
        errors.push('Trigger "schedule" must have a "cron" string');
      }
    }

    if (triggers.policy_violation) {
      if (triggers.policy_violation.reason_codes && !Array.isArray(triggers.policy_violation.reason_codes)) {
        errors.push('Trigger "policy_violation.reason_codes" must be an array');
      }
      if (triggers.policy_violation.severity && !Array.isArray(triggers.policy_violation.severity)) {
        errors.push('Trigger "policy_violation.severity" must be an array');
      }
    }
  }

  private validateJob(jobId: string, job: Job, allJobIds: string[], errors: string[]): void {
    // Steps required
    if (!job.steps || !Array.isArray(job.steps) || job.steps.length === 0) {
      errors.push(`Job "${jobId}" must have at least one step`);
    } else {
      for (let i = 0; i < job.steps.length; i++) {
        this.validateStep(jobId, i, job.steps[i], errors);
      }
    }

    // Validate needs references
    if (job.needs) {
      for (const dep of job.needs) {
        if (!allJobIds.includes(dep)) {
          errors.push(`Job "${jobId}" depends on unknown job "${dep}"`);
        }
        if (dep === jobId) {
          errors.push(`Job "${jobId}" cannot depend on itself`);
        }
      }
    }
  }

  private validateStep(jobId: string, stepIndex: number, step: Step, errors: string[]): void {
    if (!step.name || typeof step.name !== 'string') {
      errors.push(`Job "${jobId}", step ${stepIndex}: must have a "name" field`);
    }

    // A step must have either `uses` or `run`
    if (!step.uses && !step.run) {
      errors.push(`Job "${jobId}", step "${step.name}": must have either "uses" or "run"`);
    }
  }

  private validateSecretsNotExposed(workflow: TealFlowWorkflow, errors: string[]): void {
    // Check that secret references use the ${{ secrets.NAME }} pattern
    // and that raw secret values are not embedded in env or with blocks
    const checkEnv = (env: Record<string, string> | undefined, context: string): void => {
      if (!env) return;
      for (const [key, value] of Object.entries(env)) {
        // Secrets should be referenced via ${{ secrets.X }}, not hardcoded
        if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
          if (typeof value === 'string' && !SECRET_REF_PATTERN.test(value)) {
            errors.push(`${context}: env var "${key}" appears to contain a hardcoded secret. Use \${{ secrets.NAME }} syntax instead`);
          }
        }
      }
    };

    checkEnv(workflow.env, 'Workflow');

    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      checkEnv(job.env, `Job "${jobId}"`);
      for (const step of job.steps) {
        checkEnv(step.env, `Job "${jobId}", step "${step.name}"`);
      }
    }
  }
}
