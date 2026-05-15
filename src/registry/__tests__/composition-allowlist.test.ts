/**
 * Adapter Composition Allowlist — Unit Tests
 *
 * Tests the CompositionAllowlist class and checkComposition function
 * for approved adapter-combination enforcement.
 *
 * Validates: Requirements 9.22, 9.23
 */

import {
  CompositionAllowlist,
  checkComposition,
} from '../composition-allowlist';

describe('CompositionAllowlist', () => {
  // ── Basic allowlist behavior ───────────────────────────────────

  describe('basic behavior', () => {
    it('allows a composition that matches an approved set', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock', 'adapter-agentcore'],
        ['adapter-azure'],
      ]);
      const result = allowlist.check(['adapter-bedrock', 'adapter-agentcore']);
      expect(result.allowed).toBe(true);
      expect(result.reason_code).toBeUndefined();
    });

    it('rejects a composition not in the allowlist', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock', 'adapter-agentcore'],
        ['adapter-azure'],
      ]);
      const result = allowlist.check(['adapter-bedrock', 'adapter-azure']);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('UNAPPROVED_ADAPTER_COMPOSITION');
    });

    it('allows a single adapter that matches an approved set', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-azure'],
      ]);
      const result = allowlist.check(['adapter-azure']);
      expect(result.allowed).toBe(true);
    });

    it('rejects a single adapter not in the allowlist', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock'],
      ]);
      const result = allowlist.check(['adapter-azure']);
      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('UNAPPROVED_ADAPTER_COMPOSITION');
    });
  });

  // ── Order independence ─────────────────────────────────────────

  describe('order independence', () => {
    it('allows composition regardless of adapter order', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock', 'adapter-agentcore'],
      ]);
      // Reversed order should still match
      const result = allowlist.check(['adapter-agentcore', 'adapter-bedrock']);
      expect(result.allowed).toBe(true);
    });

    it('handles allowlist defined in different order', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-agentcore', 'adapter-bedrock'],
      ]);
      const result = allowlist.check(['adapter-bedrock', 'adapter-agentcore']);
      expect(result.allowed).toBe(true);
    });
  });

  // ── Exact match semantics ──────────────────────────────────────

  describe('exact match', () => {
    it('rejects subset of an approved set', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock', 'adapter-agentcore', 'adapter-azure'],
      ]);
      // Only two of three — not an exact match
      const result = allowlist.check(['adapter-bedrock', 'adapter-agentcore']);
      expect(result.allowed).toBe(false);
    });

    it('rejects superset of an approved set', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock', 'adapter-agentcore'],
      ]);
      // Three adapters when only two are approved together
      const result = allowlist.check([
        'adapter-bedrock',
        'adapter-agentcore',
        'adapter-azure',
      ]);
      expect(result.allowed).toBe(false);
    });

    it('rejects empty composition when no empty set is approved', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock'],
      ]);
      const result = allowlist.check([]);
      expect(result.allowed).toBe(false);
    });

    it('allows empty composition when empty set is approved', () => {
      const allowlist = new CompositionAllowlist([[]]);
      const result = allowlist.check([]);
      expect(result.allowed).toBe(true);
    });
  });

  // ── Multiple approved sets ─────────────────────────────────────

  describe('multiple approved sets', () => {
    it('allows any composition matching one of multiple approved sets', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock'],
        ['adapter-azure'],
        ['adapter-bedrock', 'adapter-agentcore'],
      ]);

      expect(allowlist.check(['adapter-bedrock']).allowed).toBe(true);
      expect(allowlist.check(['adapter-azure']).allowed).toBe(true);
      expect(allowlist.check(['adapter-bedrock', 'adapter-agentcore']).allowed).toBe(true);
    });

    it('rejects compositions not matching any approved set', () => {
      const allowlist = new CompositionAllowlist([
        ['adapter-bedrock'],
        ['adapter-azure'],
      ]);
      expect(allowlist.check(['adapter-agentcore']).allowed).toBe(false);
      expect(allowlist.check(['adapter-bedrock', 'adapter-azure']).allowed).toBe(false);
    });
  });

  // ── Empty allowlist ────────────────────────────────────────────

  describe('empty allowlist', () => {
    it('rejects all compositions when allowlist is empty', () => {
      const allowlist = new CompositionAllowlist([]);
      expect(allowlist.check(['adapter-bedrock']).allowed).toBe(false);
      expect(allowlist.check([]).allowed).toBe(false);
    });
  });

  // ── Reason code ────────────────────────────────────────────────

  describe('reason code', () => {
    it('returns UNAPPROVED_ADAPTER_COMPOSITION on rejection', () => {
      const allowlist = new CompositionAllowlist([['adapter-bedrock']]);
      const result = allowlist.check(['adapter-azure']);
      expect(result.reason_code).toBe('UNAPPROVED_ADAPTER_COMPOSITION');
    });

    it('does not include reason_code on approval', () => {
      const allowlist = new CompositionAllowlist([['adapter-bedrock']]);
      const result = allowlist.check(['adapter-bedrock']);
      expect(result.reason_code).toBeUndefined();
    });
  });
});

// ── Standalone function tests ────────────────────────────────────

describe('checkComposition (standalone function)', () => {
  it('allows composition matching approved combinations', () => {
    const result = checkComposition(
      ['adapter-bedrock', 'adapter-agentcore'],
      [['adapter-bedrock', 'adapter-agentcore']],
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects composition not in approved combinations', () => {
    const result = checkComposition(
      ['adapter-bedrock', 'adapter-azure'],
      [['adapter-bedrock', 'adapter-agentcore']],
    );
    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe('UNAPPROVED_ADAPTER_COMPOSITION');
  });

  it('rejects all compositions when no approved combinations provided', () => {
    const result = checkComposition(['adapter-bedrock']);
    expect(result.allowed).toBe(false);
  });

  it('handles order-independent matching', () => {
    const result = checkComposition(
      ['adapter-agentcore', 'adapter-bedrock'],
      [['adapter-bedrock', 'adapter-agentcore']],
    );
    expect(result.allowed).toBe(true);
  });
});
