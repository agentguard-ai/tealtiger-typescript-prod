/**
 * Policy Bundle Hot-Swap Manager
 *
 * Manages runtime loading and validation of governance policy bundles.
 * Supports hot-swapping bundles without process restart while preserving
 * FREEZE rule immutability — FREEZE rules from new bundles are ADDED to
 * existing rules but never removed.
 *
 * @module core/engine/v1.3/policy-hotswap
 * @see Requirements 1.6, 1.7, 4.8, 15.4
 */

import { createHash } from 'crypto';
import type { PolicyBundle, FreezeRule } from './types';
import type { GovernanceEvent, GovernanceEventListener } from './TealEngineV13';

// ── Event Types ──────────────────────────────────────────────────

export const HotSwapEventType = {
  POLICY_BUNDLE_LOADED: 'POLICY_BUNDLE_LOADED',
  POLICY_BUNDLE_SWAP_FAILED: 'POLICY_BUNDLE_SWAP_FAILED',
} as const;

// ── Validation Result ────────────────────────────────────────────

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LoadPolicyResult {
  success: boolean;
  error?: string;
}

// ── SDK Capabilities (for capability negotiation) ────────────────

const SDK_CAPABILITIES = [
  'freeze_rules',
  'plan_only_mode',
  'nhi_governance',
  'zsp',
  'attestation',
  'automation_levels',
  'code_change_governance',
  'cost_governance',
  'proof_chain',
  'tealflow',
  'drift_detection',
  'state_governance',
  'temporal_governance',
  'siem_export',
  'otel_spans',
  'response_hooks',
  'classifier_ensemble',
  'unicode_normalization',
  'encoded_output_detection',
  'control_char_sanitization',
  'markdown_exfiltration_detection',
  'memory_provenance',
  'mcp_drift_detection',
];

// ── PolicyHotSwapManager ─────────────────────────────────────────

export class PolicyHotSwapManager {
  private activeBundle: PolicyBundle | null = null;
  private accumulatedFreezeRules: FreezeRule[] = [];
  private readonly eventListeners: GovernanceEventListener[] = [];
  private readonly sdkCapabilities: string[];

  constructor(sdkCapabilities?: string[]) {
    this.sdkCapabilities = sdkCapabilities ?? SDK_CAPABILITIES;
  }

  /**
   * Validate and load a new policy bundle.
   *
   * On validation failure: retains previous bundle, emits POLICY_BUNDLE_SWAP_FAILED.
   * On success: replaces active bundle, accumulates FREEZE rules, emits POLICY_BUNDLE_LOADED.
   *
   * FREEZE rules from the new bundle are ADDED to existing FREEZE rules (never removed).
   */
  loadPolicy(newBundle: PolicyBundle): LoadPolicyResult {
    const validation = this.validateBundle(newBundle);

    if (!validation.valid) {
      const errorMessage = validation.errors.join('; ');

      this.emitEvent({
        type: HotSwapEventType.POLICY_BUNDLE_SWAP_FAILED,
        timestamp: Date.now(),
        details: {
          errors: validation.errors,
          bundle_version: newBundle.bundle_version,
          message: `Policy bundle swap failed: ${errorMessage}`,
        },
      });

      return { success: false, error: errorMessage };
    }

    // Accumulate FREEZE rules (never remove existing ones)
    if (newBundle.freeze_rules && newBundle.freeze_rules.length > 0) {
      const existingIds = new Set(this.accumulatedFreezeRules.map((r) => r.id));
      for (const rule of newBundle.freeze_rules) {
        if (!existingIds.has(rule.id)) {
          this.accumulatedFreezeRules.push(Object.freeze({ ...rule }));
        }
      }
    }

    // Replace active bundle
    this.activeBundle = newBundle;

    this.emitEvent({
      type: HotSwapEventType.POLICY_BUNDLE_LOADED,
      timestamp: Date.now(),
      details: {
        bundle_version: newBundle.bundle_version,
        policy_count: newBundle.policies.length,
        freeze_rules_total: this.accumulatedFreezeRules.length,
        message: `Policy bundle v${newBundle.bundle_version} loaded successfully.`,
      },
    });

    return { success: true };
  }

  /**
   * Get the currently active policy bundle.
   */
  getActiveBundle(): PolicyBundle | null {
    return this.activeBundle;
  }

  /**
   * Get all accumulated FREEZE rules (persisted across hot-swaps).
   */
  getAccumulatedFreezeRules(): ReadonlyArray<FreezeRule> {
    return Object.freeze([...this.accumulatedFreezeRules]);
  }

