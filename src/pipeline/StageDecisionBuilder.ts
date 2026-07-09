/**
 * Multi-Stage Defense Pipeline — StageDecisionBuilder
 *
 * Produces StageDecision objects from merged evaluation results,
 * optionally enriched with TEEC v2.1 cryptographic fields
 * (intent_ref, receipt_ref, seq, running_count, normalization_id, governance_seal).
 *
 * Integrates with CryptoService for hashing/HMAC and CounterManager for
 * monotonic sequence and running count management.
 *
 * @module pipeline/StageDecisionBuilder
 * @requirements 2.8, 4.9, 5.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

import { CryptoService } from '../core/engine/v2.1/CryptoService';
import { CounterManager } from '../core/engine/v2.1/CounterManager';
import { GENESIS_RECEIPT_REF } from '../core/engine/v2.1/types';
import type { StageDecision, ModuleEvalDetail, PipelineStage } from './types';

/**
 * Result of verifying contiguity across a chain of StageDecisions.
 */
export interface ContiguityResult {
  valid: boolean;
  error?: string;
}

/**
 * Parameters for building a StageDecision.
 */
export interface StageDecisionBuildParams {
  /** The merged action for the stage (e.g., ALLOW, DENY, MONITOR) */
  action: string;
  /** All reason codes from evaluated modules */
  reason_codes: string[];
  /** Which pipeline stage produced this decision */
  stage: PipelineStage;
  /** Stage evaluation duration in milliseconds */
  latency_ms: number;
  /** Per-module evaluation details */
  module_details: ModuleEvalDetail[];
  /** The request or response payload used for intent binding */
  payload: Record<string, unknown>;
  /** Remediation details (PostExecution only) */
  remediation?: StageDecision['remediation'];
}

/**
 * Builds StageDecision objects, optionally enriched with TEEC v2.1
 * cryptographic provenance fields when a seal secret is configured.
 *
 * When `sealSecret` is provided:
 * - `intent_ref` = SHA-256 of deterministically serialized payload
 * - `receipt_ref` = SHA-256 chain linking to the previous decision's receipt
 * - `seq` = monotonically increasing per-agent counter
 * - `running_count` = global counter across all agents
 * - `normalization_id` = SHA-256 of canonically normalized payload
 * - `governance_seal` = { hmac: HMAC-SHA256 of decision fields, timestamp, agent_id }
 */
export class StageDecisionBuilder {
  private readonly sealSecret: string | undefined;
  private readonly agentId: string;
  private readonly counterManager: CounterManager;

  constructor(sealSecret?: string, agentId?: string) {
    this.sealSecret = sealSecret;
    this.agentId = agentId ?? 'default';
    this.counterManager = new CounterManager();
  }

  /**
   * Build a StageDecision from merged evaluation results.
   * When sealSecret is configured, computes all TEEC v2.1 fields.
   */
  build(params: StageDecisionBuildParams): StageDecision {
    const decision: StageDecision = {
      action: params.action,
      reason_codes: params.reason_codes,
      stage: params.stage,
      latency_ms: params.latency_ms,
      module_details: params.module_details,
    };

    if (params.remediation) {
      decision.remediation = params.remediation;
    }

    if (this.sealSecret) {
      this.applyTeecFields(decision, params.payload);
    }

    return decision;
  }

