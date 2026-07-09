/**
 * observe() — Zero-config instrumentation for LLM provider clients.
 *
 * Wraps any supported provider client in a transparent proxy that adds:
 * - Cost tracking (per-request, per-session, per-agent)
 * - Audit logging (every request/response/error/tool call)
 * - Behavioral baseline (P50/P95/P99 from first N requests)
 * - PII detection (REPORT_ONLY — never blocks)
 * - Kill switch (freeze/unfreeze)
 *
 * All instrumentation is in-process, deterministic, and adds <5ms overhead.
 *
 * @example
 * ```ts
 * import { observe } from 'tealtiger';
 * import OpenAI from 'openai';
 *
 * const client = observe(new OpenAI());
 * // Use exactly like normal — all calls are now instrumented
 * ```
 */

import { randomUUID } from 'crypto';
import type { ObserveConfig, ObserveProxy, ObserveState } from './types';
import { detectProvider } from './provider-detector';
import { CostAccumulator } from './cost-accumulator';
import { BehavioralBaseline } from './behavioral-baseline';
import { ObservePIIScanner } from './pii-scanner';
import { ObserveAuditLogger } from './observe-audit';
import { FreezeRegistry } from './freeze-registry';
import { FrozenAgentError } from './errors';
import type { DecisionV21, GovernanceSeal } from '../core/engine/v2.1/types';
import { CryptoService } from '../core/engine/v2.1/CryptoService';
import { CounterManager } from '../core/engine/v2.1/CounterManager';
import { SealConfigurationError } from '../core/engine/v2.1/errors';
import { PolicyMode, DecisionAction, ReasonCode } from '../core/engine/types';

/**
 * Internal state for each observe() proxy instance.
 */
interface InternalState extends ObserveState {
  costAccumulator: CostAccumulator;
  baseline: BehavioralBaseline;
  piiScanner: ObservePIIScanner;
  auditLogger: ObserveAuditLogger;
  baselineCompleteEmitted: boolean;
  /** Whether TEEC v2.1 governance mode is enabled */
  governanceEnabled: boolean;
  /** Seal secret for HMAC computation (only set when governance is enabled) */
  governanceSealSecret: string | undefined;
  /** Counter manager for seq/running_count (only set when governance is enabled) */
  counterManager: CounterManager | undefined;
  /** Accumulated v2.1 decisions (only populated when governance is enabled) */
  decisions: DecisionV21[];
}


/**
 * Check if a method path is in the intercept list.
 */
function isInterceptTarget(state: InternalState, methodPath: string): boolean {
  return state.providerSignature.interceptMethods.some(
    (m) => m === methodPath || m.endsWith(`.${methodPath}`)
  );
}

/**
 * Produce a TEEC v2.1 DecisionV21 for a governance-enabled intercepted call.
 *
 * Follows the same pipeline as GovernanceEngineV21:
 * 1. Compute intent_ref and normalization_id
 * 2. Assign seq and running_count
 * 3. Compute receipt_ref (chain link)
 * 4. Compute GovernanceSeal
 * 5. Return complete DecisionV21
 */
function produceGovernanceDecision(
  state: InternalState,
  requestPayload: Record<string, unknown>,
  correlationId: string,
): DecisionV21 {
  const sealSecret = state.governanceSealSecret!;
  const counterManager = state.counterManager!;
  const agentId = state.agentId;

  // 1. Compute intent bindings
  const serializedRequest = CryptoService.deterministicSerialize(requestPayload);
  const intent_ref = CryptoService.sha256(serializedRequest);
  const normalizedForm = CryptoService.normalizePayload(requestPayload);
  const normalization_id = CryptoService.sha256(normalizedForm);

  // 2. Build base decision fields (observe mode produces ALLOW decisions)
  const baseDecision = {
    action: DecisionAction.ALLOW,
    reason_codes: [] as ReasonCode[],
    risk_score: 0,
    mode: PolicyMode.MONITOR,
    policy_id: 'observe-governance',
    policy_version: '2.1',
    component_versions: { sdk: '1.4.0', engine: '2.1.0' },
    correlation_id: correlationId,
    reason: 'Observed call — governance mode',
    event_type: 'llm.request',
    timestamp: Date.now(),
    module: 'observe',
    metadata: {} as Record<string, unknown>,
  };

  // 3. Assign counters
  const seq = counterManager.nextSeq(agentId);
  const running_count = counterManager.nextRunningCount();

  // 4. Build partial v2.1 decision (for receipt_ref computation)
  const partialDecision: Omit<DecisionV21, 'receipt_ref' | 'governance_seal'> = {
    ...baseDecision,
    intent_ref,
    normalization_id,
    seq,
    running_count,
    teec_version: '2.1' as const,
  };

  // 5. Compute receipt_ref (chain link)
  const prevReceiptRef = counterManager.getLastReceiptRef(agentId);
  const receiptPayload = CryptoService.deterministicSerialize(partialDecision);
  const receiptInput = receiptPayload + prevReceiptRef;
  const receipt_ref = CryptoService.sha256(receiptInput);
  counterManager.setLastReceiptRef(agentId, receipt_ref);

  // 6. Compute GovernanceSeal
  const fullDecisionForSeal: Omit<DecisionV21, 'governance_seal'> = {
    ...partialDecision,
    receipt_ref,
  };
  const timestamp = Date.now();
  const sealPayload = CryptoService.deterministicSerialize(fullDecisionForSeal);
  const hmacInput = sealPayload + String(timestamp) + agentId;
  const hmac = CryptoService.hmacSha256(sealSecret, hmacInput);
  const governance_seal: GovernanceSeal = { hmac, timestamp, agent_id: agentId };

  // 7. Return complete v2.1 Decision
  return {
    ...fullDecisionForSeal,
    governance_seal,
  };
}

