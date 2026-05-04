/**
 * BundleExporter Tests
 *
 * Validates the Control Plane UI preview — pull-based artifact export.
 */

import { BundleExporter } from '../BundleExporter';
import { TealEngineV12 } from '../../core/engine/v1.2/TealEngineV12';

describe('BundleExporter', () => {
  let engine: TealEngineV12;
  let exporter: BundleExporter;

  beforeEach(() => {
    engine = new TealEngineV12({ policy: {} });
    exporter = new BundleExporter(engine);
  });

  it('exportPolicyBundle returns valid JSON', () => {
    const json = exporter.exportPolicyBundle();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe('1.2.0');
    expect(Array.isArray(parsed.modules)).toBe(true);
    expect(parsed.exported_at).toBeDefined();
  });

  it('exportRegistrySnapshot returns valid JSON with entries', () => {
    const json = exporter.exportRegistrySnapshot();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe('1.2.0');
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.exported_at).toBeDefined();
  });

  it('exportTEECRegistries returns reason codes, event types, actions', () => {
    const json = exporter.exportTEECRegistries();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe('0.1.0');
    expect(parsed.reason_codes.length).toBeGreaterThanOrEqual(32);
    expect(parsed.event_types.length).toBe(18);
    expect(parsed.decision_actions.length).toBeGreaterThanOrEqual(11);
    expect(parsed.exported_at).toBeDefined();
  });

  it('exportManifest returns bundle manifest with versions and counts', () => {
    const json = exporter.exportManifest();
    const parsed = JSON.parse(json);

    expect(parsed.bundle_version).toBe('1.2.0');
    expect(parsed.teec_version).toBe('0.1.0');
    expect(Array.isArray(parsed.modules)).toBe(true);
    expect(parsed.controls.implemented).toBe(38);
    expect(parsed.controls.planned).toBeGreaterThan(0);
    expect(parsed.teec_coverage.reason_codes).toBeGreaterThanOrEqual(32);
    expect(parsed.teec_coverage.event_types).toBe(18);
    expect(parsed.exported_at).toBeDefined();
  });

  it('all exports produce parseable JSON strings', () => {
    const methods = [
      'exportPolicyBundle',
      'exportRegistrySnapshot',
      'exportTEECRegistries',
      'exportManifest',
    ] as const;

    for (const method of methods) {
      const result = exporter[method]();
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result)).not.toThrow();
    }
  });
});
