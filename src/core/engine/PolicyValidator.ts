/**
 * PolicyValidator - Policy Syntax Validation
 * 
 * Validates TealEngine policy configurations and provides detailed error messages.
 * Checks for:
 * - Required fields
 * - Type correctness
 * - Value constraints
 * - Logical consistency
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 * 
 * @module core/engine/PolicyValidator
 */

import {
  TealPolicy,
  ToolPolicy,
  IdentityPolicy,
  CodeExecutionPolicy,
  BehavioralPolicy,
  MemoryPolicy,
  ContentPolicy,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

/**
 * PolicyValidator - Validates policy configurations
 * 
 * Performs comprehensive validation of TealEngine policies including:
 * - Syntax validation
 * - Type checking
 * - Value range validation
 * - Logical consistency checks
 * - Best practice recommendations
 * 
 * @example
 * ```typescript
 * const validator = new PolicyValidator();
 * const result = validator.validate(policy);
 * 
 * if (!result.valid) {
 *   console.error('Policy errors:', result.errors);
 * }
 * 
 * if (result.warnings.length > 0) {
 *   console.warn('Policy warnings:', result.warnings);
 * }
 * ```
 */
export class PolicyValidator {
  /**
   * Validates a complete policy configuration
   * 
   * @param policy - Policy to validate
   * @returns Validation result with errors and warnings
   */
  public validate(policy: TealPolicy): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if policy is empty
    if (!policy || Object.keys(policy).length === 0) {
      warnings.push({
        code: 'EMPTY_POLICY',
        message: 'Policy configuration is empty. No policies will be enforced.',
        path: 'root',
      });
      
      return {
        valid: true, // Empty policy is valid, just not useful
        errors,
        warnings,
      };
    }

    // Validate each policy type
    if (policy.tools) {
      this.validateToolPolicy(policy.tools, errors, warnings);
    }

    if (policy.identity) {
      this.validateIdentityPolicy(policy.identity, errors, warnings);
    }

    if (policy.codeExecution) {
      this.validateCodeExecutionPolicy(policy.codeExecution, errors, warnings);
    }

    if (policy.behavioral) {
      this.validateBehavioralPolicy(policy.behavioral, errors, warnings);
    }

    if (policy.memory) {
      this.validateMemoryPolicy(policy.memory, errors, warnings);
    }

    if (policy.content) {
      this.validateContentPolicy(policy.content, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates tool policy configuration
   * 
   * @private
   */
  private validateToolPolicy(
    toolPolicy: ToolPolicy,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (Object.keys(toolPolicy).length === 0) {
      warnings.push({
        code: 'EMPTY_TOOL_POLICY',
        message: 'Tool policy is empty. No tool restrictions will be enforced.',
        path: 'tools',
      });
      return;
    }

    for (const [toolName, config] of Object.entries(toolPolicy)) {
      const path = `tools.${toolName}`;

      // Check required fields
      if (config.allowed === undefined) {
        errors.push({
          code: 'MISSING_ALLOWED',
          message: `Tool '${toolName}' is missing required 'allowed' field`,
          path,
          suggestion: `Add 'allowed: true' or 'allowed: false' to ${path}`,
        });
      }

      // Validate maxSize format
      if (config.maxSize) {
        if (!this.isValidSizeString(config.maxSize)) {
          errors.push({
            code: 'INVALID_MAX_SIZE',
            message: `Invalid maxSize format: '${config.maxSize}'`,
            path: `${path}.maxSize`,
            suggestion: `Use format like '1MB', '500KB', '10GB'`,
          });
        }
      }

      // Validate maxRows
      if (config.maxRows !== undefined) {
        if (config.maxRows < 0) {
          errors.push({
            code: 'INVALID_MAX_ROWS',
            message: `maxRows must be non-negative, got ${config.maxRows}`,
            path: `${path}.maxRows`,
            suggestion: `Set maxRows to a positive number or remove it`,
          });
        }

        if (config.maxRows === 0) {
          warnings.push({
            code: 'ZERO_MAX_ROWS',
            message: `maxRows is set to 0, which will block all queries`,
            path: `${path}.maxRows`,
          });
        }
      }

      // Validate rateLimit
      if (config.rateLimit) {
        if (config.rateLimit.max <= 0) {
          errors.push({
            code: 'INVALID_RATE_LIMIT',
            message: `Rate limit max must be positive, got ${config.rateLimit.max}`,
            path: `${path}.rateLimit.max`,
            suggestion: `Set max to a positive number`,
          });
        }

        if (!this.isValidTimeWindow(config.rateLimit.window)) {
          errors.push({
            code: 'INVALID_TIME_WINDOW',
            message: `Invalid time window format: '${config.rateLimit.window}'`,
            path: `${path}.rateLimit.window`,
            suggestion: `Use format like '1m', '1h', '1d'`,
          });
        }
      }

      // Validate allowedTables
      if (config.allowedTables) {
        if (config.allowedTables.length === 0) {
          warnings.push({
            code: 'EMPTY_ALLOWED_TABLES',
            message: `allowedTables is empty, which will block all table access`,
            path: `${path}.allowedTables`,
          });
        }
      }
    }
  }

  /**
   * Validates identity policy configuration
   * 
   * @private
   */
  private validateIdentityPolicy(
    identityPolicy: IdentityPolicy,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const path = 'identity';

    // Check required fields
    if (!identityPolicy.agentId) {
      errors.push({
        code: 'MISSING_AGENT_ID',
        message: 'Identity policy is missing required agentId field',
        path: `${path}.agentId`,
        suggestion: `Add 'agentId: "your-agent-id"' to identity policy`,
      });
    }

    if (!identityPolicy.role) {
      errors.push({
        code: 'MISSING_ROLE',
        message: 'Identity policy is missing required role field',
        path: `${path}.role`,
        suggestion: `Add 'role: "your-role"' to identity policy`,
      });
    }

    if (!identityPolicy.permissions || identityPolicy.permissions.length === 0) {
      warnings.push({
        code: 'EMPTY_PERMISSIONS',
        message: 'Identity policy has no permissions defined',
        path: `${path}.permissions`,
      });
    }

    // Validate permission format
    if (identityPolicy.permissions) {
      for (const permission of identityPolicy.permissions) {
        if (!permission.includes(':')) {
          warnings.push({
            code: 'INVALID_PERMISSION_FORMAT',
            message: `Permission '${permission}' should follow format 'action:resource'`,
            path: `${path}.permissions`,
          });
        }
      }
    }

    // Validate cost limits
    if (identityPolicy.costLimit) {
      this.validateCostLimit(identityPolicy.costLimit, `${path}.costLimit`, errors, warnings);
    }

    // Check for conflicting permissions and forbidden actions
    if (identityPolicy.permissions && identityPolicy.forbidden) {
      for (const forbidden of identityPolicy.forbidden) {
        for (const permission of identityPolicy.permissions) {
          if (this.matchesPattern(permission, forbidden)) {
            warnings.push({
              code: 'CONFLICTING_PERMISSION',
              message: `Permission '${permission}' conflicts with forbidden action '${forbidden}'`,
              path: `${path}.permissions`,
            });
          }
        }
      }
    }
  }

  /**
   * Validates code execution policy configuration
   * 
   * @private
   */
  private validateCodeExecutionPolicy(
    codePolicy: CodeExecutionPolicy,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const path = 'codeExecution';

    // Check required fields
    if (!codePolicy.allowedLanguages) {
      errors.push({
        code: 'MISSING_ALLOWED_LANGUAGES',
        message: 'Code execution policy is missing allowedLanguages field',
        path: `${path}.allowedLanguages`,
        suggestion: `Add 'allowedLanguages: ["python", "javascript"]'`,
      });
    }

    if (codePolicy.allowedLanguages && codePolicy.allowedLanguages.length === 0) {
      warnings.push({
        code: 'NO_LANGUAGES_ALLOWED',
        message: 'No programming languages are allowed',
        path: `${path}.allowedLanguages`,
      });
    }

    // Validate maxLength
    if (codePolicy.maxLength !== undefined) {
      if (codePolicy.maxLength < 0) {
        errors.push({
          code: 'INVALID_MAX_LENGTH',
          message: `maxLength must be non-negative, got ${codePolicy.maxLength}`,
          path: `${path}.maxLength`,
          suggestion: `Set maxLength to a positive number`,
        });
      }

      if (codePolicy.maxLength === 0) {
        warnings.push({
          code: 'ZERO_MAX_LENGTH',
          message: 'maxLength is 0, which will block all code execution',
          path: `${path}.maxLength`,
        });
      }

      if (codePolicy.maxLength > 100000) {
        warnings.push({
          code: 'LARGE_MAX_LENGTH',
          message: `maxLength is very large (${codePolicy.maxLength}), consider reducing for security`,
          path: `${path}.maxLength`,
        });
      }
    }

    // Validate timeout
    if (codePolicy.timeout !== undefined) {
      if (codePolicy.timeout < 0) {
        errors.push({
          code: 'INVALID_TIMEOUT',
          message: `timeout must be non-negative, got ${codePolicy.timeout}`,
          path: `${path}.timeout`,
          suggestion: `Set timeout to a positive number in milliseconds`,
        });
      }

      if (codePolicy.timeout === 0) {
        warnings.push({
          code: 'ZERO_TIMEOUT',
          message: 'timeout is 0, which will block all code execution',
          path: `${path}.timeout`,
        });
      }

      if (codePolicy.timeout > 300000) {
        warnings.push({
          code: 'LARGE_TIMEOUT',
          message: `timeout is very large (${codePolicy.timeout}ms = ${codePolicy.timeout / 1000}s), consider reducing`,
          path: `${path}.timeout`,
        });
      }
    }

    // Validate blocked functions
    if (!codePolicy.blockedFunctions || codePolicy.blockedFunctions.length === 0) {
      warnings.push({
        code: 'NO_BLOCKED_FUNCTIONS',
        message: 'No functions are blocked, consider adding dangerous functions like eval, exec',
        path: `${path}.blockedFunctions`,
      });
    }

    // Validate blocked patterns
    if (!codePolicy.blockedPatterns || codePolicy.blockedPatterns.length === 0) {
      warnings.push({
        code: 'NO_BLOCKED_PATTERNS',
        message: 'No code patterns are blocked, consider adding regex patterns for dangerous code',
        path: `${path}.blockedPatterns`,
      });
    }

    // Warn if sandbox is not required
    if (!codePolicy.requireSandbox) {
      warnings.push({
        code: 'SANDBOX_NOT_REQUIRED',
        message: 'Sandbox is not required, which may be unsafe for code execution',
        path: `${path}.requireSandbox`,
      });
    }
  }

  /**
   * Validates behavioral policy configuration
   * 
   * @private
   */
  private validateBehavioralPolicy(
    behavioralPolicy: BehavioralPolicy,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const path = 'behavioral';

    // Validate cost limits
    if (behavioralPolicy.costLimit) {
      this.validateCostLimit(behavioralPolicy.costLimit, `${path}.costLimit`, errors, warnings);
    }

    // Validate rate limit
    if (!behavioralPolicy.rateLimit) {
      warnings.push({
        code: 'MISSING_RATE_LIMIT',
        message: 'Behavioral policy is missing rate limit configuration',
        path: `${path}.rateLimit`,
      });
    } else {
      if (behavioralPolicy.rateLimit.requests <= 0) {
        errors.push({
          code: 'INVALID_RATE_LIMIT_REQUESTS',
          message: `Rate limit requests must be positive, got ${behavioralPolicy.rateLimit.requests}`,
          path: `${path}.rateLimit.requests`,
          suggestion: `Set requests to a positive number`,
        });
      }

      if (!this.isValidTimeWindow(behavioralPolicy.rateLimit.window)) {
        errors.push({
          code: 'INVALID_TIME_WINDOW',
          message: `Invalid time window format: '${behavioralPolicy.rateLimit.window}'`,
          path: `${path}.rateLimit.window`,
          suggestion: `Use format like '1m', '1h', '1d'`,
        });
      }
    }

    // Validate anomaly threshold
    if (behavioralPolicy.anomalyThreshold !== undefined) {
      if (behavioralPolicy.anomalyThreshold <= 1) {
        warnings.push({
          code: 'LOW_ANOMALY_THRESHOLD',
          message: `Anomaly threshold ${behavioralPolicy.anomalyThreshold} is very low, may cause false positives`,
          path: `${path}.anomalyThreshold`,
        });
      }

      if (behavioralPolicy.anomalyThreshold > 10) {
        warnings.push({
          code: 'HIGH_ANOMALY_THRESHOLD',
          message: `Anomaly threshold ${behavioralPolicy.anomalyThreshold} is very high, may miss anomalies`,
          path: `${path}.anomalyThreshold`,
        });
      }
    }
  }

  /**
   * Validates memory policy configuration
   * 
   * @private
   */
  private validateMemoryPolicy(
    memoryPolicy: MemoryPolicy,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const path = 'memory';

    // Validate maxSize
    if (memoryPolicy.maxSize !== undefined) {
      if (memoryPolicy.maxSize < 0) {
        errors.push({
          code: 'INVALID_MAX_SIZE',
          message: `maxSize must be non-negative, got ${memoryPolicy.maxSize}`,
          path: `${path}.maxSize`,
          suggestion: `Set maxSize to a positive number in bytes`,
        });
      }

      if (memoryPolicy.maxSize === 0) {
        warnings.push({
          code: 'ZERO_MAX_SIZE',
          message: 'maxSize is 0, which will block all memory storage',
          path: `${path}.maxSize`,
        });
      }
    }

    // Validate blocked patterns
    if (memoryPolicy.blockedPatterns && memoryPolicy.blockedPatterns.length === 0) {
      warnings.push({
        code: 'EMPTY_BLOCKED_PATTERNS',
        message: 'blockedPatterns is empty',
        path: `${path}.blockedPatterns`,
      });
    }
  }

  /**
   * Validates content policy configuration
   * 
   * @private
   */
  private validateContentPolicy(
    contentPolicy: ContentPolicy,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const path = 'content';

    // Validate PII configuration
    if (contentPolicy.pii) {
      if (contentPolicy.pii.enabled && (!contentPolicy.pii.blockedTypes || contentPolicy.pii.blockedTypes.length === 0)) {
        warnings.push({
          code: 'PII_ENABLED_NO_TYPES',
          message: 'PII detection is enabled but no types are specified',
          path: `${path}.pii.blockedTypes`,
        });
      }
    }

    // Validate moderation configuration
    if (contentPolicy.moderation) {
      if (contentPolicy.moderation.threshold !== undefined) {
        if (contentPolicy.moderation.threshold < 0 || contentPolicy.moderation.threshold > 1) {
          errors.push({
            code: 'INVALID_MODERATION_THRESHOLD',
            message: `Moderation threshold must be between 0 and 1, got ${contentPolicy.moderation.threshold}`,
            path: `${path}.moderation.threshold`,
            suggestion: `Set threshold to a value between 0 and 1`,
          });
        }

        if (contentPolicy.moderation.threshold < 0.3) {
          warnings.push({
            code: 'LOW_MODERATION_THRESHOLD',
            message: `Moderation threshold ${contentPolicy.moderation.threshold} is very low, may cause false positives`,
            path: `${path}.moderation.threshold`,
          });
        }
      }

      if (contentPolicy.moderation.enabled && (!contentPolicy.moderation.categories || contentPolicy.moderation.categories.length === 0)) {
        warnings.push({
          code: 'MODERATION_ENABLED_NO_CATEGORIES',
          message: 'Content moderation is enabled but no categories are specified',
          path: `${path}.moderation.categories`,
        });
      }
    }
  }

  /**
   * Validates cost limit configuration
   * 
   * @private
   */
  private validateCostLimit(
    costLimit: { daily?: number; hourly?: number; monthly?: number },
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (costLimit.daily !== undefined && costLimit.daily < 0) {
      errors.push({
        code: 'INVALID_DAILY_COST_LIMIT',
        message: `Daily cost limit must be non-negative, got ${costLimit.daily}`,
        path: `${path}.daily`,
        suggestion: `Set daily to a positive number or remove it`,
      });
    }

    if (costLimit.hourly !== undefined && costLimit.hourly < 0) {
      errors.push({
        code: 'INVALID_HOURLY_COST_LIMIT',
        message: `Hourly cost limit must be non-negative, got ${costLimit.hourly}`,
        path: `${path}.hourly`,
        suggestion: `Set hourly to a positive number or remove it`,
      });
    }

    if (costLimit.monthly !== undefined && costLimit.monthly < 0) {
      errors.push({
        code: 'INVALID_MONTHLY_COST_LIMIT',
        message: `Monthly cost limit must be non-negative, got ${costLimit.monthly}`,
        path: `${path}.monthly`,
        suggestion: `Set monthly to a positive number or remove it`,
      });
    }

    // Check logical consistency
    if (costLimit.hourly !== undefined && costLimit.daily !== undefined) {
      if (costLimit.hourly * 24 < costLimit.daily) {
        warnings.push({
          code: 'INCONSISTENT_COST_LIMITS',
          message: `Hourly limit (${costLimit.hourly}) * 24 = ${costLimit.hourly * 24} is less than daily limit (${costLimit.daily})`,
          path,
        });
      }
    }

    if (costLimit.daily !== undefined && costLimit.monthly !== undefined) {
      if (costLimit.daily * 30 < costLimit.monthly) {
        warnings.push({
          code: 'INCONSISTENT_COST_LIMITS',
          message: `Daily limit (${costLimit.daily}) * 30 = ${costLimit.daily * 30} is less than monthly limit (${costLimit.monthly})`,
          path,
        });
      }
    }
  }

  /**
   * Checks if a size string is valid (e.g., "1MB", "500KB")
   * 
   * @private
   */
  private isValidSizeString(size: string): boolean {
    return /^\d+(\.\d+)?\s*(B|KB|MB|GB)$/i.test(size);
  }

  /**
   * Checks if a time window string is valid (e.g., "1m", "1h", "1d")
   * 
   * @private
   */
  private isValidTimeWindow(window: string): boolean {
    return /^\d+[smhd]$/i.test(window);
  }

  /**
   * Checks if a string matches a pattern (supports wildcards)
   * 
   * @private
   */
  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(value);
    }

    return value === pattern;
  }
}
