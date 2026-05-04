/**
 * v1.2 Integration Tests — Cross-Module Interactions
 *
 * Tests the full governance pipeline with real module instances (no mocks):
 * 1. TealSecrets DENY + TealRegistry ALLOW → merged DENY
 * 2. TealSecrets ALLOW + TealRegistry DENY → merged DENY
 * 3. Both ALLOW → merged ALLOW
 * 4. TealMemory write with secret → DENY_WRITE
 * 5. Fail-closed: module crash → DENY
 * 6. Lazy init: modules init'd only on first call
 * 7. Dashboard tracks decisions after evaluateV12
 */

import { TealEngineV12 } from '../core/engine/v1.2/TealEngineV12';
import { TealSecrets } from '../secrets/TealSecrets';
import { TealRegistry } from '../registry/TealRegistry';
import { TealMemory } from '../memory/TealMemory';
import { LocalMemoryAdapter } from '../memory/LocalMemoryAdapter';
import { GovernanceDashboard } from '../dashboard/GovernanceDashboard';
import type { TealModule, ModuleResult } from '../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

function makeCtx(overrides: Partial<{ correlation_id: string }> = {}) {
  return { correlation_id: overrides.correlation_id ?? 'int-test-001' };
}

/** A module that always crashes to test fail-closed */
class CrashingModule implements TealModule {
  readonly name = 'CrashingModule';
  readonly version = '0.0.1';
  async evaluate(): Promise<ModuleResult> {
    throw new Error('Module crashed!');
  }
}

// ── Test Suite ───────────────────────────────────────────────────

