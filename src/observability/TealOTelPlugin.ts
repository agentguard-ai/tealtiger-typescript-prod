/**
 * Optional OpenTelemetry integration for TealTiger decisions.
 *
 * The plugin resolves @opentelemetry/api only when constructed. Consumers that
 * do not register telemetry keep the evaluation path free of tracing work.
 */

import { DecisionAction, ReasonCode } from '../core/engine/types';
import type { ModuleContext, ModuleEvaluationRequest, ModuleResult, TealModule } from '../core/engine/v1.2/types';

export type TealSpanAttribute =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

export interface TealSpanLike {
  setAttribute(key: string, value: TealSpanAttribute): TealSpanLike;
  recordException?(error: Error): void;
  setStatus?(status: { code: number; message?: string }): TealSpanLike;
  end(): void;
}

export interface TealSpanContextLike {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
}

export interface TealSpanOptionsLike {
  attributes?: Record<string, TealSpanAttribute>;
  links?: Array<{ context: TealSpanContextLike }>;
}

export interface TealTracerLike {
  startSpan(name: string, options?: TealSpanOptionsLike, context?: unknown): TealSpanLike;
}

export interface TealOTelApiLike {
  trace: {
    getTracer(name: string, version?: string): TealTracerLike;
  };
  context?: {
    active(): unknown;
  };
  SpanStatusCode?: {
    OK: number;
    ERROR: number;
  };
}

export interface TealTraceContext {
  correlation_id?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  baggage?: Record<string, string>;
}

export interface TealTelemetry {
  startSpan(
    name: string,
    attributes?: Record<string, TealSpanAttribute>,
    context?: TealTraceContext,
    parentContext?: unknown,
  ): TealSpanLike | undefined;
  endSpan(span: TealSpanLike | undefined, attributes?: Record<string, TealSpanAttribute>): void;
  failSpan(span: TealSpanLike | undefined, error: unknown): void;
}

export interface TealOTelPluginOptions {
  /** Manually injected tracer, useful in ESM/browser runtimes and tests. */
  tracer?: TealTracerLike;
  /** Manually injected OpenTelemetry API object. */
  api?: TealOTelApiLike;
  /** Tracer instrumentation scope name. */
  instrumentationName?: string;
  /** Tracer instrumentation scope version. */
  instrumentationVersion?: string;
  /** Disable export without removing the registered module. */
  enabled?: boolean;
}

function loadOptionalApi(): TealOTelApiLike | undefined {
  try {
    if (typeof require === 'function') {
      return require('@opentelemetry/api') as TealOTelApiLike;
    }
  } catch (_error) {
    return undefined;
  }
  return undefined;
}

function isValidTraceId(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{32}$/i.test(value);
}

function isValidSpanId(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{16}$/i.test(value);
}

/**
 * TealEngine v1.2 module and tracing adapter backed by OpenTelemetry.
 *
 * Register it as a module with `policy: { telemetry: { enabled: true } }` for
 * engine decisions, or pass it to standalone guardrail/cost integrations.
 */
export class TealOTelPlugin implements TealModule, TealTelemetry {
  readonly name = 'tealotel';
  readonly version = '1.0.0';

  private readonly tracer: TealTracerLike | undefined;
  private readonly api: TealOTelApiLike | undefined;
  private enabled: boolean;

  constructor(options: TealOTelPluginOptions = {}) {
    this.api = options.api ?? loadOptionalApi();
    this.tracer = options.tracer ?? this.api?.trace.getTracer(
      options.instrumentationName ?? 'tealtiger',
      options.instrumentationVersion ?? '1.3.0',
    );
    this.enabled = options.enabled ?? true;
  }

  async init(config: unknown): Promise<void> {
    if (config && typeof config === 'object' && 'enabled' in config) {
      const enabled = (config as { enabled?: unknown }).enabled;
      if (typeof enabled === 'boolean') {
        this.enabled = enabled;
      }
    }
  }

  async evaluate(
    _request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    return {
      action: DecisionAction.ALLOW,
      reason_codes: [ReasonCode.POLICY_COMPLIANT],
      event_type: 'policy.evaluation',
      metadata: { telemetry_export_enabled: this.isTracingEnabled() },
    };
  }

  isTracingEnabled(): boolean {
    return this.enabled && this.tracer !== undefined;
  }

  startSpan(
    name: string,
    attributes: Record<string, TealSpanAttribute> = {},
    context?: TealTraceContext,
    parentContext?: unknown,
  ): TealSpanLike | undefined {
    if (!this.isTracingEnabled() || !this.tracer) {
      return undefined;
    }

    const spanAttributes: Record<string, TealSpanAttribute> = { ...attributes };
    if (context?.correlation_id) {
      spanAttributes.correlation_id = context.correlation_id;
    }
    if (context?.baggage) {
      for (const [key, value] of Object.entries(context.baggage)) {
        spanAttributes[`baggage.${key}`] = value;
      }
    }

    const parentSpanId = context?.parent_span_id ?? context?.span_id;
    const links = isValidTraceId(context?.trace_id) && isValidSpanId(parentSpanId)
      ? [{ context: { traceId: context.trace_id, spanId: parentSpanId, traceFlags: 1 } }]
      : undefined;

    const options: TealSpanOptionsLike = { attributes: spanAttributes };
    if (links) {
      options.links = links;
    }

    return this.tracer.startSpan(
      name,
      options,
      parentContext ?? this.api?.context?.active(),
    );
  }

  endSpan(
    span: TealSpanLike | undefined,
    attributes: Record<string, TealSpanAttribute> = {},
  ): void {
    if (!span) {
      return;
    }
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
    const action = attributes['decision.action'];
    const denied = typeof action === 'string' && action.startsWith('DENY');
    span.setStatus?.(denied
      ? {
          code: this.api?.SpanStatusCode?.ERROR ?? 2,
          message: 'Governance decision denied the request',
        }
      : { code: this.api?.SpanStatusCode?.OK ?? 1 });
    span.end();
  }

  failSpan(span: TealSpanLike | undefined, error: unknown): void {
    if (!span) {
      return;
    }
    const exception = error instanceof Error ? error : new Error(String(error));
    span.recordException?.(exception);
    span.setStatus?.({
      code: this.api?.SpanStatusCode?.ERROR ?? 2,
      message: exception.message,
    });
    span.end();
  }
}
