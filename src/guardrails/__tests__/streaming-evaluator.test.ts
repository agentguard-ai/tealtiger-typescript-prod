import {
  StreamingGuardrailEvaluator,
  StreamingGuardrailEvent
} from '../streaming-evaluator';
import { PIIDetectionGuardrail } from '../pii-detection';
import { ContentModerationGuardrail } from '../content-moderation';

function isChunkEvent<T>(
  event: StreamingGuardrailEvent<T>
): event is Extract<StreamingGuardrailEvent<T>, { type: 'chunk' }> {
  return event.type === 'chunk';
}

async function* fromArray<T>(chunks: T[]): AsyncGenerator<T> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collectEvents<T>(
  evaluator: StreamingGuardrailEvaluator<T>,
  chunks: T[]
): Promise<StreamingGuardrailEvent<T>[]> {
  const events: StreamingGuardrailEvent<T>[] = [];

  for await (const event of evaluator.evaluateStream(fromArray(chunks))) {
    events.push(event);
  }

  return events;
}

describe('StreamingGuardrailEvaluator', () => {
  it('forwards chunks when streaming content passes guardrails', async () => {
    const evaluator = new StreamingGuardrailEvaluator<string>({
      guardrails: [new PIIDetectionGuardrail()],
      evaluateEveryChunks: 2
    });

    const events = await collectEvents(evaluator, ['hello ', 'world', '!']);
    const chunkEvents = events.filter(isChunkEvent);

    expect(chunkEvents.map((event) => event.text)).toEqual(['hello ', 'world', '!']);
    expect(events[events.length - 1]).toMatchObject({
      type: 'done',
      blocked: false,
      chunksProcessed: 3
    });
  });

  it('detects PII that spans chunks and emits termination without forwarding buffered chunks', async () => {
    const evaluator = new StreamingGuardrailEvaluator<string>({
      guardrails: [new PIIDetectionGuardrail()],
      evaluateEveryChunks: 2
    });

    const events = await collectEvents(evaluator, [
      'Contact me at john.doe',
      '@example.com before sending more text'
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'termination',
      chunkIndex: 2,
      bufferedChunks: 2
    });

    if (events[0].type === 'termination') {
      expect(events[0].reason).toContain('PIIDetection');
      expect(events[0].result.failedGuardrails).toContain('PIIDetection');
    }
  });

  it('accumulates content context before evaluating moderation guardrails', async () => {
    const evaluator = new StreamingGuardrailEvaluator<string>({
      guardrails: [new ContentModerationGuardrail({ useOpenAI: false })],
      evaluateEveryChunks: 2
    });

    const events = await collectEvents(evaluator, [
      'The instructions say to ',
      'kill someone in the story'
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'termination',
      chunkIndex: 2
    });

    if (events[0].type === 'termination') {
      expect(events[0].reason).toContain('ContentModeration');
    }
  });

  it('forces evaluation before pending buffers grow beyond configured limits', async () => {
    const evaluator = new StreamingGuardrailEvaluator<string>({
      guardrails: [new PIIDetectionGuardrail()],
      evaluateEveryChunks: 100,
      evaluateEveryChars: 1000,
      maxBufferedChunks: 3,
      includeEvaluationEvents: true
    });

    const events = await collectEvents(evaluator, ['a', 'b', 'c', 'd']);
    const evaluationEvents = events.filter((event) => event.type === 'evaluation');

    expect(evaluationEvents).toHaveLength(2);
    expect(evaluationEvents[0]).toMatchObject({
      type: 'evaluation',
      bufferedChunks: 3
    });
    expect(evaluationEvents[1]).toMatchObject({
      type: 'evaluation',
      bufferedChunks: 1
    });
  });

  it('supports provider-specific chunk types through a custom text extractor', async () => {
    type ProviderChunk = {
      payload: {
        delta: string;
      };
    };

    const evaluator = new StreamingGuardrailEvaluator<ProviderChunk>({
      guardrails: [new PIIDetectionGuardrail()],
      evaluateEveryChunks: 1,
      chunkTextExtractor: (chunk) => chunk.payload.delta
    });

    const events = await collectEvents(evaluator, [
      { payload: { delta: 'safe provider text' } }
    ]);

    expect(events[0]).toMatchObject({
      type: 'chunk',
      text: 'safe provider text'
    });
  });

  it('adds under 1ms overhead per chunk for lightweight PII streaming checks', async () => {
    const evaluator = new StreamingGuardrailEvaluator<string>({
      guardrails: [new PIIDetectionGuardrail()],
      evaluateEveryChunks: 1
    });
    const chunks = Array.from({ length: 500 }, (_, index) => `safe chunk ${index} `);

    const start = process.hrtime.bigint();
    let eventCount = 0;
    for await (const event of evaluator.evaluateStream(fromArray(chunks))) {
      eventCount += event.type === 'chunk' ? 1 : 0;
    }
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(eventCount).toBe(chunks.length);
    expect(durationMs / chunks.length).toBeLessThan(1);
  });
});
