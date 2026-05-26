/**
 * TealEngine v1.2 — Module Registry
 *
 * Manages module registration and lazy initialization. Modules are
 * registered eagerly but initialized only on first evaluation that
 * references them (via policy fields).
 *
 * @module core/engine/v1.2/ModuleRegistry
 */

import type { TealModule, ModuleStatusMap } from './types';
import { TealConfigError } from './errors';

export class ModuleRegistry {
  private readonly modules: Map<string, TealModule> = new Map();
  private readonly initialized: Map<string, boolean> = new Map();

  /**
   * Register a module. Does NOT call init() — that happens lazily.
   */
  register(module: TealModule): void {
    this.modules.set(module.name, module);
    this.initialized.set(module.name, false);
  }

  /**
   * Retrieve a registered module by name.
   */
  get(name: string): TealModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Check whether a module is registered.
   */
  isRegistered(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Check whether a module has been initialized.
   */
  isInitialized(name: string): boolean {
    return this.initialized.get(name) === true;
  }

  /**
   * Initialize a module (lazy — called on first evaluation that needs it).
   * No-op if already initialized or if the module has no init() method.
   *
   * @throws {TealConfigError} if the module is not registered.
   */
  async initModule(name: string, config: unknown): Promise<void> {
    const mod = this.modules.get(name);
    if (!mod) {
      throw new TealConfigError(
        `Module '${name}' is not registered`,
        'MODULE_NOT_REGISTERED',
        { module: name },
      );
    }

    if (this.initialized.get(name)) {
      return; // already initialized
    }

    if (mod.init) {
      await mod.init(config);
    }
    this.initialized.set(name, true);
  }

  /**
   * Return the registration and initialization status of every module.
   */
  getStatus(): ModuleStatusMap {
    const status: ModuleStatusMap = {};
    for (const [name, mod] of this.modules) {
      status[name] = {
        registered: true,
        initialized: this.initialized.get(name) === true,
        version: mod.version,
      };
    }
    return status;
  }

  /**
   * Parse a policy object to determine which module names it references.
   *
   * Convention: top-level keys in the policy that match a known module
   * dimension keyword map to a module name. This is intentionally simple;
   * modules self-declare their policy namespace via their `name` field.
   */
  getRequiredModules(policy: Record<string, unknown>): string[] {
    if (!policy || typeof policy !== 'object') {
      return [];
    }

    const required: string[] = [];

    // Map well-known policy keys to module names
    const keyToModule: Record<string, string> = {
      secrets: 'tealsecrets',
      memory: 'tealmemory',
      reliability: 'tealreliability',
      registry: 'tealregistry',
      verify: 'tealverify',
      monitor: 'tealmonitor',
      audit: 'tealaudit',
      guard: 'tealguard',
      telemetry: 'tealotel',
    };

    for (const key of Object.keys(policy)) {
      const moduleName = keyToModule[key];
      if (moduleName && policy[key] !== undefined && policy[key] !== null) {
        required.push(moduleName);
      }
    }

    // Also include any module name that appears directly as a key
    for (const key of Object.keys(policy)) {
      if (this.modules.has(key) && !required.includes(key)) {
        required.push(key);
      }
    }

    return required;
  }
}
