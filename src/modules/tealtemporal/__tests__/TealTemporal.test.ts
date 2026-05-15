/**
 * TealTemporal Module — Unit Tests
 *
 * Tests session and time governance including:
 * - Session TTL enforcement and expiry
 * - Session age warning emission
 * - Cooldown period enforcement between actions
 * - Time-of-day restriction blocking
 *
 * @requirements 18.5, 18.6, 18.7, 18.8, 18.9
 */

import { TealTemporalModule } from '../TealTemporal';

describe('TealTemporalModule', () => {
  let currentTime: number;
  let module: TealTemporalModule;

  beforeEach(() => {
    currentTime = 1000000; // Start at a fixed time
    module = new TealTemporalModule(
      {
        session_ttl_ms: 60000, // 1 minute
        cooldown_rules: [
          { action_class: 'DEPLOY', min_interval_ms: 30000 }, // 30s cooldown
          { action_class: 'DATABASE_WRITE', min_interval_ms: 5000 }, // 5s cooldown
        ],
        time_restrictions: [],
        age_warning_threshold: 80, // warn at 80%
      },
      () => currentTime,
    );
  });

  describe('constructor and initialization', () => {
    it('should create with default config', () => {
      const defaultModule = new TealTemporalModule();
      expect(defaultModule.name).toBe('TealTemporal');
      expect(defaultModule.version).toBe('1.3.0');
    });

    it('should accept partial config overrides', () => {
      const customModule = new TealTemporalModule({ session_ttl_ms: 120000 });
      expect(customModule.name).toBe('TealTemporal');
    });
  });

  describe('session TTL enforcement', () => {
    it('should allow session within TTL', () => {
      module.startSession('agent-1');
      // Advance time by 30s (within 60s TTL)
      currentTime += 30000;

      const result = module.checkSession('agent-1');
      expect(result.expired).toBe(false);
      expect(result.warning).toBe(false);
    });

    it('should expire session after TTL', () => {
      module.startSession('agent-1');
      // Advance time past TTL
      currentTime += 60000;

      const result = module.checkSession('agent-1');
      expect(result.expired).toBe(true);
      expect(result.reason_code).toBe('SESSION_TTL_EXPIRED');
    });

    it('should emit SESSION_TTL_EXPIRED event on expiry', () => {
      module.startSession('agent-1');
      currentTime += 60000;

      module.checkSession('agent-1');

      const events = module.getEvents();
      expect(events.some((e) => e.type === 'governance.temporal.session_expired')).toBe(true);
    });

    it('should treat missing session as expired', () => {
      const result = module.checkSession('nonexistent-agent');
      expect(result.expired).toBe(true);
      expect(result.reason_code).toBe('SESSION_TTL_EXPIRED');
    });
  });

  describe('session age warning', () => {
    it('should emit warning at configured threshold', () => {
      module.startSession('agent-1');
      // Advance to 80% of TTL (48s of 60s)
      currentTime += 48000;

      const result = module.checkSession('agent-1');
      expect(result.expired).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.reason_code).toBe('SESSION_AGE_WARNING');
    });

    it('should not emit warning before threshold', () => {
      module.startSession('agent-1');
      // Advance to 50% of TTL (30s of 60s)
      currentTime += 30000;

      const result = module.checkSession('agent-1');
      expect(result.expired).toBe(false);
      expect(result.warning).toBe(false);
    });

    it('should emit SESSION_AGE_WARNING event', () => {
      module.startSession('agent-1');
      currentTime += 48000;

      module.checkSession('agent-1');

      const events = module.getEvents();
      expect(events.some((e) => e.type === 'governance.temporal.session_warning')).toBe(true);
    });
  });

  describe('cooldown enforcement', () => {
    it('should not block first action (no history)', () => {
      const result = module.checkCooldown('agent-1', 'DEPLOY');
      expect(result.blocked).toBe(false);
      expect(result.remaining_ms).toBe(0);
    });

    it('should block action within cooldown period', () => {
      module.recordAction('agent-1', 'DEPLOY');
      // Advance 10s (within 30s cooldown)
      currentTime += 10000;

      const result = module.checkCooldown('agent-1', 'DEPLOY');
      expect(result.blocked).toBe(true);
      expect(result.remaining_ms).toBe(20000); // 30s - 10s = 20s remaining
      expect(result.reason_code).toBe('COOLDOWN_PERIOD_ACTIVE');
    });

    it('should allow action after cooldown period expires', () => {
      module.recordAction('agent-1', 'DEPLOY');
      // Advance past cooldown
      currentTime += 31000;

      const result = module.checkCooldown('agent-1', 'DEPLOY');
      expect(result.blocked).toBe(false);
      expect(result.remaining_ms).toBe(0);
    });

    it('should not block actions without cooldown rules', () => {
      module.recordAction('agent-1', 'READ');
      currentTime += 100;

      const result = module.checkCooldown('agent-1', 'READ');
      expect(result.blocked).toBe(false);
    });

    it('should track cooldowns independently per agent', () => {
      module.recordAction('agent-1', 'DEPLOY');
      currentTime += 10000;

      // agent-1 should be blocked
      expect(module.checkCooldown('agent-1', 'DEPLOY').blocked).toBe(true);
      // agent-2 should not be blocked (no history)
      expect(module.checkCooldown('agent-2', 'DEPLOY').blocked).toBe(false);
    });

    it('should track cooldowns independently per action class', () => {
      module.recordAction('agent-1', 'DEPLOY');
      currentTime += 10000;

      // DEPLOY should be blocked
      expect(module.checkCooldown('agent-1', 'DEPLOY').blocked).toBe(true);
      // DATABASE_WRITE should not be blocked (different action, no history)
      expect(module.checkCooldown('agent-1', 'DATABASE_WRITE').blocked).toBe(false);
    });

    it('should emit cooldown event when blocked', () => {
      module.recordAction('agent-1', 'DEPLOY');
      currentTime += 10000;

      module.checkCooldown('agent-1', 'DEPLOY');

      const events = module.getEvents();
      expect(events.some((e) => e.type === 'governance.temporal.cooldown_active')).toBe(true);
    });
  });

  describe('time-of-day restrictions', () => {
    let timeModule: TealTemporalModule;

    beforeEach(() => {
      // Create a module with time restrictions
      // Use a fixed time that we can control
      const fixedDate = new Date('2026-03-15T14:30:00Z'); // Sunday 14:30 UTC
      currentTime = fixedDate.getTime();

      timeModule = new TealTemporalModule(
        {
          session_ttl_ms: 3600000,
          cooldown_rules: [],
          time_restrictions: [
            {
              action_class: 'PRODUCTION_DEPLOY',
              allowed_hours: { start: 9, end: 17 }, // 9am-5pm
              timezone: 'UTC',
              allowed_days: [1, 2, 3, 4, 5], // Mon-Fri only
            },
          ],
          age_warning_threshold: 80,
        },
        () => currentTime,
      );
    });

    it('should block actions on restricted days', () => {
      // 2026-03-15 is a Sunday (day 0), not in allowed_days [1-5]
      const result = timeModule.checkTimeRestriction('PRODUCTION_DEPLOY');
      expect(result.blocked).toBe(true);
      expect(result.reason_code).toBe('TIME_RESTRICTION_VIOLATED');
    });

    it('should not block actions without restrictions', () => {
      const result = timeModule.checkTimeRestriction('READ');
      expect(result.blocked).toBe(false);
    });

    it('should emit time restriction event when blocked', () => {
      timeModule.checkTimeRestriction('PRODUCTION_DEPLOY');
      const events = timeModule.getEvents();
      expect(events.some((e) => e.type === 'governance.temporal.time_restricted')).toBe(true);
    });
  });

  describe('session management', () => {
    it('should start a new session', () => {
      module.startSession('agent-1');
      const session = module.getSession('agent-1');
      expect(session).toBeDefined();
      expect(session!.agent_id).toBe('agent-1');
      expect(session!.started_at).toBe(currentTime);
    });

    it('should not overwrite existing session', () => {
      module.startSession('agent-1');
      const originalStart = module.getSession('agent-1')!.started_at;

      currentTime += 5000;
      module.startSession('agent-1'); // Should not reset

      expect(module.getSession('agent-1')!.started_at).toBe(originalStart);
    });

    it('should end a session', () => {
      module.startSession('agent-1');
      module.endSession('agent-1');
      expect(module.getSession('agent-1')).toBeUndefined();
    });
  });

  describe('evaluate (TealModule interface)', () => {
    it('should return ALLOW for valid session without restrictions', async () => {
      module.startSession('agent-1');

      const result = await module.evaluate(
        { action_class: 'READ' },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: currentTime,
          agent_id: 'agent-1',
        },
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toHaveLength(0);
    });

    it('should return DENY when session expired', async () => {
      module.startSession('agent-1');
      currentTime += 60000; // Past TTL

      const result = await module.evaluate(
        { action_class: 'READ' },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: currentTime,
          agent_id: 'agent-1',
        },
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('SESSION_TTL_EXPIRED');
    });

    it('should return DENY when cooldown active', async () => {
      module.startSession('agent-1');
      module.recordAction('agent-1', 'DEPLOY');
      currentTime += 10000; // Within 30s cooldown

      const result = await module.evaluate(
        { action_class: 'DEPLOY' },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: currentTime,
          agent_id: 'agent-1',
        },
      );

      expect(result.action).toBe('DENY');
      expect(result.reason_codes).toContain('COOLDOWN_PERIOD_ACTIVE');
    });

    it('should include SESSION_AGE_WARNING in reason codes when in warning zone', async () => {
      module.startSession('agent-1');
      currentTime += 48000; // 80% of 60s TTL

      const result = await module.evaluate(
        { content: 'test' },
        {
          correlation_id: 'test-123',
          policy_version: '1.0.0',
          teec_version: '2.0.0',
          timestamp: currentTime,
          agent_id: 'agent-1',
        },
      );

      expect(result.action).toBe('ALLOW');
      expect(result.reason_codes).toContain('SESSION_AGE_WARNING');
    });
  });

  describe('destroy', () => {
    it('should clear all sessions and history', async () => {
      module.startSession('agent-1');
      module.recordAction('agent-1', 'DEPLOY');

      await module.destroy();

      expect(module.getSession('agent-1')).toBeUndefined();
      expect(module.getEvents()).toHaveLength(0);
    });
  });
});
