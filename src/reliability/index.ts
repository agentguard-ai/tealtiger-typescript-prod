/**
 * TealReliability Module — Public API
 *
 * @module reliability
 */

export { TealReliability } from './TealReliability';
export type {
  CircuitState,
  BackoffStrategy,
  RetryConfig,
  FallbackEntry,
  FallbackChainConfig,
  DegradeConfig,
  CircuitBreakerConfig,
  TealReliabilityConfig,
  ReliabilityEvent,
} from './types';
export { TransientError } from './types';
