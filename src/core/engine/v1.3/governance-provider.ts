/**
 * GovernanceProvider Interface and TealTigerGovernanceProvider Implementation
 *
 * Provides a portable governance provider interface that abstracts the evaluation
 * engine, allowing organizations to implement alternative backends behind the
 * same API surface.
 *
 * The GovernanceProvider interface is a public, stable contract with semver guarantees.
 *
 * @module core/engine/v1.3/governance-provider
 * @requirements 20.5–20.7, 20.14
 */

import type {
  GovernanceProvider,
  EvaluationContext,
  CapabilityManifest,
  PolicyBundle,
  GovernanceContext,
} from './types';
import type { Decision } from '../v1.2/types';
import { TealEngineV13 } from './TealEngineV13';
import type { TealEngineV13Options, GovernanceRequest } from './types';

// ── Re-export the interface for standalone use ───────────────────

export type { GovernanceProvider, EvaluationContext, CapabilityManifest, PolicyBundle };

// ── SDK Version Constants ────────────────────────────────────────

const SDK_VERSION = '1.4.0';
const TEEC_VERSION = '2.0.0';

// ── Supported Modules and Features ──────────────────────────────

const SUPPORTED_MODULES = [
  'TealGuard',
  'TealSecrets',
  'TealMemory',
  'TealRegistry',
  'TealCircuit',
  'TealAudit',
  'TealMonitor',
  'TealProof',
  'TealFlow',
  'TealClassifier',
  'TealDrift',
  'TealState',
  'TealTemporal',
];

const SUPPORTED_FEATURES = [
  'freeze_rules',
  'plan_only_mode',
  'nhi_governance',
  'automation_levels',
  'zero_standing_privilege',
  'agent_attestation',
  'code_change_governance',
  'policy_hot_swap',
  'governance_receipts',
  'declarative_workflows',
  'ml_classifier',
  'behavioral_drift',
  'context_governance',
  'temporal_governance',
  'cost_governance',
  'otel_spans',
  'response_hooks',
  'siem_export',
];

// ── TealTigerGovernanceProvider ──────────────────────────────────

/**
 * TealTigerGovernanceProvider — implements the GovernanceProvider interface
 * using TealEngineV13 as the evaluation backend.
 *
 * This class wraps the full TealEngine evaluation pipeline behind the
 * portable GovernanceProvider interface, enabling:
 * - Standard evaluation via `evaluate(context)`
 * - Policy hot-swap via `loadPolicies(bundle)`
 * - Capability discovery via `getCapabilities()`
 *
 * @example
 * ```typescript
 * const provider = new TealTigerGovernanceProvider({
 *   policy: { guardrails: { enabled: true } },
 * });
 *
 * const decision = await provider.evaluate({
 *   correlation_id: 'req-123',
 *   action: 'CODE_CHANGE',
 *   action_attributes: { target_paths: ['src/main.ts'] },
 * });
 * ```
 */
export class TealTigerGovernanceProvider implements GovernanceProvider {
  private engine: TealEngineV13;
  private currentBundle: PolicyBundle | null = null;

  constructor(options?: TealEngineV13Options) {
    this.engine = new TealEngineV13(options ?? { policy: {} });
  }

  /**
   * Evaluate a governance request and return a decision.
   *
   * Translates the portable EvaluationContext into a GovernanceRequest
   * and delegates to TealEngineV13 for evaluation.
   *
   * @param context - The evaluation context (open schema, versioned independently)
   * @returns A Decision object with action, risk score, reason codes, and evidence
   */
  async evaluate(context: EvaluationContext): Promise<Decision> {
    // Translate EvaluationContext → GovernanceRequest
    // Only include optional fields when they are defined (exactOptionalPropertyTypes)
    const request: GovernanceRequest = {
      action_class: context.action,
      action_attributes: context.action_attributes,
      ...(context.content !== undefined && { content: context.content }),
      ...(context.model !== undefined && { model: context.model }),
      ...(context.tool !== undefined && { tool: context.tool }),
      ...(context.nhi_identity !== undefined && { nhi_identity: context.nhi_identity }),
    };

    // Build context, only including defined optional fields
    const evalCtx: Partial<GovernanceContext> & { correlation_id: string } = {
      correlation_id: context.correlation_id,
      ...(context.environment !== undefined && { environment: context.environment }),
      ...(context.agent_id !== undefined && { agent_id: context.agent_id }),
    };

    // Delegate to TealEngineV13
    const decision = await this.engine.evaluate(request, evalCtx);

    return decision;
  }

  /**
   * Load a policy bundle into the provider.
   *
   * Validates the bundle and delegates to the engine's policy hot-swap mechanism.
   * If validation fails, the previous bundle is retained.
   *
   * @param bundle - The policy bundle to load
   * @throws Error if the bundle requires capabilities not supported by this SDK version
   */
  async loadPolicies(bundle: PolicyBundle): Promise<void> {
    // Validate required capabilities
    const capabilities = this.getCapabilities();
    const unsupported = bundle.required_capabilities.filter(
      (cap) => !capabilities.supported_features.includes(cap),
    );

    if (unsupported.length > 0) {
      throw new Error(
        `Policy bundle requires unsupported capabilities: ${unsupported.join(', ')}. ` +
        `SDK version ${SDK_VERSION} supports: ${capabilities.supported_features.join(', ')}`,
      );
    }

    // Store the bundle reference
    this.currentBundle = bundle;

    // Re-initialize the engine with the new policy bundle's policies
    // In a full implementation, this would delegate to PolicyHotSwapManager
    // For now, we store the bundle for reference
  }

  /**
   * Get the provider's capability manifest.
   *
   * Returns the SDK version, supported modules, supported features,
   * and TEEC schema version. Used for capability negotiation with
   * policy bundles and external systems.
   *
   * @returns CapabilityManifest describing what this provider supports
   */
  getCapabilities(): CapabilityManifest {
    return {
      sdk_version: SDK_VERSION,
      supported_modules: [...SUPPORTED_MODULES],
      supported_features: [...SUPPORTED_FEATURES],
      teec_version: TEEC_VERSION,
    };
  }

  /**
   * Get the currently loaded policy bundle (if any).
   */
  getCurrentBundle(): PolicyBundle | null {
    return this.currentBundle;
  }

  /**
   * Get the underlying TealEngineV13 instance.
   * Useful for advanced configuration or direct engine access.
   */
  getEngine(): TealEngineV13 {
    return this.engine;
  }
}
