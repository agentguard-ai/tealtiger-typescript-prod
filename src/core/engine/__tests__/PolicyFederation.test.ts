import {
  PolicyFederation,
  TealEngine,
  type PolicyFederationPayload,
  type TealPolicy
} from '../index';

const parentPayload: PolicyFederationPayload = {
  version: '1.0',
  issuer: 'parent-orchestrator',
  subjectAgentId: 'child-agent',
  issuedAt: 1710000000000,
  revision: 1,
  parentCorrelationId: 'parent-correlation-1',
  traceChain: ['root-correlation-1'],
  constraints: {
    budget: {
      remaining: 5,
      daily: 8
    },
    toolAllowlist: ['search'],
    dataClassification: 'internal'
  }
};

const childPolicy: TealPolicy = {
  tools: {
    search: { allowed: true },
    file_delete: { allowed: true }
  },
  behavioral: {
    costLimit: { daily: 10 },
    rateLimit: { requests: 100, window: '1m' }
  },
  content: {
    dataClassification: { maxLevel: 'confidential' }
  }
};

const crossSdkTokenFixture =
  'ttfp.v1.eyJjb25zdHJhaW50cyI6eyJidWRnZXQiOnsiZGFpbHkiOjgsInJlbWFpbmluZyI6NX0sImRhdGFDbGFzc2lmaWNhdGlvbiI6ImludGVybmFsIiwidG9vbEFsbG93bGlzdCI6WyJzZWFyY2giXX0sImlzc3VlZEF0IjoxNzEwMDAwMDAwMDAwLCJpc3N1ZXIiOiJwYXJlbnQtb3JjaGVzdHJhdG9yIiwicGFyZW50Q29ycmVsYXRpb25JZCI6InBhcmVudC1jb3JyZWxhdGlvbi0xIiwicmV2aXNpb24iOjEsInN1YmplY3RBZ2VudElkIjoiY2hpbGQtYWdlbnQiLCJ0cmFjZUNoYWluIjpbInJvb3QtY29ycmVsYXRpb24tMSJdLCJ2ZXJzaW9uIjoiMS4wIn0.D01L0Qu4RSTsa_YsRE1AYbJonefif-JBm3qtpRVeahU';

describe('PolicyFederation', () => {
  it('merges inherited constraints with most-restrictive-wins semantics', () => {
    const merged = PolicyFederation.mergePolicies(childPolicy, parentPayload);

    expect(merged.tools?.search.allowed).toBe(true);
    expect(merged.tools?.file_delete.allowed).toBe(false);
    expect(merged.tools?.['*'].allowed).toBe(false);
    expect(merged.behavioral?.costLimit.daily).toBe(5);
    expect(merged.content?.dataClassification?.maxLevel).toBe('internal');
  });

  it('enforces parent budget, tools, and data classification in child TealEngine', () => {
    const engine = new TealEngine(childPolicy, {
      federation: parentPayload
    });

    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search',
      cost: 4,
      metadata: { dataClassification: 'internal' }
    }).allowed).toBe(true);

    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'file_delete'
    }).allowed).toBe(false);

    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search',
      cost: 6
    }).allowed).toBe(false);

    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search',
      metadata: { dataClassification: 'confidential' }
    }).allowed).toBe(false);
  });

  it('retains parent constraints when local policies hot-reload', () => {
    const engine = new TealEngine(childPolicy, {
      federation: parentPayload
    });

    engine.updatePolicies({
      ...childPolicy,
      behavioral: {
        costLimit: { daily: 100 },
        rateLimit: { requests: 100, window: '1m' }
      },
      content: {
        dataClassification: { maxLevel: 'restricted' }
      }
    });

    expect(engine.getPolicyVersion()).toBe(2);
    expect(engine.getLocalPolicies().behavioral?.costLimit.daily).toBe(100);
    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'file_delete'
    }).allowed).toBe(false);
    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search',
      cost: 6
    }).allowed).toBe(false);
    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search',
      metadata: { dataClassification: 'confidential' }
    }).allowed).toBe(false);
  });

  it('applies async parent tool revocations on the next evaluation cycle', () => {
    const engine = new TealEngine(childPolicy, {
      federation: parentPayload
    });

    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search'
    }).allowed).toBe(true);

    engine.applyFederatedConstraints(PolicyFederation.applyRevocation(
      parentPayload.constraints,
      ['search']
    ));

    expect(engine.evaluate({
      agentId: 'child-agent',
      action: 'tool.execute',
      tool: 'search'
    }).allowed).toBe(false);
  });

  it('signs and verifies transport-agnostic policy tokens', () => {
    const token = PolicyFederation.createToken(parentPayload, 'shared-secret');
    const verified = PolicyFederation.verifyToken(token, 'shared-secret', 1710000000001);

    expect(token).toBe(crossSdkTokenFixture);
    expect(verified.valid).toBe(true);
    expect(verified.payload).toEqual(parentPayload);
    expect(PolicyFederation.verifyToken(`${token}x`, 'shared-secret').valid).toBe(false);
  });

  it('creates child contexts linked to the parent correlation chain', () => {
    const context = PolicyFederation.createChildContext(parentPayload, {
      childCorrelationId: 'child-correlation-1',
      traceId: 'trace-1',
      spanId: 'span-1'
    });

    expect(context.correlation_id).toBe('child-correlation-1');
    expect(context.trace_id).toBe('trace-1');
    expect(context.span_id).toBe('span-1');
    expect(context.metadata?.parent_correlation_id).toBe('parent-correlation-1');
    expect(context.metadata?.trace_chain).toEqual([
      'root-correlation-1',
      'parent-correlation-1'
    ]);
  });
});
