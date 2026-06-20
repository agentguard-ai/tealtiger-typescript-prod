/**
 * Model Pricing Data
 * 
 * Up-to-date pricing information for major AI model providers
 * Last updated: January 2026
 */

import { ModelPricing, ModelProvider } from './types';

/**
 * Pricing database for all supported models
 * Prices are in USD per 1K tokens
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI GPT-4 Models
  'gpt-4': {
    model: 'gpt-4',
    provider: 'openai',
    inputCostPer1K: 0.03,
    outputCostPer1K: 0.06,
    lastUpdated: '2026-01-31',
  },
  'gpt-4-32k': {
    model: 'gpt-4-32k',
    provider: 'openai',
    inputCostPer1K: 0.06,
    outputCostPer1K: 0.12,
    lastUpdated: '2026-01-31',
  },
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    provider: 'openai',
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03,
    lastUpdated: '2026-01-31',
  },
  'gpt-4-turbo-preview': {
    model: 'gpt-4-turbo-preview',
    provider: 'openai',
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03,
    lastUpdated: '2026-01-31',
  },
  'gpt-4-vision-preview': {
    model: 'gpt-4-vision-preview',
    provider: 'openai',
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03,
    imageCost: 0.00765, // per image (1024x1024)
    lastUpdated: '2026-01-31',
  },

  // OpenAI GPT-3.5 Models
  'gpt-3.5-turbo': {
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    inputCostPer1K: 0.0005,
    outputCostPer1K: 0.0015,
    lastUpdated: '2026-01-31',
  },
  'gpt-3.5-turbo-16k': {
    model: 'gpt-3.5-turbo-16k',
    provider: 'openai',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.004,
    lastUpdated: '2026-01-31',
  },

  // Anthropic Claude Models
  'claude-3-opus-20240229': {
    model: 'claude-3-opus-20240229',
    provider: 'anthropic',
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075,
    lastUpdated: '2026-01-31',
  },
  'claude-3-sonnet-20240229': {
    model: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
    lastUpdated: '2026-01-31',
  },
  'claude-3-haiku-20240307': {
    model: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.00125,
    lastUpdated: '2026-01-31',
  },
  'claude-2.1': {
    model: 'claude-2.1',
    provider: 'anthropic',
    inputCostPer1K: 0.008,
    outputCostPer1K: 0.024,
    lastUpdated: '2026-01-31',
  },
  'claude-2.0': {
    model: 'claude-2.0',
    provider: 'anthropic',
    inputCostPer1K: 0.008,
    outputCostPer1K: 0.024,
    lastUpdated: '2026-01-31',
  },
  'claude-instant-1.2': {
    model: 'claude-instant-1.2',
    provider: 'anthropic',
    inputCostPer1K: 0.0008,
    outputCostPer1K: 0.0024,
    lastUpdated: '2026-01-31',
  },

  // Google PaLM/Gemini Models
  'gemini-pro': {
    model: 'gemini-pro',
    provider: 'google',
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.0005,
    lastUpdated: '2026-01-31',
  },
  'gemini-pro-vision': {
    model: 'gemini-pro-vision',
    provider: 'google',
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.0005,
    imageCost: 0.0025,
    lastUpdated: '2026-01-31',
  },
  'palm-2': {
    model: 'palm-2',
    provider: 'google',
    inputCostPer1K: 0.0005,
    outputCostPer1K: 0.0005,
    lastUpdated: '2026-01-31',
  },

  // Cohere Models
  'command': {
    model: 'command',
    provider: 'cohere',
    inputCostPer1K: 0.001,
    outputCostPer1K: 0.002,
    lastUpdated: '2026-01-31',
  },
  'command-light': {
    model: 'command-light',
    provider: 'cohere',
    inputCostPer1K: 0.0003,
    outputCostPer1K: 0.0006,
    lastUpdated: '2026-01-31',
  },
  'command-nightly': {
    model: 'command-nightly',
    provider: 'cohere',
    inputCostPer1K: 0.001,
    outputCostPer1K: 0.002,
    lastUpdated: '2026-01-31',
  },

  // Groq Models
  'llama-3.3-70b-versatile': {
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
    inputCostPer1K: 0.00059,
    outputCostPer1K: 0.00079,
    lastUpdated: '2026-01-31',
  },
  'llama-3.1-8b-instant': {
    model: 'llama-3.1-8b-instant',
    provider: 'groq',
    inputCostPer1K: 0.00005,
    outputCostPer1K: 0.00008,
    lastUpdated: '2026-01-31',
  },
  'llama-3.1-70b-versatile': {
    model: 'llama-3.1-70b-versatile',
    provider: 'groq',
    inputCostPer1K: 0.00059,
    outputCostPer1K: 0.00079,
    lastUpdated: '2026-01-31',
  },
  'mixtral-8x7b-32768': {
    model: 'mixtral-8x7b-32768',
    provider: 'groq',
    inputCostPer1K: 0.00024,
    outputCostPer1K: 0.00024,
    lastUpdated: '2026-01-31',
  },
  'gemma2-9b-it': {
    model: 'gemma2-9b-it',
    provider: 'groq',
    inputCostPer1K: 0.0002,
    outputCostPer1K: 0.0002,
    lastUpdated: '2026-01-31',
  },

  // DeepSeek Models
  'deepseek-chat': {
    model: 'deepseek-chat',
    provider: 'deepseek',
    inputCostPer1K: 0.00014,
    outputCostPer1K: 0.00028,
    lastUpdated: '2026-01-31',
  },
  'deepseek-reasoner': {
    model: 'deepseek-reasoner',
    provider: 'deepseek',
    inputCostPer1K: 0.00055,
    outputCostPer1K: 0.00219,
    lastUpdated: '2026-01-31',
  },
  'deepseek-coder': {
    model: 'deepseek-coder',
    provider: 'deepseek',
    inputCostPer1K: 0.00014,
    outputCostPer1K: 0.00028,
    lastUpdated: '2026-01-31',
  },

  // Together AI Models
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
    model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    provider: 'together',
    inputCostPer1K: 0.005,
    outputCostPer1K: 0.005,
    lastUpdated: '2026-01-31',
  },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': {
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    provider: 'together',
    inputCostPer1K: 0.00088,
    outputCostPer1K: 0.00088,
    lastUpdated: '2026-01-31',
  },
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    provider: 'together',
    inputCostPer1K: 0.00018,
    outputCostPer1K: 0.00018,
    lastUpdated: '2026-01-31',
  },
  'deepseek-ai/DeepSeek-R1': {
    model: 'deepseek-ai/DeepSeek-R1',
    provider: 'together',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.007,
    lastUpdated: '2026-01-31',
  },

  // Hugging Face TGI Models
  'meta-llama/Meta-Llama-3.1-70B-Instruct': {
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    provider: 'hf-tgi',
    inputCostPer1K: 0.0009,
    outputCostPer1K: 0.0009,
    lastUpdated: '2026-01-31',
  },
  'meta-llama/Meta-Llama-3.1-8B-Instruct': {
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    provider: 'hf-tgi',
    inputCostPer1K: 0.0002,
    outputCostPer1K: 0.0002,
    lastUpdated: '2026-01-31',
  },
  'custom-model': {
    model: 'custom-model',
    provider: 'hf-tgi',
    inputCostPer1K: 0.0005,
    outputCostPer1K: 0.0005,
    lastUpdated: '2026-01-31',
  },

  // xAI Models
  'grok-3': {
    model: 'grok-3',
    provider: 'xai',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
    lastUpdated: '2026-01-31',
  },
  'grok-3-mini': {
    model: 'grok-3-mini',
    provider: 'xai',
    inputCostPer1K: 0.0003,
    outputCostPer1K: 0.0005,
    lastUpdated: '2026-01-31',
  },
  'grok-2': {
    model: 'grok-2',
    provider: 'xai',
    inputCostPer1K: 0.002,
    outputCostPer1K: 0.01,
    lastUpdated: '2026-01-31',
  },
  'grok-2-mini': {
    model: 'grok-2-mini',
    provider: 'xai',
    inputCostPer1K: 0.0002,
    outputCostPer1K: 0.0004,
    lastUpdated: '2026-01-31',
  },
};

/**
 * Get pricing for a specific model
 * @param model Model identifier
 * @param provider Optional provider override
 * @returns Model pricing or undefined if not found
 */
