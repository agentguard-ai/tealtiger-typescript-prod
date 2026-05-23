/**
 * TealTiger AI Clients
 * 
 * @deprecated This module contains legacy mock/placeholder client implementations.
 * Use the canonical clients from `tealtiger/client` instead (TealOpenAI, TealAnthropic,
 * TealGemini, TealBedrock, TealAzureOpenAI, TealMistral, TealCohere).
 * 
 * The canonical clients extend `TealBaseClient` and provide full component integration
 * (TealEngine, TealGuard, TealCircuit, TealAudit, TealMonitor).
 * 
 * Retained for backward compatibility only.
 * 
 * Drop-in replacements for AI provider clients with integrated security
 */

export * from './TealOpenAI';
export * from './TealAnthropic';
export * from './TealAzureOpenAI';
export * from './TealGemini';
export * from './TealBedrock';
export * from './TealMultiProvider';
