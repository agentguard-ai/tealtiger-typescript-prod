/**
 * Streaming guardrail evaluation for SSE and async chunk sources.
 *
 * The evaluator buffers provider chunks, evaluates a rolling text window at
 * configured intervals, and only forwards buffered chunks after the guardrails
 * pass. If a guardrail returns a block action, a termination event is emitted
 * and buffered chunks are not forwarded.
 */

import { Guardrail } from './base';
import {
  GuardrailEngine,
  GuardrailEngineOptions,
  GuardrailEngineResult
} from './engine';

export interface StreamingGuardrailEvaluatorOptions<TChunk = unknown> {
  engine?: GuardrailEngine;
  guardrails?: Guardrail[];
  engineOptions?: GuardrailEngineOptions;
  chunkTextExtractor?: (chunk: TChunk) => string;
  evaluateEveryChunks?: number;
  evaluateEveryChars?: number;
  maxWindowChars?: number;
  maxBufferedChunks?: number;
  maxBufferedChars?: number;
  includeEvaluationEvents?: boolean;
}

export interface StreamingGuardrailChunkEvent<TChunk = unknown> {
  type: 'chunk';
  chunk: TChunk;
  text: string;
  chunkIndex: number;
}

export interface StreamingGuardrailEvaluationEvent {
  type: 'evaluation';
  result: GuardrailEngineResult;
  text: string;
  chunkIndex: number;
  bufferedChunks: number;
  bufferedChars: number;
}

export interface StreamingGuardrailTerminationEvent {
  type: 'termination';
  result: GuardrailEngineResult;
  reason: string;
  text: string;
  chunkIndex: number;
  bufferedChunks: number;
  bufferedChars: number;
}

export interface StreamingGuardrailDoneEvent {
  type: 'done';
  chunksProcessed: number;
  evaluations: number;
  blocked: boolean;
}

export type StreamingGuardrailEvent<TChunk = unknown> =
  | StreamingGuardrailChunkEvent<TChunk>
  | StreamingGuardrailEvaluationEvent
  | StreamingGuardrailTerminationEvent
  | StreamingGuardrailDoneEvent;

interface PendingChunk<TChunk> {
  chunk: TChunk;
  text: string;
  chunkIndex: number;
}

interface EvaluationState<TChunk> {
  retainedText: string;
  pendingChunks: PendingChunk<TChunk>[];
  pendingChars: number;
  chunksSinceEvaluation: number;
  charsSinceEvaluation: number;
  chunksProcessed: number;
  evaluations: number;
}

export class StreamingGuardrailEvaluator<TChunk = unknown> {
  private readonly engine: GuardrailEngine;
  private readonly chunkTextExtractor: (chunk: TChunk) => string;
  private readonly evaluateEveryChunks: number;
  private readonly evaluateEveryChars: number;
  private readonly maxWindowChars: number;
  private readonly maxBufferedChunks: number;
  private readonly maxBufferedChars: number;
  private readonly includeEvaluationEvents: boolean;

  constructor(options: StreamingGuardrailEvaluatorOptions<TChunk> = {}) {
    this.engine = options.engine ?? new GuardrailEngine(options.engineOptions);
    this.chunkTextExtractor = options.chunkTextExtractor ?? this.defaultExtractText;
    this.evaluateEveryChunks = this.requirePositiveInteger(
      options.evaluateEveryChunks ?? 5,
      'evaluateEveryChunks'
    );
    this.evaluateEveryChars = this.requirePositiveInteger(
      options.evaluateEveryChars ?? 500,
      'evaluateEveryChars'
    );
    this.maxWindowChars = this.requirePositiveInteger(
      options.maxWindowChars ?? 4096,
      'maxWindowChars'
    );
    this.maxBufferedChunks = this.requirePositiveInteger(
      options.maxBufferedChunks ?? 64,
      'maxBufferedChunks'
    );
    this.maxBufferedChars = this.requirePositiveInteger(
      options.maxBufferedChars ?? 8192,
      'maxBufferedChars'
    );
    this.includeEvaluationEvents = options.includeEvaluationEvents === true;

    options.guardrails?.forEach((guardrail) => this.engine.registerGuardrail(guardrail));
  }

  registerGuardrail(guardrail: Guardrail): void {
    this.engine.registerGuardrail(guardrail);
  }

  async evaluateText(
    text: string,
    context: Record<string, any> = {}
  ): Promise<GuardrailEngineResult> {
    return this.engine.execute(text, {
      ...context,
      streaming: true
    });
  }

