/**
 * TealTiger SDK v1.1.x - Enterprise Adoption Features
 * P0.5: Policy Test Harness - Type Definitions
 * 
 * Type definitions for policy testing framework
 * 
 * @module core/testing/types
 * @version 1.1.0
 */

import type { 
  DecisionAction, 
  ReasonCode, 
  PolicyMode, 
  TealPolicy,
  ModeConfig,
  RequestContext,
  Decision
} from '../engine/types';

/**
 * Policy test case
 * Defines a single test with input context and expected decision
 * 
 * @interface PolicyTestCase
 */
export interface PolicyTestCase {
  /** Test case name */
  name: string;
  
  /** Optional test description */
  description?: string;
  
  /** Request context to test */
  context: RequestContext & {
    /** Execution context for tracing */
    context: import('../context/ExecutionContext').ExecutionContext;
  };
  
  /** Expected decision outcome */
  expected: {
    /** Expected action (ALLOW, DENY, etc.) */
    action: DecisionAction;
    
    /** Expected reason codes (optional) */
    reason_codes?: ReasonCode[];
    
    /** Expected risk score range (optional) */
    risk_score_range?: {
      min: number;
      max: number;
    };
    
    /** Expected evaluation mode (optional) */
    mode?: PolicyMode;
  };
  
  /** Tags for filtering and organization */
  tags?: string[];
}

/**
 * Policy test suite
 * Collection of test cases with policy configuration
 * 
 * @interface PolicyTestSuite
 */
export interface PolicyTestSuite {
  /** Suite name */
  name: string;
  
  /** Optional suite description */
  description?: string;
  
  /** Policy configuration to test against */
  policy: TealPolicy;
  
  /** Optional mode configuration */
  mode?: ModeConfig;
  
  /** Array of test cases */
  tests: PolicyTestCase[];
}

/**
 * Policy test result
 * Result of executing a single test case
 * 
 * @interface PolicyTestResult
 */
export interface PolicyTestResult {
  /** Test case name */
  name: string;
  
  /** Whether the test passed */
  passed: boolean;
  
  /** Actual decision from policy evaluation */
  actual: Decision;
  
  /** Expected decision from test case */
  expected: PolicyTestCase['expected'];
  
  /** Failure reason if test failed */
  failure_reason?: string;
  
  /** Execution time in milliseconds */
  execution_time: number;
}

/**
 * Policy test report
 * Aggregated results from running a test suite
 * 
 * @interface PolicyTestReport
 */
export interface PolicyTestReport {
  /** Report timestamp (ISO 8601) */
  timestamp: string;
  
  /** Suite name */
  suite_name: string;
  
  /** Total number of tests */
  total: number;
  
  /** Number of passed tests */
  passed: number;
  
  /** Number of failed tests */
  failed: number;
  
  /** Number of skipped tests */
  skipped: number;
  
  /** Success rate (0-1) */
  success_rate: number;
  
  /** Total execution time in milliseconds */
  total_time: number;
  
  /** Individual test results */
  results: PolicyTestResult[];
  
  /** Optional coverage information */
  coverage?: {
    /** Total number of policies */
    total_policies: number;
    
    /** Number of tested policies */
    tested_policies: number;
    
    /** Coverage percentage (0-100) */
    coverage_percentage: number;
    
    /** List of untested policy IDs */
    untested_policies: string[];
  };
}
