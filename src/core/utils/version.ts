/**
 * Version tracking utility for TealTiger components
 * 
 * Extracts component versions from package.json for inclusion in Decision objects
 * and audit events.
 * 
 * @module version
 */

import * as fs from 'fs';
import * as path from 'path';

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

  try {
    // Try to find package.json starting from current directory
    let currentDir = __dirname;
    let packageJsonPath: string | null = null;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop

    // Walk up the directory tree to find package.json
    while (attempts < maxAttempts) {
      const candidatePath = path.join(currentDir, 'package.json');
      
      if (fs.existsSync(candidatePath)) {
        packageJsonPath = candidatePath;
        break;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached root directory
        break;
      }

      currentDir = parentDir;
      attempts++;
    }

    if (!packageJsonPath) {
      // Fallback: try common locations
      const fallbackPaths = [
        path.join(process.cwd(), 'package.json'),
        path.join(__dirname, '../../package.json'),
        path.join(__dirname, '../../../package.json'),
      ];

      for (const fallbackPath of fallbackPaths) {
        if (fs.existsSync(fallbackPath)) {
          packageJsonPath = fallbackPath;
          break;
        }
      }
    }

    if (packageJsonPath && fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const version = packageJson.version || '1.1.0';
      cachedVersion = version;
      return version;
    }
  } catch (error) {
    // If reading fails, fall back to hardcoded version
    console.warn('Failed to read package.json version, using fallback:', error);
  }

  // Fallback version if package.json cannot be read
  cachedVersion = '1.1.0';
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
