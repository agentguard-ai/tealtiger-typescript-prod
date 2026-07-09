/**
 * TealEngine v2.1 — Public API
 *
 * Re-exports all v2.1 types, classes, and utilities for the
 * TEEC v2.1 Governance Contract.
 *
 * @module core/engine/v2.1
 */

// Types
export type {
  GovernanceSeal,
  DecisionV21,
  ValidationContext,
  ValidationSuccess,
  ValidationFailure,
  ValidationResult,
  ContiguitySuccess,
  ContiguityFailure,
  ContiguityResult,
} from './types';

export { GENESIS_RECEIPT_REF } from './types';

// Errors
export { SealConfigurationError } from './errors';

// Counter Management
export { CounterManager } from './CounterManager';

// Crypto
export { CryptoService } from './CryptoService';

// Governance Engine
export { GovernanceEngineV21 } from './GovernanceEngineV21';
export type { GovernanceEngineV21Options } from './GovernanceEngineV21';

// Validation
export { validateGovernanceDecision } from './validateGovernanceDecision';

// Contiguity Verification
export { verifyContiguity } from './verifyContiguity';
