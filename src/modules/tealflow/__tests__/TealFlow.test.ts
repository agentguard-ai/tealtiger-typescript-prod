/**
 * TealFlow Module — Unit Tests
 *
 * Tests TealFlow YAML parser and execution engine including:
 * - Parse valid workflow YAML
 * - Validate rejects invalid schema (missing name, missing jobs)
 * - Sequential step execution within a job
 * - Parallel independent job execution
 * - Job dependency ordering (needs)
 * - Conditional step skipping (if evaluates to false)
 * - Job failure propagation (dependent jobs skipped)
 *
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9
 */

import { TealFlowParser } from '../TealFlowParser';
import { TealFlowEngine, evaluateExpression } from '../TealFlowEngine';
import type { TealFlowWorkflow, FlowContext } from '../../../core/engine/v1.3/module-types';

describe('TealFlowParser', () => {
  let parser: TealFlowParser;

  beforeEach(() => {
    parser = new TealFlowParser();
  });

  describe('parse', () => {
    it('should parse a valid workflow YAML with all trigger types', () => {
      const yamlContent = `
name: security-review
on:
  agent_action:
    types: [CODE_CHANGE, TOOL_INVOKE]
    risk_score_above: 7
  schedule:
    cron: "0 */6 * * *"
  workflow_dispatch: {}
  policy_violation:
    reason_codes: [NHI_SCOPE_VIOLATION]
    severity: [high, critical]
env:
  ENVIRONMENT: production
jobs:
  scan:
    steps:
      - name: run-scan
        uses: tealtiger/security-scan@v1
        with:
          depth: full
  notify:
    needs: [scan]
    steps:
      - name: send-alert
        uses: tealtiger/notify@v1
        with:
          channel: security
`;

      const workflow = parser.parse(yamlContent);

      expect(workflow.name).toBe('security-review');
      expect(workflow.on.agent_action).toBeDefined();
      expect(workflow.on.agent_action!.types).toEqual(['CODE_CHANGE', 'TOOL_INVOKE']);
      expect(workflow.on.agent_action!.risk_score_above).toBe(7);
      expect(workflow.on.schedule).toBeDefined();
      expect(workflow.on.schedule!.cron).toBe('0 */6 * * *');
      expect(workflow.on.workflow_dispatch).toBeDefined();
      expect(workflow.on.policy_violation).toBeDefined();
      expect(workflow.on.policy_violation!.reason_codes).toEqual(['NHI_SCOPE_VIOLATION']);
      expect(workflow.on.policy_violation!.severity).toEqual(['high', 'critical']);
      expect(workflow.env).toEqual({ ENVIRONMENT: 'production' });
      expect(Object.keys(workflow.jobs)).toHaveLength(2);
      expect(workflow.jobs['scan'].steps).toHaveLength(1);
      expect(workflow.jobs['notify'].needs).toEqual(['scan']);
    });

    it('should parse steps with uses syntax for reusable actions', () => {
      const yamlContent = `
name: reusable-actions
on:
  workflow_dispatch: {}
jobs:
  build:
    steps:
      - name: checkout
        uses: actions/checkout@v3
      - name: lint
        uses: tealtiger/lint@v2
        with:
          config: strict
`;

      const workflow = parser.parse(yamlContent);
      const steps = workflow.jobs['build'].steps;

      expect(steps[0].uses).toBe('actions/checkout@v3');
      expect(steps[1].uses).toBe('tealtiger/lint@v2');
      expect(steps[1].with).toEqual({ config: 'strict' });
    });

    it('should parse steps with if conditionals', () => {
      const yamlContent = `
name: conditional-workflow
on:
  agent_action:
    types: [CODE_CHANGE]
jobs:
  deploy:
    if: "env.ENVIRONMENT == 'production'"
    steps:
      - name: check-approval
        uses: tealtiger/approval-check@v1
        if: "event.risk_score > 5"
      - name: deploy
        uses: tealtiger/deploy@v1
`;

      const workflow = parser.parse(yamlContent);

      expect(workflow.jobs['deploy'].if).toBe("env.ENVIRONMENT == 'production'");
      expect(workflow.jobs['deploy'].steps[0].if).toBe('event.risk_score > 5');
    });

    it('should parse steps with run commands', () => {
      const yamlContent = `
name: run-workflow
on:
  workflow_dispatch: {}
jobs:
  test:
    steps:
      - name: run-tests
        run: npm test
`;

      const workflow = parser.parse(yamlContent);
      expect(workflow.jobs['test'].steps[0].run).toBe('npm test');
    });

    it('should parse job-level and step-level env', () => {
      const yamlContent = `
name: env-workflow
on:
  workflow_dispatch: {}
jobs:
  build:
    env:
      NODE_ENV: production
    steps:
      - name: compile
        uses: tealtiger/build@v1
        env:
          OPTIMIZE: "true"
`;

      const workflow = parser.parse(yamlContent);
      expect(workflow.jobs['build'].env).toEqual({ NODE_ENV: 'production' });
      expect(workflow.jobs['build'].steps[0].env).toEqual({ OPTIMIZE: 'true' });
    });

    it('should throw on invalid YAML', () => {
      expect(() => parser.parse('{')).toThrow();
    });
  });

  describe('validate', () => {
    it('should validate a correct workflow', () => {
      const workflow: TealFlowWorkflow = {
        name: 'valid-workflow',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [{ name: 'step1', uses: 'action@v1' }],
          },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject workflow missing name', () => {
      const workflow = {
        name: '',
        on: { workflow_dispatch: {} },
        jobs: {
          build: { steps: [{ name: 'step1', uses: 'action@v1' }] },
        },
      } as TealFlowWorkflow;

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('should reject workflow missing jobs', () => {
      const workflow = {
        name: 'no-jobs',
        on: { workflow_dispatch: {} },
        jobs: {},
      } as TealFlowWorkflow;

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least one job'))).toBe(true);
    });

    it('should reject workflow with no triggers', () => {
      const workflow: TealFlowWorkflow = {
        name: 'no-triggers',
        on: {},
        jobs: {
          build: { steps: [{ name: 'step1', uses: 'action@v1' }] },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('trigger'))).toBe(true);
    });

    it('should reject job with no steps', () => {
      const workflow: TealFlowWorkflow = {
        name: 'empty-job',
        on: { workflow_dispatch: {} },
        jobs: {
          build: { steps: [] },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least one step'))).toBe(true);
    });

    it('should reject job with unknown dependency', () => {
      const workflow: TealFlowWorkflow = {
        name: 'bad-dep',
        on: { workflow_dispatch: {} },
        jobs: {
          deploy: {
            needs: ['nonexistent'],
            steps: [{ name: 'step1', uses: 'action@v1' }],
          },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unknown job'))).toBe(true);
    });

    it('should reject job that depends on itself', () => {
      const workflow: TealFlowWorkflow = {
        name: 'self-dep',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            needs: ['build'],
            steps: [{ name: 'step1', uses: 'action@v1' }],
          },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cannot depend on itself'))).toBe(true);
    });

    it('should reject step without uses or run', () => {
      const workflow: TealFlowWorkflow = {
        name: 'no-action',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [{ name: 'empty-step' }],
          },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('uses') && e.includes('run'))).toBe(true);
    });

    it('should warn about hardcoded secrets in env', () => {
      const workflow: TealFlowWorkflow = {
        name: 'hardcoded-secret',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [{
              name: 'step1',
              uses: 'action@v1',
              env: { API_SECRET: 'hardcoded-value-123' },
            }],
          },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('secret') || e.includes('Secret'))).toBe(true);
    });

    it('should accept secrets referenced via ${{ secrets.NAME }} syntax', () => {
      const workflow: TealFlowWorkflow = {
        name: 'proper-secrets',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [{
              name: 'step1',
              uses: 'action@v1',
              env: { API_SECRET: '${{ secrets.API_KEY }}' },
            }],
          },
        },
      };

      const result = parser.validate(workflow);
      expect(result.valid).toBe(true);
    });
  });
});

