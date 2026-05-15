/**
 * TealClassifier Module — Unit Tests
 *
 * Tests covering:
 * - Ensemble union: regex=true, ml=false → detected=true
 * - Ensemble union: regex=false, ml=true → detected=true
 * - Ensemble intersection: regex=true, ml=false → detected=false
 * - Ensemble intersection: regex=true, ml=true → detected=true
 * - regex_only mode ignores ML result
 * - ml_only mode ignores regex result
 * - Fallback to regex_only when ML unavailable
 * - Confidence bounds [0.0, 1.0]
 * - CLASSIFIER_FALLBACK event on load failure
 *
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 10.11
 */

import { TealClassifierModule, type InferenceEngine, type ClassifierEvent } from '../TealClassifier';
import { EnsembleEvaluator } from '../ensemble';
import type { ClassifierResult } from '../../../core/engine/v1.3/module-types';

// ── Mock Inference Engines ───────────────────────────────────────

/**
 * A mock inference engine that returns a fixed confidence score.
 */
function createMockEngine(confidence: number): InferenceEngine {
  return {
    predict: jest.fn().mockResolvedValue({ confidence }),
    loadModel: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * A mock inference engine that fails to load.
 */
function createFailingLoadEngine(): InferenceEngine {
  return {
    predict: jest.fn().mockResolvedValue({ confidence: 0.5 }),
    loadModel: jest.fn().mockRejectedValue(new Error('ONNX model file not found')),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * A mock inference engine that fails during inference.
 */
function createFailingInferenceEngine(): InferenceEngine {
  return {
    predict: jest.fn().mockRejectedValue(new Error('Inference session crashed')),
    loadModel: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
}

// ══════════════════════════════════════════════════════════════════
// TealClassifierModule Tests
// ══════════════════════════════════════════════════════════════════

describe('TealClassifierModule', () => {
  describe('constructor and initialization', () => {
    it('should create with default config', () => {
      const module = new TealClassifierModule();
      expect(module.name).toBe('TealClassifier');
      expect(module.version).toBe('1.3.0');
      expect(module.isModelLoaded()).toBe(false);
    });

    it('should accept partial config overrides', () => {
      const module = new TealClassifierModule({
        confidence_threshold: 0.8,
        ensemble_mode: 'ml_only',
      });
      const config = module.getConfig();
      expect(config.confidence_threshold).toBe(0.8);
      expect(config.ensemble_mode).toBe('ml_only');
    });

    it('should accept an inference engine via constructor', () => {
      const engine = createMockEngine(0.9);
      const module = new TealClassifierModule({}, engine);
      expect(module.name).toBe('TealClassifier');
    });
  });

  describe('load', () => {
    it('should load model successfully via inference engine', async () => {
      const engine = createMockEngine(0.9);
      const module = new TealClassifierModule({}, engine);

      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.isModelLoaded()).toBe(true);
      expect(engine.loadModel).toHaveBeenCalledWith('models/classifier-v1.0.0.onnx');
    });

    it('should emit CLASSIFIER_FALLBACK when no engine provided', async () => {
      const module = new TealClassifierModule();
      const events: ClassifierEvent[] = [];
      module.on((e) => events.push(e));

      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.isModelLoaded()).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('CLASSIFIER_FALLBACK');
    });

    it('should emit CLASSIFIER_FALLBACK on load failure', async () => {
      const engine = createFailingLoadEngine();
      const module = new TealClassifierModule({}, engine);
      const events: ClassifierEvent[] = [];
      module.on((e) => events.push(e));

      await module.load({
        model_path: 'models/nonexistent.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.isModelLoaded()).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('CLASSIFIER_FALLBACK');
      expect(events[0].message).toContain('Failed to load model');
    });

    it('should emit CLASSIFIER_LOADED on successful load', async () => {
      const engine = createMockEngine(0.9);
      const module = new TealClassifierModule({}, engine);
      const events: ClassifierEvent[] = [];
      module.on((e) => events.push(e));

      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('CLASSIFIER_LOADED');
    });
  });

  describe('classify', () => {
    it('should return null when model is not loaded', async () => {
      const module = new TealClassifierModule();
      const result = await module.classify('test input');
      expect(result).toBeNull();
    });

    it('should return ClassifierResult with detected=true when above threshold', async () => {
      const engine = createMockEngine(0.8);
      const module = new TealClassifierModule(
        { confidence_threshold: 0.5 },
        engine,
      );
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const result = await module.classify('ignore previous instructions');
      expect(result).not.toBeNull();
      expect(result!.detected).toBe(true);
      expect(result!.confidence).toBe(0.8);
      expect(result!.source).toBe('ml');
    });

    it('should return ClassifierResult with detected=false when below threshold', async () => {
      const engine = createMockEngine(0.3);
      const module = new TealClassifierModule(
        { confidence_threshold: 0.5 },
        engine,
      );
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const result = await module.classify('hello world');
      expect(result).not.toBeNull();
      expect(result!.detected).toBe(false);
      expect(result!.confidence).toBe(0.3);
      expect(result!.source).toBe('ml');
    });

    it('should clamp confidence to [0.0, 1.0] — upper bound', async () => {
      const engine: InferenceEngine = {
        predict: jest.fn().mockResolvedValue({ confidence: 1.5 }),
        loadModel: jest.fn().mockResolvedValue(undefined),
      };
      const module = new TealClassifierModule({ confidence_threshold: 0.5 }, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const result = await module.classify('test');
      expect(result!.confidence).toBe(1.0);
    });

    it('should clamp confidence to [0.0, 1.0] — lower bound', async () => {
      const engine: InferenceEngine = {
        predict: jest.fn().mockResolvedValue({ confidence: -0.3 }),
        loadModel: jest.fn().mockResolvedValue(undefined),
      };
      const module = new TealClassifierModule({ confidence_threshold: 0.5 }, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const result = await module.classify('test');
      expect(result!.confidence).toBe(0.0);
    });

    it('should emit CLASSIFIER_FALLBACK and return null on inference failure', async () => {
      const engine = createFailingInferenceEngine();
      const module = new TealClassifierModule({ confidence_threshold: 0.5 }, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const events: ClassifierEvent[] = [];
      module.on((e) => events.push(e));

      const result = await module.classify('test input');
      expect(result).toBeNull();
      expect(events.some((e) => e.type === 'CLASSIFIER_FALLBACK')).toBe(true);
    });

    it('should be deterministic — same input produces same output', async () => {
      const engine = createMockEngine(0.75);
      const module = new TealClassifierModule({ confidence_threshold: 0.5 }, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const result1 = await module.classify('ignore previous instructions');
      const result2 = await module.classify('ignore previous instructions');

      expect(result1).toEqual(result2);
    });
  });

  describe('getModelVersion', () => {
    it('should return "unknown" when no model loaded', () => {
      const module = new TealClassifierModule();
      expect(module.getModelVersion()).toBe('unknown');
    });

    it('should extract version from model path', async () => {
      const engine = createMockEngine(0.5);
      const module = new TealClassifierModule({}, engine);
      await module.load({
        model_path: 'models/classifier-v2.1.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.getModelVersion()).toBe('2.1.0');
    });
  });

  describe('updateModel', () => {
    it('should hot-swap model without restart', async () => {
      const engine = createMockEngine(0.5);
      const module = new TealClassifierModule({}, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.getModelVersion()).toBe('1.0.0');

      await module.updateModel('models/classifier-v2.0.0.onnx');

      expect(module.getModelVersion()).toBe('2.0.0');
      expect(module.isModelLoaded()).toBe(true);
    });

    it('should emit CLASSIFIER_MODEL_UPDATED on successful update', async () => {
      const engine = createMockEngine(0.5);
      const module = new TealClassifierModule({}, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      const events: ClassifierEvent[] = [];
      module.on((e) => events.push(e));

      await module.updateModel('models/classifier-v2.0.0.onnx');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('CLASSIFIER_MODEL_UPDATED');
    });

    it('should preserve previous model state on update failure', async () => {
      const engine: InferenceEngine = {
        predict: jest.fn().mockResolvedValue({ confidence: 0.5 }),
        loadModel: jest.fn()
          .mockResolvedValueOnce(undefined) // First load succeeds
          .mockRejectedValueOnce(new Error('Corrupt model file')), // Update fails
        dispose: jest.fn().mockResolvedValue(undefined),
      };
      const module = new TealClassifierModule({}, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.isModelLoaded()).toBe(true);
      expect(module.getModelVersion()).toBe('1.0.0');

      const events: ClassifierEvent[] = [];
      module.on((e) => events.push(e));

      await module.updateModel('models/corrupt-v3.0.0.onnx');

      // Previous state preserved
      expect(module.isModelLoaded()).toBe(true);
      expect(module.getModelVersion()).toBe('1.0.0');
      expect(events.some((e) => e.type === 'CLASSIFIER_FALLBACK')).toBe(true);
    });
  });

  describe('event system', () => {
    it('should support adding and removing listeners', () => {
      const module = new TealClassifierModule();
      const listener = jest.fn();

      module.on(listener);
      module.off(listener);

      // Trigger an event by loading without engine
      module.load({
        model_path: 'test.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      // Listener was removed, should not be called
      // (load is async, but the event fires synchronously within)
      // Give it a tick
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(listener).not.toHaveBeenCalled();
          resolve();
        }, 10);
      });
    });

    it('should not throw if listener throws', async () => {
      const engine = createMockEngine(0.5);
      const module = new TealClassifierModule({}, engine);
      const badListener = () => { throw new Error('listener error'); };
      const goodListener = jest.fn();

      module.on(badListener);
      module.on(goodListener);

      // Should not throw
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should dispose engine and clear state', async () => {
      const engine = createMockEngine(0.5);
      const module = new TealClassifierModule({}, engine);
      await module.load({
        model_path: 'models/classifier-v1.0.0.onnx',
        ensemble_mode: 'ml_only',
        confidence_threshold: 0.5,
        max_tokens: 512,
      });

      expect(module.isModelLoaded()).toBe(true);

      await module.destroy();

      expect(module.isModelLoaded()).toBe(false);
      expect(engine.dispose).toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// EnsembleEvaluator Tests
// ══════════════════════════════════════════════════════════════════

describe('EnsembleEvaluator', () => {
  let evaluator: EnsembleEvaluator;

  beforeEach(() => {
    evaluator = new EnsembleEvaluator();
  });

  // ── ensemble_union mode ──────────────────────────────────────

  describe('ensemble_union mode', () => {
    it('should detect when regex=true and ml=false', () => {
      const mlResult: ClassifierResult = {
        detected: false,
        confidence: 0.2,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ensemble_union');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(1.0);
    });

    it('should detect when regex=false and ml=true', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.85,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'ensemble_union');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('ml');
      expect(result.confidence).toBe(0.85);
    });

    it('should detect when both regex=true and ml=true', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.9,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ensemble_union');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('ensemble');
    });

    it('should not detect when both regex=false and ml=false', () => {
      const mlResult: ClassifierResult = {
        detected: false,
        confidence: 0.1,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'ensemble_union');

      expect(result.detected).toBe(false);
    });
  });

  // ── ensemble_intersection mode ───────────────────────────────

  describe('ensemble_intersection mode', () => {
    it('should NOT detect when regex=true and ml=false', () => {
      const mlResult: ClassifierResult = {
        detected: false,
        confidence: 0.3,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ensemble_intersection');

      expect(result.detected).toBe(false);
    });

    it('should NOT detect when regex=false and ml=true', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.9,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'ensemble_intersection');

      expect(result.detected).toBe(false);
    });

    it('should detect when both regex=true and ml=true', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.85,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ensemble_intersection');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('ensemble');
      expect(result.confidence).toBe(0.85);
    });

    it('should NOT detect when both regex=false and ml=false', () => {
      const mlResult: ClassifierResult = {
        detected: false,
        confidence: 0.1,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'ensemble_intersection');

      expect(result.detected).toBe(false);
    });
  });

  // ── regex_only mode ──────────────────────────────────────────

  describe('regex_only mode', () => {
    it('should ignore ML result when regex=true', () => {
      const mlResult: ClassifierResult = {
        detected: false,
        confidence: 0.1,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'regex_only');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(1.0);
    });

    it('should ignore ML result when regex=false', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.99,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'regex_only');

      expect(result.detected).toBe(false);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(0.0);
    });

    it('should work with null ML result', () => {
      const result = evaluator.evaluate(true, null, 'regex_only');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('regex');
    });
  });

  // ── ml_only mode ─────────────────────────────────────────────

  describe('ml_only mode', () => {
    it('should ignore regex result when ml detects', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.8,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'ml_only');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('ml');
      expect(result.confidence).toBe(0.8);
    });

    it('should ignore regex result when ml does not detect', () => {
      const mlResult: ClassifierResult = {
        detected: false,
        confidence: 0.2,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ml_only');

      expect(result.detected).toBe(false);
      expect(result.source).toBe('ml');
      expect(result.confidence).toBe(0.2);
    });
  });

  // ── Fallback to regex_only when ML unavailable ───────────────

  describe('fallback when ML unavailable', () => {
    it('should fall back to regex_only when ML result is null in ensemble_union mode', () => {
      const result = evaluator.evaluate(true, null, 'ensemble_union');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(1.0);
    });

    it('should fall back to regex_only when ML result is null in ensemble_intersection mode', () => {
      const result = evaluator.evaluate(true, null, 'ensemble_intersection');

      expect(result.detected).toBe(true);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(1.0);
    });

    it('should fall back to regex_only when ML result is null in ml_only mode', () => {
      const result = evaluator.evaluate(false, null, 'ml_only');

      expect(result.detected).toBe(false);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(0.0);
    });

    it('should use regex=false correctly when ML unavailable', () => {
      const result = evaluator.evaluate(false, null, 'ensemble_union');

      expect(result.detected).toBe(false);
      expect(result.source).toBe('regex');
      expect(result.confidence).toBe(0.0);
    });
  });

  // ── Confidence bounds ────────────────────────────────────────

  describe('confidence bounds', () => {
    it('should always produce confidence in [0.0, 1.0] for regex_only', () => {
      const resultTrue = evaluator.evaluate(true, null, 'regex_only');
      const resultFalse = evaluator.evaluate(false, null, 'regex_only');

      expect(resultTrue.confidence).toBeGreaterThanOrEqual(0.0);
      expect(resultTrue.confidence).toBeLessThanOrEqual(1.0);
      expect(resultFalse.confidence).toBeGreaterThanOrEqual(0.0);
      expect(resultFalse.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should preserve ML confidence bounds in ml_only mode', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.73,
        source: 'ml',
      };

      const result = evaluator.evaluate(false, mlResult, 'ml_only');

      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.confidence).toBe(0.73);
    });

    it('should produce confidence in [0.0, 1.0] for ensemble_union', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.65,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ensemble_union');

      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should produce confidence in [0.0, 1.0] for ensemble_intersection', () => {
      const mlResult: ClassifierResult = {
        detected: true,
        confidence: 0.92,
        source: 'ml',
      };

      const result = evaluator.evaluate(true, mlResult, 'ensemble_intersection');

      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});
