/**
 * Unit tests for ToolCallValidationModule.
 *
 * Validates: Requirements 7.4, 7.6, 7.7
 */

import { ToolCallValidationModule } from '../ToolCallValidationModule';
import type { ModuleContext, ModuleEvaluationRequest } from '../../../../core/engine/v1.2/types';

describe('ToolCallValidationModule', () => {
  const defaultCtx: ModuleContext = {
    correlation_id: 'test-corr-id',
    policy_version: '1.0.0',
    teec_version: '2.1',
    timestamp: Date.now(),
  };

  describe('TealModule interface', () => {
    it('should have correct name and version', () => {
      const module = new ToolCallValidationModule();
      expect(module.name).toBe('ToolCallValidationModule');
      expect(module.version).toBe('1.0.0');
    });

    it('should implement evaluate as an async function', () => {
      const module = new ToolCallValidationModule();
      expect(typeof module.evaluate).toBe('function');
    });
  });

  describe('ALLOW when no tool calls', () => {
    it('should return ALLOW when response has no tool_calls', async () => {
      const module = new ToolCallValidationModule({
        schemas: { search: { requiredParams: ['query'] } },
      });
      const request: ModuleEvaluationRequest = {
        _response: { content: 'Hello, world!' },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toEqual([]);
      expect(result.event_type).toBe('pipeline.tool_call_validation');
    });

    it('should return ALLOW when _response is missing', async () => {
      const module = new ToolCallValidationModule();
      const request: ModuleEvaluationRequest = { content: 'test' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });

    it('should return ALLOW when _response is not an object', async () => {
      const module = new ToolCallValidationModule();
      const request: ModuleEvaluationRequest = { _response: 'not-an-object' };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('ALLOW when tool calls are valid', () => {
    it('should return ALLOW when tool call matches schema (direct format)', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { requiredParams: ['query'], paramTypes: { query: 'string' } },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: { query: 'test query' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.metadata).toMatchObject({
        tool_call_count: 1,
        validated_tools: ['search'],
      });
    });

    it('should return ALLOW when tool call matches schema (OpenAI format)', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          get_weather: { requiredParams: ['location'], paramTypes: { location: 'string' } },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: {
                      name: 'get_weather',
                      arguments: JSON.stringify({ location: 'Seattle' }),
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });

    it('should return ALLOW when no schema exists and requireSchema is false', async () => {
      const module = new ToolCallValidationModule({
        schemas: {},
        requireSchema: false,
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'unknown_tool', arguments: { foo: 'bar' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });
  });

  describe('DENY for schema violations', () => {
    it('should return DENY when required parameter is missing', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { requiredParams: ['query'] },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: { limit: 10 } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
      expect(result.metadata).toMatchObject({
        remediation: 'resample',
      });
    });

    it('should return DENY when parameter has wrong type', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { paramTypes: { query: 'string', limit: 'number' } },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: { query: 'test', limit: 'ten' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
      expect(result.metadata).toMatchObject({ remediation: 'resample' });
    });

    it('should return DENY when unexpected parameter is present with allowedParams', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { allowedParams: ['query', 'limit'] },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: { query: 'test', malicious_param: 'evil' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
    });

    it('should return DENY when requireSchema is true and no schema exists', async () => {
      const module = new ToolCallValidationModule({
        schemas: { search: { requiredParams: ['query'] } },
        requireSchema: true,
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'unknown_tool', arguments: { foo: 'bar' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
      expect(result.metadata).toMatchObject({ remediation: 'resample' });
    });
  });

  describe('DENY for constraint violations', () => {
    it('should return DENY when argument exceeds max length', async () => {
      const module = new ToolCallValidationModule({
        constraints: [{ maxArgumentLength: 50 }],
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'write_file', arguments: { content: 'x'.repeat(100) } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
      expect(result.metadata).toMatchObject({ remediation: 'resample' });
    });

    it('should return DENY when too many tool calls exceed maxToolCalls', async () => {
      const module = new ToolCallValidationModule({
        constraints: [{ maxToolCalls: 2 }],
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'tool_a', arguments: {} },
            { name: 'tool_b', arguments: {} },
            { name: 'tool_c', arguments: {} },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
    });

    it('should return DENY when disallowed tool is called', async () => {
      const module = new ToolCallValidationModule({
        constraints: [{ disallowedTools: ['rm_rf', 'drop_database'] }],
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'drop_database', arguments: { db: 'production' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
      expect(result.metadata).toMatchObject({ remediation: 'resample' });
    });
  });

  describe('argument parsing', () => {
    it('should parse JSON string arguments (OpenAI format)', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { requiredParams: ['query'], paramTypes: { query: 'string' } },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'search',
                      arguments: '{"query": "test"}',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
    });

    it('should handle invalid JSON arguments gracefully (empty args)', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { requiredParams: ['query'] },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: 'not valid json{' },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      // Should DENY because required param 'query' is missing (args parse to {})
      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('TOOL_CALL_INVALID');
    });
  });

  describe('multiple tool calls', () => {
    it('should validate all tool calls and report all failures', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { requiredParams: ['query'] },
          calculate: { requiredParams: ['expression'], paramTypes: { expression: 'string' } },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: {} }, // missing 'query'
            { name: 'calculate', arguments: { expression: 123 } }, // wrong type
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.metadata).toMatchObject({
        failure_count: 2,
        tool_call_count: 2,
      });
    });

    it('should return ALLOW when all tool calls are valid', async () => {
      const module = new ToolCallValidationModule({
        schemas: {
          search: { requiredParams: ['query'] },
          calculate: { requiredParams: ['expression'] },
        },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [
            { name: 'search', arguments: { query: 'hello' } },
            { name: 'calculate', arguments: { expression: '2+2' } },
          ],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('ALLOW');
      expect(result.metadata).toMatchObject({ tool_call_count: 2 });
    });
  });

  describe('remediation metadata', () => {
    it('should always include remediation: "resample" in metadata on DENY', async () => {
      const module = new ToolCallValidationModule({
        schemas: { search: { requiredParams: ['query'] } },
      });
      const request: ModuleEvaluationRequest = {
        _response: {
          tool_calls: [{ name: 'search', arguments: {} }],
        },
      };

      const result = await module.evaluate(request, defaultCtx, null);

      expect(result.action).toBe('DENY');
      expect(result.metadata!.remediation).toBe('resample');
    });
  });
});
