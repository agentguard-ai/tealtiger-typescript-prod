/**
 * AI Provider secret detectors (~30 patterns)
 * OpenAI, Anthropic, Cohere, HuggingFace, Google AI, Mistral, etc.
 */
import { SecretPattern } from '../types';

export const aiProviderDetectors: SecretPattern[] = [
  // OpenAI (5 patterns)
  { id: 'openai-api-key', regex: /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/, category: 'ai_provider', severity: 'CRITICAL', description: 'OpenAI API Key (legacy)' },
  { id: 'openai-api-key-v2', regex: /\bsk-proj-[A-Za-z0-9_-]{40,}/, category: 'ai_provider', severity: 'CRITICAL', description: 'OpenAI Project API Key' },
  { id: 'openai-org-key', regex: /\borg-[A-Za-z0-9]{24}\b/, category: 'ai_provider', severity: 'MEDIUM', description: 'OpenAI Organization ID' },
  { id: 'openai-session-key', regex: /\bsess-[A-Za-z0-9]{40}\b/, category: 'ai_provider', severity: 'HIGH', description: 'OpenAI Session Key' },
  { id: 'openai-service-key', regex: /\bsk-svcacct-[A-Za-z0-9_-]{40,}/, category: 'ai_provider', severity: 'CRITICAL', description: 'OpenAI Service Account Key' },

  // Anthropic (4 patterns)
  { id: 'anthropic-api-key', regex: /\bsk-ant-api03-[A-Za-z0-9_-]{90,}/, category: 'ai_provider', severity: 'CRITICAL', description: 'Anthropic API Key' },
  { id: 'anthropic-api-key-v2', regex: /\bsk-ant-[A-Za-z0-9_-]{40,}/, category: 'ai_provider', severity: 'CRITICAL', description: 'Anthropic API Key (v2)' },
  { id: 'anthropic-session', regex: /(?:ANTHROPIC_API_KEY|anthropic_key)\s*[:=]\s*["']?(sk-ant-[A-Za-z0-9_-]{20,})/, category: 'ai_provider', severity: 'CRITICAL', description: 'Anthropic Key in Config' },
  { id: 'anthropic-admin-key', regex: /(?:ANTHROPIC_ADMIN_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'ai_provider', severity: 'CRITICAL', description: 'Anthropic Admin Key' },

  // Cohere (3 patterns)
  { id: 'cohere-api-key', regex: /(?:cohere_api_key|COHERE_API_KEY|CO_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9]{40})/, category: 'ai_provider', severity: 'HIGH', description: 'Cohere API Key' },
  { id: 'cohere-trial-key', regex: /(?:cohere_trial|COHERE_TRIAL)\s*[:=]\s*["']?([A-Za-z0-9]{40})/, category: 'ai_provider', severity: 'MEDIUM', description: 'Cohere Trial Key' },
  { id: 'cohere-production-key', regex: /(?:cohere_production|COHERE_PROD)\s*[:=]\s*["']?([A-Za-z0-9]{40})/, category: 'ai_provider', severity: 'CRITICAL', description: 'Cohere Production Key' },

  // HuggingFace (3 patterns)
  { id: 'huggingface-token', regex: /\bhf_[A-Za-z0-9]{34}\b/, category: 'ai_provider', severity: 'HIGH', description: 'HuggingFace API Token' },
  { id: 'huggingface-write-token', regex: /(?:HF_TOKEN|HUGGINGFACE_TOKEN)\s*[:=]\s*["']?(hf_[A-Za-z0-9]{34})/, category: 'ai_provider', severity: 'HIGH', description: 'HuggingFace Write Token' },
  { id: 'huggingface-org-token', regex: /(?:HF_ORG_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'ai_provider', severity: 'HIGH', description: 'HuggingFace Org Token' },

  // Google AI / Vertex (3 patterns)
  { id: 'google-ai-api-key', regex: /(?:GOOGLE_AI_API_KEY|GOOGLE_API_KEY)\s*[:=]\s*["']?(AIza[0-9A-Za-z_-]{35})/, category: 'ai_provider', severity: 'HIGH', description: 'Google AI API Key' },
  { id: 'google-palm-key', regex: /(?:PALM_API_KEY|palm_key)\s*[:=]\s*["']?(AIza[0-9A-Za-z_-]{35})/, category: 'ai_provider', severity: 'HIGH', description: 'Google PaLM API Key' },
  { id: 'google-vertex-sa', regex: /(?:VERTEX_AI_SERVICE_ACCOUNT)\s*[:=]\s*["']?([a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com)/, category: 'ai_provider', severity: 'HIGH', description: 'Google Vertex AI Service Account' },

  // Mistral (3 patterns)
  { id: 'mistral-api-key', regex: /(?:MISTRAL_API_KEY|mistral_key)\s*[:=]\s*["']?([A-Za-z0-9]{32})/, category: 'ai_provider', severity: 'HIGH', description: 'Mistral AI API Key' },
  { id: 'mistral-org-key', regex: /(?:MISTRAL_ORG_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{32,})/, category: 'ai_provider', severity: 'HIGH', description: 'Mistral AI Org Key' },
  { id: 'mistral-endpoint-key', regex: /(?:MISTRAL_ENDPOINT_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{32,})/, category: 'ai_provider', severity: 'HIGH', description: 'Mistral AI Endpoint Key' },

  // Replicate (2 patterns)
  { id: 'replicate-api-token', regex: /\br8_[A-Za-z0-9]{40}\b/, category: 'ai_provider', severity: 'HIGH', description: 'Replicate API Token' },
  { id: 'replicate-env-token', regex: /(?:REPLICATE_API_TOKEN)\s*[:=]\s*["']?(r8_[A-Za-z0-9]{40})/, category: 'ai_provider', severity: 'HIGH', description: 'Replicate Token in Env' },

  // Stability AI (2 patterns)
  { id: 'stability-api-key', regex: /(?:STABILITY_API_KEY|stability_key)\s*[:=]\s*["']?(sk-[A-Za-z0-9]{48})/, category: 'ai_provider', severity: 'HIGH', description: 'Stability AI API Key' },
  { id: 'stability-org-key', regex: /(?:STABILITY_ORG_ID)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'ai_provider', severity: 'MEDIUM', description: 'Stability AI Org ID' },

  // AI21 Labs (2 patterns)
  { id: 'ai21-api-key', regex: /(?:AI21_API_KEY|ai21_key)\s*[:=]\s*["']?([A-Za-z0-9]{40,})/, category: 'ai_provider', severity: 'HIGH', description: 'AI21 Labs API Key' },
  { id: 'ai21-org-key', regex: /(?:AI21_ORG_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'ai_provider', severity: 'MEDIUM', description: 'AI21 Labs Org Key' },

  // Together AI (2 patterns)
  { id: 'together-api-key', regex: /(?:TOGETHER_API_KEY|together_key)\s*[:=]\s*["']?([a-f0-9]{64})/, category: 'ai_provider', severity: 'HIGH', description: 'Together AI API Key' },
  { id: 'together-org-key', regex: /(?:TOGETHER_ORG_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'ai_provider', severity: 'MEDIUM', description: 'Together AI Org Key' },

  // Perplexity (1 pattern)
  { id: 'perplexity-api-key', regex: /\bpplx-[a-f0-9]{48}\b/, category: 'ai_provider', severity: 'HIGH', description: 'Perplexity API Key' },
];
