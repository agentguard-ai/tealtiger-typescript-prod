/**
 * TealClassifier Module — Public API
 *
 * Re-exports the TealClassifier ONNX loading/inference module
 * and the EnsembleEvaluator for combining regex + ML signals.
 *
 * @module modules/tealclassifier
 */

export {
  TealClassifierModule,
  type InferenceEngine,
  type ClassifierEvent,
  type ClassifierEventListener,
} from './TealClassifier';

export {
  EnsembleEvaluator,
  type EnsembleResult,
} from './ensemble';
