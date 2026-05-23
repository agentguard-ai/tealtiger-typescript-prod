/**
 * TealTiger legacy AI client wrappers
 * 
 * @deprecated Import provider clients from the package root or from
 * `src/client` inside the repository. This module keeps the pre-v1.1 wrapper
 * API available for compatibility, but the canonical public SDK clients are
 * the integrated clients in `src/client`.
 */

export * from './TealOpenAI';
export * from './TealAnthropic';
export * from './TealAzureOpenAI';
export * from './TealGemini';
export * from './TealBedrock';
export * from './TealMultiProvider';
