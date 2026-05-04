/**
 * Detector Registry — Exports all built-in detectors as a combined registry.
 */
import { SecretPattern } from '../types';
import { cloudDetectors } from './cloud';
import { vcsDetectors } from './vcs';
import { aiProviderDetectors } from './ai-providers';
import { databaseDetectors } from './database';
import { paymentDetectors } from './payments';
import { saasDetectors } from './saas';
import { infrastructureDetectors } from './infrastructure';
import { genericDetectors } from './generic';

/** All built-in detector patterns combined into a single registry. */
export const builtInDetectors: SecretPattern[] = [
  ...cloudDetectors,
  ...vcsDetectors,
  ...aiProviderDetectors,
  ...databaseDetectors,
  ...paymentDetectors,
  ...saasDetectors,
  ...infrastructureDetectors,
  ...genericDetectors,
];

export {
  cloudDetectors,
  vcsDetectors,
  aiProviderDetectors,
  databaseDetectors,
  paymentDetectors,
  saasDetectors,
  infrastructureDetectors,
  genericDetectors,
};
