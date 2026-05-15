/**
 * Anti-Tamper Guard
 *
 * Enforces separation of duties between governance teams and developers.
 * Prevents application code from weakening, bypassing, or tampering with
 * governance enforcement through forbidden config keys, registry endpoint
 * validation, and capability mismatch detection.
 *
 * @module core/engine/v1.3/anti-tamper
 * @see Requirements 15.1–15.16
 */

import type { PolicyBundle } from './types';
import type { GovernanceEvent, GovernanceEventListener } from './TealEngineV13';

// ── Event Types ──────────────────────────────────────────────────

export const AntiTamperEventType = {
  TAMPER_ATTEMPT: 'TAMPER_ATTEMPT',
  REGISTRY_ENDPOINT_VIOLATION: 'REGISTRY_ENDPOINT_VIOLATION',
  CAPABILITY_MISMATCH: 'CAPABILITY_MISMATCH',
  BUNDLE_INTEGRITY_FAILURE: 'BUNDLE_INTEGRITY_FAILURE',
} as const;

// ── Forbidden Configuration Keys ─────────────────────────────────

/**
 * Configuration keys that are forbidden because they would weaken
 * or bypass governance enforcement. Any attempt to set these keys
 * is logged as a TAMPER_ATTEMPT and the setting is ignored.
 */
const FORBIDDEN_CONFIG_KEYS: ReadonlyArray<string> = [
  'disable_enforcement',
  'bypass',
  'allow_all',
  'permissive_mode',
  'skip_governance',
  'no_enforce',
];

// ── Result Types ─────────────────────────────────────────────────

export interface ConfigCheckResult {
  tampered: boolean;
  forbidden_keys: string[];
}

export interface EndpointValidationResult {
  allowed: boolean;
  reason_code?: string;
}

export interface CapabilityCheckResult {
  compatible: boolean;
  missing: string[];
}

// ── AntiTamperGuard ──────────────────────────────────────────────

export class AntiTamperGuard {
  private readonly eventListeners: GovernanceEventListener[] = [];

  /**
   * Check a configuration object for forbidden keys that would
   * weaken or bypass governance enforcement.
   *
   * Forbidden keys: disable_enforcement, bypass, allow_all,
   * permissive_mode, skip_governance, no_enforce
   *
   * When a forbidden key is detected:
   * - Logs a TAMPER_ATTEMPT security event
   * - The forbidden setting is ignored (not applied)
   */
  checkConfig(config: Record<string, unknown>): ConfigCheckResult {
    const forbidden_keys: string[] = [];

    for (const key of Object.keys(config)) {
      if (FORBIDDEN_CONFIG_KEYS.includes(key)) {
        forbidden_keys.push(key);
      }
    }

    if (forbidden_keys.length > 0) {
      this.emitEvent({
        type: AntiTamperEventType.TAMPER_ATTEMPT,
        timestamp: Date.now(),
        details: {
          message: `Forbidden configuration keys detected and ignored: ${forbidden_keys.join(', ')}`,
          forbidden_keys,
          total_keys_in_config: Object.keys(config).length,
        },
      });
    }

    return {
      tampered: forbidden_keys.length > 0,
      forbidden_keys,
    };
  }

  /**
   * Validate a registry endpoint against a platform-managed allowlist.
   *
   * The SDK SHALL only connect to registry endpoints present in the allowlist.
   * When an endpoint is not in the allowlist, emits REGISTRY_ENDPOINT_VIOLATION.
   */
  validateRegistryEndpoint(
    endpoint: string,
    allowlist: string[],
  ): EndpointValidationResult {
    // Normalize endpoint for comparison (trim trailing slashes, lowercase)
    const normalizedEndpoint = this.normalizeEndpoint(endpoint);
    const normalizedAllowlist = allowlist.map((e) => this.normalizeEndpoint(e));

    const isAllowed = normalizedAllowlist.some(
      (allowed) => normalizedEndpoint === allowed || normalizedEndpoint.startsWith(allowed + '/'),
    );

    if (!isAllowed) {
      this.emitEvent({
        type: AntiTamperEventType.REGISTRY_ENDPOINT_VIOLATION,
        timestamp: Date.now(),
        details: {
          message: `Registry endpoint not in allowlist: ${endpoint}`,
          endpoint,
          allowlist,
        },
      });

      return {
        allowed: false,
        reason_code: 'REGISTRY_ENDPOINT_VIOLATION',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if a policy bundle's required capabilities are supported
   * by the current SDK version.
   *
   * When a bundle requires unsupported capabilities, the SDK refuses
   * to load it and emits CAPABILITY_MISMATCH.
   */
  checkCapabilityMismatch(
    bundle: PolicyBundle,
    sdkCapabilities: string[],
  ): CapabilityCheckResult {
    const missing: string[] = [];

    for (const required of bundle.required_capabilities) {
      if (!sdkCapabilities.includes(required)) {
        missing.push(required);
      }
    }

    if (missing.length > 0) {
      this.emitEvent({
        type: AntiTamperEventType.CAPABILITY_MISMATCH,
        timestamp: Date.now(),
        details: {
          message: `Bundle requires unsupported capabilities: ${missing.join(', ')}`,
          bundle_version: bundle.bundle_version,
          required_capabilities: bundle.required_capabilities,
          sdk_capabilities: sdkCapabilities,
          missing_capabilities: missing,
        },
      });
    }

    return {
      compatible: missing.length === 0,
      missing,
    };
  }

  /**
   * Register an event listener for anti-tamper events.
   */
  onEvent(listener: GovernanceEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Get the list of forbidden configuration keys.
   */
  getForbiddenKeys(): ReadonlyArray<string> {
    return FORBIDDEN_CONFIG_KEYS;
  }

  // ── Private Helpers ────────────────────────────────────────────

  private normalizeEndpoint(endpoint: string): string {
    return endpoint.toLowerCase().replace(/\/+$/, '');
  }

  private emitEvent(event: GovernanceEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Event listeners should not break the anti-tamper guard
      }
    }
  }
}
