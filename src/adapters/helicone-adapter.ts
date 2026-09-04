/**
 * TealTiger SDK - Helicone Governance Header Adapter
 *
 * Maps a deterministic TealTiger {@link Decision} to Helicone custom-property
 * request headers, so governance metadata (action, risk score, reason codes)
 * flows through the Helicone LLM proxy and becomes visible and filterable in
 * the Helicone dashboard — with no extra integration work.
 *
 * Helicone promotes any request header named `Helicone-Property-<Name>` to a
 * first-class custom property. Plain `X-*` headers are NOT surfaced as
 * properties, so this adapter uses the `Helicone-Property-` prefix by default.
 * See https://docs.helicone.ai/observability/custom-properties.
 *
 * This adapter performs no enforcement. It is a one-way, side-effect-free
 * projection of an already-made decision into headers, safe to call on every
 * request.
 *
 * @module adapters/helicone-adapter
 */

import type { Decision } from '../core/engine/types';

/**
 * Default prefix for governance custom properties.
 *
 * Produces headers like `Helicone-Property-TealTiger-Action`. The
 * `Helicone-Property-` segment is what Helicone recognises; `TealTiger`
 * namespaces our properties so they group together in the dashboard.
 */
export const HELICONE_PROPERTY_PREFIX = 'Helicone-Property-TealTiger';

/**
 * Options controlling how a decision is projected into Helicone headers.
 */
export interface HeliconeHeaderOptions {
  /**
   * Header prefix applied to every governance property.
   *
   * Defaults to {@link HELICONE_PROPERTY_PREFIX}. Must keep the
   * `Helicone-Property-` segment for Helicone to treat the values as custom
   * properties; override only the trailing namespace if needed.
   */
  prefix?: string;

  /**
   * Include the correlation ID as a property. Default: `true`. Useful as a
   * join key from a Helicone log entry back to a TealTiger audit record.
   */
  includeCorrelationId?: boolean;

  /**
   * Include the OpenTelemetry trace ID when present on the decision.
   * Default: `true`.
   */
  includeTraceId?: boolean;

  /**
   * Include the policy id/version as properties. Default: `false` (keeps the
   * header set minimal; enable for compliance dashboards that segment by
   * policy).
   */
  includePolicy?: boolean;
}

/**
 * Convert a TealTiger {@link Decision} into Helicone custom-property headers.
 *
 * The returned object is a plain `Record<string, string>` suitable for
 * spreading into any HTTP header bag — an OpenAI client's `defaultHeaders`, a
 * `fetch` call's `headers`, or an Axios `headers` config.
 *
 * Always emitted:
 * - `<prefix>-Action` — the {@link Decision.action} (e.g. `ALLOW`, `DENY`).
 * - `<prefix>-Risk-Score` — the risk score `0`–`100` as a string.
 * - `<prefix>-Reason-Codes` — reason codes joined with `,` (empty string when none).
 *
 * Optionally emitted (see {@link HeliconeHeaderOptions}):
 * - `<prefix>-Correlation-Id`
 * - `<prefix>-Trace-Id` (only when the decision carries a `trace_id`)
 * - `<prefix>-Policy-Id`, `<prefix>-Policy-Version`
 *
 * Header values are sanitized to a single line (CR/LF stripped) to avoid
 * header injection from any free-form field.
 *
 * @param decision - A decision produced by a TealTiger policy-enforcing component.
 * @param options - Optional projection controls.
 * @returns Header name/value pairs ready to merge into an outbound request.
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { toHeliconeHeaders } from 'tealtiger';
 *
 * const decision = engine.evaluate({ agentId: 'agent-1', action: 'tool.execute', tool: 'search' });
 *
 * const client = new OpenAI({
 *   baseURL: 'https://oai.helicone.ai/v1',
 *   defaultHeaders: {
 *     'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
 *     ...toHeliconeHeaders(decision),
 *   },
 * });
 * ```
 */
export function toHeliconeHeaders(
  decision: Decision,
  options: HeliconeHeaderOptions = {},
): Record<string, string> {
  const prefix = options.prefix ?? HELICONE_PROPERTY_PREFIX;
  const includeCorrelationId = options.includeCorrelationId ?? true;
  const includeTraceId = options.includeTraceId ?? true;
  const includePolicy = options.includePolicy ?? false;

  const headers: Record<string, string> = {
    [`${prefix}-Action`]: sanitizeHeaderValue(decision.action),
    [`${prefix}-Risk-Score`]: String(decision.risk_score),
    [`${prefix}-Reason-Codes`]: sanitizeHeaderValue(
      (decision.reason_codes ?? []).join(','),
    ),
  };

  if (includeCorrelationId && decision.correlation_id) {
    headers[`${prefix}-Correlation-Id`] = sanitizeHeaderValue(decision.correlation_id);
  }

  if (includeTraceId && decision.trace_id) {
    headers[`${prefix}-Trace-Id`] = sanitizeHeaderValue(decision.trace_id);
  }

  if (includePolicy) {
    if (decision.policy_id) {
      headers[`${prefix}-Policy-Id`] = sanitizeHeaderValue(decision.policy_id);
    }
    if (decision.policy_version) {
      headers[`${prefix}-Policy-Version`] = sanitizeHeaderValue(decision.policy_version);
    }
  }

  return headers;
}

/**
 * Merge governance headers into an existing header bag without mutating it.
 *
 * Convenience wrapper for the common case of adding governance properties to
 * headers you already have (auth, content-type, other Helicone directives).
 * Governance headers take precedence on key collisions.
 *
 * @param existing - Existing headers (e.g. auth, `Helicone-Auth`).
 * @param decision - The decision to project.
 * @param options - Optional projection controls.
 * @returns A new merged header object.
 */
export function withHeliconeHeaders(
  existing: Record<string, string>,
  decision: Decision,
  options: HeliconeHeaderOptions = {},
): Record<string, string> {
  return { ...existing, ...toHeliconeHeaders(decision, options) };
}

/**
 * Strip CR/LF and trim a value so it is safe to use as a single-line HTTP
 * header. Prevents header injection from free-form decision fields.
 */
function sanitizeHeaderValue(value: string): string {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}
