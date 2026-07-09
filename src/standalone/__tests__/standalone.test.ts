/**
 * Standalone Module Exports — Unit Tests
 *
 * Verifies:
 * - Each standalone module can be imported and used without TealEngine
 * - GovernanceProvider produces same decisions as direct TealEngine usage
 *
 * @requirements 20.5–20.13
 */

import { DecisionAction } from '../../core/engine/types';
import { TealEngineV13 } from '../../core/engine/v1.3/TealEngineV13';
import type { GovernanceRequest, EvaluationContext } from '../../core/engine/v1.3/types';
import type { TealModule, ModuleResult } from '../../core/engine/v1.2/types';

// Import from standalone barrel
import {
  TealGuard,
  TealSecrets,
  TealMemory,
  TealRegistry,
  TealCircuit,
  TealAudit,
  TealProof,
  MerkleTree,
  TealFlowEngine,
  TealFlowParser,
  TealClassifier,
  TealDrift,
  TealState,
  TealTemporal,
  TealTigerGovernanceProvider,
} from '../index';

// ── Helpers ──────────────────────────────────────────────────────

const ALLOW_RESULT: ModuleResult = {
  action: DecisionAction.ALLOW,
  reason_codes: ['POLICY_COMPLIANT'],
  event_type: 'policy.evaluation',
};

const mockModule = (name: string, result: ModuleResult): TealModule => ({
  name,
  version: '1.0.0',
  evaluate: jest.fn().mockResolvedValue(result),
  init: jest.fn().mockResolvedValue(undefined),
});

// ── Standalone Module Import Tests ───────────────────────────────

describe('Standalone Module Exports — Import Without TealEngine', () => {
  describe('TealGuard (guard)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealGuard).toBeDefined();
      expect(typeof TealGuard).toBe('function');
    });

    it('can be instantiated without TealEngine', () => {
      const guard = new TealGuard();
      expect(guard).toBeDefined();
    });
  });

  describe('TealSecrets (secrets)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealSecrets).toBeDefined();
      expect(typeof TealSecrets).toBe('function');
    });

    it('can be instantiated without TealEngine', () => {
      const secrets = new TealSecrets();
      expect(secrets).toBeDefined();
    });
  });

  describe('TealMemory (memory)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealMemory).toBeDefined();
      expect(typeof TealMemory).toBe('function');
    });

    it('can be instantiated without TealEngine', () => {
      const mockAdapter = {
        read: jest.fn(),
        write: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      };
      const memory = new TealMemory({ adapter: mockAdapter as any });
      expect(memory).toBeDefined();
    });
  });

  describe('TealRegistry (registry)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealRegistry).toBeDefined();
      expect(typeof TealRegistry).toBe('function');
    });
  });

  describe('TealCircuit (circuit)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealCircuit).toBeDefined();
      expect(typeof TealCircuit).toBe('function');
    });
  });

  describe('TealAudit (audit)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealAudit).toBeDefined();
      expect(typeof TealAudit).toBe('function');
    });
  });

  describe('TealProof (proof)', () => {
    it('can be imported as standalone classes', () => {
      expect(TealProof).toBeDefined();
      expect(MerkleTree).toBeDefined();
      expect(typeof TealProof).toBe('function');
      expect(typeof MerkleTree).toBe('function');
    });

    it('MerkleTree can be used without TealEngine', () => {
      const tree = new MerkleTree();
      expect(tree).toBeDefined();
      expect(typeof tree.append).toBe('function');
      expect(typeof tree.root).toBe('function');
      expect(typeof tree.getProof).toBe('function');
      expect(typeof tree.verify).toBe('function');
    });
  });

  describe('TealFlow (flow)', () => {
    it('can be imported as standalone classes', () => {
      expect(TealFlowEngine).toBeDefined();
      expect(TealFlowParser).toBeDefined();
      expect(typeof TealFlowEngine).toBe('function');
      expect(typeof TealFlowParser).toBe('function');
    });
  });

  describe('TealClassifier (classifier)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealClassifier).toBeDefined();
      expect(typeof TealClassifier).toBe('function');
    });
  });

  describe('TealDrift (drift)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealDrift).toBeDefined();
      expect(typeof TealDrift).toBe('function');
    });
  });

  describe('TealState (state)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealState).toBeDefined();
      expect(typeof TealState).toBe('function');
    });
  });

  describe('TealTemporal (temporal)', () => {
    it('can be imported as a standalone class', () => {
      expect(TealTemporal).toBeDefined();
      expect(typeof TealTemporal).toBe('function');
    });
  });
});

// ── GovernanceProvider Tests ──────────────────────────────────────