export function getModelPricing(model: string, provider?: ModelProvider): ModelPricing | undefined {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try fuzzy match (case-insensitive, handle variations)
  const normalizedModel = model.toLowerCase().trim();
  
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (key.toLowerCase() === normalizedModel) {
      return pricing;
    }
  }

  // Try partial match for versioned models
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalizedModel.startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(normalizedModel)) {
      if (!provider || pricing.provider === provider) {
        return pricing;
      }
    }
  }

  return undefined;
}

/**
 * Get all models for a specific provider
 * @param provider Provider name
 * @returns Array of model pricing
 */
export function getProviderModels(provider: ModelProvider): ModelPricing[] {
  return Object.values(MODEL_PRICING).filter(p => p.provider === provider);
}

/**
 * Check if a model is supported
 * @param model Model identifier
 * @returns True if model pricing is available
 */
export function isModelSupported(model: string): boolean {
  return getModelPricing(model) !== undefined;
}

/**
 * Get list of all supported models
 * @returns Array of model identifiers
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_PRICING);
}

/**
 * Get list of all supported providers
 * @returns Array of provider names
 */
export function getSupportedProviders(): ModelProvider[] {
  const providers = new Set<ModelProvider>();
  Object.values(MODEL_PRICING).forEach(p => providers.add(p.provider));
  return Array.from(providers);
}
