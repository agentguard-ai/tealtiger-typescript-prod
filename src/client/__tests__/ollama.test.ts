import { TealOllama } from '../ollama';
import { TealEngine } from '../../core/engine/TealEngine';
import { TealAudit, CustomOutput, AuditEvent } from '../../core/audit/TealAudit';
import { PolicyViolationError } from '../base';

const originalFetch = global.fetch;

function mockOllamaFetch(): jest.Mock {
  const fetchMock = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    return {
      ok: true,
      json: async () => ({
        id: 'chatcmpl-ollama-test',
        object: 'chat.completion',
        created: 1700000000,
        model: body.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Governed local response' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16
        }
      })
    } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('TealOllama', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('wraps a mocked Ollama chat call with TealEngine policy evaluation and audit', async () => {
    const fetchMock = mockOllamaFetch();
    const auditEvents: AuditEvent[] = [];
    const engine = new TealEngine({
      tools: {
        'ollama.chat': { allowed: true }
      }
    });
    const audit = new TealAudit({
      outputs: [new CustomOutput(event => auditEvents.push(event))],
      enableStorage: true
    });

    const client = new TealOllama({
      agentId: 'local-agent',
      model: 'llama3.2',
      engine,
      audit
    });

    const response = await client.chat.create({
      messages: [{ role: 'user', content: 'Summarize this local note.' }]
    });

    expect(response.choices[0].message.content).toBe('Governed local response');
    expect(response.metadata?.engine).toBe('TealEngine v1.1.0');
    expect(response.metadata?.audit).toBe('TealAudit');
    expect(response.metadata?.provider).toBe('ollama');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"llama3.2"')
      })
    );

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].agentId).toBe('local-agent');
    expect(auditEvents[0].action).toBe('ollama.chat.create');
    expect(auditEvents[0].policyDecisions?.allowed).toBe('true');
  });

  it('blocks Ollama calls when TealEngine denies the ollama.chat tool', async () => {
    const fetchMock = mockOllamaFetch();
    const engine = new TealEngine({
      tools: {
        'ollama.chat': { allowed: false }
      }
    });

    const client = new TealOllama({
      agentId: 'local-agent',
      model: 'llama3.2',
      engine
    });

    await expect(client.chat.create({
      messages: [{ role: 'user', content: 'This should be blocked.' }]
    })).rejects.toThrow(PolicyViolationError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports custom secured Ollama-compatible endpoints', async () => {
    const fetchMock = mockOllamaFetch();
    const client = new TealOllama({
      baseURL: 'http://ollama-proxy.local/v1/',
      apiKey: 'proxy-token',
      model: 'mistral'
    });

    await client.chat.create({
      messages: [{ role: 'user', content: 'Hello local proxy.' }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ollama-proxy.local/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer proxy-token'
        })
      })
    );
  });
});
