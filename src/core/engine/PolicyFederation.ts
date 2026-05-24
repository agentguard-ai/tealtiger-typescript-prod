/**
 * PolicyFederation - Cross-agent policy propagation protocol
 *
 * Provides transport-agnostic signed policy tokens and deterministic
 * most-restrictive-wins merging for parent/child agent policy constraints.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  BehavioralPolicy,
  DataClassificationLevel,
  TealPolicy,
  ToolPolicy,
} from './types';
import { ContextManager } from '../context/ContextManager';
import type { ExecutionContext } from '../context/ExecutionContext';

const TOKEN_PREFIX = 'ttfp.v1';

export interface FederatedBudgetCeiling {
  /** Remaining budget available to this child branch */
  remaining?: number;
  /** Daily budget ceiling */
  daily?: number;
  /** Hourly budget ceiling */
  hourly?: number;
  /** Monthly budget ceiling */
  monthly?: number;
}

export interface PolicyFederationConstraints {
  /** Parent budget limits inherited by the child agent */
  budget?: FederatedBudgetCeiling;
  /** Explicit parent tool allowlist */
  toolAllowlist?: string[];
  /** Maximum data classification the child may access */
  dataClassification?: DataClassificationLevel;
  /** Tools revoked asynchronously by the parent */
  revokedTools?: string[];
}

export interface PolicyFederationPayload {
  /** Federation protocol version */
  version: '1.0';
  /** Parent or authority issuing the constraints */
  issuer: string;
  /** Child agent expected to consume these constraints */
  subjectAgentId: string;
  /** Unix epoch milliseconds */
  issuedAt: number;
  /** Optional expiration time in Unix epoch milliseconds */
  expiresAt?: number;
  /** Monotonic revision for async revocations */
  revision: number;
  /** Parent correlation ID for trace chaining */
  parentCorrelationId?: string;
  /** Full parent trace chain, oldest to newest */
  traceChain?: string[];
  /** Inherited constraints */
  constraints: PolicyFederationConstraints;
}

export interface PolicyFederationVerificationResult {
  valid: boolean;
  payload?: PolicyFederationPayload;
  error?: string;
}

export interface ChildContextOptions {
  childCorrelationId?: string;
  traceId?: string;
  spanId?: string;
}

export class PolicyFederation {
  /**
   * Creates a transport-agnostic signed policy token.
   */
  static createToken(payload: PolicyFederationPayload, secret: string): string {
    const encodedPayload = base64UrlEncode(stableStringify(payload));
    const signingInput = `${TOKEN_PREFIX}.${encodedPayload}`;
    const signature = sign(signingInput, secret);
    return `${signingInput}.${signature}`;
  }

  /**
   * Verifies a signed policy token and returns the decoded payload.
   */
  static verifyToken(
    token: string,
    secret: string,
    nowMs: number = Date.now()
  ): PolicyFederationVerificationResult {
    const parts = token.split('.');
    if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== TOKEN_PREFIX) {
      return { valid: false, error: 'Invalid policy federation token format' };
    }

    const signingInput = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const expectedSignature = sign(signingInput, secret);
    if (!constantTimeEquals(parts[3], expectedSignature)) {
      return { valid: false, error: 'Invalid policy federation token signature' };
    }

    try {
      const payload = JSON.parse(base64UrlDecode(parts[2])) as PolicyFederationPayload;
      if (payload.expiresAt !== undefined && payload.expiresAt <= nowMs) {
        return { valid: false, error: 'Policy federation token expired' };
      }

      return { valid: true, payload };
    } catch {
      return { valid: false, error: 'Invalid policy federation token payload' };
    }
  }

  /**
   * Decodes a token without verifying its signature.
   */
  static decodeToken(token: string): PolicyFederationPayload {
    const parts = token.split('.');
    if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== TOKEN_PREFIX) {
      throw new Error('Invalid policy federation token format');
    }

    return JSON.parse(base64UrlDecode(parts[2])) as PolicyFederationPayload;
  }

  /**
   * Merges parent constraints into child policies using most-restrictive-wins.
   */
  static mergePolicies(
    childPolicy: TealPolicy,
    federation: PolicyFederationConstraints | PolicyFederationPayload
  ): TealPolicy {
    const constraints = this.extractConstraints(federation);
    const merged = clonePolicy(childPolicy);

    if (constraints.toolAllowlist || constraints.revokedTools) {
      merged.tools = mergeToolPolicies(
        merged.tools,
        constraints.toolAllowlist,
        constraints.revokedTools
      );
    }

    if (constraints.budget) {
      merged.behavioral = mergeBudgetPolicy(merged.behavioral, constraints.budget);
      if (merged.identity) {
        merged.identity = {
          ...merged.identity,
          costLimit: mergeCostLimit(merged.identity.costLimit, constraints.budget),
        };
      }
    }

    if (constraints.dataClassification) {
      const currentMax = merged.content?.dataClassification?.maxLevel;
      const maxLevel = currentMax
        ? mostRestrictiveClassification(currentMax, constraints.dataClassification)
        : constraints.dataClassification;

      merged.content = {
        ...(merged.content ?? {}),
        dataClassification: { maxLevel },
      };
    }

    return merged;
  }

  /**
   * Returns a new constraints object with async tool revocations applied.
   */
  static applyRevocation(
    constraints: PolicyFederationConstraints,
    revokedTools: string[]
  ): PolicyFederationConstraints {
    const combined = new Set([
      ...(constraints.revokedTools ?? []),
      ...revokedTools,
    ]);

    const next: PolicyFederationConstraints = {
      ...constraints,
      revokedTools: Array.from(combined).sort(),
    };

    if (next.toolAllowlist) {
      next.toolAllowlist = next.toolAllowlist.filter((tool) => !combined.has(tool));
    }

    return next;
  }

  /**
   * Creates a child ExecutionContext linked back to the parent trace.
   */
  static createChildContext(
    payload: PolicyFederationPayload,
    options: ChildContextOptions = {}
  ): ExecutionContext {
    const traceChain = [
      ...(payload.traceChain ?? []),
      ...(payload.parentCorrelationId ? [payload.parentCorrelationId] : []),
    ];

    return ContextManager.createContext({
      ...(options.childCorrelationId && { correlation_id: options.childCorrelationId }),
      ...(options.traceId && { trace_id: options.traceId }),
      ...(options.spanId && { span_id: options.spanId }),
      metadata: {
        federation_issuer: payload.issuer,
        federation_revision: payload.revision,
        parent_correlation_id: payload.parentCorrelationId,
        trace_chain: traceChain,
      },
    });
  }

  static extractConstraints(
    federation: PolicyFederationConstraints | PolicyFederationPayload
  ): PolicyFederationConstraints {
    if ('constraints' in federation) {
      return federation.constraints;
    }

    return federation;
  }
}

