/**
 * Governed local Ollama chat example.
 *
 * Start Ollama first:
 *   ollama run llama3.2
 */

import { TealOllama, TealEngine, TealAudit, ConsoleOutput } from '../src';

async function main(): Promise<void> {
  const engine = new TealEngine({
    tools: {
      'ollama.chat': { allowed: true }
    }
  });

  const audit = new TealAudit({
    outputs: [new ConsoleOutput()]
  });

  const ollama = new TealOllama({
    agentId: 'local-ollama-agent',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    engine,
    audit
  });

  const response = await ollama.chat.create({
    messages: [
      { role: 'system', content: 'You are concise and cite uncertainty.' },
      { role: 'user', content: 'Give me a three-bullet local AI safety checklist.' }
    ],
    temperature: 0.2
  });

  console.log(response.choices[0].message.content);
  console.log(response.metadata);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
