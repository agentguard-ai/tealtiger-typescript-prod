import { BenchmarkSuite, ValidationResult } from './types';

/**
 * Registry for benchmark suites. Validates suites on registration
 * and supports selective or full execution.
 */
export class SuiteRegistry {
  private suites: Map<string, BenchmarkSuite> = new Map();

  /**
   * Register a benchmark suite. Validates the suite before registration.
   * Throws if validation fails.
   */
  register(suite: BenchmarkSuite): void {
    const validation = this.validate(suite);
    if (!validation.valid) {
      throw new Error(
        `Suite registration failed: ${validation.errors.join('; ')}`
      );
    }

    if (this.suites.has(suite.name)) {
      throw new Error(
        `Suite "${suite.name}" is already registered`
      );
    }

    this.suites.set(suite.name, suite);
  }

  /**
   * Retrieve a registered suite by name.
   */
  get(name: string): BenchmarkSuite | undefined {
    return this.suites.get(name);
  }

  /**
   * Retrieve all registered suites.
   */
  getAll(): BenchmarkSuite[] {
    return Array.from(this.suites.values());
  }

  /**
   * Validate that a suite implements all required interface methods
   * and has non-empty name and datasetVersion properties.
   */
  validate(suite: BenchmarkSuite): ValidationResult {
    const errors: string[] = [];

    if (!suite) {
      return { valid: false, errors: ['Suite is null or undefined'] };
    }

    // Check non-empty name
    if (!suite.name || typeof suite.name !== 'string' || suite.name.trim() === '') {
      errors.push('Suite must have a non-empty "name" property');
    }

    // Check non-empty datasetVersion
    if (!suite.datasetVersion || typeof suite.datasetVersion !== 'string' || suite.datasetVersion.trim() === '') {
      errors.push('Suite must have a non-empty "datasetVersion" property');
    }

    // Check required methods
    if (typeof suite.loadDataset !== 'function') {
      errors.push('Suite must implement "loadDataset" method');
    }

    if (typeof suite.execute !== 'function') {
      errors.push('Suite must implement "execute" method');
    }

    if (typeof suite.formatResults !== 'function') {
      errors.push('Suite must implement "formatResults" method');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