  /**
   * Validate a policy bundle without loading it.
   *
   * Checks:
   * 1. Schema validity (required fields present)
   * 2. Integrity hash (SHA-256 of bundle contents)
   * 3. Capability requirements match SDK capabilities
   * 4. Signature verification (Ed25519 placeholder)
   */
  validateBundle(bundle: PolicyBundle): BundleValidationResult {
    const errors: string[] = [];

    // 1. Schema validity
    this.validateSchema(bundle, errors);

    // 2. Integrity hash verification
    this.validateIntegrityHash(bundle, errors);

    // 3. Capability requirements
    this.validateCapabilities(bundle, errors);

    // 4. Signature verification (Ed25519 placeholder)
    this.validateSignature(bundle, errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Register an event listener for hot-swap events.
   */
  onEvent(listener: GovernanceEventListener): void {
    this.eventListeners.push(listener);
  }

  // ── Private Validation Methods ─────────────────────────────────

  private validateSchema(bundle: PolicyBundle, errors: string[]): void {
    if (!bundle.bundle_version || typeof bundle.bundle_version !== 'string') {
      errors.push('Missing or invalid bundle_version');
    }

    if (!bundle.requires_sdk || typeof bundle.requires_sdk !== 'string') {
      errors.push('Missing or invalid requires_sdk');
    }

    if (!bundle.requires_teec || typeof bundle.requires_teec !== 'string') {
      errors.push('Missing or invalid requires_teec');
    }

    if (!Array.isArray(bundle.required_capabilities)) {
      errors.push('Missing or invalid required_capabilities (must be array)');
    }

    if (!bundle.hash || typeof bundle.hash !== 'string') {
      errors.push('Missing or invalid hash');
    }

    if (!Array.isArray(bundle.policies)) {
      errors.push('Missing or invalid policies (must be array)');
    } else if (bundle.policies.length === 0) {
      errors.push('TealTiger: Policy bundle is empty. At least one policy rule is required.');
    }

    if (!bundle.fail_behavior || !['fail_closed', 'fail_open'].includes(bundle.fail_behavior)) {
      errors.push('Missing or invalid fail_behavior (must be "fail_closed" or "fail_open")');
    }

    // Validate individual policies have required fields
    if (Array.isArray(bundle.policies)) {
      for (let i = 0; i < bundle.policies.length; i++) {
        const policy = bundle.policies[i];
        if (!policy.id) {
          errors.push(`Policy at index ${i} missing 'id'`);
        }
        if (!policy.control_id) {
          errors.push(`Policy at index ${i} missing 'control_id'`);
        }
        if (!policy.match) {
          errors.push(`Policy at index ${i} missing 'match'`);
        }
        if (!policy.action) {
          errors.push(`Policy at index ${i} missing 'action'`);
        }
      }
    }
  }

  private validateIntegrityHash(bundle: PolicyBundle, errors: string[]): void {
    if (!bundle.hash) {
      // Already caught by schema validation
      return;
    }

    const computedHash = this.computeBundleHash(bundle);
    if (computedHash !== bundle.hash) {
      errors.push(
        `Integrity hash mismatch: expected ${bundle.hash}, computed ${computedHash}`,
      );
    }
  }

  private validateCapabilities(bundle: PolicyBundle, errors: string[]): void {
    if (!Array.isArray(bundle.required_capabilities)) {
      return;
    }

    const missing: string[] = [];
    for (const cap of bundle.required_capabilities) {
      if (!this.sdkCapabilities.includes(cap)) {
        missing.push(cap);
      }
    }

    if (missing.length > 0) {
      errors.push(
        `Bundle requires unsupported capabilities: ${missing.join(', ')}`,
      );
    }
  }

  private validateSignature(bundle: PolicyBundle, errors: string[]): void {
    // Ed25519 signature verification placeholder
    // When signature is present, verify it against the bundle hash
    if (bundle.signature) {
      // Placeholder: accept signatures that are non-empty and at least 64 chars
      // In production, this would verify against a trusted public key
      if (bundle.signature.length < 64) {
        errors.push('Invalid signature: too short (minimum 64 characters for Ed25519)');
      }
    }
    // If no signature is present, that's acceptable (signature is optional)
  }

  // ── Utility Methods ────────────────────────────────────────────

  /**
   * Compute SHA-256 hash of bundle contents for integrity verification.
   * Hash is computed over: bundle_version + requires_sdk + requires_teec +
   * required_capabilities + policies (serialized) + fail_behavior
   */
  computeBundleHash(bundle: PolicyBundle): string {
    const content = JSON.stringify({
      bundle_version: bundle.bundle_version,
      requires_sdk: bundle.requires_sdk,
      requires_teec: bundle.requires_teec,
      required_capabilities: bundle.required_capabilities,
      policies: bundle.policies,
      fail_behavior: bundle.fail_behavior,
      cost_limits: bundle.cost_limits,
      freeze_rules: bundle.freeze_rules,
    });

    return createHash('sha256').update(content).digest('hex');
  }

  private emitEvent(event: GovernanceEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Event listeners should not break the hot-swap manager
      }
    }
  }
}
