/**
 * TealSecrets Module — Unit Tests
 *
 * Covers: detection, confidence scoring, cache, custom patterns,
 * credential TTL, performance budget, and finding completeness.
 */

import { TealSecrets } from '../TealSecrets';
import { ConfidenceScorer } from '../ConfidenceScorer';
import { DetectionCache } from '../DetectionCache';
import { CredentialTTLChecker } from '../CredentialTTL';
import { builtInDetectors } from '../detectors';
import type { ModuleContext } from '../../core/engine/v1.2/types';

const makeCtx = (): ModuleContext => ({
  correlation_id: 'test-corr-001',
  policy_version: '1.0.0',
  teec_version: '0.1.0',
  timestamp: Date.now(),
});

const fixture = (...parts: string[]): string => parts.join('');

// ── Detection of known patterns ──────────────────────────────────

describe('TealSecrets — Detection Engine', () => {
  let secrets: TealSecrets;

  beforeEach(() => {
    secrets = new TealSecrets();
  });

  test('detects AWS Access Key ID (AKIA prefix)', () => {
    const content = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE';
    const findings = secrets.scan(content);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const awsFinding = findings.find((f) => f.type === 'aws-access-key-id');
    expect(awsFinding).toBeDefined();
    expect(awsFinding!.category).toBe('cloud');
  });

  test('detects GitHub Personal Access Token (ghp_ prefix)', () => {
    const content = 'token = ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const findings = secrets.scan(content);
    const ghFinding = findings.find((f) => f.type === 'github-pat');
    expect(ghFinding).toBeDefined();
    expect(ghFinding!.category).toBe('vcs');
  });

  test('detects Stripe Secret Key (sk_live_ prefix)', () => {
    const content = 'STRIPE_SECRET_KEY=sk_live_FAKEKEYFORTESTINGONLY00ab';
    const findings = secrets.scan(content);
    const stripeFinding = findings.find((f) => f.type === 'stripe-secret-key');
    expect(stripeFinding).toBeDefined();
    expect(stripeFinding!.category).toBe('payments');
  });

  test.each([
    ['stripe-secret-key', fixture('sk_live_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'), 'CRITICAL'],
    ['stripe-publishable-key', fixture('pk_live_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'), 'CRITICAL'],
    ['stripe-test-secret', fixture('sk_test_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'), 'LOW'],
    ['stripe-test-publishable-key', fixture('pk_test_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'), 'LOW'],
  ])('detects %s with configured Stripe severity', (type, key, severity) => {
    const findings = secrets.scan(`STRIPE_KEY=${key}`);
    const finding = findings.find((f) => f.type === type);
    const detector = builtInDetectors.find((d) => d.id === type);

    expect(detector).toBeDefined();
    expect(detector!.category).toBe('payments');
    expect(detector!.severity).toBe(severity);
    expect(finding).toBeDefined();
    expect(finding!.category).toBe('payments');
    expect(finding!.severity).toBe(severity);
  });

  test('detects RSA Private Key', () => {
    const content = 'private_key = -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
    const findings = secrets.scan(content);
    const rsaFinding = findings.find((f) => f.type === 'rsa-private-key');
    expect(rsaFinding).toBeDefined();
    expect(rsaFinding!.category).toBe('generic_key');
  });

  test('detects PostgreSQL connection string', () => {
    const content = 'DATABASE_URL=postgresql://user:pass123@localhost:5432/mydb';
    const findings = secrets.scan(content);
    const pgFinding = findings.find((f) => f.type === 'postgres-connection-string');
    expect(pgFinding).toBeDefined();
    expect(pgFinding!.category).toBe('database');
  });

  test.each([
    [
      'slack-bot-token',
      fixture('SLACK_BOT_TOKEN=xox', 'b-123456789012-123456789012-', 'AbCdEfGhIjKlMnOpQrStUvWx'),
    ],
    [
      'slack-user-token',
      fixture('SLACK_USER_TOKEN=xox', 'p-123456789012-123456789012-', 'AbCdEfGhIjKlMnOpQrStUvWxYz'),
    ],
    [
      'slack-webhook',
      fixture('SLACK_WEBHOOK_URL=https://hooks.slack.com/services/', 'T12345678/B12345678/', 'abcdefghijklmnopqrstuvwx'),
    ],
    [
      'twilio-account-sid',
      fixture('TWILIO_ACCOUNT_SID=A', 'C0123456789abcdef0123456789abcdef'),
    ],
    [
      'twilio-auth-token',
      fixture('TWILIO_AUTH_TOKEN=0123456789abcdef', '0123456789abcdef'),
    ],
    [
      'sendgrid-api-key',
      fixture('SENDGRID_API_KEY=S', 'G.abcdefghijklmnopqrstuv.', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'),
    ],
    [
      'mailgun-api-key',
      fixture('MAILGUN_API_KEY=key-', '0123456789abcdef0123456789abcdef'),
    ],
    [
      'datadog-api-key',
      fixture('DATADOG_API_KEY=0123456789abcdef', '0123456789abcdef'),
    ],
    [
      'pagerduty-api-key',
      fixture('PAGERDUTY_API_KEY=pdAbCdEf', 'GhIjKlMnOpQr'),
    ],
    [
      'sentry-dsn',
      fixture('SENTRY_DSN=https://0123456789abcdef', '0123456789abcdef@o123456.ingest.sentry.io/1234567'),
    ],
  ])('detects %s with SaaS category and confidence score', (type, content) => {
    const findings = secrets.scan(content);
    const finding = findings.find((f) => f.type === type);
    const detector = builtInDetectors.find((d) => d.id === type);

    expect(detector).toBeDefined();
    expect(detector!.regex).toBeInstanceOf(RegExp);
    expect(detector!.description.length).toBeGreaterThan(0);
    expect(detector!.category).toBe('saas');
    expect(finding).toBeDefined();
    expect(finding!.category).toBe('saas');
    expect(finding!.confidence).toBeGreaterThanOrEqual(0);
    expect(finding!.confidence).toBeLessThanOrEqual(1);
  });

  test('does not detect similar-looking SendGrid strings', () => {
    const content = [
      fixture('SENDGRID_API_KEY=S', 'G.abcdefghijklmnopqrstu.', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'),
      fixture('SENDGRID_API_KEY=S', 'G.abcdefghijklmnopqrstuv_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'),
      fixture('SENDGRID_API_KEY=S', 'G.abcdefghijklmnopqrstuv.', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop'),
    ].join('\n');

    const findings = secrets.scan(content);
    expect(findings.find((f) => f.type === 'sendgrid-api-key')).toBeUndefined();
  });

  test('does not report common SaaS words as secret tokens', () => {
    const content = [
      'Rotate the Slack bot and user tokens through the admin console.',
      'Document Twilio account setup, SendGrid email delivery, and Mailgun routing.',
      'Review Datadog dashboards, PagerDuty schedules, and the Sentry project DSN docs.',
    ].join(' ');

    const findings = secrets.scan(content);
    const issue48Types = new Set([
      'slack-bot-token',
      'slack-user-token',
      'slack-webhook',
      'twilio-account-sid',
      'twilio-auth-token',
      'sendgrid-api-key',
      'mailgun-api-key',
      'datadog-api-key',
      'pagerduty-api-key',
      'sentry-dsn',
    ]);

    expect(findings.filter((f) => issue48Types.has(f.type))).toHaveLength(0);
  });

  test('returns empty findings for clean content', () => {
    const content = 'This is a normal text with no secrets at all.';
    const findings = secrets.scan(content);
    expect(findings.length).toBe(0);
  });

  test('has 250+ built-in detector patterns across 8 categories', () => {
    expect(builtInDetectors.length).toBeGreaterThanOrEqual(250);
    // Verify all 8 non-custom categories are represented
    const categories = new Set(builtInDetectors.map((d) => d.category));
    expect(categories.has('cloud')).toBe(true);
    expect(categories.has('vcs')).toBe(true);
    expect(categories.has('ai_provider')).toBe(true);
    expect(categories.has('database')).toBe(true);
    expect(categories.has('payments')).toBe(true);
    expect(categories.has('saas')).toBe(true);
    expect(categories.has('infrastructure')).toBe(true);
    expect(categories.has('generic_key')).toBe(true);
  });

  test('getDetectorCount includes built-in detectors', () => {
    expect(secrets.getDetectorCount()).toBeGreaterThanOrEqual(250);
  });
});

// ── Confidence Scoring Determinism ───────────────────────────────

describe('TealSecrets — Confidence Scorer', () => {
  const scorer = new ConfidenceScorer();

  test('identical inputs produce identical scores (determinism)', () => {
    const match = 'AKIAIOSFODNN7EXAMPLE';
    const context = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE';
    const patternId = 'aws-access-key-id';

    const result1 = scorer.score(match, context, patternId);
    const result2 = scorer.score(match, context, patternId);

    expect(result1.confidence).toBe(result2.confidence);
    expect(result1.signals.entropy_score).toBe(result2.signals.entropy_score);
    expect(result1.signals.structural_match).toBe(result2.signals.structural_match);
    expect(result1.signals.context_proximity).toBe(result2.signals.context_proximity);
    expect(result1.signals.fp_risk).toBe(result2.signals.fp_risk);
    expect(result1.severity).toBe(result2.severity);
  });

  test('confidence is in [0, 1]', () => {
    const result = scorer.score('AKIAIOSFODNN7EXAMPLE', 'api_key = AKIAIOSFODNN7EXAMPLE', 'aws');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('all sub-signals are in [0, 1]', () => {
    const result = scorer.score('sk_live_FAKEKEYFORTESTINGONLY00', 'stripe secret key', 'stripe');
    expect(result.signals.entropy_score).toBeGreaterThanOrEqual(0);
    expect(result.signals.entropy_score).toBeLessThanOrEqual(1);
    expect(result.signals.structural_match).toBeGreaterThanOrEqual(0);
    expect(result.signals.structural_match).toBeLessThanOrEqual(1);
    expect(result.signals.context_proximity).toBeGreaterThanOrEqual(0);
    expect(result.signals.context_proximity).toBeLessThanOrEqual(1);
    expect(result.signals.fp_risk).toBeGreaterThanOrEqual(0);
    expect(result.signals.fp_risk).toBeLessThanOrEqual(1);
  });

  test('known prefix gets high structural match', () => {
    const result = scorer.score('AKIAIOSFODNN7EXAMPLE', '', 'aws');
    expect(result.signals.structural_match).toBe(1.0);
  });

  test('context keywords increase context proximity', () => {
    const result = scorer.score('sometoken123', 'api_key = sometoken123 secret auth', 'generic');
    expect(result.signals.context_proximity).toBeGreaterThan(0);
  });

  test('test/example content increases FP risk', () => {
    const result = scorer.score('AKIAIOSFODNN7EXAMPLE', 'this is a test example', 'aws');
    expect(result.signals.fp_risk).toBeGreaterThan(0);
  });

  test('severity mapping: HIGH or CRITICAL for known prefix with context', () => {
    // High entropy + known prefix + context keywords + no FP
    const result = scorer.score('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij', 'token = ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij secret auth credential', 'github-pat');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(['CRITICAL', 'HIGH']).toContain(result.severity);
  });
});

// ── Cache Hit/Miss Behavior ──────────────────────────────────────

describe('TealSecrets — Detection Cache', () => {
  test('cache miss on first scan, hit on second', () => {
    const cache = new DetectionCache();
    const content = 'test content';

    expect(cache.get(content)).toBeNull();
    expect(cache.getStats().misses).toBe(1);

    cache.set(content, []);
    const result = cache.get(content);
    expect(result).toEqual([]);
    expect(cache.getStats().hits).toBe(1);
  });

  test('cache invalidation clears all entries', () => {
    const cache = new DetectionCache();
    cache.set('content1', []);
    cache.set('content2', []);
    expect(cache.getStats().size).toBe(2);

    cache.invalidate();
    expect(cache.getStats().size).toBe(0);
    expect(cache.get('content1')).toBeNull();
  });

  test('LRU eviction when max entries exceeded', () => {
    const cache = new DetectionCache({ enabled: true, maxEntries: 2, ttlMs: 60000 });
    cache.set('a', []);
    cache.set('b', []);
    cache.set('c', []); // should evict 'a'

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  test('disabled cache always returns null', () => {
    const cache = new DetectionCache({ enabled: false, maxEntries: 100, ttlMs: 60000 });
    cache.set('content', []);
    expect(cache.get('content')).toBeNull();
  });

  test('TealSecrets uses cache for repeated scans', () => {
    const secrets = new TealSecrets();
    const content = 'AKIAIOSFODNN7EXAMPLE aws_access_key_id';

    secrets.scan(content);
    const stats1 = secrets.getCacheStats();
    expect(stats1.misses).toBe(1);

    secrets.scan(content);
    const stats2 = secrets.getCacheStats();
    expect(stats2.hits).toBe(1);
  });
});

// ── Custom Pattern Registration ──────────────────────────────────

describe('TealSecrets — Custom Pattern Registration', () => {
  test('registered pattern is detected in subsequent scans', () => {
    const secrets = new TealSecrets();
    const customContent = 'MYAPP-SECRET-abc123def456';

    // Before registration: no match
    const before = secrets.scan(customContent);
    const customBefore = before.find((f) => f.type === 'custom-myapp-secret');
    expect(customBefore).toBeUndefined();

    // Register custom pattern
    secrets.registerPattern({
      id: 'custom-myapp-secret',
      regex: /MYAPP-SECRET-[a-z0-9]{12}/,
      category: 'custom',
      severity: 'HIGH',
      description: 'MyApp Secret Token',
    });

    // After registration: match found
    const after = secrets.scan(customContent);
    const customAfter = after.find((f) => f.type === 'custom-myapp-secret');
    expect(customAfter).toBeDefined();
    expect(customAfter!.category).toBe('custom');
  });

  test('cache is invalidated on pattern registration', () => {
    const secrets = new TealSecrets();
    const content = 'MYAPP-SECRET-abc123def456';

    secrets.scan(content); // populate cache
    expect(secrets.getCacheStats().size).toBeGreaterThanOrEqual(1);

    secrets.registerPattern({
      id: 'custom-myapp-secret',
      regex: /MYAPP-SECRET-[a-z0-9]{12}/,
      category: 'custom',
      severity: 'HIGH',
      description: 'MyApp Secret Token',
    });

    expect(secrets.getCacheStats().size).toBe(0);
  });
});

// ── Credential TTL Enforcement ───────────────────────────────────

describe('TealSecrets — Credential TTL', () => {
  const checker = new CredentialTTLChecker();

  test('age > max_ttl → DENY + CREDENTIAL_TTL_EXCEEDED', () => {
    const result = checker.check({
      type: 'aws_access_key',
      age_ms: 100_000,
      policy_max_ttl_ms: 50_000,
    });
    expect(result.action).toBe('DENY');
    expect(result.reason_code).toBe('CREDENTIAL_TTL_EXCEEDED');
  });

  test('age within 80% of max → REQUIRE_APPROVAL + CREDENTIAL_ROTATION_REQUIRED', () => {
    const result = checker.check({
      type: 'github_pat',
      age_ms: 85_000,
      policy_max_ttl_ms: 100_000,
    });
    expect(result.action).toBe('REQUIRE_APPROVAL');
    expect(result.reason_code).toBe('CREDENTIAL_ROTATION_REQUIRED');
  });

  test('age well below max → ALLOW', () => {
    const result = checker.check({
      type: 'stripe_key',
      age_ms: 10_000,
      policy_max_ttl_ms: 100_000,
    });
    expect(result.action).toBe('ALLOW');
    expect(result.reason_code).toBe('POLICY_COMPLIANT');
  });

  test('TealSecrets.checkCredentialTTL delegates correctly', () => {
    const secrets = new TealSecrets();
    const result = secrets.checkCredentialTTL({
      type: 'api_key',
      age_ms: 200_000,
      policy_max_ttl_ms: 100_000,
    });
    expect(result.action).toBe('DENY');
    expect(result.reason_code).toBe('CREDENTIAL_TTL_EXCEEDED');
    // Metadata should not contain raw credential values
    expect(result.metadata.type).toBe('api_key');
    expect(result.metadata.age_ms).toBe(200_000);
  });
});

// ── Policy Enforcement ───────────────────────────────────────────

describe('TealSecrets — Policy Enforcement', () => {
  test('evaluate returns DENY when secret detected above threshold', async () => {
    const secrets = new TealSecrets();
    const ctx = makeCtx();
    const policy = {
      enabled: true,
      action: 'DENY',
      confidence_threshold: 0.1, // low threshold to ensure enforcement
      perfBudgetMs: 5000,
    };

    const result = await secrets.evaluate(
      { content: 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE' },
      ctx,
      policy,
    );

    expect(result.action).toBe('DENY');
    expect(result.reason_codes).toContain('SECRET_DETECTED');
  });

  test('evaluate returns ALLOW when no secrets found', async () => {
    const secrets = new TealSecrets();
    const ctx = makeCtx();
    const policy = {
      enabled: true,
      action: 'DENY',
      confidence_threshold: 0.5,
    };

    const result = await secrets.evaluate(
      { content: 'This is clean content with no secrets.' },
      ctx,
      policy,
    );

    expect(result.action).toBe('ALLOW');
    expect(result.reason_codes.length).toBe(0);
  });

  test('evaluate returns ALLOW for empty content', async () => {
    const secrets = new TealSecrets();
    const ctx = makeCtx();
    const result = await secrets.evaluate({ content: '' }, ctx, {});
    expect(result.action).toBe('ALLOW');
  });

  test('evaluate maps REDACT action correctly', async () => {
    const secrets = new TealSecrets();
    const ctx = makeCtx();
    const policy = {
      enabled: true,
      action: 'REDACT',
      confidence_threshold: 0.1,
      perfBudgetMs: 5000,
    };

    const result = await secrets.evaluate(
      { content: 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE' },
      ctx,
      policy,
    );

    expect(result.action).toBe('REDACT');
  });

  test('evaluate maps REQUIRE_APPROVAL action correctly', async () => {
    const secrets = new TealSecrets();
    const ctx = makeCtx();
    const policy = {
      enabled: true,
      action: 'REQUIRE_APPROVAL',
      confidence_threshold: 0.1,
      perfBudgetMs: 5000,
    };

    const result = await secrets.evaluate(
      { content: '-----BEGIN RSA PRIVATE KEY-----' },
      ctx,
      policy,
    );

    expect(result.action).toBe('REQUIRE_APPROVAL');
  });
});

// ── Finding Completeness ─────────────────────────────────────────

describe('TealSecrets — Finding Completeness', () => {
  test('every finding has all required fields', () => {
    const secrets = new TealSecrets();
    const content = [
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
      'sk_live_FAKEKEYFORTESTINGONLY00',
      '-----BEGIN RSA PRIVATE KEY-----',
    ].join('\n');

    const findings = secrets.scan(content);
    expect(findings.length).toBeGreaterThan(0);

    for (const f of findings) {
      expect(f.finding_id).toBeTruthy();
      expect(typeof f.finding_id).toBe('string');
      expect(f.type).toBeTruthy();
      expect(typeof f.type).toBe('string');
      expect(f.category).toBeTruthy();
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).toContain(f.severity);
      expect(f.fingerprint).toBeTruthy();
      expect(typeof f.fingerprint).toBe('string');
      expect(f.evidence_signals).toBeDefined();
      expect(f.evidence_signals.entropy_score).toBeGreaterThanOrEqual(0);
      expect(f.evidence_signals.entropy_score).toBeLessThanOrEqual(1);
      expect(f.evidence_signals.structural_match).toBeGreaterThanOrEqual(0);
      expect(f.evidence_signals.structural_match).toBeLessThanOrEqual(1);
      expect(f.evidence_signals.context_proximity).toBeGreaterThanOrEqual(0);
      expect(f.evidence_signals.context_proximity).toBeLessThanOrEqual(1);
      expect(f.evidence_signals.fp_risk).toBeGreaterThanOrEqual(0);
      expect(f.evidence_signals.fp_risk).toBeLessThanOrEqual(1);
      expect(f.location).toBeDefined();
      expect(f.location.offset).toBeGreaterThanOrEqual(0);
      expect(f.location.length).toBeGreaterThan(0);
      expect(f.location.line).toBeGreaterThanOrEqual(1);
      expect(f.location.column).toBeGreaterThanOrEqual(1);
    }
  });

  test('finding_id is deterministic (same input = same ID)', () => {
    const secrets = new TealSecrets();
    const content = 'AKIAIOSFODNN7EXAMPLE';

    const findings1 = secrets.scan(content);
    // Clear cache to force re-scan
    secrets.registerPattern({
      id: 'dummy-clear-cache',
      regex: /NEVER_MATCH_THIS_12345/,
      category: 'custom',
      severity: 'LOW',
      description: 'dummy',
    });
    const findings2 = secrets.scan(content);

    const f1 = findings1.find((f) => f.type === 'aws-access-key-id');
    const f2 = findings2.find((f) => f.type === 'aws-access-key-id');
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    expect(f1!.finding_id).toBe(f2!.finding_id);
    expect(f1!.fingerprint).toBe(f2!.fingerprint);
  });
});