function clonePolicy(policy: TealPolicy): TealPolicy {
  return {
    ...policy,
    ...(policy.tools && { tools: cloneToolPolicy(policy.tools) }),
    ...(policy.identity && {
      identity: {
        ...policy.identity,
        ...(policy.identity.permissions && { permissions: [...policy.identity.permissions] }),
        ...(policy.identity.forbidden && { forbidden: [...policy.identity.forbidden] }),
        ...(policy.identity.costLimit && { costLimit: { ...policy.identity.costLimit } }),
      },
    }),
    ...(policy.behavioral && {
      behavioral: {
        ...policy.behavioral,
        costLimit: { ...policy.behavioral.costLimit },
        rateLimit: { ...policy.behavioral.rateLimit },
      },
    }),
    ...(policy.content && {
      content: {
        ...policy.content,
        ...(policy.content.pii && {
          pii: {
            ...policy.content.pii,
            ...(policy.content.pii.blockedTypes && {
              blockedTypes: [...policy.content.pii.blockedTypes],
            }),
          },
        }),
        ...(policy.content.moderation && {
          moderation: {
            ...policy.content.moderation,
            ...(policy.content.moderation.categories && {
              categories: [...policy.content.moderation.categories],
            }),
          },
        }),
        ...(policy.content.dataClassification && {
          dataClassification: { ...policy.content.dataClassification },
        }),
      },
    }),
  };
}

function cloneToolPolicy(tools: ToolPolicy): ToolPolicy {
  const clone: ToolPolicy = {};

  for (const [tool, config] of Object.entries(tools)) {
    clone[tool] = {
      ...config,
      ...(config.rateLimit && { rateLimit: { ...config.rateLimit } }),
      ...(config.allowedTables && { allowedTables: [...config.allowedTables] }),
      ...(config.parameters && { parameters: { ...config.parameters } }),
    };
  }

  return clone;
}

function mergeToolPolicies(
  childTools: ToolPolicy | undefined,
  allowlist: string[] | undefined,
  revokedTools: string[] | undefined
): ToolPolicy {
  const revoked = new Set(revokedTools ?? []);
  const result: ToolPolicy = cloneToolPolicy(childTools ?? {});

  if (allowlist) {
    const allowed = new Set(allowlist);
    result['*'] = { allowed: false };

    for (const tool of allowlist) {
      const child = result[tool];
      result[tool] = {
        ...(child ?? {}),
        allowed: Boolean(child?.allowed ?? true) && !revoked.has(tool),
      };
    }

    for (const [tool, config] of Object.entries(result)) {
      if (tool !== '*' && !allowed.has(tool)) {
        result[tool] = { ...config, allowed: false };
      }
    }
  } else if (!childTools && revoked.size > 0) {
    result['*'] = { allowed: true };
  }

  for (const tool of revoked) {
    result[tool] = {
      ...(result[tool] ?? {}),
      allowed: false,
    };
  }

  return result;
}

function mergeBudgetPolicy(
  behavioral: BehavioralPolicy | undefined,
  budget: FederatedBudgetCeiling
): BehavioralPolicy {
  return {
    ...(behavioral ?? {}),
    costLimit: mergeCostLimit(behavioral?.costLimit, budget),
    rateLimit: behavioral?.rateLimit ?? {
      requests: Number.MAX_SAFE_INTEGER,
      window: '1d',
    },
  };
}

function mergeCostLimit(
  current: { daily?: number; hourly?: number; monthly?: number } | undefined,
  budget: FederatedBudgetCeiling
): { daily?: number; hourly?: number; monthly?: number } {
  const result = { ...(current ?? {}) };
  const dailyCeiling = minDefined(budget.daily, budget.remaining);

  const daily = minDefined(result.daily, dailyCeiling);
  if (daily !== undefined) {
    result.daily = daily;
  }

  const hourly = minDefined(result.hourly, budget.hourly);
  if (hourly !== undefined) {
    result.hourly = hourly;
  }

  const monthly = minDefined(result.monthly, budget.monthly);
  if (monthly !== undefined) {
    result.monthly = monthly;
  }

  return result;
}

function minDefined(
  left: number | undefined,
  right: number | undefined
): number | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return Math.min(left, right);
}

function mostRestrictiveClassification(
  left: DataClassificationLevel,
  right: DataClassificationLevel
): DataClassificationLevel {
  return classificationRank(left) <= classificationRank(right) ? left : right;
}

function classificationRank(level: DataClassificationLevel): number {
  const ranks: Record<DataClassificationLevel, number> = {
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
  };

  return ranks[level];
}

function sign(signingInput: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(signingInput).digest());
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
