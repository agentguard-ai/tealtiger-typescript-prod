/**
 * Multi-Stage Defense Pipeline — Tool Allowlist Module
 *
 * Inspects tool call requests and returns DENY with reason code TOOL_NOT_ALLOWED
 * when any requested tool is not on the configured allowlist.
 *
 * Supports multiple tool field formats:
 * - `request.tool` — single tool name (string)
 * - `request.tool_name` — single tool name (string)
 * - `request.tools` — array of tool names or tool objects with a `name` field
 *
 * @module pipeline/modules/pre/ToolAllowlistModule
 * @requirements 6.5, 6.6, 6.7
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
 * Configuration object for ToolAllowlistModule.
 */
export interface ToolAllowlistConfig {
  /** List of permitted tool names. Matched case-sensitively. */
  allowlist: string[];
}

// ── Module Implementation ────────────────────────────────────────

/**
 * Inspects tool call requests and denies those containing tools not on
 * the configured allowlist. Returns ALLOW when no tool calls are found
 * or all requested tools are permitted.
 *
 * Tool detection checks (in order):
 * 1. `request.tool` — single tool name string
 * 2. `request.tool_name` — single tool name string
 * 3. `request.tools` — array of tool names (strings) or tool objects with a `name` field
 *
 * If no tool-related fields are found, the module returns ALLOW (no tool calls to validate).
 */
export class ToolAllowlistModule implements TealModule {
  readonly name = 'ToolAllowlistModule';
  readonly version = '1.0.0';

  private readonly allowlist: Set<string>;

  constructor(config: ToolAllowlistConfig) {
    this.allowlist = new Set(config.allowlist);
  }

  async evaluate(
    request: ModuleEvaluationRequest,
    _ctx: ModuleContext,
    _policy: unknown,
  ): Promise<ModuleResult> {
    const requestedTools = this.extractTools(request);

    // If no tool calls found, allow the request
    if (requestedTools.length === 0) {
      return {
        action: DecisionAction.ALLOW,
        reason_codes: [],
        event_type: 'pipeline.tool_allowlist',
        metadata: {
          module: this.name,
        },
      };
    }

    // Check each tool against the allowlist
    const blockedTools = requestedTools.filter(
      (tool) => !this.allowlist.has(tool),
    );

    if (blockedTools.length > 0) {
      return {
        action: DecisionAction.DENY,
        reason_codes: ['TOOL_NOT_ALLOWED'],
        event_type: 'pipeline.tool_allowlist',
        metadata: {
          module: this.name,
          blocked_tools: blockedTools,
          requested_tools: requestedTools,
          allowlist: Array.from(this.allowlist),
        },
      };
    }

    return {
      action: DecisionAction.ALLOW,
      reason_codes: [],
      event_type: 'pipeline.tool_allowlist',
      metadata: {
        module: this.name,
        requested_tools: requestedTools,
      },
    };
  }

  /**
   * Extract tool names from the request, checking multiple possible field formats.
   */
  private extractTools(request: ModuleEvaluationRequest): string[] {
    const tools: string[] = [];

    // Check `request.tool` (single tool name)
    if (typeof request.tool === 'string' && request.tool.length > 0) {
      tools.push(request.tool);
    }

    // Check `request.tool_name` (single tool name, alternative field)
    const toolName = request['tool_name'];
    if (typeof toolName === 'string' && toolName.length > 0) {
      tools.push(toolName);
    }

    // Check `request.tools` (array of tool names or tool objects)
    const toolsField = request['tools'];
    if (Array.isArray(toolsField)) {
      for (const entry of toolsField) {
        if (typeof entry === 'string' && entry.length > 0) {
          tools.push(entry);
        } else if (
          entry !== null &&
          typeof entry === 'object' &&
          typeof (entry as Record<string, unknown>).name === 'string'
        ) {
          const name = (entry as Record<string, unknown>).name as string;
          if (name.length > 0) {
            tools.push(name);
          }
        }
      }
    }

    return tools;
  }
}
