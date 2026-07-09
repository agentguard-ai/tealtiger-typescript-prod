/**
 * ProviderDetector — identifies which of the 12 supported providers
 * a client instance belongs to using duck-typing (no instanceof).
 */

import type { ProviderSignature, TokenUsage, ToolCallInfo } from './types';
import { UnsupportedProviderError } from './errors';
import { createHash } from 'crypto';

function hashArgs(args: unknown): string {
  const str = JSON.stringify(args ?? {});
  return `sha256:${createHash('sha256').update(str).digest('hex').slice(0, 32)}`;
}

// --- Usage Extractors ---

function openaiUsageExtractor(response: any): TokenUsage | null {
  const usage = response?.usage;
  if (!usage) return null;
  return {
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

function anthropicUsageExtractor(response: any): TokenUsage | null {
  const usage = response?.usage;
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
  };
}

function geminiUsageExtractor(response: any): TokenUsage | null {
  const meta = response?.usageMetadata;
  if (!meta) return null;
  return {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    totalTokens: meta.totalTokenCount ?? 0,
  };
}


// --- Model Extractors ---

function openaiModelExtractor(request: any, response: any): string {
  return response?.model ?? request?.model ?? 'unknown';
}

function anthropicModelExtractor(request: any, response: any): string {
  return response?.model ?? request?.model ?? 'unknown';
}

function geminiModelExtractor(request: any, _response: any): string {
  return request?.model ?? 'gemini-unknown';
}

// --- Tool Call Extractors ---

function openaiToolCallExtractor(response: any): ToolCallInfo[] {
  const choices = response?.choices;
  if (!choices?.[0]?.message?.tool_calls) return [];
  return choices[0].message.tool_calls.map((tc: any) => ({
    toolName: tc.function?.name ?? 'unknown',
    argumentCount: Object.keys(JSON.parse(tc.function?.arguments ?? '{}')).length,
    argumentsHash: hashArgs(tc.function?.arguments),
  }));
}

function anthropicToolCallExtractor(response: any): ToolCallInfo[] {
  const content = response?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block: any) => block.type === 'tool_use')
    .map((block: any) => ({
      toolName: block.name ?? 'unknown',
      argumentCount: Object.keys(block.input ?? {}).length,
      argumentsHash: hashArgs(block.input),
    }));
}

function defaultToolCallExtractor(_response: any): ToolCallInfo[] {
  return [];
}

// --- Provider Detection ---

function hasNestedMethod(obj: any, path: string): boolean {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return false;
    current = current[part];
  }
  return typeof current === 'function' || current != null;
}

function getBaseURL(client: any): string {
  return (
    client?.baseURL ??
    client?._options?.baseURL ??
    client?.configuration?.basePath ??
    ''
  ).toLowerCase();
}

/**
 * Detect the provider type from a client instance using duck-typing.
 * @throws UnsupportedProviderError if no match found
 */
export function detectProvider(client: object): ProviderSignature {
  const c = client as any;
  const baseURL = getBaseURL(c);

  // Azure OpenAI (must check before OpenAI — same methods, different baseURL)
  if (hasNestedMethod(c, 'chat.completions') && (c?._options?.azureEndpoint || baseURL.includes('azure'))) {
    return {
      provider: 'azure-openai',
      interceptMethods: ['chat.completions.create', 'completions.create'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // DeepSeek (OpenAI-compatible with deepseek baseURL)
  if (hasNestedMethod(c, 'chat.completions') && baseURL.includes('deepseek')) {
    return {
      provider: 'deepseek',
      interceptMethods: ['chat.completions.create'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // Groq (OpenAI-compatible with groq baseURL)
  if (hasNestedMethod(c, 'chat.completions') && baseURL.includes('groq')) {
    return {
      provider: 'groq',
      interceptMethods: ['chat.completions.create'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // xAI (OpenAI-compatible with x.ai baseURL)
  if (hasNestedMethod(c, 'chat.completions') && baseURL.includes('x.ai')) {
    return {
      provider: 'xai',
      interceptMethods: ['chat.completions.create'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // Together (OpenAI-compatible with together baseURL)
  if (hasNestedMethod(c, 'chat.completions') && baseURL.includes('together')) {
    return {
      provider: 'together',
      interceptMethods: ['chat.completions.create'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // OpenAI (generic — checked after URL-specific variants)
  if (hasNestedMethod(c, 'chat.completions')) {
    return {
      provider: 'openai',
      interceptMethods: ['chat.completions.create', 'completions.create'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // Anthropic
  if (hasNestedMethod(c, 'messages')) {
    return {
      provider: 'anthropic',
      interceptMethods: ['messages.create'],
      usageExtractor: anthropicUsageExtractor,
      modelExtractor: anthropicModelExtractor,
      toolCallExtractor: anthropicToolCallExtractor,
    };
  }

  // Gemini
  if (typeof c?.generateContent === 'function' || hasNestedMethod(c, 'models.generateContent')) {
    return {
      provider: 'gemini',
      interceptMethods: ['generateContent', 'models.generateContent'],
      usageExtractor: geminiUsageExtractor,
      modelExtractor: geminiModelExtractor,
      toolCallExtractor: defaultToolCallExtractor,
    };
  }

  // Bedrock (AWS SDK pattern)
  if (typeof c?.send === 'function' && c?.config?.region) {
    return {
      provider: 'bedrock',
      interceptMethods: ['send'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: (_req: any, _res: any) => 'bedrock-model',
      toolCallExtractor: defaultToolCallExtractor,
    };
  }

  // Cohere
  if (typeof c?.chat === 'function' && typeof c?.generate === 'function') {
    return {
      provider: 'cohere',
      interceptMethods: ['chat', 'generate'],
      usageExtractor: (res: any) => {
        const meta = res?.meta?.tokens;
        if (!meta) return null;
        return {
          inputTokens: meta.input_tokens ?? 0,
          outputTokens: meta.output_tokens ?? 0,
          totalTokens: (meta.input_tokens ?? 0) + (meta.output_tokens ?? 0),
        };
      },
      modelExtractor: (_req: any, _res: any) => 'command-r',
      toolCallExtractor: defaultToolCallExtractor,
    };
  }

  // Mistral
  if (typeof c?.chat === 'function' && c?.constructor?.name?.toLowerCase().includes('mistral')) {
    return {
      provider: 'mistral',
      interceptMethods: ['chat'],
      usageExtractor: openaiUsageExtractor,
      modelExtractor: openaiModelExtractor,
      toolCallExtractor: openaiToolCallExtractor,
    };
  }

  // HF-TGI
  if (typeof c?.textGeneration === 'function' || baseURL.includes('huggingface')) {
    return {
      provider: 'hf-tgi',
      interceptMethods: ['textGeneration', 'chatCompletion'],
      usageExtractor: (_res: any) => null,
      modelExtractor: (_req: any, _res: any) => 'hf-model',
      toolCallExtractor: defaultToolCallExtractor,
    };
  }

  // No match
  const typeName = c?.constructor?.name ?? typeof client;
  throw new UnsupportedProviderError(typeName);
}
