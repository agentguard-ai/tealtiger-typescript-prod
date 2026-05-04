/**
 * BundleExporter — Control Plane UI Preview
 *
 * Exports governance artifacts for pull-based consumption.
 * Satisfies FR-8 (optional, non-enforcing, pull-based) without
 * building a full web UI. TealEngine operates fully without this.
 *
 * @module dashboard/BundleExporter
 */

import type { TealEngineV12 } from '../core/engine/v1.2/TealEngineV12';
import type { TEECRegistry } from '../core/engine/v1.2/types';
import { IMPLEMENTED_CONTROLS, PLANNED_CONTROLS } from './controls';

const BUNDLE_VERSION = '1.2.0';

export class BundleExporter {
  private readonly engine: TealEngineV12;

  constructor(engine: TealEngineV12) {
    this.engine = engine;
  }

  /**
   * Export the current policy as JSON string.
   */
  exportPolicyBundle(): string {
    const moduleStatus = this.engine.getModuleStatus();
    return JSON.stringify(
      {
        version: BUNDLE_VERSION,
        modules: Object.keys(moduleStatus),
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  /**
   * Export a snapshot of registry entries (module status) as JSON.
   */
  exportRegistrySnapshot(): string {
    const status = this.engine.getModuleStatus();
    return JSON.stringify(
      {
        version: BUNDLE_VERSION,
        entries: Object.entries(status).map(([name, info]) => ({
          name,
          version: info.version,
          registered: info.registered,
          initialized: info.initialized,
        })),
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  /**
   * Export TEEC registries (reason codes, event types, actions) as JSON.
   */
  exportTEECRegistries(): string {
    const registry: TEECRegistry = this.engine.getTEECRegistry();
    return JSON.stringify(
      {
        version: registry.version,
        reason_codes: Array.from(registry.reason_codes.values()),
        event_types: Array.from(registry.event_types.values()),
        decision_actions: Array.from(registry.decision_actions.values()),
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  /**
   * Export bundle manifest (versions, modules, controls) as JSON.
   */
  exportManifest(): string {
    const moduleStatus = this.engine.getModuleStatus();
    const registry = this.engine.getTEECRegistry();
    return JSON.stringify(
      {
        bundle_version: BUNDLE_VERSION,
        teec_version: registry.version,
        modules: Object.entries(moduleStatus).map(([name, info]) => ({
          name,
          version: info.version,
          initialized: info.initialized,
        })),
        controls: {
          implemented: IMPLEMENTED_CONTROLS.length,
          planned: PLANNED_CONTROLS.length,
        },
        teec_coverage: {
          reason_codes: registry.reason_codes.size,
          event_types: registry.event_types.size,
          decision_actions: registry.decision_actions.size,
        },
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    );
  }
}
