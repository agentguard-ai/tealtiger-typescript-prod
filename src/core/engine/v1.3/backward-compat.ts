/**
 * Backward Compatibility Layer — v1.2 → v1.3 Migration
 *
 * Ensures all v1.2 policy configurations are accepted without modification.
 * When no v1.3-specific features are configured, behavior is identical to v1.2.
 *
 * Key guarantees:
 * - All v1.2 policy configurations accepted without modification
 * - No v1.3 features configured = v1.2 behavior
 * - TealClassifier defaults to `regex_only`
 * - TealFlow is opt-in (not loaded unless configured)
 * - Public API surface unchanged
 * - All new config fields optional with v1.2-equivalent defaults
 *
 * @module core/engine/v1.3/backward-compat
 * @requirements 11.1–11.11
 */

import type { TealEngineV13Options } from './types';

// ── v1.3-specific configuration keys ────────────────────────────

/**
 * Keys that are exclusive to v1.3 configuration.
 * If none of these are present, the config is a v1.2 config.
 */
const V13_SPECIFIC_KEYS: ReadonlyArray<string> = [
  'freeze_rules',
  'plan_only_mode',
  'plan_only_config',
  'nhi_inventory',
  'automation_levels',
  'zsp_config',
  'attestation_config',
  'proof_config',
  'flow_config',
  'response_hooks',
  'otel_config',
  'code_change_policy',
  'policy_packs',
];

// ── BackwardCompatibilityLayer ───────────────────────────────────

/**
 * BackwardCompatibilityLayer — detects v1.2 configurations and wraps them
 * with v1.3 defaults to ensure identical behavior.
 *
 * @example
 * ```typescript
 * const compat = new BackwardCompatibilityLayer();
 *
 * if (compat.isV12Config(userConfig)) {
 *   const v13Config = compat.wrapV12Config(userConfig);
 *   const engine = new TealEngineV13(v13Config);
 * }
 * ```
 */
export class BackwardCompatibilityLayer {
  /**
   * Detect whether a configuration object is a v1.2 configuration.
   *
   * A config is considered v1.2 if it does NOT contain any v1.3-specific keys.
   * This includes configs that have only the base v1.2 fields: modules, policy,
   * mode, and failurePolicy.
   *
   * @param config - The configuration object to check
   * @returns true if the config is a v1.2 configuration (no v1.3 features)
   */
  isV12Config(config: unknown): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }

    const configObj = config as Record<string, unknown>;

    // A v1.2 config must have at least a 'policy' field
    if (!('policy' in configObj)) {
      return false;
    }

    // Check if any v1.3-specific keys are present
    for (const key of V13_SPECIFIC_KEYS) {
      if (key in configObj && configObj[key] !== undefined) {
        return false;
      }
    }

    return true;
  }

  /**
   * Wrap a v1.2 configuration with v1.3 defaults.
   *
   * Ensures that:
   * - All v1.2 fields are preserved as-is
   * - No v1.3 features are enabled (preserving v1.2 behavior)
   * - TealClassifier defaults to `regex_only` (no ML loaded)
   * - TealFlow is not loaded (opt-in only)
   * - FREEZE rules are empty (no immutable blocks)
   * - PLAN_ONLY mode is disabled
   * - NHI governance is disabled
   * - ZSP is disabled
   * - Attestation is not required
   *
   * @param config - The v1.2 configuration to wrap
   * @returns A TealEngineV13Options object with v1.2-equivalent defaults
   */
  wrapV12Config(config: unknown): TealEngineV13Options {
    if (!config || typeof config !== 'object') {
      return {
        policy: {},
      } as TealEngineV13Options;
    }

    const v12Config = config as Record<string, unknown>;

    // Preserve all v1.2 fields exactly as provided
    // Build incrementally to satisfy exactOptionalPropertyTypes
    const v13Options: TealEngineV13Options = {
      policy: (v12Config.policy as Record<string, unknown>) ?? {},
    };

    // Only include v1.2 fields that are actually defined
    if (v12Config.modules !== undefined) {
      (v13Options as any).modules = v12Config.modules;
    }
    if (v12Config.mode !== undefined) {
      (v13Options as any).mode = v12Config.mode;
    }
    if (v12Config.failurePolicy !== undefined) {
      (v13Options as any).failurePolicy = v12Config.failurePolicy;
    }

    // v1.3 fields are intentionally omitted to preserve v1.2 behavior

    return v13Options;
  }

  /**
   * Get the default TealClassifier ensemble mode for v1.2 compatibility.
   * Always returns 'regex_only' to preserve v1.2 detection behavior.
   */
  getDefaultClassifierMode(): 'regex_only' {
    return 'regex_only';
  }

  /**
   * Check if TealFlow should be loaded based on configuration.
   * TealFlow is opt-in — only loaded when explicitly configured.
   *
   * @param config - The engine configuration
   * @returns true if TealFlow should be loaded
   */
  shouldLoadTealFlow(config: unknown): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }

    const configObj = config as Record<string, unknown>;
    const flowConfig = configObj.flow_config as Record<string, unknown> | undefined;

    // TealFlow is only loaded when flow_config is present and enabled
    return flowConfig !== undefined && flowConfig?.enabled === true;
  }

  /**
   * Validate that a v1.2 config will produce identical behavior in v1.3.
   * Returns a list of any compatibility warnings.
   *
   * @param config - The configuration to validate
   * @returns Array of warning messages (empty if fully compatible)
   */
  validateCompatibility(config: unknown): string[] {
    const warnings: string[] = [];

    if (!config || typeof config !== 'object') {
      warnings.push('Configuration is not a valid object');
      return warnings;
    }

    const configObj = config as Record<string, unknown>;

    // Check for required v1.2 fields
    if (!('policy' in configObj)) {
      warnings.push('Missing required "policy" field');
    }

    // Check for deprecated fields that might cause confusion
    if ('version' in configObj && configObj.version === '1.2.0') {
      // Explicit v1.2 version marker — this is fine, just informational
    }

    return warnings;
  }
}
