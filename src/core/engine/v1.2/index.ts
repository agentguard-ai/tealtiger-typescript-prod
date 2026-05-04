/**
 * TealEngine v1.2 — Public API
 *
 * Re-exports all v1.2 types, classes, and utilities.
 * v1.1 types remain available from the parent `../types` module.
 *
 * @module core/engine/v1.2
 */

// Types
export type {
  DecisionAction,
  Decision,
  RegistryRef,
  SecretFinding,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
  TealModule,
  ReasonCodeEntry,
  EventTypeEntry,
  DecisionActionEntry,
  TEECRegistry,
  ModuleStatusMap,
} from './types';

export { DecisionActionV12 } from './types';

// Errors
export {
  TealError,
  TealConfigError,
  TealSchemaError,
  TealRuntimeError,
  TealAdapterError,
} from './errors';

// TEEC
export { TEECRegistryLoader } from './TEECRegistryLoader';
export { TEECValidator } from './TEECValidator';
export type { TEECValidationResult } from './TEECValidator';

// Module system
export { ModuleRegistry } from './ModuleRegistry';

// v1.2 Orchestration Engine
export { TealEngineV12 } from './TealEngineV12';
export type { TealEngineV12Options, FailurePolicyConfig } from './TealEngineV12';
