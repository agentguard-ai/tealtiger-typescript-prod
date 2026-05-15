/**
 * TealClassifier — Lightweight ML Detection Module
 *
 * Provides optional ONNX-based ML classification for prompt injection detection.
 * Uses a pluggable InferenceEngine interface so the actual ONNX Runtime dependency
 * lives in the separate @tealtiger/classifier package.
 *
 * Features:
 * - Load ONNX model via pluggable InferenceEngine (dependency injection)
 * - Local inference with no external API calls
 * - Confidence score always in [0.0, 1.0]
 * - Deterministic: same input → same output (no sampling/temperature)
 * - Fallback: if model fails to load or inference fails → emit CLASSIFIER_FALLBACK event
 * - Hot-swap model without SDK restart via updateModel()
 *
 * @module modules/tealclassifier/TealClassifier
 * @requirements 10.1, 10.7, 10.8, 10.9, 10.10, 10.11
 */

import type {
  ClassifierConfig,
  ClassifierResult,
} from '../../core/engine/v1.3/module-types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
} from '../../core/engine/v1.2/types';

// ── Constants ────────────────────────────────────────────────────

const MODULE_NAME = 'TealClassifier';
const MODULE_VERSION = '1.3.0';
const REASON_CODE_DETECTED = 'ML_INJECTION_DETECTED';
const REASON_CODE_FALLBACK = 'CLASSIFIER_FALLBACK';
const EVENT_TYPE_DETECTED = 'governance.classifier.detected';
const EVENT_TYPE_FALLBACK = 'governance.classifier.fallback';
const EVENT_TYPE_NONE = 'governance.classifier.none';

// ── Interfaces ───────────────────────────────────────────────────

/**
 * Pluggable inference engine interface.
 * Implemented by @tealtiger/classifier package which wraps ONNX Runtime.
 * Allows the core SDK to remain free of heavy ONNX dependencies.
 */
export interface InferenceEngine {
  /**
   * Run inference on the given input string.
   * Must return a confidence score in [0.0, 1.0].
   * Must be deterministic: same input → same output.
   */
  predict(input: string): Promise<{ confidence: number }>;

  /**
   * Load a model from the given path.
   * Throws if the model cannot be loaded.
   */
  loadModel?(modelPath: string): Promise<void>;

  /**
   * Dispose of resources held by the engine.
   */
  dispose?(): Promise<void>;
}

/**
 * Event listener type for classifier events.
 */
export type ClassifierEventListener = (event: ClassifierEvent) => void;

/**
 * Events emitted by the TealClassifier module.
 */
export interface ClassifierEvent {
  type: 'CLASSIFIER_FALLBACK' | 'CLASSIFIER_LOADED' | 'CLASSIFIER_MODEL_UPDATED';
  message: string;
  timestamp: number;
  modelPath?: string;
  error?: Error;
}

// ── Default configuration ────────────────────────────────────────

const DEFAULT_CONFIG: ClassifierConfig = {
  model_path: '',
  ensemble_mode: 'regex_only',
  confidence_threshold: 0.5,
  max_tokens: 512,
};

// ── TealClassifierModule ─────────────────────────────────────────

export class TealClassifierModule implements TealModule {
  readonly name = MODULE_NAME;
  readonly version = MODULE_VERSION;

  private config: ClassifierConfig;
  private engine: InferenceEngine | null;
  private modelLoaded = false;
  private modelVersion = 'unknown';
  private listeners: ClassifierEventListener[] = [];

