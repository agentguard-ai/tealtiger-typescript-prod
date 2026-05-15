/**
 * Governance Cost Enforcer & Anomaly Detection Tests
 *
 * Tests for TealMonitor v2 cost governance enhancements:
 * - GovernanceCostEnforcer: governance-owned cost limits
 * - CostAnomalyDetector: anomaly and spike detection
 *
 * @requirements 17.1–17.4, 17.8–17.13
 */

import { GovernanceCostEnforcer } from '../governance-cost';
import { CostAnomalyDetector } from '../anomaly-detection';
import { CostGovernanceConfig } from '../../core/engine/v1.3/module-types';

describe('GovernanceCostEnforcer', () => {
  const defaultConfig: CostGovernanceConfig = {
    governance_limits: {
      per_request_max: 1.0,
      per_session_max: 10.0,
      per_daily_max: 100.0,
      per_agent_max: 500.0,
      reasoning_token_budget: 50000,
    },
    anomaly: {
      baseline_window: 100,
      spike_multiplier: 10,
      growth_rate_threshold: 0.5,
    },
    attribution: {
      emit_format: 'json',
      include_agent_id: true,
      include_workflow_id: true,
    },
  };

  let enforcer: GovernanceCostEnforcer;

  beforeEach(() => {
    enforcer = new GovernanceCostEnforcer(defaultConfig);
  });

  describe('Per-request budget enforcement', () => {
    it('should allow requests within per-request limit', () => {
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.5,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining_budget).toBeGreaterThan(0);
    });

    it('should deny requests exceeding per-request limit', () => {
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 1.5,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('COST_BUDGET_EXCEEDED');
      expect(result.remaining_budget).toBe(1.0);
    });

    it('should deny requests exactly at per-request limit boundary', () => {
      // Cost > limit should be denied
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 1.01,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('COST_BUDGET_EXCEEDED');
    });

    it('should allow requests exactly at per-request limit', () => {
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 1.0,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Per-session budget enforcement', () => {
    it('should allow requests within session budget', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 3.0, session_id: 'session-1' });

      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.5,
        session_id: 'session-1',
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny requests that would exceed session budget', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 9.5, session_id: 'session-1' });

      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.8,
        session_id: 'session-1',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('COST_BUDGET_EXCEEDED');
      expect(result.remaining_budget).toBe(0.5);
    });

    it('should track sessions independently', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 9.0, session_id: 'session-1' });

      // Different session should have full budget
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.5,
        session_id: 'session-2',
      });

      expect(result.allowed).toBe(true);
    });

    it('should not check session limit when no session_id provided', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 9.5, session_id: 'session-1' });

      // Without session_id, session limit is not checked
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.5,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Per-daily budget enforcement', () => {
    it('should allow requests within daily budget', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 50.0 });

      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.5,
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny requests that would exceed daily budget', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 99.5 });

      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.8,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('COST_BUDGET_EXCEEDED');
      expect(result.remaining_budget).toBe(0.5);
    });

    it('should aggregate daily costs across all agents', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 60.0 });
      enforcer.recordCost({ agent_id: 'agent-2', cost: 39.5 });

      const result = enforcer.checkBudget({
        agent_id: 'agent-3',
        estimated_cost: 0.8,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('COST_BUDGET_EXCEEDED');
    });
  });

  describe('Per-agent budget enforcement', () => {
    it('should allow requests within agent budget', () => {
      // Use a config with high daily limit so agent limit is the binding constraint
      const agentConfig: CostGovernanceConfig = {
        governance_limits: {
          per_request_max: 1.0,
          per_session_max: 10.0,
          per_daily_max: 10000.0, // High daily limit
          per_agent_max: 500.0,
        },
        anomaly: { baseline_window: 100, spike_multiplier: 10, growth_rate_threshold: 0.5 },
        attribution: { emit_format: 'json', include_agent_id: true, include_workflow_id: true },
      };
      const agentEnforcer = new GovernanceCostEnforcer(agentConfig);

      agentEnforcer.recordCost({ agent_id: 'agent-1', cost: 200.0 });

      const result = agentEnforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.5,
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny requests that would exceed agent budget', () => {
      const agentConfig: CostGovernanceConfig = {
        governance_limits: {
          per_request_max: 1.0,
          per_session_max: 10.0,
          per_daily_max: 10000.0, // High daily limit
          per_agent_max: 500.0,
        },
        anomaly: { baseline_window: 100, spike_multiplier: 10, growth_rate_threshold: 0.5 },
        attribution: { emit_format: 'json', include_agent_id: true, include_workflow_id: true },
      };
      const agentEnforcer = new GovernanceCostEnforcer(agentConfig);

      agentEnforcer.recordCost({ agent_id: 'agent-1', cost: 499.5 });

      const result = agentEnforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.8,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('COST_BUDGET_EXCEEDED');
      expect(result.remaining_budget).toBe(0.5);
    });

    it('should track agents independently', () => {
      const agentConfig: CostGovernanceConfig = {
        governance_limits: {
          per_request_max: 1.0,
          per_session_max: 10.0,
          per_daily_max: 10000.0, // High daily limit
          per_agent_max: 500.0,
        },
        anomaly: { baseline_window: 100, spike_multiplier: 10, growth_rate_threshold: 0.5 },
        attribution: { emit_format: 'json', include_agent_id: true, include_workflow_id: true },
      };
      const agentEnforcer = new GovernanceCostEnforcer(agentConfig);

      agentEnforcer.recordCost({ agent_id: 'agent-1', cost: 499.5 });

      // Different agent should have full budget
      const result = agentEnforcer.checkBudget({
        agent_id: 'agent-2',
        estimated_cost: 0.5,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Reasoning token budget enforcement', () => {
    it('should allow requests within reasoning token budget', () => {
      enforcer.recordCost({
        agent_id: 'agent-1',
        cost: 0.1,
        session_id: 'session-1',
        reasoning_tokens: 10000,
      });

      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.1,
        session_id: 'session-1',
        reasoning_tokens: 5000,
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny requests that would exceed reasoning token budget', () => {
      enforcer.recordCost({
        agent_id: 'agent-1',
        cost: 0.1,
        session_id: 'session-1',
        reasoning_tokens: 45000,
      });

      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.1,
        session_id: 'session-1',
        reasoning_tokens: 6000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('REASONING_TOKEN_BUDGET_EXCEEDED');
      expect(result.remaining_budget).toBe(5000);
    });

    it('should not check reasoning tokens when not provided in request', () => {
      enforcer.recordCost({
        agent_id: 'agent-1',
        cost: 0.1,
        session_id: 'session-1',
        reasoning_tokens: 49000,
      });

      // No reasoning_tokens in check — should not trigger reasoning limit
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.1,
        session_id: 'session-1',
      });

      expect(result.allowed).toBe(true);
    });

    it('should track reasoning tokens by session when session_id provided', () => {
      enforcer.recordCost({
        agent_id: 'agent-1',
        cost: 0.1,
        session_id: 'session-1',
        reasoning_tokens: 45000,
      });

      // Different session should have full reasoning budget
      const result = enforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 0.1,
        session_id: 'session-2',
        reasoning_tokens: 6000,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Governance limits override application limits', () => {
    it('should enforce governance ceiling when app limit is higher', () => {
      const appLimit = 200.0; // App wants $200
      const governanceLimit = 100.0; // Governance says $100

      const effective = enforcer.enforceFloor(appLimit, governanceLimit);

      expect(effective).toBe(100.0); // Governance wins
    });

    it('should use app limit when it is lower than governance ceiling', () => {
      const appLimit = 50.0; // App wants $50
      const governanceLimit = 100.0; // Governance allows up to $100

      const effective = enforcer.enforceFloor(appLimit, governanceLimit);

      expect(effective).toBe(50.0); // App's stricter limit applies
    });

    it('should not allow application code to raise limits above governance ceiling', () => {
      const governanceLimit = 100.0;

      // Simulate multiple attempts to raise limits
      const attempts = [150, 200, 500, 1000];
      for (const appLimit of attempts) {
        const effective = enforcer.enforceFloor(appLimit, governanceLimit);
        expect(effective).toBeLessThanOrEqual(governanceLimit);
      }
    });

    it('should allow everything when no governance limits configured', () => {
      const noLimitsConfig: CostGovernanceConfig = {
        anomaly: {
          baseline_window: 100,
          spike_multiplier: 10,
          growth_rate_threshold: 0.5,
        },
        attribution: {
          emit_format: 'json',
          include_agent_id: true,
          include_workflow_id: true,
        },
      };

      const noLimitsEnforcer = new GovernanceCostEnforcer(noLimitsConfig);
      const result = noLimitsEnforcer.checkBudget({
        agent_id: 'agent-1',
        estimated_cost: 999999,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining_budget).toBe(Infinity);
    });
  });

  describe('Cost tracking helpers', () => {
    it('should track agent costs correctly', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 5.0 });
      enforcer.recordCost({ agent_id: 'agent-1', cost: 3.0 });

      expect(enforcer.getAgentCost('agent-1')).toBe(8.0);
      expect(enforcer.getAgentCost('agent-2')).toBe(0);
    });

    it('should track session costs correctly', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 2.0, session_id: 'sess-1' });
      enforcer.recordCost({ agent_id: 'agent-1', cost: 3.0, session_id: 'sess-1' });

      expect(enforcer.getSessionCost('sess-1')).toBe(5.0);
      expect(enforcer.getSessionCost('sess-2')).toBe(0);
    });

    it('should track daily costs correctly', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 10.0 });
      enforcer.recordCost({ agent_id: 'agent-2', cost: 20.0 });

      expect(enforcer.getDailyCost()).toBe(30.0);
    });

    it('should reset all tracked costs', () => {
      enforcer.recordCost({ agent_id: 'agent-1', cost: 10.0, session_id: 'sess-1' });

      enforcer.reset();

      expect(enforcer.getAgentCost('agent-1')).toBe(0);
      expect(enforcer.getSessionCost('sess-1')).toBe(0);
      expect(enforcer.getDailyCost()).toBe(0);
    });
  });
});

