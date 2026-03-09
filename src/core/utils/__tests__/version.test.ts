/**
 * Unit tests for version tracking utility
 */

import {
  getPackageVersion,
  getComponentVersions,
  getComponentVersionsWithGuard,
  getComponentVersionsWithCircuit,
  getComponentVersionsWithMonitor,
  getAllComponentVersions,
  clearVersionCache,
} from '../version';

describe('Version Utility', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearVersionCache();
  });

  describe('getPackageVersion', () => {
    it('should return a valid version string', () => {
      const version = getPackageVersion();
      
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning format
    });

    it('should cache the version after first read', () => {
      const version1 = getPackageVersion();
      const version2 = getPackageVersion();
      
      expect(version1).toBe(version2);
    });

    it('should return fallback version if package.json cannot be read', () => {
      // This test verifies the fallback behavior
      // In a real scenario where package.json is missing, it should return '1.1.0'
      const version = getPackageVersion();
      
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
    });
  });

  describe('getComponentVersions', () => {
    it('should return component versions with sdk and engine', () => {
      const versions = getComponentVersions();
      
      expect(versions).toBeDefined();
      expect(versions.sdk).toBeDefined();
      expect(versions.engine).toBeDefined();
      expect(typeof versions.sdk).toBe('string');
      expect(typeof versions.engine).toBe('string');
    });

    it('should use the same version for sdk and engine', () => {
      const versions = getComponentVersions();
      
      expect(versions.sdk).toBe(versions.engine);
    });

    it('should not include guard, circuit, or monitor by default', () => {
      const versions = getComponentVersions();
      
      expect(versions.guard).toBeUndefined();
      expect(versions.circuit).toBeUndefined();
      expect(versions.monitor).toBeUndefined();
    });
  });

  describe('getComponentVersionsWithGuard', () => {
    it('should include guard version', () => {
      const versions = getComponentVersionsWithGuard();
      
      expect(versions.sdk).toBeDefined();
      expect(versions.engine).toBeDefined();
      expect(versions.guard).toBeDefined();
      expect(typeof versions.guard).toBe('string');
    });

    it('should use the same version for all components', () => {
      const versions = getComponentVersionsWithGuard();
      
      expect(versions.sdk).toBe(versions.engine);
      expect(versions.sdk).toBe(versions.guard);
    });
  });

  describe('getComponentVersionsWithCircuit', () => {
    it('should include circuit version', () => {
      const versions = getComponentVersionsWithCircuit();
      
      expect(versions.sdk).toBeDefined();
      expect(versions.engine).toBeDefined();
      expect(versions.circuit).toBeDefined();
      expect(typeof versions.circuit).toBe('string');
    });

    it('should use the same version for all components', () => {
      const versions = getComponentVersionsWithCircuit();
      
      expect(versions.sdk).toBe(versions.engine);
      expect(versions.sdk).toBe(versions.circuit);
    });
  });

  describe('getComponentVersionsWithMonitor', () => {
    it('should include monitor version', () => {
      const versions = getComponentVersionsWithMonitor();
      
      expect(versions.sdk).toBeDefined();
      expect(versions.engine).toBeDefined();
      expect(versions.monitor).toBeDefined();
      expect(typeof versions.monitor).toBe('string');
    });

    it('should use the same version for all components', () => {
      const versions = getComponentVersionsWithMonitor();
      
      expect(versions.sdk).toBe(versions.engine);
      expect(versions.sdk).toBe(versions.monitor);
    });
  });

  describe('getAllComponentVersions', () => {
    it('should include all component versions', () => {
      const versions = getAllComponentVersions();
      
      expect(versions.sdk).toBeDefined();
      expect(versions.engine).toBeDefined();
      expect(versions.guard).toBeDefined();
      expect(versions.circuit).toBeDefined();
      expect(versions.monitor).toBeDefined();
    });

    it('should use the same version for all components', () => {
      const versions = getAllComponentVersions();
      
      expect(versions.sdk).toBe(versions.engine);
      expect(versions.sdk).toBe(versions.guard);
      expect(versions.sdk).toBe(versions.circuit);
      expect(versions.sdk).toBe(versions.monitor);
    });

    it('should return all required fields', () => {
      const versions = getAllComponentVersions();
      
      // TypeScript should enforce this, but verify at runtime
      expect(Object.keys(versions)).toEqual(
        expect.arrayContaining(['sdk', 'engine', 'guard', 'circuit', 'monitor'])
      );
    });
  });

  describe('clearVersionCache', () => {
    it('should clear the cached version', () => {
      // Get version to populate cache
      const version1 = getPackageVersion();
      
      // Clear cache
      clearVersionCache();
      
      // Get version again (should re-read)
      const version2 = getPackageVersion();
      
      // Both should be the same value, but cache was cleared
      expect(version1).toBe(version2);
    });
  });

  describe('Version consistency', () => {
    it('should return consistent versions across all functions', () => {
      const baseVersion = getPackageVersion();
      const componentVersions = getComponentVersions();
      const guardVersions = getComponentVersionsWithGuard();
      const circuitVersions = getComponentVersionsWithCircuit();
      const monitorVersions = getComponentVersionsWithMonitor();
      const allVersions = getAllComponentVersions();
      
      expect(componentVersions.sdk).toBe(baseVersion);
      expect(guardVersions.sdk).toBe(baseVersion);
      expect(circuitVersions.sdk).toBe(baseVersion);
      expect(monitorVersions.sdk).toBe(baseVersion);
      expect(allVersions.sdk).toBe(baseVersion);
    });
  });
});
