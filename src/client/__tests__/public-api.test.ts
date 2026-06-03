import fs from 'fs';
import path from 'path';
import {
  TealOpenAI,
  createTealOpenAI,
  TealAnthropic,
  createTealAnthropic
} from '../../index';

describe('canonical public client API', () => {
  it('exports the integrated OpenAI client from the package root', () => {
    const client = new TealOpenAI({
      apiKey: 'test-key',
      enableGuardrails: false
    });

    expect(typeof client.chat.create).toBe('function');
    expect((client.chat as any).completions).toBeUndefined();
  });

  it('uses canonical factories for root client exports', () => {
    const openai = createTealOpenAI({
      apiKey: 'test-key',
      enableGuardrails: false
    });
    const anthropic = createTealAnthropic({
      apiKey: 'test-key',
      enableGuardrails: false
    });

    expect(openai).toBeInstanceOf(TealOpenAI);
    expect(anthropic).toBeInstanceOf(TealAnthropic);
    expect(typeof anthropic.messages.create).toBe('function');
  });

  it('keeps README examples aligned with canonical method names', () => {
    const readmePath = path.join(__dirname, '../../../README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');

    expect(readme).toContain('client.chat.create({');
    expect(readme).toContain('client.messages.create()');
    expect(readme).not.toContain('client.chat.completions.create({');
    expect(readme).not.toContain('TealMultiProvider, TealOpenAI, TealAnthropic');
  });
});
