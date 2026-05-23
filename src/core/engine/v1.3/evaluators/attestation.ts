import { V13ReasonCode } from '../types';
import type { GovernanceRequest, AttestationConfig, AgentAttestation } from '../types';
import type { PreEvalDenyResult } from './types';

export function evaluateAttestation(
  request: GovernanceRequest,
  attestationConfig?: AttestationConfig,
): PreEvalDenyResult | null {
  if (!attestationConfig || !attestationConfig.required) {
    return null;
  }

  const attestation = request.attestation;

  if (!attestation) {
    return {
      reason_code: V13ReasonCode.AGENT_ATTESTATION_MISSING,
      reason: 'Agent attestation is required but was not provided in the governance request.',
      metadata: {
        attestation_required: true,
      },
    };
  }

  if (!isAttestationValid(attestation, attestationConfig)) {
    return {
      reason_code: V13ReasonCode.AGENT_INTEGRITY_FAILED,
      reason: `Agent attestation integrity check failed for agent '${attestation.agent_id}'.`,
      metadata: {
        agent_id: attestation.agent_id,
        signer: attestation.signer,
        attested_at: attestation.attested_at,
      },
    };
  }

  return null;
}

function isAttestationValid(
  attestation: AgentAttestation,
  config: AttestationConfig,
): boolean {
  if (config.trusted_signers.length > 0) {
    if (!config.trusted_signers.includes(attestation.signer)) {
      return false;
    }
  }

  if (config.max_attestation_age_ms) {
    const age = Date.now() - attestation.attested_at;
    if (age > config.max_attestation_age_ms) {
      return false;
    }
  }

  if (!attestation.signature || attestation.signature.length === 0) {
    return false;
  }

  if (!attestation.integrity_hash || attestation.integrity_hash.length === 0) {
    return false;
  }

  return true;
}
