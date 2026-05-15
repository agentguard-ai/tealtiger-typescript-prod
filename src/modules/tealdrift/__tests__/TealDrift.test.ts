/**
 * TealDrift Module — Unit Tests
 *
 * Tests behavioral drift detection including:
 * - Baseline establishment with sufficient samples
 * - Drift detection beyond threshold
 * - min_samples guard (no alerting before threshold)
 * - Rolling stats accuracy
 *
 * @requirements 9.20, 9.21
 */

import { TealDriftModule } from '../TealDrift';
import type { DriftObservation } from '../../../core/engine/v1.3/module-types';

describe('TealDriftModule', () => {
  let module: TealDriftModule;

  beforeEach(() => {
    module = new TealDriftModule({
      baseline_window: 100,
      threshold_sigma: 3,
      min_samples: 50,
    });
  });

  describe('constructor and initialization', () => {
    it('should create with default config', () => {
      const defaultModule = new TealDriftModule();
      expect(defaultModule.name).toBe('TealDrift');
      expect(defaultModule.version).toBe('1.3.0');
    });

    it('should accept partial config overrides', () => {
      const customModule = new TealDriftModule({ threshold_sigma: 2 });
      expect(customModule.name).toBe('TealDrift');
    });
  });

  describe('updateBaseline', () => {
    it('should create a new baseline for unseen agent/provider/model', () => {
      const obs: DriftObservation = {
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding'],
      };

      module.updateBaseline(obs);
      const baseline = module.getBaseline('agent-1', 'openai', 'gpt-4');

      expect(baseline).toBeDefined();
      expect(baseline!.agent_id).toBe('agent-1');
      expect(baseline!.provider).toBe('openai');
      expect(baseline!.model).toBe('gpt-4');
      expect(baseline!.sample_count).toBe(1);
    });

    it('should increment sample count on each update', () => {
      const obs: DriftObservation = {
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding'],
      };

      module.updateBaseline(obs);
      module.updateBaseline(obs);
      module.updateBaseline(obs);

      const baseline = module.getBaseline('agent-1', 'openai', 'gpt-4');
      expect(baseline!.sample_count).toBe(3);
    });

    it('should track refusal rate as running average', () => {
      // 3 non-refusals, 1 refusal → mean should be 0.25
      for (let i = 0; i < 3; i++) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: 500,
          topics: ['coding'],
        });
      }
      module.updateBaseline({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: true,
        response_length: 500,
        topics: ['coding'],
      });

      const baseline = module.getBaseline('agent-1', 'openai', 'gpt-4');
      expect(baseline!.metrics.refusal_rate.mean).toBeCloseTo(0.25);
      expect(baseline!.metrics.refusal_rate.count).toBe(4);
    });

    it('should track response length mean and variance', () => {
      const lengths = [100, 200, 300, 400, 500];
      for (const len of lengths) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: len,
          topics: ['coding'],
        });
      }

      const baseline = module.getBaseline('agent-1', 'openai', 'gpt-4');
      expect(baseline!.metrics.response_length.mean).toBeCloseTo(300);
      expect(baseline!.metrics.response_length.count).toBe(5);
      expect(baseline!.metrics.response_length.variance).toBeGreaterThan(0);
    });

    it('should track topic distribution', () => {
      module.updateBaseline({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding', 'math'],
      });
      module.updateBaseline({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding'],
      });

      const baseline = module.getBaseline('agent-1', 'openai', 'gpt-4');
      expect(baseline!.metrics.topic_distribution.get('coding')).toBe(2);
      expect(baseline!.metrics.topic_distribution.get('math')).toBe(1);
    });
  });

  describe('checkDrift', () => {
    it('should return null when no baseline exists', () => {
      const obs: DriftObservation = {
        agent_id: 'unknown-agent',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding'],
      };

      const result = module.checkDrift(obs);
      expect(result).toBeNull();
    });

    it('should return null when sample count is below min_samples', () => {
      // Add 10 samples (below min_samples of 50)
      for (let i = 0; i < 10; i++) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: 500,
          topics: ['coding'],
        });
      }

      const result = module.checkDrift({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: true,
        response_length: 99999,
        topics: ['unknown'],
      });

      expect(result).toBeNull();
    });

    it('should detect response_length drift beyond threshold', () => {
      // Establish baseline with consistent response lengths around 500
      for (let i = 0; i < 60; i++) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: 500 + (Math.random() * 20 - 10), // 490-510
          topics: ['coding'],
        });
      }

      // Check with extreme deviation
      const result = module.checkDrift({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 50000, // Way beyond normal
        topics: ['coding'],
      });

      expect(result).not.toBeNull();
      expect(result!.drifted).toBe(true);
      expect(result!.metric).toBe('response_length');
      expect(result!.deviation_sigma).toBeGreaterThan(3);
    });

    it('should not flag drift when within normal range', () => {
      // Establish baseline with response lengths around 500 with some variance
      for (let i = 0; i < 60; i++) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: 500 + (i % 10) * 10, // 500-590
          topics: ['coding'],
        });
      }

      // Check with value within normal range
      const result = module.checkDrift({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 550,
        topics: ['coding'],
      });

      expect(result).toBeNull();
    });

    it('should detect topic distribution drift with all unseen topics', () => {
      // Establish baseline with known topics
      for (let i = 0; i < 60; i++) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: 500,
          topics: ['coding', 'math'],
        });
      }

      // Check with completely unseen topics
      const result = module.checkDrift({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['weapons', 'hacking'],
      });

      expect(result).not.toBeNull();
      expect(result!.drifted).toBe(true);
      expect(result!.metric).toBe('topic_distribution');
    });
  });

  describe('getBaseline', () => {
    it('should return undefined for unknown agent', () => {
      expect(module.getBaseline('nonexistent')).toBeUndefined();
    });

    it('should find baseline by agent_id alone', () => {
      module.updateBaseline({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding'],
      });

      const baseline = module.getBaseline('agent-1');
      expect(baseline).toBeDefined();
      expect(baseline!.agent_id).toBe('agent-1');
    });
  });

  describe('evaluate (TealModule interface)', () => {
    it('should return ALLOW when no drift observation provided', async () => {
      const result = await module.evaluate(
        { content: 'test' },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: Date.now(),
        },
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toHaveLength(0);
    });

    it('should return DENY with BEHAVIORAL_DRIFT_DETECTED when drift detected', async () => {
      // Build up baseline
      for (let i = 0; i < 60; i++) {
        module.updateBaseline({
          agent_id: 'agent-1',
          provider: 'openai',
          model: 'gpt-4',
          refusal: false,
          response_length: 500 + (Math.random() * 10 - 5),
          topics: ['coding'],
        });
      }

      const result = await module.evaluate(
        {
          drift_observation: {
            agent_id: 'agent-1',
            provider: 'openai',
            model: 'gpt-4',
            refusal: false,
            response_length: 99999,
            topics: ['coding'],
          },
        },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: Date.now(),
        },
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('BEHAVIORAL_DRIFT_DETECTED');
    });
  });

  describe('destroy', () => {
    it('should clear all baselines', async () => {
      module.updateBaseline({
        agent_id: 'agent-1',
        provider: 'openai',
        model: 'gpt-4',
        refusal: false,
        response_length: 500,
        topics: ['coding'],
      });

      await module.destroy();
      expect(module.getBaseline('agent-1')).toBeUndefined();
    });
  });
});
