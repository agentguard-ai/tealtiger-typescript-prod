# OpenTelemetry Decision Tracing

TealTiger can export governance decisions as OpenTelemetry spans through the optional
`TealOTelPlugin`. No telemetry code is executed until the plugin is registered or
passed to a standalone component.

## Install

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-http
```

`@opentelemetry/api` is an optional peer dependency. Applications that do not
enable tracing do not need to install it.

## Trace TealEngineV12 Decisions

```typescript
import { trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { TealEngineV12, TealOTelPlugin } from 'tealtiger';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
});
sdk.start();

const telemetry = new TealOTelPlugin({
  tracer: trace.getTracer('tealtiger-example'),
});

const engine = new TealEngineV12({
  modules: [telemetry],
  policy: { telemetry: { enabled: true } },
});

const decision = await engine.evaluateV12(
  { content: 'inspect this request' },
  {
    correlation_id: 'request-42',
    baggage: { workflow: 'customer-support' },
  },
);
```

The engine emits:

| Span name | Purpose |
| --- | --- |
| `tealtiger.governance.evaluate` | One span for the final policy decision |
| `tealtiger.module.evaluate` | One span per active v1.2 module |
| `tealtiger.guardrail.check` | Guardrail validation when telemetry is passed to `TealGuard` |
| `tealtiger.cost.calculate` | Estimated and actual model cost calculation |

Decision spans include `decision.action`, `decision.risk_score`,
`reason_codes`, `policy.version`, and `correlation_id`. A supplied
`trace_id` plus `parent_span_id` creates an OpenTelemetry span link, and
`baggage` fields are emitted as `baggage.<key>` attributes.

## Standalone Components

Use the same plugin with the classic engine, guardrails, and cost tracking:

```typescript
import { CostTracker, TealEngine, TealGuard } from 'tealtiger';

const engine = new TealEngine(policy, { telemetry });
const guard = new TealGuard({ telemetry });
const costs = new CostTracker({ telemetry });
```

## Automatic and Manual Setup

In CommonJS applications, `new TealOTelPlugin()` resolves an installed
`@opentelemetry/api` package and uses the globally registered tracer provider.
Passing `tracer` or `api` explicitly is recommended for ESM/browser applications
and for tests. If a provider has not been initialized, OpenTelemetry supplies its
standard no-op tracer. If the plugin is not configured, TealTiger does not create
or process spans.

## Jaeger

Run Jaeger with its OTLP HTTP endpoint enabled and open its UI at
`http://localhost:16686`:

```bash
docker run --rm --name jaeger \
  -p 16686:16686 -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

See [`examples/opentelemetry-jaeger.ts`](../../examples/opentelemetry-jaeger.ts)
for a complete setup.