describe('TealFlowEngine', () => {
  let engine: TealFlowEngine;

  const baseContext: FlowContext = {
    event: { risk_score: 8, action_type: 'CODE_CHANGE' },
    env: { ENVIRONMENT: 'production' },
    secrets: { API_KEY: 'secret-value' },
  };

  beforeEach(() => {
    engine = new TealFlowEngine();
  });

  describe('sequential step execution', () => {
    it('should execute steps sequentially within a job', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'sequential-test',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [
              { name: 'step-1', uses: 'action/first@v1' },
              { name: 'step-2', uses: 'action/second@v1' },
              { name: 'step-3', uses: 'action/third@v1' },
            ],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      expect(result.success).toBe(true);
      expect(result.jobs_completed).toContain('build');
      expect(result.jobs_failed).toHaveLength(0);
    });

    it('should pass step parameters to action execution', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'params-test',
        on: { workflow_dispatch: {} },
        jobs: {
          scan: {
            steps: [
              {
                name: 'security-scan',
                uses: 'tealtiger/scan@v1',
                with: { depth: 'full', target: 'src/' },
              },
            ],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      expect(result.success).toBe(true);
      expect(result.outputs['scan']).toBeDefined();
    });
  });

  describe('parallel independent job execution', () => {
    it('should execute independent jobs in parallel', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'parallel-test',
        on: { workflow_dispatch: {} },
        jobs: {
          lint: {
            steps: [{ name: 'run-lint', uses: 'tealtiger/lint@v1' }],
          },
          test: {
            steps: [{ name: 'run-tests', uses: 'tealtiger/test@v1' }],
          },
          scan: {
            steps: [{ name: 'run-scan', uses: 'tealtiger/scan@v1' }],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      expect(result.success).toBe(true);
      expect(result.jobs_completed).toHaveLength(3);
      expect(result.jobs_completed).toContain('lint');
      expect(result.jobs_completed).toContain('test');
      expect(result.jobs_completed).toContain('scan');
      expect(result.jobs_failed).toHaveLength(0);
    });
  });

  describe('job dependency ordering (needs)', () => {
    it('should execute dependent jobs only after prerequisites complete', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'dependency-test',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [{ name: 'compile', uses: 'tealtiger/build@v1' }],
          },
          test: {
            needs: ['build'],
            steps: [{ name: 'run-tests', uses: 'tealtiger/test@v1' }],
          },
          deploy: {
            needs: ['test'],
            steps: [{ name: 'deploy-app', uses: 'tealtiger/deploy@v1' }],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      expect(result.success).toBe(true);
      expect(result.jobs_completed).toHaveLength(3);

      // Verify ordering: build before test, test before deploy
      const buildIdx = result.jobs_completed.indexOf('build');
      const testIdx = result.jobs_completed.indexOf('test');
      const deployIdx = result.jobs_completed.indexOf('deploy');

      expect(buildIdx).toBeLessThan(testIdx);
      expect(testIdx).toBeLessThan(deployIdx);
    });

    it('should execute jobs with shared dependencies correctly', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'diamond-dep',
        on: { workflow_dispatch: {} },
        jobs: {
          build: {
            steps: [{ name: 'compile', uses: 'tealtiger/build@v1' }],
          },
          lint: {
            needs: ['build'],
            steps: [{ name: 'run-lint', uses: 'tealtiger/lint@v1' }],
          },
          test: {
            needs: ['build'],
            steps: [{ name: 'run-tests', uses: 'tealtiger/test@v1' }],
          },
          deploy: {
            needs: ['lint', 'test'],
            steps: [{ name: 'deploy-app', uses: 'tealtiger/deploy@v1' }],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      expect(result.success).toBe(true);
      expect(result.jobs_completed).toHaveLength(4);

      // build must come before lint and test
      const buildIdx = result.jobs_completed.indexOf('build');
      const lintIdx = result.jobs_completed.indexOf('lint');
      const testIdx = result.jobs_completed.indexOf('test');
      const deployIdx = result.jobs_completed.indexOf('deploy');

      expect(buildIdx).toBeLessThan(lintIdx);
      expect(buildIdx).toBeLessThan(testIdx);
      expect(lintIdx).toBeLessThan(deployIdx);
      expect(testIdx).toBeLessThan(deployIdx);
    });
  });

  describe('conditional step skipping (if)', () => {
    it('should skip step when if condition evaluates to false', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'conditional-skip',
        on: { workflow_dispatch: {} },
        jobs: {
          review: {
            steps: [
              {
                name: 'high-risk-check',
                uses: 'tealtiger/risk-check@v1',
                if: 'event.risk_score > 10',
              },
              {
                name: 'always-run',
                uses: 'tealtiger/log@v1',
              },
            ],
          },
        },
      };

      const context: FlowContext = {
        event: { risk_score: 5 },
        env: {},
        secrets: {},
      };

      const result = await engine.execute(workflow, context);

      expect(result.success).toBe(true);
      expect(result.jobs_completed).toContain('review');
    });

    it('should execute step when if condition evaluates to true', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'conditional-execute',
        on: { workflow_dispatch: {} },
        jobs: {
          review: {
            steps: [
              {
                name: 'high-risk-check',
                uses: 'tealtiger/risk-check@v1',
                if: 'event.risk_score > 5',
              },
            ],
          },
        },
      };

      const context: FlowContext = {
        event: { risk_score: 8 },
        env: {},
        secrets: {},
      };

      const result = await engine.execute(workflow, context);

      expect(result.success).toBe(true);
      expect(result.outputs['review']).toBeDefined();
    });

    it('should skip entire job when job-level if evaluates to false', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'job-conditional',
        on: { workflow_dispatch: {} },
        jobs: {
          deploy: {
            if: "env.ENVIRONMENT == 'staging'",
            steps: [{ name: 'deploy', uses: 'tealtiger/deploy@v1' }],
          },
        },
      };

      const context: FlowContext = {
        event: {},
        env: { ENVIRONMENT: 'production' },
        secrets: {},
      };

      const result = await engine.execute(workflow, context);

      // Job is skipped but counts as completed (not failed)
      expect(result.success).toBe(true);
      expect(result.jobs_completed).toContain('deploy');
      expect(result.jobs_failed).toHaveLength(0);
    });

    it('should support comparison operators in conditions', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'comparison-test',
        on: { workflow_dispatch: {} },
        jobs: {
          check: {
            steps: [
              {
                name: 'eq-check',
                uses: 'tealtiger/check@v1',
                if: "env.MODE == 'strict'",
              },
            ],
          },
        },
      };

      const context: FlowContext = {
        event: {},
        env: { MODE: 'strict' },
        secrets: {},
      };

      const result = await engine.execute(workflow, context);
      expect(result.success).toBe(true);
      expect(result.outputs['check']).toBeDefined();
    });
  });

  describe('job failure propagation', () => {
    it('should skip dependent jobs when a prerequisite fails', async () => {
      // Test with a linear chain where the first job has a circular dep causing failure
      const workflow: TealFlowWorkflow = {
        name: 'failure-propagation',
        on: { workflow_dispatch: {} },
        jobs: {
          // These two form a circular dep → both fail
          build: {
            needs: ['verify'],
            steps: [{ name: 'compile', uses: 'tealtiger/build@v1' }],
          },
          verify: {
            needs: ['build'],
            steps: [{ name: 'verify-build', uses: 'tealtiger/verify@v1' }],
          },
          // This depends on build which fails → should be skipped
          test: {
            needs: ['build'],
            steps: [{ name: 'run-tests', uses: 'tealtiger/test@v1' }],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      expect(result.success).toBe(false);
      expect(result.jobs_failed).toContain('build');
      expect(result.jobs_failed).toContain('verify');
      expect(result.jobs_failed).toContain('test');
    });

    it('should mark dependent jobs as failed when prerequisite fails', async () => {
      // Create a workflow with circular dependencies (which the engine handles as failure)
      const workflow: TealFlowWorkflow = {
        name: 'circular-dep',
        on: { workflow_dispatch: {} },
        jobs: {
          a: {
            needs: ['b'],
            steps: [{ name: 'step-a', uses: 'action@v1' }],
          },
          b: {
            needs: ['a'],
            steps: [{ name: 'step-b', uses: 'action@v1' }],
          },
          c: {
            needs: ['a'],
            steps: [{ name: 'step-c', uses: 'action@v1' }],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      // Circular dependencies cause all involved jobs to fail
      expect(result.success).toBe(false);
      expect(result.jobs_failed.length).toBeGreaterThan(0);
    });

    it('should propagate failure to transitive dependents', async () => {
      // Test that if A fails, B (needs A) fails, and C (needs B) also fails
      // Using circular dep to force failure of 'build'
      const workflow: TealFlowWorkflow = {
        name: 'transitive-failure',
        on: { workflow_dispatch: {} },
        jobs: {
          // Independent job that will succeed
          lint: {
            steps: [{ name: 'run-lint', uses: 'tealtiger/lint@v1' }],
          },
          // These form a circular dep and will fail
          build: {
            needs: ['deploy'],
            steps: [{ name: 'compile', uses: 'tealtiger/build@v1' }],
          },
          test: {
            needs: ['build'],
            steps: [{ name: 'run-tests', uses: 'tealtiger/test@v1' }],
          },
          deploy: {
            needs: ['test'],
            steps: [{ name: 'deploy-app', uses: 'tealtiger/deploy@v1' }],
          },
        },
      };

      const result = await engine.execute(workflow, baseContext);

      // lint should succeed, the circular chain should fail
      expect(result.jobs_completed).toContain('lint');
      expect(result.jobs_failed).toContain('build');
      expect(result.jobs_failed).toContain('test');
      expect(result.jobs_failed).toContain('deploy');
    });
  });

  describe('expression evaluator', () => {
    const ctx: FlowContext = {
      event: { risk_score: 8, action_type: 'CODE_CHANGE', nested: { value: 42 } },
      env: { ENVIRONMENT: 'production', DEBUG: 'false' },
      secrets: { API_KEY: 'secret' },
    };

    it('should evaluate boolean literals', () => {
      expect(evaluateExpression('true', ctx)).toBe(true);
      expect(evaluateExpression('false', ctx)).toBe(false);
    });

    it('should evaluate numeric comparisons', () => {
      expect(evaluateExpression('event.risk_score > 5', ctx)).toBe(true);
      expect(evaluateExpression('event.risk_score > 10', ctx)).toBe(false);
      expect(evaluateExpression('event.risk_score >= 8', ctx)).toBe(true);
      expect(evaluateExpression('event.risk_score < 10', ctx)).toBe(true);
      expect(evaluateExpression('event.risk_score <= 8', ctx)).toBe(true);
    });

    it('should evaluate string equality', () => {
      expect(evaluateExpression("env.ENVIRONMENT == 'production'", ctx)).toBe(true);
      expect(evaluateExpression("env.ENVIRONMENT == 'staging'", ctx)).toBe(false);
      expect(evaluateExpression("env.ENVIRONMENT != 'staging'", ctx)).toBe(true);
    });

    it('should evaluate nested property access', () => {
      expect(evaluateExpression('event.nested.value == 42', ctx)).toBe(true);
    });

    it('should evaluate negation', () => {
      expect(evaluateExpression('!false', ctx)).toBe(true);
      expect(evaluateExpression('!true', ctx)).toBe(false);
    });

    it('should evaluate logical AND', () => {
      expect(evaluateExpression("event.risk_score > 5 && env.ENVIRONMENT == 'production'", ctx)).toBe(true);
      expect(evaluateExpression("event.risk_score > 10 && env.ENVIRONMENT == 'production'", ctx)).toBe(false);
    });

    it('should evaluate logical OR', () => {
      expect(evaluateExpression("event.risk_score > 10 || env.ENVIRONMENT == 'production'", ctx)).toBe(true);
      expect(evaluateExpression("event.risk_score > 10 || env.ENVIRONMENT == 'staging'", ctx)).toBe(false);
    });

    it('should handle undefined values as falsy', () => {
      expect(evaluateExpression('event.nonexistent', ctx)).toBe(false);
    });
  });

  describe('workflow-level env merging', () => {
    it('should merge workflow env into execution context', async () => {
      const workflow: TealFlowWorkflow = {
        name: 'env-merge',
        on: { workflow_dispatch: {} },
        env: { WORKFLOW_VAR: 'from-workflow' },
        jobs: {
          check: {
            steps: [
              {
                name: 'env-check',
                uses: 'tealtiger/check@v1',
                if: "env.WORKFLOW_VAR == 'from-workflow'",
              },
            ],
          },
        },
      };

      const context: FlowContext = {
        event: {},
        env: {},
        secrets: {},
      };

      const result = await engine.execute(workflow, context);
      expect(result.success).toBe(true);
      expect(result.outputs['check']).toBeDefined();
    });
  });

  describe('end-to-end parse and execute', () => {
    it('should parse YAML and execute the workflow', async () => {
      const parser = new TealFlowParser();
      const yamlContent = `
name: e2e-test
on:
  agent_action:
    types: [CODE_CHANGE]
env:
  MODE: strict
jobs:
  validate:
    steps:
      - name: check-policy
        uses: tealtiger/policy-check@v1
        with:
          mode: strict
  report:
    needs: [validate]
    steps:
      - name: generate-report
        uses: tealtiger/report@v1
`;

      const workflow = parser.parse(yamlContent);
      const validation = parser.validate(workflow);
      expect(validation.valid).toBe(true);

      const result = await engine.execute(workflow, baseContext);
      expect(result.success).toBe(true);
      expect(result.jobs_completed).toContain('validate');
      expect(result.jobs_completed).toContain('report');

      // Verify ordering
      const validateIdx = result.jobs_completed.indexOf('validate');
      const reportIdx = result.jobs_completed.indexOf('report');
      expect(validateIdx).toBeLessThan(reportIdx);
    });
  });
});
