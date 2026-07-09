/**
 * TealTiger SDK - Ollama Provider Entry Point
 *
 * Local Ollama support using Ollama's OpenAI-compatible endpoint.
 */

export { TealEngine } from '../core/engine';
export { TealGuard } from '../core/guard/TealGuard';
export { TealCircuit } from '../core/circuit/TealCircuit';
export { TealAudit } from '../core/audit/TealAudit';
export { ContextManager } from '../core/context/ContextManager';

export { TealOllama, createTealOllama } from '../client/ollama';

export type { TealClientConfig, RequestContext } from '../client/base';
export type {
  TealOllamaConfig,
  OllamaChatMessage,
  OllamaChatCompletionParams,
  OllamaChatCompletionResponse
} from '../client/ollama';
export type { TealPolicy, PolicyEvaluationResult } from '../core/engine';
export type { TealGuardConfig, TealGuardResult } from '../core/guard/TealGuard';
export type { ExecutionContext } from '../core/context/ExecutionContext';

export { TealTigerError, PolicyViolationError, GuardrailViolationError } from '../client/base';
