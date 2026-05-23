import { globMatch, matchesPolicy } from '../shared';
import type { PolicyMatcher, GovernanceRequest } from '../../types';

describe('globMatch', () => {
  const cases = [
    { name: 'exact match', pattern: 'foo', value: 'foo', expected: true },
    { name: 'different strings', pattern: 'foo', value: 'bar', expected: false },
    { name: 'wildcard matches everything', pattern: '*', value: 'anything', expected: true },
    { name: 'prefix wildcard', pattern: 'foo.*', value: 'foo.bar', expected: true },
    { name: 'prefix wildcard no match', pattern: 'foo.*', value: 'foobar', expected: false },
    { name: 'suffix wildcard', pattern: '*.ts', value: 'main.ts', expected: true },
    { name: 'suffix wildcard no match', pattern: '*.ts', value: 'main.js', expected: false },
    { name: 'contains wildcard', pattern: 'src/*/test', value: 'src/utils/test', expected: true },
    { name: 'empty pattern vs empty value', pattern: '', value: '', expected: true },
    { name: 'empty pattern vs non-empty', pattern: '', value: 'x', expected: false },
  ];

  it.each(cases)('$name', ({ pattern, value, expected }) => {
    expect(globMatch(pattern, value)).toBe(expected);
  });
});

describe('matchesPolicy', () => {
  const request: GovernanceRequest = {
    action_class: 'CODE_CHANGE',
    tool: 'git',
    model: 'gpt-4',
    action_attributes: { environment: 'production' },
    nhi_identity: {
      agent_id: 'agent-001',
      owner: 'team-alpha',
      created_at: Date.now(),
      capability_scope: ['*'],
      environment_constraints: ['production'],
      status: 'active',
    },
  };

  describe('table-driven: single field matching', () => {
    const cases = [
      { name: 'matches action_class', matcher: { action_class: 'CODE_CHANGE' } as PolicyMatcher, expected: true },
      { name: 'action_class mismatch', matcher: { action_class: 'READ' } as PolicyMatcher, expected: false },
      { name: 'matches tool', matcher: { tool: 'git' } as PolicyMatcher, expected: true },
      { name: 'tool mismatch', matcher: { tool: 'npm' } as PolicyMatcher, expected: false },
      { name: 'matches agent_id', matcher: { agent_id: 'agent-001' } as PolicyMatcher, expected: true },
      { name: 'agent_id mismatch', matcher: { agent_id: 'agent-999' } as PolicyMatcher, expected: false },
      { name: 'matches environment', matcher: { environment: 'production' } as PolicyMatcher, expected: true },
      { name: 'environment mismatch', matcher: { environment: 'staging' } as PolicyMatcher, expected: false },
      { name: 'matches model', matcher: { model: 'gpt-4' } as PolicyMatcher, expected: true },
      { name: 'model mismatch', matcher: { model: 'claude-3' } as PolicyMatcher, expected: false },
      { name: 'wildcard action_class matches all', matcher: { action_class: '*' } as PolicyMatcher, expected: true },
    ];

    it.each(cases)('$name', ({ matcher, expected }) => {
      expect(matchesPolicy(matcher, request)).toBe(expected);
    });
  });

  it('empty matcher matches everything', () => {
    expect(matchesPolicy({} as PolicyMatcher, request)).toBe(true);
  });

  it('all fields must match (AND logic)', () => {
    const matcher: PolicyMatcher = {
      action_class: 'CODE_CHANGE',
      tool: 'git',
      model: 'gpt-4',
    };
    expect(matchesPolicy(matcher, request)).toBe(true);

    const partialMatcher: PolicyMatcher = {
      action_class: 'CODE_CHANGE',
      tool: 'npm', // This doesn't match
    };
    expect(matchesPolicy(partialMatcher, request)).toBe(false);
  });

  it('handles missing optional identity fields', () => {
    const noIdentityRequest: GovernanceRequest = {
      action_class: 'READ',
    };
    const matcher: PolicyMatcher = { agent_id: 'agent-001' };
    expect(matchesPolicy(matcher, noIdentityRequest)).toBe(false);
  });
});
