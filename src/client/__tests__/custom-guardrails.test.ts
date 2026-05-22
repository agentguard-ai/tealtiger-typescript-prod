import { GuardrailViolationError } from '../base';
import { TealOpenAI } from '../openai';

describe('TealOpenAI custom guardrails', () => {
  it('blocks requests with function-based custom guardrails from client config', async () => {
    const client = new TealOpenAI({
      apiKey: 'test-key',
      enableGuardrails: true,
      customGuardrails: [
        {
          name: 'medical-terms-blocker',
          check: async (input: string) => {
            const found = ['diagnosis', 'prescription', 'treatment']
              .find(term => input.toLowerCase().includes(term));

            return {
              passed: !found,
              reason: found ? `Blocked medical term: ${found}` : undefined
            };
          }
        }
      ]
    });

    await expect(client.chat.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please include the diagnosis.' }]
    })).rejects.toThrow(GuardrailViolationError);
  });
});
