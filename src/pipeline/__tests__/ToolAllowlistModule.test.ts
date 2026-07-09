/**
 * ToolAllowlistModule — Unit Tests
 *
 * Covers:
 * - DENY with TOOL_NOT_ALLOWED when `request.tool` is not on allowlist
 * - DENY with TOOL_NOT_ALLOWED when `request.tool_name` is not on allowlist
 * - DENY with TOOL_NOT_ALLOWED when `request.tools` array contains disallowed tools
 * - ALLOW when all requested tools are on the allowlist
 * - ALLOW when no tool-related fields are present (no tool calls to validate)
 * - Metadata includes blocked_tools and requested_tools
 * - Tool objects with `name` field in the `tools` array
 *
 * @requirements 6.5, 6.6, 6.7
 */

import { ToolAllowlistModule } from '../modules/pre/ToolAllowlistModule';
import type {
  ModuleContext,
  ModuleEvaluationRequest,
} from '../../core/engine/v1.2/types';

// ── Helpers ──────────────────────────────────────────────────────

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-001',
  policy_version: '1.0.0',
  teec_version: '2.1',
  timestamp: Date.now(),
});

const makeRequest = (
  overrides: Partial<ModuleEvaluationRequest> = {},
): ModuleEvaluationRequest => ({
  content: 'Use the calculator tool',
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe('ToolAllowlistModule', () => {
  describe('request.tool field', () => {
    it('should return DENY when request.tool is not on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({ tool: 'file_delete' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_NOT_ALLOWED');
      expect(result.metadata?.blocked_tools).toContain('file_delete');
    });

    it('should return ALLOW when request.tool is on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({ tool: 'calculator' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should match tool names case-sensitively', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['Calculator'],
      });

      const result = await module.evaluate(
        makeRequest({ tool: 'calculator' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_NOT_ALLOWED');
    });
  });

  describe('request.tool_name field', () => {
    it('should return DENY when request.tool_name is not on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({ tool_name: 'execute_code' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_NOT_ALLOWED');
      expect(result.metadata?.blocked_tools).toContain('execute_code');
    });

    it('should return ALLOW when request.tool_name is on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['search', 'web_browse'],
      });

      const result = await module.evaluate(
        makeRequest({ tool_name: 'search' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('request.tools array (string entries)', () => {
    it('should return DENY when any tool in the array is not on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({ tools: ['calculator', 'file_delete', 'search'] }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_NOT_ALLOWED');
      expect(result.metadata?.blocked_tools).toEqual(['file_delete']);
    });

    it('should return ALLOW when all tools in the array are on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search', 'web_browse'],
      });

      const result = await module.evaluate(
        makeRequest({ tools: ['calculator', 'search'] }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should report multiple blocked tools', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator'],
      });

      const result = await module.evaluate(
        makeRequest({ tools: ['file_delete', 'execute_code', 'calculator'] }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.metadata?.blocked_tools).toEqual([
        'file_delete',
        'execute_code',
      ]);
    });
  });

  describe('request.tools array (object entries with name field)', () => {
    it('should return DENY when a tool object name is not on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({
          tools: [
            { name: 'calculator', params: {} },
            { name: 'rm_rf', params: { path: '/' } },
          ],
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_NOT_ALLOWED');
      expect(result.metadata?.blocked_tools).toContain('rm_rf');
    });

    it('should return ALLOW when all tool object names are on allowlist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({
          tools: [
            { name: 'calculator', params: { expr: '2+2' } },
            { name: 'search', params: { query: 'test' } },
          ],
        }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('no tool fields present', () => {
    it('should return ALLOW when no tool-related fields exist', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator'],
      });

      const result = await module.evaluate(
        makeRequest({ content: 'Just a plain text request' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when tool field is empty string', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator'],
      });

      const result = await module.evaluate(
        makeRequest({ tool: '' }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });

    it('should return ALLOW when tools array is empty', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator'],
      });

      const result = await module.evaluate(
        makeRequest({ tools: [] }),
        makeCtx(),
        undefined,
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('should include blocked_tools and requested_tools in DENY metadata', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['search'],
      });

      const result = await module.evaluate(
        makeRequest({ tool: 'dangerous_tool' }),
        makeCtx(),
        undefined,
      );

      expect(result.metadata?.blocked_tools).toEqual(['dangerous_tool']);
      expect(result.metadata?.requested_tools).toEqual(['dangerous_tool']);
      expect(result.metadata?.allowlist).toEqual(['search']);
    });

    it('should include requested_tools in ALLOW metadata', async () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator', 'search'],
      });

      const result = await module.evaluate(
        makeRequest({ tool: 'calculator' }),
        makeCtx(),
        undefined,
      );

      expect(result.metadata?.requested_tools).toEqual(['calculator']);
    });
  });

  describe('TealModule interface compliance', () => {
    it('should have correct name and version', () => {
      const module = new ToolAllowlistModule({
        allowlist: ['calculator'],
      });

      expect(module.name).toBe('ToolAllowlistModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should have an async evaluate method', () => {
      const module = new ToolAllowlistModule({
        allowlist: [],
      });

      expect(typeof module.evaluate).toBe('function');
    });
  });
});
