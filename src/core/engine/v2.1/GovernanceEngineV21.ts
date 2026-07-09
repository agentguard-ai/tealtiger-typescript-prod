/**
 * TealEngine v2.1 — GovernanceEngineV21
 *
 * Extends TealEngineV12 with the TEEC v2.1 Governance Contract pipeline.
 * When `seal_secret` is configured, produces DecisionV21 with cryptographic
 * seals, intent binding, receipt chaining, and sequence counters.
 * When `seal_secret` is absent, delegates entirely to v1.2 behavior.
 *
 * @module core/engine/v2.1/GovernanceEngineV21
 */

import { TealEngineV12, type TealEngineV12Options } from '../v1.2/TealEngineV12';
import type { ModuleContext, Decision } from '../v1.2/types';
import type { DecisionV21, GovernanceSeal } from './types';
import { CryptoService } from './CryptoService';
import { CounterManager } from './CounterManager';

// SealConfigurationError is available for callers who need to detect missing seal_secret
// in explicit governance mode (e.g., ObserveProxy with governance: true).
// The engine itself uses opt-in semantics: no seal_secret = v1.2 passthrough.
export { SealConfigurationError } from './errors';

// ── Options ──────────────────────────────────────────────────────

export interface GovernanceEngineV21Options extends TealEngineV12Options {
  /** Secret key for HMAC seals. Presence activates v2.1 mode. */
  seal_secret?: string;
  /** Default agent ID for seal and counter scoping */
  agent_id?: string;
}

// ── GovernanceEngineV21 ──────────────────────────────────────────

/**
 * TEEC v2.1 Governance Engine.
 *
 * Extends TealEngineV12 with cryptographic verifiability:
 * - Intent binding (intent_ref, normalization_id)
 * - Receipt chaining (receipt_ref)
 * - Sequence counters (seq, running_count)
 * - GovernanceSeal (HMAC-SHA256)
 *
 * Opt-in via `seal_secret`: when absent, `evaluate()` delegates to v1.2.
 */
export class GovernanceEngineV21 extends TealEngineV12 {
  private readonly sealSecret: string | undefined;
  private readonly defaultAgentId: string | undefined;
  private readonly counterManager: CounterManager;

  constructor(options: GovernanceEngineV21Options) {
    super(options);
    this.sealSecret = options.seal_secret;
    this.defaultAgentId = options.agent_id;
    this.counterManager = new CounterManager();
  }

  /**
   * Evaluate a request with TEEC v2.1 governance fields.
   *
   * If `seal_secret` is configured: runs the full v2.1 pipeline producing
   * a DecisionV21 with cryptographic seals, intent binding, and receipt chaining.
   *
   * If `seal_secret` is absent: delegates entirely to `evaluateV12()` (v1.2 behavior).
   *
   * @param request - The request payload to evaluate
   * @param ctx - Evaluation context (must include correlation_id)
   * @returns A DecisionV21 (v2.1 mode) or Decision cast to DecisionV21 (v1.2 mode)
   */
  async evaluate(
    request: Record<string, unknown>,
    ctx: Partial<ModuleContext> & { correlation_id: string },
  ): Promise<DecisionV21> {
    // 1. Opt-in check — if no seal_secret, delegate to v1.2
    if (!this.sealSecret) {
      const v12Decision = await this.evaluateV12(request, ctx);
      return v12Decision as unknown as DecisionV21;
    }

    // 2. Compute intent bindings BEFORE policy evaluation
    const serializedRequest = CryptoService.deterministicSerialize(request);
    const intent_ref = CryptoService.sha256(serializedRequest);
    const normalizedForm = CryptoService.normalizePayload(request);
    const normalization_id = CryptoService.sha256(normalizedForm);

    // 3. Run v1.2 policy evaluation pipeline
    const baseDecision: Decision = await this.evaluateV12(request, ctx);

    // 4. Resolve agent_id and assign counters
    const agent_id = (ctx as Record<string, unknown>).agent_id as string
      ?? this.defaultAgentId
      ?? 'default';
    const seq = this.counterManager.nextSeq(agent_id);
    const running_count = this.counterManager.nextRunningCount();

    // 5. Build partial v2.1 decision (for receipt_ref computation)
    const partialDecision: Omit<DecisionV21, 'receipt_ref' | 'governance_seal'> = {
      ...baseDecision,
      intent_ref,
      normalization_id,
      seq,
      running_count,
      teec_version: '2.1',
    };

    // 6. Compute receipt_ref (chain link)
    const prevReceiptRef = this.counterManager.getLastReceiptRef(agent_id);
    const receipt_ref = this.computeReceiptRef(partialDecision, prevReceiptRef);
    this.counterManager.setLastReceiptRef(agent_id, receipt_ref);

    // 7. Compute GovernanceSeal
    const fullDecisionForSeal: Omit<DecisionV21, 'governance_seal'> = {
      ...partialDecision,
      receipt_ref,
    };
    const timestamp = Date.now();
    const governance_seal = this.computeGovernanceSeal(
      fullDecisionForSeal,
      timestamp,
      agent_id,
      this.sealSecret,
    );

    // 8. Return complete v2.1 Decision
    return {
      ...fullDecisionForSeal,
      governance_seal,
    };
  }

  /**
   * Compute the receipt_ref hash-chain link.
   *
   * @param decision - Partial decision (without receipt_ref and governance_seal)
   * @param previousReceiptRef - The previous receipt_ref (GENESIS_RECEIPT_REF for seq=1)
   * @returns SHA-256 hex hash linking this decision to the chain
   */
  private computeReceiptRef(
    decision: Omit<DecisionV21, 'receipt_ref' | 'governance_seal'>,
    previousReceiptRef: string,
  ): string {
    const payload = CryptoService.deterministicSerialize(decision);
    const input = payload + previousReceiptRef;
    return CryptoService.sha256(input);
  }

  /**
   * Compute the GovernanceSeal (HMAC-SHA256 based).
   *
   * @param decision - Full decision without governance_seal
   * @param timestamp - Unix ms timestamp for the seal
   * @param agentId - Identity of the producing agent
   * @param sealSecret - HMAC secret key
   * @returns GovernanceSeal with hmac, timestamp, and agent_id
   */
  private computeGovernanceSeal(
    decision: Omit<DecisionV21, 'governance_seal'>,
    timestamp: number,
    agentId: string,
    sealSecret: string,
  ): GovernanceSeal {
    const payload = CryptoService.deterministicSerialize(decision);
    const hmacInput = payload + String(timestamp) + agentId;
    const hmac = CryptoService.hmacSha256(sealSecret, hmacInput);
    return { hmac, timestamp, agent_id: agentId };
  }

  /**
   * Get the CounterManager instance (for testing/inspection).
   */
  getCounterManager(): CounterManager {
    return this.counterManager;
  }
}
