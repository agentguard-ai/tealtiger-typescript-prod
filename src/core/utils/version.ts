/**
 * Version tracking utility for TealTiger components
 * 
 * Extracts component versions from package.json for inclusion in Decision objects
 * and audit events.
 * 
 * @module version
 */

/**
 * Single source of truth for the SDK version.
 *
 * This is a build-time constant rather than a runtime `package.json` read.
 * The previous implementation walked the filesystem from `__dirname`, which
 * is unreliable in a bundled build (the whole SDK is a single file) and does
 * not exist at all under ES modules — importing the ESM build threw
 * `ReferenceError: __dirname is not defined`. Keep this in sync with the
 * `version` field in package.json (the release process updates both).
 */
export const PACKAGE_VERSION = '1.5.0';

/**
 * Component version information
 */
export interface ComponentVersionInfo {
  /** SDK version */
  sdk: string;
  /** Engine version */
  engine: string;
  /** Guard version (optional) */
  guard?: string;
  /** Circuit version (optional) */
  circuit?: string;
  /** Monitor version (optional) */
  monitor?: string;
}

/**
 * Cached version information to avoid repeated file reads
 */
let cachedVersion: string | null = null;

/**
 * Extract version from package.json
 * 
 * This function reads the package.json file and extracts the version field.
 * The version is cached after the first read to improve performance.
 * 
 * @returns The version string from package.json
 * 
 * @example
 * ```typescript
 * const version = getPackageVersion();
 * console.log(version); // "1.1.0"
 * ```
 */
export function getPackageVersion(): string {
  // Return cached version if available
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  // Build-time constant — no filesystem access, so this works identically in
  // CommonJS and ESM bundles and never depends on `__dirname` / cwd.
  cachedVersion = PACKAGE_VERSION;
  return cachedVersion;
}

/**
 * Get component versions for TealEngine
 * 
 * Returns version information for all TealTiger components involved in
 * policy evaluation. All components use the same SDK version.
 * 
 * @returns Component version information
 * 
 * @example
 * ```typescript
 * const versions = getComponentVersions();
 * console.log(versions);
 * // {
 * //   sdk: "1.1.0",
 * //   engine: "1.1.0"
 * // }
 * ```
 */
export function getComponentVersions(): ComponentVersionInfo {
  const version = getPackageVersion();
  
  return {
    sdk: version,
    engine: version,
  };
}

/**
 * Get component versions with guard included
 * 
 * @returns Component version information including guard
 */
export function getComponentVersionsWithGuard(): ComponentVersionInfo {
  const version = getPackageVersion();
  
  return {
    sdk: version,
    engine: version,
    guard: version,
  };
}

/**
 * Get component versions with circuit included
 * 
 * @returns Component version information including circuit
 */
export function getComponentVersionsWithCircuit(): ComponentVersionInfo {
  const version = getPackageVersion();
  
  return {
    sdk: version,
    engine: version,
    circuit: version,
  };
}

/**
 * Get component versions with monitor included
 * 
 * @returns Component version information including monitor
 */
export function getComponentVersionsWithMonitor(): ComponentVersionInfo {
  const version = getPackageVersion();
  
  return {
    sdk: version,
    engine: version,
    monitor: version,
  };
}

/**
 * Get all component versions
 * 
 * Returns version information for all TealTiger components.
 * 
 * @returns Complete component version information
 */
export function getAllComponentVersions(): Required<ComponentVersionInfo> {
  const version = getPackageVersion();
  
  return {
    sdk: version,
    engine: version,
    guard: version,
    circuit: version,
    monitor: version,
  };
}

/**
 * Clear the cached version
 * 
 * This is primarily useful for testing purposes to force a re-read
 * of the package.json file.
 * 
 * @internal
 */
export function clearVersionCache(): void {
  cachedVersion = null;
}