  /**
   * @param config - Classifier configuration (model path, ensemble mode, thresholds)
   * @param engine - Optional pluggable inference engine (for dependency injection)
   */
  constructor(config?: Partial<ClassifierConfig>, engine?: InferenceEngine) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.engine = engine ?? null;
  }

  // ── Lifecycle ────────────────────────────────────────────────

  async init(): Promise<void> {
    // No-op if no engine provided or regex_only mode
    if (!this.engine || this.config.ensemble_mode === 'regex_only') {
      return;
    }
    await this.load(this.config);
  }

  async destroy(): Promise<void> {
    if (this.engine?.dispose) {
      await this.engine.dispose();
    }
    this.modelLoaded = false;
    this.listeners = [];
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Load the ONNX model via the inference engine.
   * On failure, emits CLASSIFIER_FALLBACK and reverts to null (caller uses regex_only).
   */
  async load(config: ClassifierConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    if (!this.engine) {
      this.emitEvent({
        type: 'CLASSIFIER_FALLBACK',
        message: 'No inference engine provided; falling back to regex_only',
        timestamp: Date.now(),
        modelPath: this.config.model_path,
      });
      this.modelLoaded = false;
      return;
    }

    try {
      if (this.engine.loadModel) {
        await this.engine.loadModel(this.config.model_path);
      }
      this.modelLoaded = true;
      this.modelVersion = this.extractModelVersion(this.config.model_path);
      this.emitEvent({
        type: 'CLASSIFIER_LOADED',
        message: `Model loaded from ${this.config.model_path}`,
        timestamp: Date.now(),
        modelPath: this.config.model_path,
      });
    } catch (error) {
      this.modelLoaded = false;
      this.emitEvent({
        type: 'CLASSIFIER_FALLBACK',
        message: `Failed to load model: ${(error as Error).message}`,
        timestamp: Date.now(),
        modelPath: this.config.model_path,
        error: error as Error,
      });
    }
  }

  /**
   * Run classification on the input string.
   * Returns a ClassifierResult with detected flag, confidence, and source.
   *
   * If the model is not loaded or inference fails, returns null
   * (indicating ML is unavailable — caller should use regex_only fallback).
   */
  async classify(input: string): Promise<ClassifierResult | null> {
    if (!this.engine || !this.modelLoaded) {
      return null;
    }

    try {
      const result = await this.engine.predict(input);

      // Clamp confidence to [0.0, 1.0]
      const confidence = Math.max(0.0, Math.min(1.0, result.confidence));

      const detected = confidence >= this.config.confidence_threshold;

      return {
        detected,
        confidence,
        source: 'ml',
      };
    } catch (error) {
      // Inference failed — emit fallback event and return null
      this.emitEvent({
        type: 'CLASSIFIER_FALLBACK',
        message: `Inference failed: ${(error as Error).message}`,
        timestamp: Date.now(),
        error: error as Error,
      });
      return null;
    }
  }

  /**
   * Get the current model version string.
   */
  getModelVersion(): string {
    return this.modelVersion;
  }

  /**
   * Hot-swap the model without restarting the SDK.
   * Loads a new model from the given path. If loading fails,
   * the previous model state is preserved and a fallback event is emitted.
   */
  async updateModel(newModelPath: string): Promise<void> {
    const previousLoaded = this.modelLoaded;
    const previousVersion = this.modelVersion;

    try {
      if (!this.engine) {
        throw new Error('No inference engine available for model update');
      }

      if (this.engine.loadModel) {
        await this.engine.loadModel(newModelPath);
      }

      this.config = { ...this.config, model_path: newModelPath };
      this.modelLoaded = true;
      this.modelVersion = this.extractModelVersion(newModelPath);

      this.emitEvent({
        type: 'CLASSIFIER_MODEL_UPDATED',
        message: `Model updated to ${newModelPath}`,
        timestamp: Date.now(),
        modelPath: newModelPath,
      });
    } catch (error) {
      // Restore previous state
      this.modelLoaded = previousLoaded;
      this.modelVersion = previousVersion;

      this.emitEvent({
        type: 'CLASSIFIER_FALLBACK',
        message: `Model update failed: ${(error as Error).message}`,
        timestamp: Date.now(),
        modelPath: newModelPath,
        error: error as Error,
      });
    }
  }

  /**
   * Check if the ML model is currently loaded and available.
   */
  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  /**
   * Get the current classifier configuration.
   */
  getConfig(): Readonly<ClassifierConfig> {
    return { ...this.config };
  }

  // ── Event system ─────────────────────────────────────────────

  /**
   * Register an event listener for classifier events.
   */
  on(listener: ClassifierEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an event listener.
   */
  off(listener: ClassifierEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // ── TealModule evaluate interface ────────────────────────────

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
  ): Promise<ModuleResult> {
    const input = request.content ?? '';

    if (!input) {
      return {
        action: 'ALLOW' as any,
        reason_codes: [],
        event_type: EVENT_TYPE_NONE,
      };
    }

    const result = await this.classify(input);

    if (result === null) {
      // ML unavailable — signal fallback
      return {
        action: 'ALLOW' as any,
        reason_codes: [REASON_CODE_FALLBACK],
        event_type: EVENT_TYPE_FALLBACK,
        metadata: { ml_unavailable: true },
      };
    }

    if (result.detected) {
      return {
        action: 'DENY' as any,
        reason_codes: [REASON_CODE_DETECTED],
        event_type: EVENT_TYPE_DETECTED,
        metadata: {
          confidence: result.confidence,
          threshold: this.config.confidence_threshold,
          source: result.source,
        },
      };
    }

    return {
      action: 'ALLOW' as any,
      reason_codes: [],
      event_type: EVENT_TYPE_NONE,
      metadata: {
        confidence: result.confidence,
        source: result.source,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private emitEvent(event: ClassifierEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors to prevent cascading failures
      }
    }
  }

  private extractModelVersion(modelPath: string): string {
    // Extract version from path like "models/classifier-v1.2.3.onnx"
    const match = modelPath.match(/v?(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  }
}
