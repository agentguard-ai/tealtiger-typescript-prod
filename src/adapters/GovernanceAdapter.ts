/**
 * TealTiger SDK - Common Governance Adapter Interface
 *
 * Defines the shared interface and base class for all platform adapters
 * (Bedrock, AgentCore, Azure). All adapters translate between platform-specific
 * contracts and TealTiger's GovernanceRequest, using the same TealEngineV13
 * evaluation logic internally.
 *
 * Cross-platform guarantee: identical inputs → identical Decisions regardless
 * of which platform adapter is used.
 *
 * @module adapters/GovernanceAdapter
 * @requirements 14.13, 14.14, 14.16
 */

import type { TealEngineV13 } from '../core/engine/v1.3/TealEngineV13';
import type { GovernanceRequest, DecisionV13 } from '../core/engine/v1.3/types';

// ── Platform Decision ────────────────────────────────────────────

/**
 * Platform-agnostic decision returned by all adapters.
 * Adapters translate this into platform-specific response formats.
 */
export interface PlatformDecision {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason codes from governance evaluation */
  reason_codes: string[];
  /** Additional metadata from the decision */
  metadata: Record<string, unknown>;
}

// ── Supported Platforms ──────────────────────────────────────────

/**
 * Supported platform identifiers.
 */
export type PlatformType = 'bedrock' | 'agentcore' | 'azure';

// ── Governance Adapter Interface ─────────────────────────────────

/**
 * Common interface for all platform governance adapters.
 *
 * Each adapter:
 * 1. Accepts platform-specific request formats
 * 2. Translates them to TealTiger's GovernanceRequest
 * 3. Evaluates via TealEngineV13
 * 4. Translates the Decision back to platform-specific format
 */
export interface GovernanceAdapter {
  /** Platform identifier */
  readonly platform: PlatformType;

  /**
   * Evaluate a platform-specific request through the governance pipeline.
   * @param platformRequest - Platform-specific request object
   * @returns Platform-agnostic decision
   */
  evaluate(platformRequest: unknown): Promise<PlatformDecision>;

  /**
   * Initialize the adapter with a TealEngine instance.
   * Must be called before evaluate().
   * @param engine - TealEngineV13 instance for governance evaluation
   */
  initialize(engine: TealEngineV13): Promise<void>;
}

// ── Base Governance Adapter ──────────────────────────────────────

/**
 * Abstract base class for platform governance adapters.
 *
 * Provides shared functionality:
 * - Engine initialization and lifecycle
 * - Correlation ID generation
 * - Common translation helpers
 *
 * Subclasses implement platform-specific request/response translation.
 */
export abstract class BaseGovernanceAdapter implements GovernanceAdapter {
  abstract readonly platform: PlatformType;

  /** The TealEngine instance used for governance evaluation */
  protected engine: TealEngineV13 | null = null;

  /**
   * Initialize the adapter with a TealEngine instance.
   */
  async initialize(engine: TealEngineV13): Promise<void> {
    this.engine = engine;
  }

  /**
   * Evaluate a platform-specific request.
   * Subclasses must implement this to translate platform requests.
   */
  abstract evaluate(platformRequest: unknown): Promise<PlatformDecision>;

  /**
   * Evaluate a GovernanceRequest via the engine.
   * Used by subclasses after translating platform-specific requests.
   *
   * @throws Error if the adapter has not been initialized
   */
  protected async evaluateViaEngine(
    request: GovernanceRequest
  ): Promise<DecisionV13> {
    if (!this.engine) {
      throw new Error(
        `${this.platform} adapter not initialized. Call initialize(engine) first.`
      );
    }

    return this.engine.evaluate(request, {
      correlation_id: generateUUID(),
    });
  }

  /**
   * Convert a DecisionV13 to a PlatformDecision.
   */
  protected toPlatformDecision(decision: DecisionV13): PlatformDecision {
    return {
      allowed: decision.action === 'ALLOW',
      reason_codes: decision.reason_codes ?? [],
      metadata: {
        risk_score: decision.risk_score,
        policy_version: decision.policy_version,
        automation_level: decision.automation_level,
        control_id: decision.control_id,
        owasp_category: decision.owasp_category,
      },
    };
  }
}

// ── Utility ──────────────────────────────────────────────────────

/**
 * Generate a UUID v4 for correlation IDs.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
