/**
 * stageAdapter — Unit Tests
 *
 * Covers:
 * - assignStage() returns a module with the assigned stage property
 * - Original module is not modified (no side effects)
 * - Returned module preserves name and version from the original
 * - Returned module's evaluate() still works correctly
 * - Prototype chain is preserved
 *
 * @requirements 8.1, 8.2, 8.3
 */

import { assignStage } from '../stageAdapter';
import { PipelineStage } from '../types';
import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';
import { DecisionAction } from '../../core/engine/types';

// ── Helpers ──────────────────────────────────────────────────────

const ALLOW_RESULT: ModuleResult = {
  action: DecisionAction.ALLOW,
  reason_codes: ['POLICY_COMPLIANT'],
  event_type: 'policy.evaluation',
};

const DENY_RESULT: ModuleResult = {
  action: DecisionAction.DENY,
  reason_codes: ['SECRET_DETECTED'],
  event_type: 'secret.detection',
};

const CTX: ModuleContext = {
  correlation_id: 'test-corr-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
};

const REQUEST: ModuleEvaluationRequest = { content: 'test payload' };
const POLICY = { enabled: true };

class MockTealModule implements TealModule {
  readonly name: string;
  readonly version: string;
  private readonly result: ModuleResult;

  constructor(name: string, version: string, result: ModuleResult) {
    this.name = name;
    this.version = version;
    this.result = result;
  }

  async evaluate(
    _request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    return this.result;
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe('stageAdapter — assignStage()', () => {
  describe('Stage Property Assignment', () => {
    it('returns a module with the assigned stage property', () => {
      const original = new MockTealModule('test-secrets', '1.2.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      expect(adapted.stage).toBe(PipelineStage.PRE_EXECUTION);
    });

    it('supports PRE_EXECUTION stage assignment', () => {
      const original = new MockTealModule('mod-a', '1.0.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      expect(adapted.stage).toBe('PRE_EXECUTION');
    });

    it('supports POST_EXECUTION stage assignment', () => {
      const original = new MockTealModule('mod-b', '1.0.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.POST_EXECUTION);

      expect(adapted.stage).toBe('POST_EXECUTION');
    });

    it('supports EXECUTION stage assignment', () => {
      const original = new MockTealModule('mod-c', '1.0.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.EXECUTION);

      expect(adapted.stage).toBe('EXECUTION');
    });
  });

  describe('Original Module Immutability', () => {
    it('does not modify the original module', () => {
      const original = new MockTealModule('test-secrets', '1.2.0', ALLOW_RESULT);
      assignStage(original, PipelineStage.PRE_EXECUTION);

      expect((original as any).stage).toBeUndefined();
    });

    it('returns a different object reference than the original', () => {
      const original = new MockTealModule('test-secrets', '1.2.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      expect(adapted).not.toBe(original);
    });
  });

  describe('Module Interface Preservation', () => {
    it('preserves the name property from the original module', () => {
      const original = new MockTealModule('TealSecrets', '1.2.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      expect(adapted.name).toBe('TealSecrets');
    });

    it('preserves the version property from the original module', () => {
      const original = new MockTealModule('TealRegistry', '2.0.1', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.POST_EXECUTION);

      expect(adapted.version).toBe('2.0.1');
    });

    it('evaluate() still works and returns the correct result', async () => {
      const original = new MockTealModule('TealSecrets', '1.2.0', DENY_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      const result = await adapted.evaluate(REQUEST, CTX, POLICY);

      expect(result.action).toBe(DecisionAction.DENY);
      expect(result.reason_codes).toEqual(['SECRET_DETECTED']);
      expect(result.event_type).toBe('secret.detection');
    });

    it('evaluate() receives the correct arguments', async () => {
      const evaluateSpy = jest.fn().mockResolvedValue(ALLOW_RESULT);
      const original: TealModule = {
        name: 'spy-module',
        version: '1.0.0',
        evaluate: evaluateSpy,
      };
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      await adapted.evaluate(REQUEST, CTX, POLICY);

      expect(evaluateSpy).toHaveBeenCalledWith(REQUEST, CTX, POLICY);
    });
  });

  describe('Prototype Chain Preservation', () => {
    it('preserves the prototype chain of class-based modules', () => {
      const original = new MockTealModule('test-mod', '1.0.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      expect(adapted).toBeInstanceOf(MockTealModule);
    });

    it('preserves methods from the prototype', () => {
      const original = new MockTealModule('test-mod', '1.0.0', ALLOW_RESULT);
      const adapted = assignStage(original, PipelineStage.PRE_EXECUTION);

      // evaluate is on the prototype for class instances
      expect(typeof adapted.evaluate).toBe('function');
    });
  });
});
