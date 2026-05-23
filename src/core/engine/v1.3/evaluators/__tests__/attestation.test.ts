import { V13ReasonCode } from '../../types';
import { evaluateAttestation } from '../attestation';
import type { GovernanceRequest, AttestationConfig, AgentAttestation } from '../../types';

describe('evaluateAttestation', () => {
  const config: AttestationConfig = {
    required: true,
    trusted_signers: ['signer-key-001'],
    max_attestation_age_ms: 60_000,
  };

  const validAttestation: AgentAttestation = {
    agent_id: 'agent-007',
    signature: 'valid-sig',
    signer: 'signer-key-001',
    attested_at: Date.now() - 10_000,
    integrity_hash: 'sha256-ghi789',
  };

  describe('table-driven: base scenarios', () => {
    const cases = [
      { name: 'returns null when not required', config: { ...config, required: false } as AttestationConfig, attestation: undefined, expected: null },
      { name: 'returns null when config is undefined', config: undefined, attestation: undefined, expected: null },
      { name: 'denies when attestation missing', config, attestation: undefined, expected: V13ReasonCode.AGENT_ATTESTATION_MISSING },
      { name: 'allows valid attestation', config, attestation: validAttestation, expected: null },
    ];

    it.each(cases)('$name', ({ config: cfg, attestation, expected }) => {
      const request: GovernanceRequest = attestation ? { attestation } : {};
      const result = evaluateAttestation(request, cfg);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.reason_code).toBe(expected);
      }
    });
  });

  describe('table-driven: integrity failures', () => {
    const now = Date.now();

    const cases = [
      {
        name: 'untrusted signer',
        attestation: { ...validAttestation, signer: 'untrusted-signer' },
        expected: V13ReasonCode.AGENT_INTEGRITY_FAILED,
      },
      {
        name: 'expired attestation',
        attestation: { ...validAttestation, attested_at: now - 120_000 },
        expected: V13ReasonCode.AGENT_INTEGRITY_FAILED,
      },
      {
        name: 'empty signature',
        attestation: { ...validAttestation, signature: '' },
        expected: V13ReasonCode.AGENT_INTEGRITY_FAILED,
      },
      {
        name: 'empty integrity hash',
        attestation: { ...validAttestation, integrity_hash: '' },
        expected: V13ReasonCode.AGENT_INTEGRITY_FAILED,
      },
    ];

    it.each(cases)('$name', ({ attestation, expected }) => {
      const request: GovernanceRequest = { attestation: attestation as AgentAttestation };
      const result = evaluateAttestation(request, config);
      expect(result).not.toBeNull();
      expect(result!.reason_code).toBe(expected);
    });
  });

  it('skips age check when max_attestation_age_ms is not set', () => {
    const configNoAge: AttestationConfig = {
      required: true,
      trusted_signers: ['signer-key-001'],
    };

    const oldAttestation: AgentAttestation = {
      ...validAttestation,
      attested_at: Date.now() - 3_600_000,
    };

    const result = evaluateAttestation({ attestation: oldAttestation } as GovernanceRequest, configNoAge);
    expect(result).toBeNull();
  });

  it('skips signer check when trusted_signers is empty', () => {
    const configNoSigners: AttestationConfig = {
      required: true,
      trusted_signers: [],
    };

    const result = evaluateAttestation({ attestation: validAttestation } as GovernanceRequest, configNoSigners);
    expect(result).toBeNull();
  });
});
