/**
 * Property-Based Testing Generators for TealEngine
 * 
 * This module provides fast-check arbitraries (generators) for creating
 * random test data for property-based testing of TealEngine components.
 */

import * as fc from 'fast-check';
import {
  TealPolicy,
  ToolPolicy,
  IdentityPolicy,
  CodeExecutionPolicy,
  BehavioralPolicy,
  RequestContext,
  PolicyEvaluationResult,
} from '../types';

// ============================================================================
// Basic Primitives
// ============================================================================

/**
 * Generate valid tool names
 */
export const arbToolName = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('database_query'),
    fc.constant('file_read'),
    fc.constant('file_write'),
    fc.constant('api_call'),
    fc.constant('code_execution'),
    fc.constant('web_search'),
    fc.constant('email_send'),
    fc.constant('slack_message')
  );

/**
 * Generate valid agent IDs
 */
export const arbAgentId = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('agent-001'),
    fc.constant('support-bot'),
    fc.constant('admin-agent'),
    fc.constant('analyst-001'),
    fc.constant('service-account')
  );

/**
 * Generate valid roles
 */
export const arbRole = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('admin'),
    fc.constant('user'),
    fc.constant('customer-support'),
    fc.constant('analyst'),
    fc.constant('developer')
  );

/**
 * Generate valid action names
 */
export const arbAction = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('chat.create'),
    fc.constant('tool.execute'),
    fc.constant('code.execute'),
    fc.constant('completion.create')
  );

/**
 * Generate valid programming languages
 */
export const arbLanguage = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('javascript'),
    fc.constant('typescript'),
    fc.constant('python'),
    fc.constant('java'),
    fc.constant('go'),
    fc.constant('rust')
  );

/**
 * Generate valid size strings (e.g., "10MB", "1GB")
 */
export const arbSizeString = (): fc.Arbitrary<string> =>
  fc.tuple(fc.integer({ min: 1, max: 1000 }), fc.oneof(fc.constant('KB'), fc.constant('MB'), fc.constant('GB')))
    .map(([num, unit]) => `${num}${unit}`);

/**
 * Generate valid time window strings (e.g., "1h", "24h")
 */
export const arbTimeWindow = (): fc.Arbitrary<string> =>
  fc.tuple(fc.integer({ min: 1, max: 168 }), fc.oneof(fc.constant('h'), fc.constant('m'), fc.constant('d')))
    .map(([num, unit]) => `${num}${unit}`);

/**
 * Generate valid permissions
 */
export const arbPermission = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('read:customer_data'),
    fc.constant('write:tickets'),
    fc.constant('delete:records'),
    fc.constant('execute:code'),
    fc.constant('admin:all')
  );

// ============================================================================
// Policy Components
// ============================================================================

/**
 * Generate ToolPolicy (dictionary-based)
 */
export const arbToolPolicy = (): fc.Arbitrary<ToolPolicy> =>
  fc.dictionary(
    arbToolName(),
    fc.record({
      allowed: fc.boolean(),
      maxSize: fc.option(arbSizeString()),
      rateLimit: fc.option(
        fc.record({
          max: fc.integer({ min: 1, max: 1000 }),
          window: arbTimeWindow(),
        })
      ),
      allowedTables: fc.option(fc.array(fc.string(), { minLength: 1, maxLength: 5 })),
      maxRows: fc.option(fc.integer({ min: 1, max: 10000 })),
      parameters: fc.option(fc.dictionary(fc.string(), fc.anything())),
    })
  ) as fc.Arbitrary<ToolPolicy>;

/**
 * Generate IdentityPolicy
 */
export const arbIdentityPolicy = (): fc.Arbitrary<IdentityPolicy> =>
  fc.record({
    agentId: arbAgentId(),
    role: arbRole(),
    permissions: fc.array(arbPermission(), { minLength: 1, maxLength: 5 }),
    forbidden: fc.option(fc.array(fc.string(), { minLength: 0, maxLength: 5 })),
    costLimit: fc.option(
      fc.record({
        daily: fc.option(fc.double({ min: 1, max: 1000, noNaN: true })),
        hourly: fc.option(fc.double({ min: 0.1, max: 100, noNaN: true })),
        monthly: fc.option(fc.double({ min: 10, max: 10000, noNaN: true })),
      })
    ),
  }) as fc.Arbitrary<IdentityPolicy>;

/**
 * Generate CodeExecutionPolicy
 */
export const arbCodeExecutionPolicy = (): fc.Arbitrary<CodeExecutionPolicy> =>
  fc.record({
    allowedLanguages: fc.array(arbLanguage(), { minLength: 1, maxLength: 4 }),
    blockedFunctions: fc.array(fc.string(), { minLength: 0, maxLength: 10 }),
    blockedPatterns: fc.array(fc.constant(/eval|exec|system/), { minLength: 0, maxLength: 5 }),
    maxLength: fc.integer({ min: 100, max: 100000 }),
    timeout: fc.integer({ min: 1000, max: 60000 }),
    requireSandbox: fc.boolean(),
  });

/**
 * Generate BehavioralPolicy
 */
