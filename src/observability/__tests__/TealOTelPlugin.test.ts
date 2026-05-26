import { CostTracker } from '../../cost/CostTracker';
import { TealEngine } from '../../core/engine/TealEngine';
import { DecisionAction } from '../../core/engine/types';
import { TealEngineV12 } from '../../core/engine/v1.2/TealEngineV12';
import type { ModuleResult, TealModule } from '../../core/engine/v1.2/types';
import { TealGuard } from '../../core/guard/TealGuard';
import {
  TealOTelPlugin,
  type TealSpanAttribute,
  type TealSpanLike,
  type TealSpanOptionsLike,
  type TealTracerLike,
} from '../TealOTelPlugin';

class MockSpan implements TealSpanLike {
  readonly attributes: Record<string, TealSpanAttribute> = {};
  status: { code: number; message?: string } | undefined;
  exception: Error | undefined;
  ended = false;

  setAttribute(key: string, value: TealSpanAttribute): TealSpanLike {
    this.attributes[key] = value;
    return this;
  }

  setStatus(status: { code: number; message?: string }): TealSpanLike {
    this.status = status;
    return this;
  }

  recordException(error: Error): void {
    this.exception = error;
  }

  end(): void {
    this.ended = true;
  }
}

class MockTracer implements TealTracerLike {
  readonly started: Array<{
    name: string;
    options: TealSpanOptionsLike | undefined;
    context: unknown;
    span: MockSpan;
  }> = [];

  startSpan(name: string, options?: TealSpanOptionsLike, context?: unknown): MockSpan {
    const span = new MockSpan();
    Object.assign(span.attributes, options?.attributes);
    this.started.push({ name, options, context, span });
    return span;
  }
}

const allowModule = (name: string): TealModule => ({
  name,
  version: '1.0.0',
  evaluate: async (): Promise<ModuleResult> => ({
    action: DecisionAction.ALLOW,
    reason_codes: ['POLICY_COMPLIANT'],
    event_type: 'policy.evaluation',
  }),
});

describe('TealOTelPlugin', () => {
  it('does not create spans when it is disabled', () => {
    const tracer = new MockTracer();
    const plugin = new TealOTelPlugin({ tracer, enabled: false });

    expect(plugin.startSpan('tealtiger.governance.evaluate')).toBeUndefined();
    expect(tracer.started).toHaveLength(0);
  });

  it('uses an injected API tracer and active context', () => {
    const tracer = new MockTracer();
    const parentContext = { parent: true };
    const plugin = new TealOTelPlugin({
      api: {
        trace: { getTracer: () => tracer },
        context: { active: () => parentContext },
        SpanStatusCode: { OK: 1, ERROR: 2 },
      },
    });

    const span = plugin.startSpan('tealtiger.governance.evaluate');
    plugin.endSpan(span, { 'decision.action': 'ALLOW' });

    expect(tracer.started[0].context).toBe(parentContext);
    expect(tracer.started[0].span.attributes['decision.action']).toBe('ALLOW');
    expect(tracer.started[0].span.ended).toBe(true);
  });

  it('marks denied decisions as error spans', () => {
    const tracer = new MockTracer();
    const plugin = new TealOTelPlugin({
      tracer,
      api: {
        trace: { getTracer: () => tracer },
        SpanStatusCode: { OK: 1, ERROR: 2 },
      },
    });

    const span = plugin.startSpan('tealtiger.governance.evaluate');
    plugin.endSpan(span, { 'decision.action': 'DENY' });

    expect(tracer.started[0].span.status?.code).toBe(2);
  });

  it('exports v1.2 decision and module spans with trace links and baggage', async () => {
    const tracer = new MockTracer();
    const telemetry = new TealOTelPlugin({ tracer });
    const engine = new TealEngineV12({
      modules: [allowModule('tealsecrets'), telemetry],
      policy: { secrets: { enabled: true }, telemetry: { enabled: true } },
    });

    const decision = await engine.evaluateV12(
      { content: 'safe' },
      {
        correlation_id: 'corr-120',
        trace_id: 'a'.repeat(32),
        parent_span_id: 'b'.repeat(16),
        baggage: { workflow: 'review' },
      },
    );

    const root = tracer.started.find((entry) => entry.name === 'tealtiger.governance.evaluate');
    const modules = tracer.started.filter((entry) => entry.name === 'tealtiger.module.evaluate');

    expect(decision.action).toBe(DecisionAction.ALLOW);
    expect(root?.span.attributes['decision.action']).toBe(DecisionAction.ALLOW);
    expect(root?.span.attributes['decision.risk_score']).toBe(0);
    expect(root?.span.attributes.reason_codes).toContain('POLICY_COMPLIANT');
    expect(root?.span.attributes['baggage.workflow']).toBe('review');
    expect(root?.options?.links?.[0].context.traceId).toBe('a'.repeat(32));
    expect(modules).toHaveLength(2);
  });

  it('honors disabled telemetry policies in TealEngineV12', async () => {
    const tracer = new MockTracer();
    const telemetry = new TealOTelPlugin({ tracer });
    const engine = new TealEngineV12({
      modules: [telemetry],
      policy: { telemetry: { enabled: false } },
    });

    await engine.evaluateV12({ content: 'safe' }, { correlation_id: 'corr-disabled' });

    expect(tracer.started).toHaveLength(0);
  });

  it('instruments classic policy decisions and guardrail checks', async () => {
    const tracer = new MockTracer();
    const telemetry = new TealOTelPlugin({ tracer });
    const engine = new TealEngine(
      { tools: { search: { allowed: true } } },
      { telemetry },
    );
    const guard = new TealGuard({ telemetry });

    engine.evaluateWithMode({ agentId: 'agent', action: 'tool.execute', tool: 'search' });
    await guard.check('safe input');

    expect(tracer.started.map((entry) => entry.name)).toEqual([
      'tealtiger.governance.evaluate',
      'tealtiger.guardrail.check',
    ]);
    expect(tracer.started.every((entry) => entry.span.ended)).toBe(true);
  });

  it('instruments estimated and actual cost calculation', () => {
    const tracer = new MockTracer();
    const telemetry = new TealOTelPlugin({ tracer });
    const tracker = new CostTracker({ telemetry });
    const tokens = { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 };

    tracker.estimateCost('gpt-4', tokens);
    tracker.calculateActualCost('req-1', 'agent-1', 'gpt-4', tokens);

    expect(tracer.started.map((entry) => entry.name)).toEqual([
      'tealtiger.cost.calculate',
      'tealtiger.cost.calculate',
    ]);
    expect(tracer.started[0].span.attributes['cost.amount_usd']).toBe(0.06);
    expect(tracer.started[1].span.attributes['cost.amount_usd']).toBe(0.06);
  });
});