describe('v1.2 Integration Tests', () => {
  describe('cross-module merge: TealSecrets + TealRegistry', () => {
    const registryWithModel = new TealRegistry({
      entries: [
        {
          id: 'gpt-4',
          catalog: 'models',
          version: '1.0.0',
          hash: 'abc123',
          metadata: {},
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      supply_chain: { block_below: false },
    });

    // Use module names as policy keys so getRequiredModules finds them
    // via the "module name appears directly as a key" path.
    it('secret content + valid model → DENY (secrets wins)', async () => {
      const secrets = new TealSecrets();
      const engine = new TealEngineV12({
        modules: [secrets, registryWithModel],
        policy: {
          TealSecrets: {
            enabled: true,
            action: 'DENY',
            confidence_threshold: 0.1,
            perfBudgetMs: 5000,
          },
          TealRegistry: {},
        },
      });

      const decision = await engine.evaluateV12(
        { content: 'AKIAIOSFODNN7EXAMPLE', model: 'gpt-4' },
        makeCtx(),
      );

      // TealSecrets should DENY, TealRegistry should ALLOW → merged = DENY
      expect(decision.action).toBe('DENY');
      expect(decision.reason_codes.some(
        (c: string) => c === 'SECRET_DETECTED' || c === 'CREDENTIAL_LEAKAGE',
      )).toBe(true);
    });

    it('clean content + invalid model → DENY (registry wins)', async () => {
      const secrets = new TealSecrets();
      const engine = new TealEngineV12({
        modules: [secrets, registryWithModel],
        policy: {
          TealSecrets: {
            enabled: true,
            action: 'DENY',
            confidence_threshold: 0.5,
            perfBudgetMs: 5000,
          },
          TealRegistry: {},
        },
      });

      const decision = await engine.evaluateV12(
        { content: 'Hello world, no secrets here', model: 'unknown-model-xyz' },
        makeCtx(),
      );

      expect(decision.action).toBe('DENY');
      expect(decision.reason_codes).toContain('MODEL_NOT_ALLOWLISTED');
    });

    it('clean content + valid model → ALLOW (both pass)', async () => {
      const secrets = new TealSecrets();
      const engine = new TealEngineV12({
        modules: [secrets, registryWithModel],
        policy: {
          TealSecrets: {
            enabled: true,
            action: 'DENY',
            confidence_threshold: 0.5,
            perfBudgetMs: 5000,
          },
          TealRegistry: {},
        },
      });

      const decision = await engine.evaluateV12(
        { content: 'Hello world, no secrets here', model: 'gpt-4' },
        makeCtx(),
      );

      expect(decision.action).toBe('ALLOW');
    });
  });

  describe('TealMemory write with secret content', () => {
    it('write with secret → DENY_WRITE', async () => {
      const adapter = new LocalMemoryAdapter();
      const memory = new TealMemory({ adapter });
      // TealMemory.evaluate casts the full policy as TealMemoryPolicy,
      // so the memory config must be at the top level of the policy object.
      const engine = new TealEngineV12({
        modules: [memory],
        policy: {
          TealMemory: true, // triggers module resolution
          enabled: true,
          write: {
            allowed_scopes: ['SESSION'],
            deny_if: { secrets: true },
            on_detect: { secrets: 'DENY' },
          },
        },
      });

      const decision = await engine.evaluateV12(
        {
          content: 'my-api-key-AKIAIOSFODNN7EXAMPLE',
          scope: 'SESSION',
          classification: 'PUBLIC',
        },
        makeCtx(),
      );

      // Memory module should detect secret and deny write
      expect(['DENY_WRITE', 'DENY']).toContain(decision.action);
    });
  });

  describe('fail-closed: module crash → DENY', () => {
    it('crashing module triggers fail-closed DENY', async () => {
      const crasher = new CrashingModule();
      const engine = new TealEngineV12({
        modules: [crasher],
        policy: { CrashingModule: { enabled: true } },
        failurePolicy: { default: 'FAIL_CLOSED' },
      });

      const decision = await engine.evaluateV12(
        { content: 'test' },
        makeCtx(),
      );

      expect(decision.action).toBe('DENY');
      expect(decision.reason).toContain('Fail-closed');
    });
  });

  describe('lazy initialization', () => {
    it('modules are not initialized until first evaluation', () => {
      const secrets = new TealSecrets();
      const engine = new TealEngineV12({
        modules: [secrets],
        policy: {},
      });

      const statusBefore = engine.getModuleStatus();
      expect(statusBefore['TealSecrets']?.registered).toBe(true);
      expect(statusBefore['TealSecrets']?.initialized).toBe(false);
    });

    it('modules are initialized on first evaluation that references them', async () => {
      const secrets = new TealSecrets();
      const engine = new TealEngineV12({
        modules: [secrets],
        policy: {
          TealSecrets: { enabled: true, action: 'DENY', confidence_threshold: 0.5, perfBudgetMs: 5000 },
        },
      });

      await engine.evaluateV12({ content: 'test' }, makeCtx());

      const statusAfter = engine.getModuleStatus();
      expect(statusAfter['TealSecrets']?.initialized).toBe(true);
    });
  });

  describe('dashboard tracks decisions after evaluateV12', () => {
    it('recordDecision updates stats correctly', async () => {
      const secrets = new TealSecrets();
      const engine = new TealEngineV12({
        modules: [secrets],
        policy: {
          TealSecrets: { enabled: true, action: 'DENY', confidence_threshold: 0.5, perfBudgetMs: 5000 },
        },
      });
      const dashboard = new GovernanceDashboard(engine);

      const decision1 = await engine.evaluateV12(
        { content: 'Hello world' },
        makeCtx(),
      );
      dashboard.recordDecision(decision1);

      const decision2 = await engine.evaluateV12(
        { content: 'AKIAIOSFODNN7EXAMPLE' },
        makeCtx({ correlation_id: 'int-test-002' }),
      );
      dashboard.recordDecision(decision2);

      const stats = dashboard.getDecisionStats();
      expect(stats.total).toBe(2);
      expect(Object.keys(stats.by_action).length).toBeGreaterThan(0);
    });
  });
});
