/**
 * TealSecrets Module — Public API
 *
 * @module secrets
 */

export { TealSecrets } from './TealSecrets';
export { ConfidenceScorer } from './ConfidenceScorer';
export { DetectionCache } from './DetectionCache';
export { CredentialTTLChecker } from './CredentialTTL';
export type { CredentialTTLResult } from './CredentialTTL';

export type {
  SecretCategory,
  Severity,
  SecretPattern,
  ContentLocation,
  ConfidenceSignals,
  SecretFindingFull,
  CacheOptions,
  CredentialMetadata,
  TealSecretsPolicy,
} from './types';

export { builtInDetectors } from './detectors';
