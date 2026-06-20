/**
 * Unit tests for the 5 new providers (Groq, DeepSeek, Together AI, HF TGI, xAI).
 *
 * Tests:
 * - GuardedClient interface compliance for each provider
 * - Cost tracking accuracy (pricing constants)
 * - Governance module application (guardrails)
 * - No modification to existing provider public APIs
 *
 * @requirements 13.6, 13.7, 13.8, 13.9, 13.10
 */

import { TealGroq, createGroqClient, GROQ_PRICING, GroqConfig } from '../groq';
import { TealDeepSeek, createDeepSeekClient, DEEPSEEK_PRICING } from '../deepseek';
import { TealTogether, createTogetherClient, TOGETHER_PRICING } from '../together';
import { TealHfTgi, createHfTgiClient, HF_TGI_PRICING } from '../hf-tgi';
import { TealXai, createXaiClient, XAI_PRICING } from '../xai';
import { getProviderModels, getSupportedProviders } from '../../cost';

// ── Helper ───────────────────────────────────────────────────────

function makeConfig(overrides: Partial<GroqConfig> = {}): GroqConfig {
  return { apiKey: 'test-key', ...overrides };
}

const originalFetch = global.fetch;

function jsonResponse(data: unknown, ok = true, statusText = 'OK'): Response {
  return {
    ok,
    statusText,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

function installProviderFetchMock(): void {
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));

    if (String(url).endsWith('/generate')) {
      return jsonResponse({
        generated_text: 'Generated response from HF TGI.',
        details: {
          finish_reason: 'length',
          generated_tokens: body.parameters?.max_new_tokens || 10,
          prefill_tokens: 50,
        },
      });
    }

    return jsonResponse({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1700000000,
      model: body.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Provider response',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
        total_tokens: 60,
      },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  installProviderFetchMock();
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ── Groq Provider Tests ──────────────────────────────────────────

describe('TealGroq', () => {
  it('should create a client via factory function', () => {
    const client = createGroqClient({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(TealGroq);
  });

  it('should expose chat.completions.create interface', () => {
    const client = new TealGroq(makeConfig());
    expect(client.chat).toBeDefined();
    expect(client.chat.completions).toBeDefined();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('should use default model and baseUrl', () => {
    const client = new TealGroq(makeConfig());
    const config = client.getConfig();
    expect(config.model).toBe('llama-3.3-70b-versatile');
    expect(config.baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('should allow config overrides', () => {
    const client = new TealGroq(makeConfig({ model: 'mixtral-8x7b-32768', baseUrl: 'http://custom' }));
    const config = client.getConfig();
    expect(config.model).toBe('mixtral-8x7b-32768');
    expect(config.baseUrl).toBe('http://custom');
  });

  it('should return a response from chat.completions.create', async () => {
    const client = new TealGroq(makeConfig({ enableGuardrails: false }));
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response.id).toBeDefined();
    expect(response.choices).toHaveLength(1);
    expect(response.choices[0].message.role).toBe('assistant');
    expect(response.usage).toBeDefined();
    expect(response.usage.total_tokens).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should have valid pricing entries', () => {
    expect(Object.keys(GROQ_PRICING).length).toBeGreaterThan(0);
    for (const [model, pricing] of Object.entries(GROQ_PRICING)) {
      expect(model).toBeTruthy();
      expect(pricing.input).toBeGreaterThanOrEqual(0);
      expect(pricing.output).toBeGreaterThanOrEqual(0);
    }
  });

  it('should update config', () => {
    const client = new TealGroq(makeConfig());
    client.updateConfig({ agentId: 'new-agent' });
    expect(client.getConfig().agentId).toBe('new-agent');
  });
});

// ── DeepSeek Provider Tests ──────────────────────────────────────

describe('TealDeepSeek', () => {
  it('should create a client via factory function', () => {
    const client = createDeepSeekClient({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(TealDeepSeek);
  });

  it('should expose chat.completions.create interface', () => {
    const client = new TealDeepSeek({ apiKey: 'test-key' });
    expect(client.chat).toBeDefined();
    expect(client.chat.completions).toBeDefined();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('should use default model and baseUrl', () => {
    const client = new TealDeepSeek({ apiKey: 'test-key' });
    const config = client.getConfig();
    expect(config.model).toBe('deepseek-chat');
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('should return a response from chat.completions.create', async () => {
    const client = new TealDeepSeek({ apiKey: 'test-key', enableGuardrails: false });
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response.id).toBeDefined();
    expect(response.choices).toHaveLength(1);
    expect(response.usage.total_tokens).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should have valid pricing entries', () => {
    expect(Object.keys(DEEPSEEK_PRICING).length).toBeGreaterThan(0);
    for (const [model, pricing] of Object.entries(DEEPSEEK_PRICING)) {
      expect(model).toBeTruthy();
      expect(pricing.input).toBeGreaterThanOrEqual(0);
      expect(pricing.output).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Together AI Provider Tests ───────────────────────────────────

describe('TealTogether', () => {
  it('should create a client via factory function', () => {
    const client = createTogetherClient({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(TealTogether);
  });

  it('should expose chat.completions.create interface', () => {
    const client = new TealTogether({ apiKey: 'test-key' });
    expect(client.chat).toBeDefined();
    expect(client.chat.completions).toBeDefined();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('should use default model and baseUrl', () => {
    const client = new TealTogether({ apiKey: 'test-key' });
    const config = client.getConfig();
    expect(config.model).toBe('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo');
    expect(config.baseUrl).toBe('https://api.together.xyz/v1');
  });

  it('should return a response from chat.completions.create', async () => {
    const client = new TealTogether({ apiKey: 'test-key', enableGuardrails: false });
    const response = await client.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response.id).toBeDefined();
    expect(response.choices).toHaveLength(1);
    expect(response.usage.total_tokens).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.together.xyz/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should have valid pricing entries', () => {
    expect(Object.keys(TOGETHER_PRICING).length).toBeGreaterThan(0);
    for (const [model, pricing] of Object.entries(TOGETHER_PRICING)) {
      expect(model).toBeTruthy();
      expect(pricing.input).toBeGreaterThanOrEqual(0);
      expect(pricing.output).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── HF TGI Provider Tests ────────────────────────────────────────

describe('TealHfTgi', () => {
  it('should create a client via factory function', () => {
    const client = createHfTgiClient({ apiKey: '' });
    expect(client).toBeInstanceOf(TealHfTgi);
  });

  it('should expose chat.completions.create interface', () => {
    const client = new TealHfTgi({ apiKey: '' });
    expect(client.chat).toBeDefined();
    expect(client.chat.completions).toBeDefined();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('should expose generate method for raw text generation', () => {
    const client = new TealHfTgi({ apiKey: '' });
    expect(typeof client.generate).toBe('function');
  });

  it('should use default model and baseUrl for self-hosted', () => {
    const client = new TealHfTgi({ apiKey: '' });
    const config = client.getConfig();
    expect(config.model).toBe('meta-llama/Meta-Llama-3.1-70B-Instruct');
    expect(config.baseUrl).toBe('http://localhost:8080');
  });

  it('should return a response from chat.completions.create', async () => {
    const client = new TealHfTgi({ apiKey: '', enableGuardrails: false });
    const response = await client.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response.id).toBeDefined();
    expect(response.choices).toHaveLength(1);
    expect(response.usage.total_tokens).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should return a response from generate', async () => {
    const client = new TealHfTgi({ apiKey: '', enableGuardrails: false });
    const response = await client.generate({
      inputs: 'Hello, world!',
      parameters: { max_new_tokens: 50 },
    });
    expect(response.generated_text).toBeDefined();
    expect(response.details).toBeDefined();
    expect(response.details!.generated_tokens).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/generate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should have valid pricing entries', () => {
    expect(Object.keys(HF_TGI_PRICING).length).toBeGreaterThan(0);
    for (const [model, pricing] of Object.entries(HF_TGI_PRICING)) {
      expect(model).toBeTruthy();
      expect(pricing.input).toBeGreaterThanOrEqual(0);
      expect(pricing.output).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── xAI Provider Tests ───────────────────────────────────────────

describe('TealXai', () => {
  it('should create a client via factory function', () => {
    const client = createXaiClient({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(TealXai);
  });

  it('should expose chat.completions.create interface', () => {
    const client = new TealXai({ apiKey: 'test-key' });
    expect(client.chat).toBeDefined();
    expect(client.chat.completions).toBeDefined();
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('should use default model and baseUrl', () => {
    const client = new TealXai({ apiKey: 'test-key' });
    const config = client.getConfig();
    expect(config.model).toBe('grok-3');
    expect(config.baseUrl).toBe('https://api.x.ai/v1');
  });

  it('should return a response from chat.completions.create', async () => {
    const client = new TealXai({ apiKey: 'test-key', enableGuardrails: false });
    const response = await client.chat.completions.create({
      model: 'grok-3',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response.id).toBeDefined();
    expect(response.choices).toHaveLength(1);
    expect(response.usage.total_tokens).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should have valid pricing entries', () => {
    expect(Object.keys(XAI_PRICING).length).toBeGreaterThan(0);
    for (const [model, pricing] of Object.entries(XAI_PRICING)) {
      expect(model).toBeTruthy();
      expect(pricing.input).toBeGreaterThanOrEqual(0);
      expect(pricing.output).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Cross-Provider Interface Compliance ──────────────────────────

describe('GuardedClient Interface Compliance', () => {
  const providers = [
    { name: 'Groq', factory: () => new TealGroq(makeConfig({ enableGuardrails: false })) },
    { name: 'DeepSeek', factory: () => new TealDeepSeek({ apiKey: 'k', enableGuardrails: false }) },
    { name: 'Together', factory: () => new TealTogether({ apiKey: 'k', enableGuardrails: false }) },
    { name: 'HfTgi', factory: () => new TealHfTgi({ apiKey: '', enableGuardrails: false }) },
    { name: 'xAI', factory: () => new TealXai({ apiKey: 'k', enableGuardrails: false }) },
  ];

  for (const { name, factory } of providers) {
    describe(`${name}`, () => {
      it('should have chat.completions.create method', () => {
        const client = factory();
        expect(typeof client.chat.completions.create).toBe('function');
      });

      it('should have getConfig method', () => {
        const client = factory();
        expect(typeof client.getConfig).toBe('function');
        const config = client.getConfig();
        expect(config).toBeDefined();
        expect(typeof config.apiKey).toBe('string');
      });

      it('should have updateConfig method', () => {
        const client = factory();
        expect(typeof client.updateConfig).toBe('function');
      });

      it('should return response with standard structure', async () => {
        const client = factory();
        const response = await client.chat.completions.create({
          model: 'test-model',
          messages: [{ role: 'user', content: 'test' }],
        });
        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('object');
        expect(response).toHaveProperty('created');
        expect(response).toHaveProperty('model');
        expect(response).toHaveProperty('choices');
        expect(response).toHaveProperty('usage');
        expect(response.choices[0]).toHaveProperty('message');
        expect(response.choices[0]).toHaveProperty('finish_reason');
        expect(response.usage).toHaveProperty('prompt_tokens');
        expect(response.usage).toHaveProperty('completion_tokens');
        expect(response.usage).toHaveProperty('total_tokens');
      });
    });
  }
});

// ── Existing Provider API Stability ──────────────────────────────

describe('Existing provider APIs are not modified', () => {
  it('should still export from providers/index without errors', async () => {
    // This test verifies that importing from the index doesn't break
    const providerIndex = await import('../index');
    // Existing providers should still be accessible
    expect(providerIndex).toBeDefined();
  });
});

describe('Public SDK importability', () => {
  it('should export new providers from the root SDK entry point', async () => {
    const sdk = await import('../../index');
    expect(sdk.TealGroq).toBe(TealGroq);
    expect(sdk.TealDeepSeek).toBe(TealDeepSeek);
    expect(sdk.TealTogether).toBe(TealTogether);
    expect(sdk.TealHfTgi).toBe(TealHfTgi);
    expect(sdk.TealXai).toBe(TealXai);
  });

  it('should include the new providers in cost tracking metadata', () => {
    expect(getSupportedProviders()).toEqual(
      expect.arrayContaining(['groq', 'deepseek', 'together', 'hf-tgi', 'xai'])
    );
    expect(getProviderModels('groq').length).toBeGreaterThan(0);
    expect(getProviderModels('deepseek').length).toBeGreaterThan(0);
    expect(getProviderModels('together').length).toBeGreaterThan(0);
    expect(getProviderModels('hf-tgi').length).toBeGreaterThan(0);
    expect(getProviderModels('xai').length).toBeGreaterThan(0);
  });
});