/**
 * Create an intercepted method wrapper that runs the full instrumentation pipeline.
 */
function createInterceptedMethod(
  originalMethod: Function,
  target: object,
  state: InternalState,
  _methodName: string,
): Function {
  return async function observeInterceptor(...args: any[]) {
    const requestId = randomUUID();
    const correlationId = randomUUID();
    const registry = FreezeRegistry.getInstance();

    // Step 1: Check kill switch
    if (registry.isFrozen(state.agentId)) {
      state.auditLogger.logFreezeBlock({
        agentId: state.agentId,
        requestId,
        correlationId,
        isWildcard: registry.isWildcardFreeze(),
      });
      throw new FrozenAgentError(state.agentId, registry.isWildcardFreeze());
    }

    // Step 2: PII scan on request
    const requestPii = state.piiScanner.scan(args[0], 'request');

    // Step 3: Log request event
    const model = state.providerSignature.modelExtractor(args[0], null);
    state.auditLogger.logRequest({
      agentId: state.agentId,
      sessionId: state.sessionId,
      requestId,
      correlationId,
      provider: state.provider,
      model,
    });

    // Step 4: Forward to provider and measure latency
    const startTime = performance.now();
    let response: any;
    try {
      response = await originalMethod.apply(target, args);
    } catch (error: any) {
      // Log error, then re-throw unchanged
      state.auditLogger.logError({
        requestId,
        correlationId,
        errorType: error?.constructor?.name ?? 'Error',
        errorMessage: error?.message ?? String(error),
      });
      throw error;
    }
    const latencyMs = performance.now() - startTime;

    // Step 5: Extract usage and compute cost
    const usage = state.providerSignature.usageExtractor(response);
    const resolvedModel = state.providerSignature.modelExtractor(args[0], response);
    const costResult = state.costAccumulator.recordCost(
      state.agentId,
      state.sessionId,
      requestId,
      resolvedModel,
      state.provider,
      usage,
    );

    // Step 5b: Produce governance decision if governance mode is enabled
    if (state.governanceEnabled) {
      const requestPayload = (typeof args[0] === 'object' && args[0] !== null)
        ? args[0] as Record<string, unknown>
        : { _raw: String(args[0]) };
      const decision = produceGovernanceDecision(state, requestPayload, correlationId);
      state.decisions.push(decision);
    }

    // Step 6: PII scan on response
    const responsePii = state.piiScanner.scan(response, 'response');

    // Step 7: Extract and log tool calls
    const toolCalls = state.providerSignature.toolCallExtractor(response);
    for (const tc of toolCalls) {
      state.auditLogger.logToolCall({
        requestId,
        correlationId,
        ...tc,
      });
    }

    // Step 8: Feed behavioral baseline
    state.baseline.addSample({
      latencyMs,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: costResult.cost,
      toolCallCount: toolCalls.length,
    });

    // Step 9: Check if baseline just completed
    if (state.baseline.isComplete() && !state.baselineCompleteEmitted) {
      state.baselineCompleteEmitted = true;
      state.auditLogger.logBaselineComplete(state.agentId, state.sessionId);
    }

    // Step 10: Log response event
    const combinedPii = requestPii || responsePii
      ? {
          count: (requestPii?.count ?? 0) + (responsePii?.count ?? 0),
          types: [...new Set([...(requestPii?.types ?? []), ...(responsePii?.types ?? [])])],
          phase: (responsePii ? 'response' : 'request') as 'request' | 'response',
        }
      : null;

    state.auditLogger.logResponse({
      requestId,
      correlationId,
      outputTokenCount: usage?.outputTokens ?? 0,
      cost: costResult.cost,
      latencyMs,
      piiDetections: combinedPii,
    });

    // Step 11: Return original response UNMODIFIED
    state.requestCount += 1;
    return response;
  };
}


