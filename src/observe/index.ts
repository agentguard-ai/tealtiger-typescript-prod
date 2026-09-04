/**
 * TealTiger observe() — Zero-config instrumentation for LLM provider clients.
 *
 * @example
 * ```ts
 * import { observe, freeze, unfreeze } from 'tealtiger';
 * import OpenAI from 'openai';
 *
 * const client = observe(new OpenAI());
 * // Now every call is tracked: cost, audit, PII, baseline
 *
 * console.log(client.getCost());     // session cost summary
 * console.log(client.getBaseline()); // behavioral stats after 100 requests
 *
 * freeze('*');   // emergency stop — all agents blocked
 * unfreeze('*'); // resume
 * ```
 *
 * @module observe
 */

// Public API
export { observe } from './observe';
export { freeze, unfreeze } from './freeze-registry';
export { formatCost } from './format-cost';

// Public types
export type {
  ObserveConfig,
  ObserveProxy,
  ObserveCostSummary,
  BaselineResult,
  PercentileStats,
  PIIDetectionSummary,
  SupportedProvider,
} from './types';

// Errors
export { UnsupportedProviderError, FrozenAgentError } from './errors';
