/**
 * TealState Module — Unit Tests
 *
 * Tests context and state governance including:
 * - Context size enforcement (deny, truncate, alert)
 * - Provenance metadata tracking
 * - Mutation governance (log/block unauthorized changes)
 * - CONTEXT_SIZE_EXCEEDED emission
 *
 * @requirements 18.1, 18.2, 18.3, 18.4
 */

import { TealStateModule } from '../TealState';
import type { ContextEntry } from '../../../core/engine/v1.3/module-types';

describe('TealStateModule', () => {
  let module: TealStateModule;

  beforeEach(() => {
    module = new TealStateModule({
      max_context_size: 100, // 100 bytes for easy testing
      on_exceed: 'deny',
      track_provenance: true,
      mutation_governance: true,
    });
  });

  describe('constructor and initialization', () => {
    it('should create with default config', () => {
      const defaultModule = new TealStateModule();
      expect(defaultModule.name).toBe('TealState');
      expect(defaultModule.version).toBe('1.3.0');
    });

    it('should accept partial config overrides', () => {
      const customModule = new TealStateModule({ max_context_size: 500 });
      expect(customModule.name).toBe('TealState');
    });
  });

  describe('addContext — deny mode', () => {
    it('should allow entries within size limit', () => {
      const entry: ContextEntry = {
        content: 'Hello',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      };

      const result = module.addContext('agent-1', entry);
      expect(result.allowed).toBe(true);
      expect(result.reason_code).toBeUndefined();
    });

    it('should deny entry when it would exceed max_context_size', () => {
      // Fill up context close to limit
      const bigEntry: ContextEntry = {
        content: 'x'.repeat(90),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      };
      module.addContext('agent-1', bigEntry);

      // Try to add another entry that exceeds limit
      const overflowEntry: ContextEntry = {
        content: 'y'.repeat(20),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      };
      const result = module.addContext('agent-1', overflowEntry);

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('CONTEXT_SIZE_EXCEEDED');
    });

    it('should emit CONTEXT_SIZE_EXCEEDED event on deny', () => {
      const bigEntry: ContextEntry = {
        content: 'x'.repeat(90),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      };
      module.addContext('agent-1', bigEntry);

      const overflowEntry: ContextEntry = {
        content: 'y'.repeat(20),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      };
      module.addContext('agent-1', overflowEntry);

      const events = module.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('governance.state.context_exceeded');
    });
  });

  describe('addContext — truncate mode', () => {
    let truncateModule: TealStateModule;

    beforeEach(() => {
      truncateModule = new TealStateModule({
        max_context_size: 100,
        on_exceed: 'truncate',
        track_provenance: true,
        mutation_governance: true,
      });
    });

    it('should truncate oldest entries to make room', () => {
      // Add several small entries
      for (let i = 0; i < 5; i++) {
        truncateModule.addContext('agent-1', {
          content: `entry-${i}`.padEnd(20, ' '),
          source: 'user',
          timestamp: Date.now() + i,
          trust_tier: 'direct_user',
        });
      }

      // Add a large entry that requires truncation
      const result = truncateModule.addContext('agent-1', {
        content: 'large-entry'.padEnd(50, ' '),
        source: 'user',
        timestamp: Date.now() + 100,
        trust_tier: 'direct_user',
      });

      expect(result.allowed).toBe(true);
      // Oldest entries should have been removed
      const context = truncateModule.getContext('agent-1');
      expect(context.length).toBeLessThan(6);
    });
  });

  describe('addContext — alert mode', () => {
    let alertModule: TealStateModule;

    beforeEach(() => {
      alertModule = new TealStateModule({
        max_context_size: 100,
        on_exceed: 'alert',
        track_provenance: true,
        mutation_governance: false,
      });
    });

    it('should allow entry but emit event when exceeding limit', () => {
      alertModule.addContext('agent-1', {
        content: 'x'.repeat(90),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      const result = alertModule.addContext('agent-1', {
        content: 'y'.repeat(20),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      expect(result.allowed).toBe(true);
      const events = alertModule.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('governance.state.context_exceeded');
    });
  });

  describe('getContext and getContextSize', () => {
    it('should return empty array for unknown agent', () => {
      expect(module.getContext('unknown')).toEqual([]);
    });

    it('should return 0 size for unknown agent', () => {
      expect(module.getContextSize('unknown')).toBe(0);
    });

    it('should return all added entries', () => {
      const entry1: ContextEntry = {
        content: 'Hello',
        source: 'user',
        timestamp: 1000,
        trust_tier: 'direct_user',
      };
      const entry2: ContextEntry = {
        content: 'World',
        source: 'tool',
        timestamp: 2000,
        trust_tier: 'tool_output_internal',
      };

      module.addContext('agent-1', entry1);
      module.addContext('agent-1', entry2);

      const context = module.getContext('agent-1');
      expect(context).toHaveLength(2);
      expect(context[0].content).toBe('Hello');
      expect(context[1].content).toBe('World');
    });

    it('should track cumulative size', () => {
      module.addContext('agent-1', {
        content: 'Hello', // 5 bytes
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      expect(module.getContextSize('agent-1')).toBe(5);
    });
  });

  describe('removeContext', () => {
    beforeEach(() => {
      module.addContext('agent-1', {
        content: 'entry-0',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });
      module.addContext('agent-1', {
        content: 'entry-1',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });
    });

    it('should remove entry at valid index', () => {
      const result = module.removeContext('agent-1', 0, 'admin', true);
      expect(result.allowed).toBe(true);
      expect(module.getContext('agent-1')).toHaveLength(1);
    });

    it('should reject removal at invalid index', () => {
      const result = module.removeContext('agent-1', 99, 'admin', true);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('INVALID_INDEX');
    });

    it('should block unauthorized removal when mutation_governance enabled', () => {
      const result = module.removeContext('agent-1', 0, 'rogue-agent', false);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('UNAUTHORIZED_STATE_MUTATION');
    });

    it('should log unauthorized mutation attempt', () => {
      module.removeContext('agent-1', 0, 'rogue-agent', false);
      const log = module.getMutationLog('agent-1');
      const unauthorized = log.filter((r) => !r.authorized);
      expect(unauthorized.length).toBeGreaterThan(0);
    });
  });

  describe('mutation governance', () => {
    it('should log all mutations when enabled', () => {
      module.addContext('agent-1', {
        content: 'test entry',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      const log = module.getMutationLog('agent-1');
      expect(log.length).toBe(1);
      expect(log[0].action).toBe('add');
      expect(log[0].authorized).toBe(true);
    });

    it('should not log mutations when disabled', () => {
      const noMutModule = new TealStateModule({
        max_context_size: 1000,
        on_exceed: 'deny',
        track_provenance: true,
        mutation_governance: false,
      });

      noMutModule.addContext('agent-1', {
        content: 'test entry',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      expect(noMutModule.getMutationLog('agent-1')).toHaveLength(0);
    });
  });

  describe('clearContext', () => {
    it('should remove all context for an agent', () => {
      module.addContext('agent-1', {
        content: 'test',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      module.clearContext('agent-1');
      expect(module.getContext('agent-1')).toEqual([]);
      expect(module.getContextSize('agent-1')).toBe(0);
    });
  });

  describe('evaluate (TealModule interface)', () => {
    it('should return ALLOW when no context entry provided', async () => {
      const result = await module.evaluate(
        { content: 'test' },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: Date.now(),
          agent_id: 'agent-1',
        },
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toHaveLength(0);
    });

    it('should return DENY when context entry exceeds limit', async () => {
      // Fill up context
      module.addContext('agent-1', {
        content: 'x'.repeat(90),
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      const result = await module.evaluate(
        {
          context_entry: {
            content: 'y'.repeat(20),
            source: 'user',
            timestamp: Date.now(),
            trust_tier: 'direct_user',
          },
        },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: Date.now(),
          agent_id: 'agent-1',
        },
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('CONTEXT_SIZE_EXCEEDED');
    });
  });

  describe('destroy', () => {
    it('should clear all contexts and events', async () => {
      module.addContext('agent-1', {
        content: 'test',
        source: 'user',
        timestamp: Date.now(),
        trust_tier: 'direct_user',
      });

      await module.destroy();
      expect(module.getContext('agent-1')).toEqual([]);
      expect(module.getEvents()).toHaveLength(0);
    });
  });
});