  async *evaluateStream(
    chunks: AsyncIterable<TChunk>,
    context: Record<string, any> = {}
  ): AsyncGenerator<StreamingGuardrailEvent<TChunk>> {
    const state: EvaluationState<TChunk> = {
      retainedText: '',
      pendingChunks: [],
      pendingChars: 0,
      chunksSinceEvaluation: 0,
      charsSinceEvaluation: 0,
      chunksProcessed: 0,
      evaluations: 0
    };

    for await (const chunk of chunks) {
      state.chunksProcessed += 1;
      const text = this.chunkTextExtractor(chunk);

      if (!this.hasEnabledGuardrails()) {
        yield {
          type: 'chunk',
          chunk,
          text,
          chunkIndex: state.chunksProcessed
        };
        continue;
      }

      this.appendChunk(state, chunk, text);

      if (this.shouldEvaluate(state)) {
        const outcome = await this.evaluatePending(state, context);
        for (const event of outcome.events) {
          yield event;
        }

        if (outcome.blocked) {
          return;
        }
      }
    }

    if (state.pendingChunks.length > 0) {
      const outcome = await this.evaluatePending(state, context);
      for (const event of outcome.events) {
        yield event;
      }

      if (outcome.blocked) {
        return;
      }
    }

    yield {
      type: 'done',
      chunksProcessed: state.chunksProcessed,
      evaluations: state.evaluations,
      blocked: false
    };
  }

  private appendChunk(state: EvaluationState<TChunk>, chunk: TChunk, text: string): void {
    state.retainedText = this.trimStart(state.retainedText + text, this.maxWindowChars);
    state.pendingChunks.push({
      chunk,
      text,
      chunkIndex: state.chunksProcessed
    });
    state.pendingChars += text.length;
    state.chunksSinceEvaluation += 1;
    state.charsSinceEvaluation += text.length;
  }

  private shouldEvaluate(state: EvaluationState<TChunk>): boolean {
    return (
      state.chunksSinceEvaluation >= this.evaluateEveryChunks ||
      state.charsSinceEvaluation >= this.evaluateEveryChars ||
      state.pendingChunks.length >= this.maxBufferedChunks ||
      state.pendingChars >= this.maxBufferedChars
    );
  }

  private async evaluatePending(
    state: EvaluationState<TChunk>,
    context: Record<string, any>
  ): Promise<{
    blocked: boolean;
    events: StreamingGuardrailEvent<TChunk>[];
  }> {
    const result = await this.evaluateText(state.retainedText, {
      ...context,
      chunkIndex: state.chunksProcessed,
      bufferedChunks: state.pendingChunks.length,
      bufferedChars: state.pendingChars
    });
    state.evaluations += 1;

    const bufferedChunks = state.pendingChunks.length;
    const bufferedChars = state.pendingChars;
    const events: StreamingGuardrailEvent<TChunk>[] = [];

    if (this.includeEvaluationEvents) {
      events.push({
        type: 'evaluation',
        result,
        text: state.retainedText,
        chunkIndex: state.chunksProcessed,
        bufferedChunks,
        bufferedChars
      });
    }

    if (this.shouldTerminate(result)) {
      events.push({
        type: 'termination',
        result,
        reason: this.getTerminationReason(result),
        text: state.retainedText,
        chunkIndex: state.chunksProcessed,
        bufferedChunks,
        bufferedChars
      });
      this.resetPending(state);
      return { blocked: true, events };
    }

    for (const pending of state.pendingChunks) {
      events.push({
        type: 'chunk',
        chunk: pending.chunk,
        text: pending.text,
        chunkIndex: pending.chunkIndex
      });
    }

    this.resetPending(state);
    return { blocked: false, events };
  }

  private resetPending(state: EvaluationState<TChunk>): void {
    state.pendingChunks = [];
    state.pendingChars = 0;
    state.chunksSinceEvaluation = 0;
    state.charsSinceEvaluation = 0;
  }

  private shouldTerminate(result: GuardrailEngineResult): boolean {
    return result.results.some((execution) => execution.result?.shouldBlock() === true);
  }

  private getTerminationReason(result: GuardrailEngineResult): string {
    const blockingResult = result.results.find(
      (execution) => execution.result?.shouldBlock() === true
    );

    if (blockingResult?.result) {
      return `${blockingResult.guardrailName}: ${blockingResult.result.reason}`;
    }

    return 'Streaming guardrail requested termination';
  }

  private hasEnabledGuardrails(): boolean {
    return this.engine.getRegisteredGuardrails().some((guardrail) => guardrail.enabled);
  }

  private defaultExtractText(chunk: TChunk): string {
    const value = chunk as any;

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value?.text === 'string') {
      return value.text;
    }

    if (typeof value?.content === 'string') {
      return value.content;
    }

    if (typeof value?.delta === 'string') {
      return value.delta;
    }

    const openAIContent = value?.choices?.[0]?.delta?.content;
    if (typeof openAIContent === 'string') {
      return openAIContent;
    }

    return '';
  }

  private trimStart(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(text.length - maxLength);
  }

  private requirePositiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }

    return value;
  }
}
