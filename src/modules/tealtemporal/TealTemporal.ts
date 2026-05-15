/**
 * TealTemporal — Session and Time Governance Module
 *
 * Enforces temporal governance controls:
 * - Session TTL: terminate sessions that exceed their time-to-live
 * - Session age warning: emit warnings at configurable threshold before expiry
 * - Cooldown periods: enforce minimum intervals between same action class
 * - Time-of-day restrictions: block actions outside allowed hours/days per timezone
 *
 * Emits reason codes:
 * - SESSION_TTL_EXPIRED
 * - SESSION_AGE_WARNING
 * - COOLDOWN_PERIOD_ACTIVE
 * - TIME_RESTRICTION_VIOLATED
 *
 * @module modules/tealtemporal/TealTemporal
 * @requirements 18.5, 18.6, 18.7, 18.8, 18.9
 */

import type {
  TemporalConfig,
} from '../../core/engine/v1.3/module-types';
import type {
  TealModule,
  ModuleEvaluationRequest,
  ModuleContext,
  ModuleResult,
} from '../../core/engine/v1.2/types';

// ── Constants ────────────────────────────────────────────────────

const MODULE_NAME = 'TealTemporal';
const MODULE_VERSION = '1.3.0';

const REASON_SESSION_EXPIRED = 'SESSION_TTL_EXPIRED';
const REASON_SESSION_WARNING = 'SESSION_AGE_WARNING';
const REASON_COOLDOWN_ACTIVE = 'COOLDOWN_PERIOD_ACTIVE';
const REASON_TIME_RESTRICTED = 'TIME_RESTRICTION_VIOLATED';

const EVENT_TYPE_EXPIRED = 'governance.temporal.session_expired';
const EVENT_TYPE_WARNING = 'governance.temporal.session_warning';
const EVENT_TYPE_COOLDOWN = 'governance.temporal.cooldown_active';
const EVENT_TYPE_TIME_BLOCK = 'governance.temporal.time_restricted';

// ── Default configuration ────────────────────────────────────────

const DEFAULT_CONFIG: TemporalConfig = {
  session_ttl_ms: 3600000, // 1 hour
  cooldown_rules: [],
  time_restrictions: [],
  age_warning_threshold: 80, // warn at 80% of TTL
};

// ── Internal types ───────────────────────────────────────────────

interface SessionRecord {
  agent_id: string;
  started_at: number;
  last_activity: number;
}

interface ActionRecord {
  agent_id: string;
  action_class: string;
  executed_at: number;
}

// ── TealTemporalModule ───────────────────────────────────────────

export class TealTemporalModule implements TealModule {
  readonly name = MODULE_NAME;
  readonly version = MODULE_VERSION;

  private config: TemporalConfig;
  private sessions: Map<string, SessionRecord> = new Map();
  private actionHistory: Map<string, ActionRecord[]> = new Map();
  private events: Array<{ type: string; data: Record<string, unknown> }> = [];

  /** Allows injecting a custom time source for testing. */
  private nowFn: () => number;