describe('CostAnomalyDetector', () => {
  const defaultConfig = {
    baseline_window: 100,
    spike_multiplier: 10,
    growth_rate_threshold: 0.5,
  };

  let detector: CostAnomalyDetector;

  beforeEach(() => {
    detector = new CostAnomalyDetector(defaultConfig);
  });

  describe('Anomaly detection with spike multiplier', () => {
    it('should not flag anomaly when baseline is empty', () => {
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 100.0,
      });

      expect(result.anomaly).toBe(false);
    });

    it('should not flag anomaly when cost is within normal range', () => {
      // Build baseline with costs around $0.05
      for (let i = 0; i < 10; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.05,
        });
      }

      // Request at $0.10 (2x baseline) should not trigger (threshold is 10x)
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.10,
      });

      expect(result.anomaly).toBe(false);
    });

    it('should flag anomaly when cost exceeds spike multiplier of baseline', () => {
      // Build baseline with costs around $0.05
      for (let i = 0; i < 10; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.05,
        });
      }

      // Request at $0.60 (12x baseline of $0.05) should trigger
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.60,
      });

      expect(result.anomaly).toBe(true);
      expect(result.alert_type).toBe('single_request_anomaly');
      expect(result.reason_code).toBe('COST_ANOMALY_DETECTED');
    });

    it('should use configurable spike multiplier', () => {
      const strictDetector = new CostAnomalyDetector({
        baseline_window: 100,
        spike_multiplier: 3, // Much stricter: 3x triggers
        growth_rate_threshold: 0.5,
      });

      // Build baseline
      for (let i = 0; i < 10; i++) {
        strictDetector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 1.0,
        });
      }

      // 4x baseline should trigger with 3x multiplier
      const result = strictDetector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 4.0,
      });

      expect(result.anomaly).toBe(true);
      expect(result.reason_code).toBe('COST_ANOMALY_DETECTED');
    });

    it('should track baselines per agent/provider independently', () => {
      // Build baseline for agent-1/openai at $0.05
      for (let i = 0; i < 10; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.05,
        });
      }

      // Build baseline for agent-1/anthropic at $1.00
      for (let i = 0; i < 10; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'anthropic',
          cost: 1.0,
        });
      }

      // $0.60 is anomalous for openai (12x) but not for anthropic (0.6x)
      const openaiResult = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.60,
      });

      const anthropicResult = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'anthropic',
        cost: 0.60,
      });

      expect(openaiResult.anomaly).toBe(true);
      expect(anthropicResult.anomaly).toBe(false);
    });

    it('should maintain rolling window and evict old entries', () => {
      const smallWindowDetector = new CostAnomalyDetector({
        baseline_window: 5,
        spike_multiplier: 10,
        growth_rate_threshold: 0.5,
      });

      // Fill window with low costs
      for (let i = 0; i < 5; i++) {
        smallWindowDetector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.01,
        });
      }

      // Now add higher costs to shift the baseline up
      for (let i = 0; i < 5; i++) {
        smallWindowDetector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 1.0,
        });
      }

      // After window eviction, baseline should be ~$1.0
      // $5.0 is only 5x, should NOT trigger with 10x multiplier
      const result = smallWindowDetector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 5.0,
      });

      expect(result.anomaly).toBe(false);
    });
  });

  describe('Cost spike detection with growth rate', () => {
    it('should not flag spike on first session cost report', () => {
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 5.0,
      });

      expect(result.anomaly).toBe(false);
    });

    it('should flag spike when session cost growth rate exceeds threshold', () => {
      // First report: session total = $10
      detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 10.0,
      });

      // Second report: session total = $20 (100% growth, threshold is 50%)
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 20.0,
      });

      expect(result.anomaly).toBe(true);
      expect(result.alert_type).toBe('session_cost_spike');
      expect(result.reason_code).toBe('COST_SPIKE_DETECTED');
    });

    it('should not flag spike when growth rate is below threshold', () => {
      // First report: session total = $10
      detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 10.0,
      });

      // Second report: session total = $12 (20% growth, threshold is 50%)
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 12.0,
      });

      expect(result.anomaly).toBe(false);
    });

    it('should use configurable growth rate threshold', () => {
      const sensitiveDetector = new CostAnomalyDetector({
        baseline_window: 100,
        spike_multiplier: 10,
        growth_rate_threshold: 0.1, // Very sensitive: 10% growth triggers
      });

      // First report
      sensitiveDetector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 10.0,
      });

      // Second report: 15% growth should trigger with 10% threshold
      const result = sensitiveDetector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 0.05,
        session_cost_total: 11.5,
      });

      expect(result.anomaly).toBe(true);
      expect(result.reason_code).toBe('COST_SPIKE_DETECTED');
    });

    it('should prioritize single-request anomaly over session spike', () => {
      // Build baseline at $0.05
      for (let i = 0; i < 10; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.05,
          session_cost_total: 0.05 * (i + 1),
        });
      }

      // Both anomaly conditions met: cost is 20x baseline AND session growth is huge
      const result = detector.checkAnomaly({
        agent_id: 'agent-1',
        provider: 'openai',
        cost: 1.0, // 20x baseline
        session_cost_total: 100.0, // massive growth
      });

      // Single-request anomaly is checked first
      expect(result.anomaly).toBe(true);
      expect(result.reason_code).toBe('COST_ANOMALY_DETECTED');
    });
  });

  describe('Baseline management', () => {
    it('should report baseline mean correctly', () => {
      for (let i = 0; i < 5; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.10,
        });
      }

      const mean = detector.getBaselineMean('agent-1', 'openai');
      expect(mean).toBeCloseTo(0.10);
    });

    it('should report baseline size correctly', () => {
      for (let i = 0; i < 7; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.05,
        });
      }

      expect(detector.getBaselineSize('agent-1', 'openai')).toBe(7);
    });

    it('should return undefined mean for unknown agent/provider', () => {
      expect(detector.getBaselineMean('unknown', 'unknown')).toBeUndefined();
    });

    it('should reset all state', () => {
      for (let i = 0; i < 5; i++) {
        detector.checkAnomaly({
          agent_id: 'agent-1',
          provider: 'openai',
          cost: 0.05,
        });
      }

      detector.reset();

      expect(detector.getBaselineSize('agent-1', 'openai')).toBe(0);
      expect(detector.getBaselineMean('agent-1', 'openai')).toBeUndefined();
    });
  });
});