/**
 * Create a recursive proxy that handles nested property access
 * (e.g., client.chat.completions.create).
 */
function createRecursiveProxy<T extends object>(
  target: T,
  state: InternalState,
  path: string[] = [],
): ObserveProxy<T> {
  const handler: ProxyHandler<T> = {
    get(obj, prop, receiver) {
      const propStr = String(prop);

      // Expose telemetry accessors
      if (propStr === 'getCost') return () => state.costAccumulator.getSessionCost(state.sessionId);
      if (propStr === 'getAgentCost') return () => state.costAccumulator.getAgentCost(state.agentId);
      if (propStr === 'getBaseline') return () => state.baseline.getBaseline();
      if (propStr === 'getAgentId') return () => state.agentId;
      if (propStr === 'getSessionId') return () => state.sessionId;
      if (propStr === 'getDecisions') return () => [...state.decisions];

      // Skip symbols and internal props
      if (typeof prop === 'symbol') return Reflect.get(obj, prop, receiver);

      const value = Reflect.get(obj, prop, receiver);
      const currentPath = [...path, propStr].join('.');

      // If value is a function, check if it's an intercept target
      if (typeof value === 'function') {
        if (isInterceptTarget(state, propStr) || isInterceptTarget(state, currentPath)) {
          return createInterceptedMethod(value, obj, state, propStr);
        }
        // Non-intercepted function — bind to original target
        return value.bind(obj);
      }

      // If value is an object, proxy it recursively (for nested namespaces)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return createRecursiveProxy(value, state, [...path, propStr]);
      }

      return value;
    },
  };

  return new Proxy(target, handler) as ObserveProxy<T>;
}

/**
 * Wraps a supported LLM provider client with zero-config instrumentation.
 * Returns a drop-in proxy that is API-compatible with the original client.
 *
 * @param client - A supported LLM provider client instance
 * @param config - Optional configuration (agentId, sessionId, baselineWindow)
 * @returns An ObserveProxy that wraps the client with instrumentation
 * @throws UnsupportedProviderError if client is not a supported provider
 *
 * @example
 * ```ts
 * import { observe } from 'tealtiger';
 * import OpenAI from 'openai';
 *
 * // Zero-config: one line to instrument
 * const client = observe(new OpenAI());
 *
 * // Use exactly like the original client
 * const response = await client.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 *
 * // Access telemetry
 * console.log(client.getCost());     // { totalCost: 0.0012, ... }
 * console.log(client.getBaseline()); // null until 100 requests
 * ```
 */
export function observe<T extends object>(
  client: T,
  config?: ObserveConfig,
): ObserveProxy<T> {
  // Governance validation: if governance is enabled, seal_secret must be present
  if (config?.governance && !config.governance_seal_secret) {
    throw new SealConfigurationError(
      'ObserveProxy requires governance_seal_secret when governance is enabled.',
    );
  }

  // Detect provider
  const providerSignature = detectProvider(client);

  // Build internal state
  const state: InternalState = {
    agentId: config?.agentId ?? randomUUID(),
    sessionId: config?.sessionId ?? randomUUID(),
    provider: providerSignature.provider,
    providerSignature,
    requestCount: 0,
    costAccumulator: new CostAccumulator(),
    baseline: new BehavioralBaseline(config?.baselineWindow ?? 100),
    piiScanner: new ObservePIIScanner(),
    auditLogger: new ObserveAuditLogger(),
    baselineCompleteEmitted: false,
    governanceEnabled: config?.governance === true,
    governanceSealSecret: config?.governance_seal_secret,
    counterManager: config?.governance === true ? new CounterManager() : undefined,
    decisions: [],
  };

  // Create and return the recursive proxy
  return createRecursiveProxy(client, state);
}