  constructor(config?: Partial<TemporalConfig>, nowFn?: () => number) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nowFn = nowFn || (() => Date.now());
  }

  async init(): Promise<void> {
    // No async initialization required
  }

  async destroy(): Promise<void> {
    this.sessions.clear();
    this.actionHistory.clear();
    this.events = [];
  }

  /**
   * Starts or retrieves a session for the given agent.
   */
  startSession(agent_id: string): void {
    if (!this.sessions.has(agent_id)) {
      const now = this.nowFn();
      this.sessions.set(agent_id, {
        agent_id,
        started_at: now,
        last_activity: now,
      });
    }
  }

  /**
   * Checks session status for the given agent.
   * Returns whether the session is expired or in warning state.
   */
  checkSession(agent_id: string): {
    expired: boolean;
    warning: boolean;
    reason_code?: string;
  } {
    const session = this.sessions.get(agent_id);
    if (!session) {
      // No session = treat as expired (agent must start a session first)
      return { expired: true, warning: false, reason_code: REASON_SESSION_EXPIRED };
    }

    const now = this.nowFn();
    const elapsed = now - session.started_at;

    // Check if TTL exceeded
    if (elapsed >= this.config.session_ttl_ms) {
      this.emitEvent(EVENT_TYPE_EXPIRED, {
        agent_id,
        elapsed_ms: elapsed,
        ttl_ms: this.config.session_ttl_ms,
      });
      return { expired: true, warning: false, reason_code: REASON_SESSION_EXPIRED };
    }

    // Check if in warning zone
    const warningThresholdMs =
      (this.config.age_warning_threshold / 100) * this.config.session_ttl_ms;
    if (elapsed >= warningThresholdMs) {
      this.emitEvent(EVENT_TYPE_WARNING, {
        agent_id,
        elapsed_ms: elapsed,
        ttl_ms: this.config.session_ttl_ms,
        threshold_percent: this.config.age_warning_threshold,
      });
      return { expired: false, warning: true, reason_code: REASON_SESSION_WARNING };
    }

    // Update last activity
    session.last_activity = now;
    return { expired: false, warning: false };
  }

  /**
   * Checks cooldown status for the given agent and action class.
   * Returns whether the action is blocked and remaining cooldown time.
   */
  checkCooldown(
    agent_id: string,
    action_class: string,
  ): { blocked: boolean; remaining_ms: number; reason_code?: string } {
    const rule = this.config.cooldown_rules.find(
      (r) => r.action_class === action_class,
    );

    // No cooldown rule for this action class
    if (!rule) {
      return { blocked: false, remaining_ms: 0 };
    }

    const key = `${agent_id}::${action_class}`;
    const history = this.actionHistory.get(key) || [];
    const now = this.nowFn();

    // Find the most recent execution of this action class
    const lastExecution = history.length > 0 ? history[history.length - 1] : null;

    if (!lastExecution) {
      return { blocked: false, remaining_ms: 0 };
    }

    const elapsed = now - lastExecution.executed_at;
    const remaining = rule.min_interval_ms - elapsed;

    if (remaining > 0) {
      this.emitEvent(EVENT_TYPE_COOLDOWN, {
        agent_id,
        action_class,
        remaining_ms: remaining,
        min_interval_ms: rule.min_interval_ms,
      });
      return { blocked: true, remaining_ms: remaining, reason_code: REASON_COOLDOWN_ACTIVE };
    }

    return { blocked: false, remaining_ms: 0 };
  }

  /**
   * Records an action execution for cooldown tracking.
   */
  recordAction(agent_id: string, action_class: string): void {
    const key = `${agent_id}::${action_class}`;
    const history = this.actionHistory.get(key) || [];
    history.push({
      agent_id,
      action_class,
      executed_at: this.nowFn(),
    });
    this.actionHistory.set(key, history);
  }

  /**
   * Checks time-of-day restrictions for the given action class.
   * Returns whether the action is blocked based on current time.
   */
  checkTimeRestriction(action_class: string): {
    blocked: boolean;
    reason_code?: string;
  } {
    const restriction = this.config.time_restrictions.find(
      (r) => r.action_class === action_class,
    );

    // No time restriction for this action class
    if (!restriction) {
      return { blocked: false };
    }

    const now = this.getNowInTimezone(restriction.timezone);
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0=Sun, 6=Sat

    // Check day restriction
    if (!restriction.allowed_days.includes(currentDay)) {
      this.emitEvent(EVENT_TYPE_TIME_BLOCK, {
        action_class,
        current_day: currentDay,
        allowed_days: restriction.allowed_days,
        timezone: restriction.timezone,
      });
      return { blocked: true, reason_code: REASON_TIME_RESTRICTED };
    }

    // Check hour restriction
    const { start, end } = restriction.allowed_hours;
    let withinHours: boolean;

    if (start <= end) {
      // Normal range (e.g., 9-17)
      withinHours = currentHour >= start && currentHour < end;
    } else {
      // Overnight range (e.g., 22-6)
      withinHours = currentHour >= start || currentHour < end;
    }

    if (!withinHours) {
      this.emitEvent(EVENT_TYPE_TIME_BLOCK, {
        action_class,
        current_hour: currentHour,
        allowed_hours: restriction.allowed_hours,
        timezone: restriction.timezone,
      });
      return { blocked: true, reason_code: REASON_TIME_RESTRICTED };
    }

    return { blocked: false };
  }

  /**
   * Gets emitted events (for testing and integration).
   */
  getEvents(): Array<{ type: string; data: Record<string, unknown> }> {
    return [...this.events];
  }

  /**
   * Gets session info for an agent.
   */
  getSession(agent_id: string): SessionRecord | undefined {
    return this.sessions.get(agent_id);
  }

  /**
   * Ends a session for the given agent.
   */
  endSession(agent_id: string): void {
    this.sessions.delete(agent_id);
  }

  /**
   * TealModule evaluate interface.
   */
  async evaluate(
    request: ModuleEvaluationRequest,
    ctx: ModuleContext,
  ): Promise<ModuleResult> {
    const agent_id = ctx.agent_id || 'unknown';
    const action_class = (request['action_class'] as string) || '';

    // Ensure session exists
    this.startSession(agent_id);

    // Check session TTL
    const sessionResult = this.checkSession(agent_id);
    if (sessionResult.expired) {
      return {
        action: 'DENY' as any,
        reason_codes: [REASON_SESSION_EXPIRED],
        event_type: EVENT_TYPE_EXPIRED,
        metadata: { agent_id },
      };
    }

    // Check cooldown
    if (action_class) {
      const cooldownResult = this.checkCooldown(agent_id, action_class);
      if (cooldownResult.blocked) {
        return {
          action: 'DENY' as any,
          reason_codes: [REASON_COOLDOWN_ACTIVE],
          event_type: EVENT_TYPE_COOLDOWN,
          metadata: {
            agent_id,
            action_class,
            remaining_ms: cooldownResult.remaining_ms,
          },
        };
      }

      // Check time restriction
      const timeResult = this.checkTimeRestriction(action_class);
      if (timeResult.blocked) {
        return {
          action: 'DENY' as any,
          reason_codes: [REASON_TIME_RESTRICTED],
          event_type: EVENT_TYPE_TIME_BLOCK,
          metadata: { agent_id, action_class },
        };
      }

      // Record action for cooldown tracking
      this.recordAction(agent_id, action_class);
    }

    // Build result with optional warning
    const reason_codes: string[] = [];
    if (sessionResult.warning) {
      reason_codes.push(REASON_SESSION_WARNING);
    }

    return {
      action: 'ALLOW' as any,
      reason_codes,
      event_type: sessionResult.warning ? EVENT_TYPE_WARNING : 'governance.temporal.allowed',
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private getNowInTimezone(timezone: string): Date {
    try {
      // Use Intl to get current time in the specified timezone
      const now = new Date(this.nowFn());
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find((p) => p.type === 'hour');
      const dayPart = parts.find((p) => p.type === 'weekday');

      // Create a date object representing the time in the target timezone
      const result = new Date(now);
      if (hourPart) {
        const hour = parseInt(hourPart.value, 10);
        result.setHours(hour);
      }
      // Map weekday name to day number
      if (dayPart) {
        const dayMap: Record<string, number> = {
          Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
        };
        const dayNum = dayMap[dayPart.value];
        if (dayNum !== undefined) {
          // Adjust the date to match the day in the target timezone
          const diff = dayNum - result.getDay();
          result.setDate(result.getDate() + diff);
        }
      }
      return result;
    } catch {
      // Fallback to local time if timezone is invalid
      return new Date(this.nowFn());
    }
  }

  private emitEvent(type: string, data: Record<string, unknown>): void {
    this.events.push({ type, data });
  }
}
