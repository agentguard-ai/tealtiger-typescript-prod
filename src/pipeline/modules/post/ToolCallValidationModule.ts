/**
 * Multi-Stage Defense Pipeline — Tool Call Validation Module
 *
 * Verifies tool calls in the LLM response conform to expected schemas and
 * parameter constraints. Returns DENY with `remediation: "resample"` metadata
 * and reason code TOOL_CALL_INVALID when a tool call is malformed or violates
 * configured constraints.
 *
 * Supports multiple response formats:
 * - `request._response.tool_calls` — direct tool_calls array
 * - `request._response.choices[].message.tool_calls` — OpenAI-style chat completion
 *
 * @module pipeline/modules/post/ToolCallValidationModule
 * @requirements 7.4, 7.6, 7.7
 */

import type {
  TealModule,
  ModuleResult,
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../../core/engine/v1.2/types';
import { DecisionAction } from '../../../core/engine/types';

// ── Configuration ────────────────────────────────────────────────

/**
 * Schema definition for a single tool's expected parameters.
 */
export interface ToolCallSchema {
  /** Required parameter names that must be present in the tool call arguments. */
  requiredParams?: string[];
  /** Parameter name → expected typeof string (e.g., { query: 'string', limit: 'number' }). */
  paramTypes?: Record<string, string>;
  /** Optional list of allowed parameter names. Extra params are rejected when set. */
  allowedParams?: string[];
}

/**
 * Additional constraint that can be applied across all tool calls.
 */
export interface ToolConstraint {
  /** Maximum length (in characters) for any single argument value (stringified). */
  maxArgumentLength?: number;
  /** Maximum total number of tool calls in a single response. */
  maxToolCalls?: number;
  /** Disallowed function names. */
  disallowedTools?: string[];
}

/**
 * Configuration object for ToolCallValidationModule.
 */
export interface ToolCallValidationConfig {
  /** Tool name → expected parameter schema mapping. */
  schemas?: Record<string, ToolCallSchema>;
  /** Additional constraints applied to all tool calls. */
  constraints?: ToolConstraint[];
  /** If true, tool calls without a matching schema are rejected. Default: false. */
  requireSchema?: boolean;
}

// ── Internal Types ───────────────────────────────────────────────

interface ParsedToolCall {
  id: string | undefined;
  name: string;
  arguments: Record<string, unknown>;
}

interface ValidationFailure {
  toolName: string;
  toolCallId: string | undefined;
  reason: string;
}

// ── Module Implementation ────────────────────────────────────────

/**
 * Verifies tool calls in the LLM response conform to the expected schema
 * and parameter constraints. Returns DENY with `remediation: "resample"`
 * when a tool call is malformed or violates configured constraints.
 *
 * When no tool calls are present in the response, the module returns ALLOW.
 */
export class ToolCallValidationModule implements TealModule {
  readonly name = 'ToolCallValidationModule';
  readonly version = '1.0.0';

  private readonly schemas: Record<string, ToolCallSchema>;
  private readonly constraints: ToolConstraint[];
  private readonly requireSchema: boolean;

  constructor(config: ToolCallValidationConfig = {}) {
    this.schemas = config.schemas ?? {};
    this.constraints = config.constraints ?? [];
    this.requireSchema = config.requireSchema ?? false;
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    const toolCalls = this.extractToolCalls(request);

    // No tool calls present — allow
    if (toolCalls.length === 0) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'pipeline.tool_call_validation',
        metadata: {
          module: this.name,
        },
      };
    }

    const failures: ValidationFailure[] = [];

    // Check global constraints: max tool calls
    for (const constraint of this.constraints) {
      if (
        constraint.maxToolCalls !== undefined &&
        toolCalls.length > constraint.maxToolCalls
      ) {
        failures.push({
          toolName: '*',
          toolCallId: undefined,
          reason: `Too many tool calls: ${toolCalls.length} > max ${constraint.maxToolCalls}`,
        });
      }
    }

    // Validate each tool call
    for (const toolCall of toolCalls) {
      // Check disallowed tools
      for (const constraint of this.constraints) {
        if (
          constraint.disallowedTools &&
          constraint.disallowedTools.includes(toolCall.name)
        ) {
          failures.push({
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            reason: `Tool '${toolCall.name}' is disallowed`,
          });
        }
      }

      // Check schema requirement
      const schema = this.schemas[toolCall.name];
      if (!schema && this.requireSchema) {
        failures.push({
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          reason: `No schema defined for tool '${toolCall.name}'`,
        });
        continue;
      }

      // Validate against schema if one exists
      if (schema) {
        this.validateAgainstSchema(toolCall, schema, failures);
      }

      // Check argument length constraints
      this.validateConstraints(toolCall, failures);
    }

    if (failures.length > 0) {
      return {
        action: DecisionAction.DENY,
        reason_codes: ['TOOL_CALL_INVALID'],
        event_type: 'pipeline.tool_call_validation',
        metadata: {
          module: this.name,
          remediation: 'resample',
          failures,
          failure_count: failures.length,
          tool_call_count: toolCalls.length,
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.tool_call_validation',
      metadata: {
        module: this.name,
        tool_call_count: toolCalls.length,
        validated_tools: toolCalls.map((tc) => tc.name),
      },
    };
  }

  /**
   * Extract tool calls from the response, checking multiple formats.
   *
   * Supported locations:
   * 1. `request._response.tool_calls` — direct array
   * 2. `request._response.choices[].message.tool_calls` — OpenAI chat completion format
   */
  private extractToolCalls(request: ModuleEvaluationRequest): ParsedToolCall[] {
    const response = request['_response'] as Record<string, unknown> | undefined;
    if (!response || typeof response !== 'object') {
      return [];
    }

    const toolCalls: ParsedToolCall[] = [];

    // Check direct tool_calls array
    const directToolCalls = response['tool_calls'];
    if (Array.isArray(directToolCalls)) {
      for (const tc of directToolCalls) {
        const parsed = this.parseToolCall(tc);
        if (parsed) {
          toolCalls.push(parsed);
        }
      }
      return toolCalls;
    }

    // Check OpenAI-style choices[].message.tool_calls
    const choices = response['choices'];
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        if (choice && typeof choice === 'object') {
          const message = (choice as Record<string, unknown>)['message'];
          if (message && typeof message === 'object') {
            const msgToolCalls = (message as Record<string, unknown>)['tool_calls'];
            if (Array.isArray(msgToolCalls)) {
              for (const tc of msgToolCalls) {
                const parsed = this.parseToolCall(tc);
                if (parsed) {
                  toolCalls.push(parsed);
                }
              }
            }
          }
        }
      }
    }

    return toolCalls;
  }

  /**
   * Parse a single tool call object into a normalized format.
   * Supports both OpenAI-style ({ function: { name, arguments } }) and
   * flat format ({ name, arguments }).
   */
  private parseToolCall(tc: unknown): ParsedToolCall | null {
    if (!tc || typeof tc !== 'object') {
      return null;
    }

    const obj = tc as Record<string, unknown>;
    const id = typeof obj['id'] === 'string' ? obj['id'] : undefined;

    // OpenAI-style: { id, type, function: { name, arguments } }
    if (obj['function'] && typeof obj['function'] === 'object') {
      const fn = obj['function'] as Record<string, unknown>;
      const name = fn['name'];
      if (typeof name !== 'string' || name.length === 0) {
        return null;
      }

      const args = this.parseArguments(fn['arguments']);
      return { id, name, arguments: args };
    }

    // Flat format: { name, arguments }
    const name = obj['name'];
    if (typeof name !== 'string' || name.length === 0) {
      return null;
    }

    const args = this.parseArguments(obj['arguments']);
    return { id, name, arguments: args };
  }

  /**
   * Parse arguments from a tool call. Handles:
   * - JSON string (parse it)
   * - Object (use directly)
   * - Otherwise empty object
   */
  private parseArguments(args: unknown): Record<string, unknown> {
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Invalid JSON — treated as empty/malformed
        return {};
      }
    }

    if (args && typeof args === 'object' && !Array.isArray(args)) {
      return args as Record<string, unknown>;
    }

    return {};
  }

  /**
   * Validate a tool call against its schema.
   */
  private validateAgainstSchema(
    toolCall: ParsedToolCall,
    schema: ToolCallSchema,
    failures: ValidationFailure[],
  ): void {
    const args = toolCall.arguments;

    // Check required parameters
    if (schema.requiredParams) {
      for (const param of schema.requiredParams) {
        if (args[param] === undefined || args[param] === null) {
          failures.push({
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            reason: `Missing required parameter '${param}' for tool '${toolCall.name}'`,
          });
        }
      }
    }

    // Check parameter types
    if (schema.paramTypes) {
      for (const [param, expectedType] of Object.entries(schema.paramTypes)) {
        const value = args[param];
        if (value !== undefined && value !== null) {
          const actualType = typeof value;
          if (actualType !== expectedType) {
            failures.push({
              toolName: toolCall.name,
              toolCallId: toolCall.id,
              reason: `Type mismatch for parameter '${param}' of tool '${toolCall.name}': expected ${expectedType}, got ${actualType}`,
            });
          }
        }
      }
    }

    // Check allowed parameters (reject extra params)
    if (schema.allowedParams) {
      const allowedSet = new Set(schema.allowedParams);
      for (const param of Object.keys(args)) {
        if (!allowedSet.has(param)) {
          failures.push({
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            reason: `Unexpected parameter '${param}' for tool '${toolCall.name}'`,
          });
        }
      }
    }
  }

  /**
   * Validate a tool call against global constraints.
   */
  private validateConstraints(
    toolCall: ParsedToolCall,
    failures: ValidationFailure[],
  ): void {
    for (const constraint of this.constraints) {
      // Check max argument length
      if (constraint.maxArgumentLength !== undefined) {
        for (const [param, value] of Object.entries(toolCall.arguments)) {
          const stringified =
            typeof value === 'string' ? value : JSON.stringify(value);
          if (stringified && stringified.length > constraint.maxArgumentLength) {
            failures.push({
              toolName: toolCall.name,
              toolCallId: toolCall.id,
              reason: `Argument '${param}' of tool '${toolCall.name}' exceeds max length: ${stringified.length} > ${constraint.maxArgumentLength}`,
            });
          }
        }
      }
    }
  }
}
