/**
 * v1.3 Provider Parity Demo
 *
 * Demonstrates guarded chat flows for the additional v1.3 providers:
 * Groq, DeepSeek, Together AI, Hugging Face TGI, and xAI.
 */

import {
  TealDeepSeek,
  TealGroq,
  TealHfTgi,
  TealTogether,
  TealXai,
  GuardrailEngine,
  PromptInjectionGuardrail,
} from '../src';

const guardrailEngine = new GuardrailEngine();

guardrailEngine.registerGuardrail(new PromptInjectionGuardrail({
  name: 'prompt-injection',
  enabled: true,
  action: 'block',
}));

const providerRuns = [
  {
    name: 'Groq',
    apiKey: process.env.GROQ_API_KEY,
    client: () => new TealGroq({
      apiKey: process.env.GROQ_API_KEY!,
      agentId: 'provider-parity-groq',
      guardrailEngine,
    }),
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'DeepSeek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    client: () => new TealDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY!,
      agentId: 'provider-parity-deepseek',
      guardrailEngine,
    }),
    model: 'deepseek-chat',
  },
  {
    name: 'Together AI',
    apiKey: process.env.TOGETHER_API_KEY,
    client: () => new TealTogether({
      apiKey: process.env.TOGETHER_API_KEY!,
      agentId: 'provider-parity-together',
      guardrailEngine,
    }),
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  },
  {
    name: 'xAI',
    apiKey: process.env.XAI_API_KEY,
    client: () => new TealXai({
      apiKey: process.env.XAI_API_KEY!,
      agentId: 'provider-parity-xai',
      guardrailEngine,
    }),
    model: 'grok-3',
  },
  {
    name: 'HF TGI',
    apiKey: process.env.HF_TGI_API_KEY || '',
    client: () => new TealHfTgi({
      apiKey: process.env.HF_TGI_API_KEY || '',
      baseUrl: process.env.HF_TGI_BASE_URL || 'http://localhost:8080',
      agentId: 'provider-parity-hf-tgi',
      guardrailEngine,
    }),
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    requiresBaseUrl: true,
  },
];

async function main() {
  for (const run of providerRuns) {
    if (!run.apiKey && !run.requiresBaseUrl) {
      console.log(`Skipping ${run.name}; API key is not configured.`);
      continue;
    }

    const client = run.client();
    const response = await client.chat.completions.create({
      model: run.model,
      messages: [{ role: 'user', content: 'Summarize TealTiger governance in one sentence.' }],
      max_tokens: 80,
    });

    console.log(`${run.name}: ${response.choices[0]?.message.content}`);
    console.log(`${run.name} cost record:`, response.security?.costRecord);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
