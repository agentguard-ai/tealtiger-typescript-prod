/**
 * TealTiger SDK - Helicone Governance Header Adapter Tests
 *
 * Covers the projection of a Decision into Helicone custom-property headers:
 * - Default header names use the Helicone-Property- prefix
 * - Value serialization (risk score, reason-codes join)
 * - Correlation/trace id inclusion and toggles
 * - Custom prefix and policy inclusion options
 * - Header-injection sanitization
 * - Non-mutating merge helper
 */
import {
  toHeliconeHeaders,
  withHeliconeHeaders,
  HELICONE_PROPERTY_PREFIX,
} from '../helicone-adapter';
import { DecisionAction, ReasonCode, PolicyMode } from '../../core/engine/types';
import type { Decision } from '../../core/engine/types';

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    action: DecisionAction.ALLOW,
    reason_codes: [ReasonCode.POLICY_COMPLIANT],
    risk_score: 0,
    mode: PolicyMode.ENFORCE,
    policy_id: 'policy-1',
    policy_version: '1.0.0',
    component_versions: { sdk: '1.4.1', engine: '1.4.1' },
    correlation_id: 'corr-123',
    reason: 'Allowed',
    ...overrides,
  } as Decision;
}

describe('toHeliconeHeaders', () => {
  it('emits action, risk score, and reason codes with the default prefix', () => {
    const headers = toHeliconeHeaders(
      makeDecision({
        action: DecisionAction.DENY,
        risk_score: 90,
        reason_codes: [ReasonCode.PII_DETECTED, ReasonCode.SECRET_DETECTED],
      }),
    );

    expect(headers['Helicone-Property-TealTiger-Action']).toBe('DENY');
    expect(headers['Helicone-Property-TealTiger-Risk-Score']).toBe('90');
    expect(headers['Helicone-Property-TealTiger-Reason-Codes']).toBe(
      'PII_DETECTED,SECRET_DETECTED',
    );
  });

  it('uses the exported default prefix constant', () => {
    const headers = toHeliconeHeaders(makeDecision());
    expect(Object.keys(headers).every((k) => k.startsWith(HELICONE_PROPERTY_PREFIX))).toBe(true);
  });

  it('serializes a zero risk score as "0" (not omitted)', () => {
    const headers = toHeliconeHeaders(makeDecision({ risk_score: 0 }));
    expect(headers['Helicone-Property-TealTiger-Risk-Score']).toBe('0');
  });

  it('emits an empty string for no reason codes', () => {
    const headers = toHeliconeHeaders(makeDecision({ reason_codes: [] }));
    expect(headers['Helicone-Property-TealTiger-Reason-Codes']).toBe('');
  });

  it('includes correlation id by default and omits it when disabled', () => {
    const withId = toHeliconeHeaders(makeDecision({ correlation_id: 'corr-xyz' }));
    expect(withId['Helicone-Property-TealTiger-Correlation-Id']).toBe('corr-xyz');

    const withoutId = toHeliconeHeaders(makeDecision(), { includeCorrelationId: false });
    expect(withoutId).not.toHaveProperty('Helicone-Property-TealTiger-Correlation-Id');
  });

  it('includes trace id only when present on the decision', () => {
    const withTrace = toHeliconeHeaders(makeDecision({ trace_id: 'trace-abc' }));
    expect(withTrace['Helicone-Property-TealTiger-Trace-Id']).toBe('trace-abc');

    const withoutTrace = toHeliconeHeaders(makeDecision());
    expect(withoutTrace).not.toHaveProperty('Helicone-Property-TealTiger-Trace-Id');
  });

  it('omits trace id when includeTraceId is false even if present', () => {
    const headers = toHeliconeHeaders(makeDecision({ trace_id: 'trace-abc' }), {
      includeTraceId: false,
    });
    expect(headers).not.toHaveProperty('Helicone-Property-TealTiger-Trace-Id');
  });

  it('includes policy id and version only when includePolicy is set', () => {
    const off = toHeliconeHeaders(makeDecision());
    expect(off).not.toHaveProperty('Helicone-Property-TealTiger-Policy-Id');

    const on = toHeliconeHeaders(
      makeDecision({ policy_id: 'p-9', policy_version: '2.1.0' }),
      { includePolicy: true },
    );
    expect(on['Helicone-Property-TealTiger-Policy-Id']).toBe('p-9');
    expect(on['Helicone-Property-TealTiger-Policy-Version']).toBe('2.1.0');
  });

  it('honors a custom prefix', () => {
    const headers = toHeliconeHeaders(makeDecision(), {
      prefix: 'Helicone-Property-Gov',
    });
    expect(headers['Helicone-Property-Gov-Action']).toBe('ALLOW');
    expect(headers).not.toHaveProperty('Helicone-Property-TealTiger-Action');
  });

  it('sanitizes CR/LF from values to prevent header injection', () => {
    const headers = toHeliconeHeaders(
      makeDecision({ correlation_id: 'corr\r\nX-Evil: 1' }),
    );
    const value = headers['Helicone-Property-TealTiger-Correlation-Id'];
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toBe('corr X-Evil: 1');
  });
});

describe('withHeliconeHeaders', () => {
  it('merges governance headers into existing headers without mutating input', () => {
    const existing = { 'Helicone-Auth': 'Bearer sk-helicone-test' };
    const merged = withHeliconeHeaders(existing, makeDecision({ action: DecisionAction.DENY }));

    expect(merged['Helicone-Auth']).toBe('Bearer sk-helicone-test');
    expect(merged['Helicone-Property-TealTiger-Action']).toBe('DENY');
    // original object is untouched
    expect(existing).not.toHaveProperty('Helicone-Property-TealTiger-Action');
  });
});
