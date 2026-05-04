/**
 * GovernanceDashboard Tests
 *
 * Validates the read-only governance visibility dashboard:
 * - getSnapshot returns valid structure
 * - getControlsByDimension groups correctly
 * - getTEECCoverage returns correct counts
 * - recordDecision increments stats correctly
 * - Dashboard is read-only (no mutation methods)
 * - Works without engine (standalone mode with defaults)
 */

import { GovernanceDashboard } from '../GovernanceDashboard';
import { IMPLEMENTED_CONTROLS, PLANNED_CONTROLS } from '../controls';
import { TealEngineV12 } from '../../core/engine/v1.2/TealEngineV12';
import { DecisionAction, PolicyMode, ReasonCode } from '../../core/engine/types';
import type { Decision } from '../../core/engine/types';

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    action: DecisionAction.ALLOW,
    reason_codes: [ReasonCode.POLICY_COMPLIANT],
    risk_score: 0,
    mode: PolicyMode.ENFORCE,
    policy_id: 'test',
    policy_version: '1.2.0',
    component_versions: { sdk: '1.2.0', engine: '1.2.0' },
    correlation_id: 'test-corr-id',
    reason: 'test',
    ...overrides,
  };
}

describe('GovernanceDashboard', () => {
  describe('standalone mode (no engine)', () => {
    it('getSnapshot returns valid structure', () => {
      const dashboard = new GovernanceDashboard();
      const snapshot = dashboard.getSnapshot();

      expect(snapshot.bundle_version).toBe('1.2.0');
      expect(snapshot.teec_version).toBe('0.1.0');
      expect(snapshot.modules).toEqual({});
      expect(snapshot.controls.implemented).toHaveLength(IMPLEMENTED_CONTROLS.length);
      expect(snapshot.controls.planned).toHaveLength(PLANNED_CONTROLS.length);
      expect(snapshot.teec_coverage).toBeDefined();
      expect(snapshot.decision_stats).toBeDefined();
      expect(typeof snapshot.timestamp).toBe('number');
    });

    it('getTEECCoverage returns correct defaults', () => {
      const dashboard = new GovernanceDashboard();
      const coverage = dashboard.getTEECCoverage();

      expect(coverage.reason_codes).toBe(32);
      expect(coverage.event_types).toBe(18);
      expect(coverage.decision_actions).toBe(11);
      expect(coverage.version).toBe('0.1.0');
    });

    it('getModuleStatus returns empty when no engine', () => {
      const dashboard = new GovernanceDashboard();
      expect(dashboard.getModuleStatus()).toEqual({});
    });

    it('getDecisionStats returns zeroed stats initially', () => {
      const dashboard = new GovernanceDashboard();
      const stats = dashboard.getDecisionStats();

      expect(stats.total).toBe(0);
      expect(stats.by_action).toEqual({});
      expect(stats.by_reason_code).toEqual({});
    });
  });

  describe('with engine', () => {
    it('getTEECCoverage reads from engine TEEC registry', () => {
      const engine = new TealEngineV12({ policy: {} });
      const dashboard = new GovernanceDashboard(engine);
      const coverage = dashboard.getTEECCoverage();

      expect(coverage.reason_codes).toBeGreaterThanOrEqual(32);
      expect(coverage.event_types).toBe(18);
      expect(coverage.decision_actions).toBeGreaterThanOrEqual(11);
      expect(coverage.version).toBe('0.1.0');
    });

    it('getModuleStatus reflects engine module state', () => {
      const engine = new TealEngineV12({ policy: {} });
      const dashboard = new GovernanceDashboard(engine);
      // No modules registered → empty
      expect(Object.keys(dashboard.getModuleStatus())).toHaveLength(0);
    });
  });

  describe('getControlsByDimension', () => {
    it('groups controls by all 6 dimensions', () => {
      const dashboard = new GovernanceDashboard();
      const grouped = dashboard.getControlsByDimension();

      expect(grouped['SEC']).toBeDefined();
      expect(grouped['MEM']).toBeDefined();
      expect(grouped['REL']).toBeDefined();
      expect(grouped['EVID']).toBeDefined();
      expect(grouped['REG']).toBeDefined();
      expect(grouped['COST']).toBeDefined();
    });

    it('SEC dimension has correct count', () => {
      const dashboard = new GovernanceDashboard();
      const grouped = dashboard.getControlsByDimension();
      // 10 implemented + 2 planned
      expect(grouped['SEC'].length).toBe(12);
    });

    it('all controls have required fields', () => {
      const dashboard = new GovernanceDashboard();
      const grouped = dashboard.getControlsByDimension();

      for (const [dim, controls] of Object.entries(grouped)) {
        for (const ctrl of controls) {
          expect(ctrl.control_id).toBeTruthy();
          expect(ctrl.dimension).toBe(dim);
          expect(['planned', 'alpha', 'beta', 'stable']).toContain(ctrl.maturity);
          expect(ctrl.module).toBeTruthy();
          expect(['implemented', 'planned']).toContain(ctrl.status);
        }
      }
    });
  });

  describe('recordDecision', () => {
    it('increments total count', () => {
      const dashboard = new GovernanceDashboard();
      dashboard.recordDecision(makeDecision());
      dashboard.recordDecision(makeDecision());

      expect(dashboard.getDecisionStats().total).toBe(2);
    });

    it('tracks by_action correctly', () => {
      const dashboard = new GovernanceDashboard();
      dashboard.recordDecision(makeDecision({ action: DecisionAction.ALLOW }));
      dashboard.recordDecision(makeDecision({ action: DecisionAction.DENY }));
      dashboard.recordDecision(makeDecision({ action: DecisionAction.DENY }));

      const stats = dashboard.getDecisionStats();
      expect(stats.by_action['ALLOW']).toBe(1);
      expect(stats.by_action['DENY']).toBe(2);
    });

    it('tracks by_reason_code correctly', () => {
      const dashboard = new GovernanceDashboard();
      dashboard.recordDecision(
        makeDecision({ reason_codes: [ReasonCode.POLICY_COMPLIANT] }),
      );
      dashboard.recordDecision(
        makeDecision({
          reason_codes: [ReasonCode.SECRET_DETECTED, ReasonCode.CREDENTIAL_LEAKAGE],
        }),
      );

      const stats = dashboard.getDecisionStats();
      expect(stats.by_reason_code['POLICY_COMPLIANT']).toBe(1);
      expect(stats.by_reason_code['SECRET_DETECTED']).toBe(1);
      expect(stats.by_reason_code['CREDENTIAL_LEAKAGE']).toBe(1);
    });
  });

  describe('read-only invariant', () => {
    it('has no mutation methods on the prototype', () => {
      const dashboard = new GovernanceDashboard();
      const proto = Object.getOwnPropertyNames(
        Object.getPrototypeOf(dashboard),
      );

      // Only allowed methods: constructor + read methods + recordDecision
      const allowedMethods = [
        'constructor',
        'getSnapshot',
        'getControlsByDimension',
        'getTEECCoverage',
        'getModuleStatus',
        'getDecisionStats',
        'recordDecision',
      ];

      for (const method of proto) {
        expect(allowedMethods).toContain(method);
      }
    });

    it('getSnapshot returns copies, not references', () => {
      const dashboard = new GovernanceDashboard();
      const snap1 = dashboard.getSnapshot();
      const snap2 = dashboard.getSnapshot();

      expect(snap1.controls.implemented).not.toBe(snap2.controls.implemented);
      expect(snap1.controls.planned).not.toBe(snap2.controls.planned);
    });

    it('getDecisionStats returns a copy', () => {
      const dashboard = new GovernanceDashboard();
      dashboard.recordDecision(makeDecision());
      const stats1 = dashboard.getDecisionStats();
      stats1.total = 999;
      expect(dashboard.getDecisionStats().total).toBe(1);
    });
  });

  describe('control catalog', () => {
    it('has 38 implemented controls', () => {
      expect(IMPLEMENTED_CONTROLS).toHaveLength(38);
    });

    it('all implemented controls have status "implemented"', () => {
      for (const ctrl of IMPLEMENTED_CONTROLS) {
        expect(ctrl.status).toBe('implemented');
      }
    });

    it('all planned controls have status "planned"', () => {
      for (const ctrl of PLANNED_CONTROLS) {
        expect(ctrl.status).toBe('planned');
      }
    });
  });
});
