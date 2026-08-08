import { detectProvider } from '../provider-detector';

describe('detectProvider', () => {
  it('detects an OpenAI-compatible Groq client by its base URL', () => {
    const groqClient = {
      baseURL: 'https://api.groq.com/openai/v1',
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    const signature = detectProvider(groqClient);

    expect(signature.provider).toBe('groq');
    expect(signature.interceptMethods).toEqual(['chat.completions.create']);
  });
});