  /**
   * Verify that a chain of StageDecisions has valid contiguity.
   *
   * Checks:
   * 1. `seq` values are monotonically increasing (each > previous)
   * 2. Each decision's `receipt_ref` correctly chains to the previous decision
   *
   * @param decisions - Chronologically ordered StageDecisions to verify
   * @returns ContiguityResult indicating whether the chain is valid
   */
  verifyContiguity(decisions: StageDecision[]): ContiguityResult {
    if (decisions.length === 0) {
      return { valid: true };
    }

    // All decisions must have TEEC v2.1 fields to verify contiguity
    for (let i = 0; i < decisions.length; i++) {
      if (decisions[i].seq === undefined || decisions[i].receipt_ref === undefined) {
        return {
          valid: false,
          error: `Decision at index ${i} is missing TEEC v2.1 fields (seq or receipt_ref)`,
        };
      }
    }

    // Check seq monotonicity
    for (let i = 1; i < decisions.length; i++) {
      if (decisions[i].seq! <= decisions[i - 1].seq!) {
        return {
          valid: false,
          error: `seq is not monotonically increasing at index ${i}: ${decisions[i].seq} <= ${decisions[i - 1].seq}`,
        };
      }
    }

    // Check receipt_ref chaining
    // First decision's receipt_ref should chain from GENESIS_RECEIPT_REF
    const firstExpectedReceipt = this.computeReceiptRef(
      decisions[0],
      GENESIS_RECEIPT_REF,
    );
    if (decisions[0].receipt_ref !== firstExpectedReceipt) {
      return {
        valid: false,
        error: `receipt_ref chain break at index 0: expected ${firstExpectedReceipt}, got ${decisions[0].receipt_ref}`,
      };
    }

    // Subsequent decisions chain from the previous decision's receipt_ref
    for (let i = 1; i < decisions.length; i++) {
      const expectedReceipt = this.computeReceiptRef(
        decisions[i],
        decisions[i - 1].receipt_ref!,
      );
      if (decisions[i].receipt_ref !== expectedReceipt) {
        return {
          valid: false,
          error: `receipt_ref chain break at index ${i}: expected ${expectedReceipt}, got ${decisions[i].receipt_ref}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Apply TEEC v2.1 cryptographic fields to a StageDecision.
   */
  private applyTeecFields(decision: StageDecision, payload: Record<string, unknown>): void {
    // intent_ref = SHA-256 of deterministically serialized payload
    const serializedPayload = CryptoService.deterministicSerialize(payload);
    decision.intent_ref = CryptoService.sha256(serializedPayload);

    // seq = monotonically increasing per agent
    decision.seq = this.counterManager.nextSeq(this.agentId);

    // running_count = global counter
    decision.running_count = this.counterManager.nextRunningCount();

    // normalization_id = SHA-256 of canonically normalized payload
    decision.normalization_id = CryptoService.sha256(
      CryptoService.normalizePayload(payload),
    );

    // receipt_ref = SHA-256 chain linking to the previous decision
    const previousReceiptRef = this.counterManager.getLastReceiptRef(this.agentId);
    decision.receipt_ref = this.computeReceiptRef(decision, previousReceiptRef);

    // Store the new receipt_ref for the next decision in the chain
    this.counterManager.setLastReceiptRef(this.agentId, decision.receipt_ref);

    // governance_seal = HMAC-SHA256 of decision fields + timestamp + agent_id
    const timestamp = Date.now();
    decision.governance_seal = {
      hmac: this.computeSealHmac(decision, timestamp),
      timestamp,
      agent_id: this.agentId,
    };
  }

  /**
   * Compute receipt_ref as SHA-256(intent_ref + previousReceiptRef + seq).
   * This creates a hash chain linking each decision to its predecessor.
   */
  private computeReceiptRef(decision: StageDecision, previousReceiptRef: string): string {
    const chainInput = `${decision.intent_ref}:${previousReceiptRef}:${decision.seq}`;
    return CryptoService.sha256(chainInput);
  }

  /**
   * Compute the HMAC-SHA256 governance seal over the decision's key fields.
   * The HMAC covers: action, stage, seq, intent_ref, receipt_ref, timestamp, agent_id.
   */
  private computeSealHmac(decision: StageDecision, timestamp: number): string {
    const sealData = CryptoService.deterministicSerialize({
      action: decision.action,
      stage: decision.stage,
      seq: decision.seq,
      intent_ref: decision.intent_ref,
      receipt_ref: decision.receipt_ref,
      running_count: decision.running_count,
      normalization_id: decision.normalization_id,
      timestamp,
      agent_id: this.agentId,
    });
    return CryptoService.hmacSha256(this.sealSecret!, sealData);
  }
}
