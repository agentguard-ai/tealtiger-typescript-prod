/**
 * TealEngine v2.1 — validateGovernanceDecision
 *
 * Pure validation function for TEEC v2.1 Governance Decisions.
 * Performs schema validation, timestamp drift checks, intent binding
 * verification, and cryptographic seal verification.
 *
 * @module core/engine/v2.1/validateGovernanceDecision
 */

import { CryptoService } from './CryptoService';
import type { ValidationContext, ValidationResult } from './types';

/**
 * The six v2.1 fields required on a valid DecisionV21.
 * Used for schema validation to distinguish v2.1 from v1.2 decisions.
 */
const V21_REQUIRED_FIELDS = [
  'intent_ref',
  'receipt_ref',
  'seq',
  'running_count',
  'normalization_id',
  'governance_seal',
] as const;

/**
 * Fields characteristic of a v1.2 Decision (present in v1.2 but not v2.1-specific).
 * Used to detect when a v1.2 decision is mistakenly passed for v2.1 validation.
 */
const V12_CHARACTERISTIC_FIELDS = [
  'action',
  'reason_codes',
  'risk_score',
  'mode',
  'policy_id',
  'correlation_id',
] as const;

/**
 * Check whether a value looks like a v1.2 Decision (has v1.2 characteristic fields
 * but lacks v2.1 fields).
 */
function hasV12Fields(decision: Record<string, unknown>): boolean {
  const matchCount = V12_CHARACTERISTIC_FIELDS.filter(
    (field) => field in decision,
  ).length;
  // If at least 4 of 6 characteristic v1.2 fields are present, it's likely a v1.2 decision
  return matchCount >= 4;
}

/**
 * Validate that the governance_seal object has the correct shape.
 */
function isValidGovernanceSeal(seal: unknown): seal is { hmac: string; timestamp: number; agent_id: string } {
  if (!seal || typeof seal !== 'object') return false;
  const s = seal as Record<string, unknown>;
  return (
    typeof s.hmac === 'string' &&
    typeof s.timestamp === 'number' &&
    typeof s.agent_id === 'string'
  );
}

/**
 * Validate a TEEC v2.1 Governance Decision.
 *
 * Performs four sequential checks:
 * 1. **Schema check** — verifies all six v2.1 fields are present and correctly typed
 * 2. **Timestamp drift check** — ensures the seal timestamp is within tolerance of reference_time
 * 3. **Intent ref verification** — recomputes SHA-256 of the serialized request payload
 * 4. **Seal verification** — recomputes HMAC and compares to stored seal
 *
 * Returns `ValidationSuccess` on pass, `ValidationFailure` with specific error_type on fail.
 *
 * @param decision - The decision object to validate (accepts any object for schema checking)
 * @param context - Validation context with request_payload, seal_secret, and optional timing params
 * @returns A discriminated union indicating success or the specific failure type
 *
 * @example
 * ```typescript
 * const result = validateGovernanceDecision(decision, {
 *   request_payload: originalRequest,
 *   seal_secret: 'my-secret',
 *   reference_time: Date.now(),
 *   timestamp_tolerance_ms: 60000,
 * });
 *
 * if (result.valid) {
 *   console.log('Decision verified:', result.receipt_ref);
 * } else {
 *   console.error(`Validation failed: ${result.error_type} — ${result.message}`);
 * }
 * ```
 */
export function validateGovernanceDecision(
  decision: Record<string, unknown>,
  context: ValidationContext,
): ValidationResult {
  const { request_payload, seal_secret, reference_time, timestamp_tolerance_ms } = context;
  const tolerance = timestamp_tolerance_ms ?? 60000;
  const refTime = reference_time ?? Date.now();

  // ── 1. Schema check ─────────────────────────────────────────────

  const missingFields = V21_REQUIRED_FIELDS.filter((field) => !(field in decision));

  if (missingFields.length > 0) {
    if (hasV12Fields(decision)) {
      return {
        valid: false,
        error_type: 'schema_violation',
        message:
          'Decision is TEEC v1.2 — use TEECValidator.validateDecision() for v1.2 validation. ' +
          `Missing v2.1 fields: ${missingFields.join(', ')}`,
      };
    }
    return {
      valid: false,
      error_type: 'schema_violation',
      message: `Decision is missing required TEEC v2.1 fields: ${missingFields.join(', ')}`,
    };
  }

  // Type checks for v2.1 fields
  if (typeof decision.intent_ref !== 'string') {
    return {
      valid: false,
      error_type: 'schema_violation',
      message: 'Field "intent_ref" must be a string',
    };
  }
  if (typeof decision.receipt_ref !== 'string') {
    return {
      valid: false,
      error_type: 'schema_violation',
      message: 'Field "receipt_ref" must be a string',
    };
  }
  if (typeof decision.seq !== 'number') {
    return {
      valid: false,
      error_type: 'schema_violation',
      message: 'Field "seq" must be a number',
    };
  }
  if (typeof decision.running_count !== 'number') {
    return {
      valid: false,
      error_type: 'schema_violation',
      message: 'Field "running_count" must be a number',
    };
  }
  if (typeof decision.normalization_id !== 'string') {
    return {
      valid: false,
      error_type: 'schema_violation',
      message: 'Field "normalization_id" must be a string',
    };
  }
  if (!isValidGovernanceSeal(decision.governance_seal)) {
    return {
      valid: false,
      error_type: 'schema_violation',
      message:
        'Field "governance_seal" must be an object with { hmac: string, timestamp: number, agent_id: string }',
    };
  }

  // From this point we know the decision has valid structure
  const seal = decision.governance_seal as { hmac: string; timestamp: number; agent_id: string };

  // ── 2. Timestamp drift check ────────────────────────────────────

  const drift = Math.abs(seal.timestamp - refTime);
  if (drift > tolerance) {
    return {
      valid: false,
      error_type: 'timestamp_drift',
      message:
        `Seal timestamp drift of ${drift}ms exceeds tolerance of ${tolerance}ms. ` +
        `Seal timestamp: ${seal.timestamp}, reference time: ${refTime}`,
    };
  }

  // ── 3. Intent ref verification ──────────────────────────────────

  const serializedPayload = CryptoService.deterministicSerialize(request_payload);
  const expectedIntentRef = CryptoService.sha256(serializedPayload);

  if (expectedIntentRef !== decision.intent_ref) {
    return {
      valid: false,
      error_type: 'intent_mismatch',
      message:
        'Intent ref verification failed — the request payload does not match the intent_ref ' +
        'stored in the decision. This may indicate a TOCTOU violation or incorrect payload.',
    };
  }

  // ── 4. Seal verification ────────────────────────────────────────

  // Build the decision payload excluding governance_seal
  const decisionForSeal: Record<string, unknown> = {};
  for (const key of Object.keys(decision)) {
    if (key !== 'governance_seal') {
      decisionForSeal[key] = decision[key];
    }
  }

  const sealPayload = CryptoService.deterministicSerialize(decisionForSeal);
  const hmacInput = sealPayload + String(seal.timestamp) + seal.agent_id;
  const expectedHmac = CryptoService.hmacSha256(seal_secret, hmacInput);

  if (expectedHmac !== seal.hmac) {
    return {
      valid: false,
      error_type: 'seal_mismatch',
      message:
        'Governance seal verification failed — the HMAC does not match. ' +
        'This may indicate tampering, an incorrect seal_secret, or a modified decision payload.',
    };
  }

  // ── 5. All checks passed ────────────────────────────────────────

  return {
    valid: true,
    receipt_ref: decision.receipt_ref as string,
    intent_ref: decision.intent_ref as string,
  };
}
