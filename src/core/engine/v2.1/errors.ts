/**
 * TealEngine v2.1 — Error Hierarchy
 *
 * Extends v1.2 error types with governance-contract-specific errors.
 *
 * @module core/engine/v2.1/errors
 */

import { TealConfigError } from '../v1.2/errors';

/**
 * Thrown when `seal_secret` is required for TEEC v2.1 governance operations
 * but has not been configured. This can occur when:
 * - GovernanceEngineV21 is initialized with governance mode active but no seal_secret
 * - ObserveProxy has `governance: true` but `governance_seal_secret` is missing
 */
export class SealConfigurationError extends TealConfigError {
  constructor(context?: string) {
    super(
      `seal_secret is required for TEEC v2.1 governance. ${context ?? 'Provide seal_secret in engine options or ObserveConfig.governance_seal_secret.'}`,
      'SEAL_SECRET_MISSING',
      { config_key: 'seal_secret' },
    );
    this.name = 'SealConfigurationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SealConfigurationError);
    }
  }
}
