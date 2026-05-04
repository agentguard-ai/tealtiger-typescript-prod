/**
 * TealSecrets — Credential TTL Enforcement
 *
 * Checks credential age against policy-driven maximum TTL.
 * Emits CREDENTIAL_TTL_EXCEEDED or CREDENTIAL_ROTATION_REQUIRED.
 *
 * @module secrets/CredentialTTL
 */

import { CredentialMetadata } from './types';

export interface CredentialTTLResult {
  action: 'DENY' | 'REQUIRE_APPROVAL' | 'ALLOW';
  reason_code: string;
  metadata: {
    type: string;
    age_ms: number;
    policy_max_ttl_ms: number;
  };
}

/** Default warning threshold: 80% of max TTL */
const DEFAULT_WARNING_THRESHOLD = 0.8;

export class CredentialTTLChecker {
  private readonly warningThreshold: number;

  constructor(warningThreshold: number = DEFAULT_WARNING_THRESHOLD) {
    this.warningThreshold = warningThreshold;
  }

  /**
   * Check credential age against policy TTL.
   *
   * - age_ms > policy_max_ttl_ms → DENY + CREDENTIAL_TTL_EXCEEDED
   * - age_ms >= warningThreshold * policy_max_ttl_ms → REQUIRE_APPROVAL + CREDENTIAL_ROTATION_REQUIRED
   * - Otherwise → ALLOW
   */
  check(credential: CredentialMetadata): CredentialTTLResult {
    const age = credential.age_ms ?? 0;
    const maxTtl = credential.policy_max_ttl_ms;

    const baseMeta = {
      type: credential.type,
      age_ms: age,
      policy_max_ttl_ms: maxTtl,
    };

    if (age > maxTtl) {
      return {
        action: 'DENY',
        reason_code: 'CREDENTIAL_TTL_EXCEEDED',
        metadata: baseMeta,
      };
    }

    if (age >= maxTtl * this.warningThreshold) {
      return {
        action: 'REQUIRE_APPROVAL',
        reason_code: 'CREDENTIAL_ROTATION_REQUIRED',
        metadata: baseMeta,
      };
    }

    return {
      action: 'ALLOW',
      reason_code: 'POLICY_COMPLIANT',
      metadata: baseMeta,
    };
  }
}
