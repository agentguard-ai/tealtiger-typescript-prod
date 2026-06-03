/**
 * OpenTelemetry export example for a local Jaeger collector.
 *
 * Start Jaeger:
 * docker run --rm --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
 */

import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { TealEngineV12, TealOTelPlugin } from 'tealtiger';

async function main(): Promise<void> {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces',
    }),
  });
  sdk.start();

  const telemetry = new TealOTelPlugin({
    tracer: trace.getTracer('tealtiger-jaeger-example'),
  });

  const engine = new TealEngineV12({
    modules: [telemetry],
    policy: { telemetry: { enabled: true } },
  });

  const decision = await engine.evaluateV12(
    { content: 'Example governed request' },
    {
      correlation_id: 'jaeger-example-request',
      baggage: { workflow: 'demo' },
    },
  );

  console.log(decision.action, decision.reason_codes);
  await sdk.shutdown();
}

void main();