describe('GovernanceProvider — Portable Interface', () => {
  describe('evaluate()', () => {
    it('produces same decisions as direct TealEngine usage', async () => {
      const mod = mockModule('tealsecrets', ALLOW_RESULT);

      // Direct TealEngine usage
      const engine = new TealEngineV13({
        modules: [mod],
        policy: { secrets: { enabled: true } },
      });

      const directDecision = await engine.evaluate(
        { content: 'hello world', action_class: 'READ' } as GovernanceRequest,
        { correlation_id: 'test-direct-001' },
      );

      // GovernanceProvider usage
      const provider = new TealTigerGovernanceProvider({
        modules: [mod],
        policy: { secrets: { enabled: true } },
      });

      const providerDecision = await provider.evaluate({
        correlation_id: 'test-direct-001',
        action: 'READ',
        action_attributes: {},
        content: 'hello world',
      });

      // Both should produce ALLOW decisions
      expect(directDecision.action).toBe(DecisionAction.ALLOW);
      expect(providerDecision.action).toBe(DecisionAction.ALLOW);
      expect(directDecision.action).toBe(providerDecision.action);
    });

    it('translates EvaluationContext to GovernanceRequest correctly', async () => {
      const mod = mockModule('tealsecrets', ALLOW_RESULT);

      const provider = new TealTigerGovernanceProvider({
        modules: [mod],
        policy: { secrets: { enabled: true } },
      });

      const context: EvaluationContext = {
        correlation_id: 'ctx-001',
        agent_id: 'agent-alpha',
        action: 'TOOL_INVOKE',
        action_attributes: { tool_name: 'search' },
        content: 'search query',
        model: 'gpt-4',
        tool: 'search',
        environment: 'staging',
      };

      const decision = await provider.evaluate(context);

      expect(decision).toBeDefined();
      expect(decision.action).toBeDefined();
      expect(decision.correlation_id).toBe('ctx-001');
    });

    it('denies requests matching FREEZE rules via GovernanceProvider', async () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
        freeze_rules: [
          {
            id: 'freeze-prod-deploy',
            match: { action_class: 'PRODUCTION_DEPLOY' },
            reason: 'Production deployments frozen during maintenance',
            created_at: Date.now(),
            created_by: 'admin',
            immutable: true,
          },
        ],
      });

      const decision = await provider.evaluate({
        correlation_id: 'freeze-test-001',
        action: 'PRODUCTION_DEPLOY',
        action_attributes: { target: 'prod-cluster' },
      });

      expect(decision.action).toBe(DecisionAction.DENY);
      expect(decision.reason_codes).toContain('FREEZE_BLOCK');
    });

    it('denies requests from revoked NHI identities', async () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
      });

      const decision = await provider.evaluate({
        correlation_id: 'nhi-test-001',
        action: 'READ',
        action_attributes: {},
        nhi_identity: {
          agent_id: 'agent-revoked',
          owner: 'team-alpha',
          created_at: Date.now() - 86400000,
          capability_scope: ['read:*'],
          environment_constraints: ['production'],
          status: 'revoked',
        },
      });

      expect(decision.action).toBe(DecisionAction.DENY);
      expect(decision.reason_codes).toContain('NHI_REVOKED');
    });
  });

  describe('getCapabilities()', () => {
    it('returns a valid CapabilityManifest', () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
      });

      const capabilities = provider.getCapabilities();

      expect(capabilities.sdk_version).toBe('1.4.0');
      expect(capabilities.teec_version).toBe('2.0.0');
      expect(Array.isArray(capabilities.supported_modules)).toBe(true);
      expect(Array.isArray(capabilities.supported_features)).toBe(true);
      expect(capabilities.supported_modules.length).toBeGreaterThan(0);
      expect(capabilities.supported_features.length).toBeGreaterThan(0);
    });

    it('includes all v1.3 modules in supported_modules', () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
      });

      const capabilities = provider.getCapabilities();
      const expectedModules = [
        'TealGuard',
        'TealSecrets',
        'TealMemory',
        'TealRegistry',
        'TealCircuit',
        'TealAudit',
        'TealMonitor',
        'TealProof',
        'TealFlow',
        'TealClassifier',
        'TealDrift',
        'TealState',
        'TealTemporal',
      ];

      for (const mod of expectedModules) {
        expect(capabilities.supported_modules).toContain(mod);
      }
    });

    it('includes key governance features in supported_features', () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
      });

      const capabilities = provider.getCapabilities();
      const expectedFeatures = [
        'freeze_rules',
        'plan_only_mode',
        'nhi_governance',
        'automation_levels',
        'zero_standing_privilege',
        'policy_hot_swap',
        'governance_receipts',
      ];

      for (const feature of expectedFeatures) {
        expect(capabilities.supported_features).toContain(feature);
      }
    });
  });

  describe('loadPolicies()', () => {
    it('accepts a valid policy bundle', async () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
      });

      const bundle = {
        bundle_version: '1.0.0',
        requires_sdk: '^1.3.0',
        requires_teec: '^2.0.0',
        required_capabilities: ['freeze_rules'],
        hash: 'placeholder-hash',
        policies: [],
        fail_behavior: 'fail_closed' as const,
      };

      // Should not throw for valid capabilities
      await expect(provider.loadPolicies(bundle)).resolves.not.toThrow();
    });

    it('rejects bundles requiring unsupported capabilities', async () => {
      const provider = new TealTigerGovernanceProvider({
        modules: [],
        policy: {},
      });

      const bundle = {
        bundle_version: '2.0.0',
        requires_sdk: '^2.0.0',
        requires_teec: '^3.0.0',
        required_capabilities: ['quantum_governance', 'time_travel'],
        hash: 'placeholder-hash',
        policies: [],
        fail_behavior: 'fail_closed' as const,
      };

      await expect(provider.loadPolicies(bundle)).rejects.toThrow(
        /unsupported capabilities/i,
      );
    });
  });
});