export const arbBehavioralPolicy = (): fc.Arbitrary<BehavioralPolicy> =>
  fc.record({
    costLimit: fc.record({
      daily: fc.option(fc.double({ min: 1, max: 1000, noNaN: true })),
      hourly: fc.option(fc.double({ min: 0.1, max: 100, noNaN: true })),
      monthly: fc.option(fc.double({ min: 10, max: 10000, noNaN: true })),
    }),
    rateLimit: fc.record({
      requests: fc.integer({ min: 1, max: 1000 }),
      window: arbTimeWindow(),
    }),
    anomalyThreshold: fc.option(fc.double({ min: 1.5, max: 5.0, noNaN: true })),
  }) as fc.Arbitrary<BehavioralPolicy>;

/**
 * Generate complete TealPolicy
 */
export const arbTealPolicy = (): fc.Arbitrary<TealPolicy> =>
  fc.record({
    tools: fc.option(arbToolPolicy()),
    identity: fc.option(arbIdentityPolicy()),
    codeExecution: fc.option(arbCodeExecutionPolicy()),
    behavioral: fc.option(arbBehavioralPolicy()),
  }) as fc.Arbitrary<TealPolicy>;

/**
 * Generate TealPolicy with at least one policy section defined
 */
export const arbValidTealPolicy = (): fc.Arbitrary<TealPolicy> =>
  arbTealPolicy().filter(
    (policy) =>
      policy.tools !== undefined ||
      policy.identity !== undefined ||
      policy.codeExecution !== undefined ||
      policy.behavioral !== undefined
  );

// ============================================================================
// Request Context
// ============================================================================

/**
 * Generate RequestContext
 */
export const arbRequestContext = (): fc.Arbitrary<RequestContext> =>
  fc.record({
    agentId: arbAgentId(),
    action: arbAction(),
    model: fc.option(fc.constant('gpt-4')),
    content: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
    tool: fc.option(arbToolName()),
    toolParams: fc.option(fc.dictionary(fc.string(), fc.anything())),
    code: fc.option(fc.string({ minLength: 10, maxLength: 1000 })),
    cost: fc.option(fc.double({ min: 0.001, max: 10.0, noNaN: true })),
    metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
  }) as fc.Arbitrary<RequestContext>;

/**
 * Generate RequestContext that matches a specific tool
 */
export const arbRequestContextForTool = (tool: string): fc.Arbitrary<RequestContext> =>
  fc.record({
    agentId: arbAgentId(),
    action: fc.constant('tool.execute'),
    tool: fc.constant(tool),
    toolParams: fc.option(fc.dictionary(fc.string(), fc.anything())),
    metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
  }) as fc.Arbitrary<RequestContext>;

/**
 * Generate RequestContext for code execution
 */
export const arbRequestContextForCode = (): fc.Arbitrary<RequestContext> =>
  fc.record({
    agentId: arbAgentId(),
    action: fc.constant('code.execute'),
    code: fc.string({ minLength: 10, maxLength: 1000 }),
    metadata: fc.option(
      fc.record({
        language: arbLanguage(),
      })
    ),
  }) as fc.Arbitrary<RequestContext>;

// ============================================================================
// Policy Evaluation Results
// ============================================================================

/**
 * Generate PolicyEvaluationResult
 */
export const arbPolicyEvaluationResult = (): fc.Arbitrary<PolicyEvaluationResult> =>
  fc.record({
    allowed: fc.boolean(),
    reason: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
    triggeredPolicies: fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
    metadata: fc.record({
      evaluationTime: fc.integer({ min: 0, max: 100 }),
      cacheHit: fc.boolean(),
      engine: fc.constant('TealEngine'),
    }),
  }) as fc.Arbitrary<PolicyEvaluationResult>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a pair of TealPolicy and RequestContext that should be allowed
 */
export const arbAllowedPolicyAndContext = (): fc.Arbitrary<[TealPolicy, RequestContext]> =>
  arbToolName().chain((tool) => {
    const policy: TealPolicy = {
      tools: {
        [tool]: { allowed: true },
      },
    };
    const context = arbRequestContextForTool(tool);
    return fc.tuple(fc.constant(policy), context);
  });

/**
 * Generate a pair of TealPolicy and RequestContext that should be blocked
 */
export const arbBlockedPolicyAndContext = (): fc.Arbitrary<[TealPolicy, RequestContext]> =>
  fc.tuple(arbToolName(), arbToolName()).chain(([allowedTool, blockedTool]) => {
    const policy: TealPolicy = {
      tools: {
        [allowedTool]: { allowed: true },
        [blockedTool]: { allowed: false },
      },
    };
    const context = arbRequestContextForTool(blockedTool);
    return fc.tuple(fc.constant(policy), context);
  });

/**
 * Generate empty/minimal policy (for boundary testing)
 */
export const arbEmptyPolicy = (): fc.Arbitrary<TealPolicy> =>
  fc.constant({});

/**
 * Generate policy with all sections defined (for comprehensive testing)
 */
export const arbComprehensivePolicy = (): fc.Arbitrary<TealPolicy> =>
  fc.record({
    tools: arbToolPolicy(),
    identity: arbIdentityPolicy(),
    codeExecution: arbCodeExecutionPolicy(),
    behavioral: arbBehavioralPolicy(),
  });
