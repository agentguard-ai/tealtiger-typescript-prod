/**
 * TealMonitor - Behavioral Monitoring and Anomaly Detection
 * 
 * Real-time monitoring of agent behavior with anomaly detection capabilities.
 * Tracks costs, tool usage, request patterns, and detects unusual behavior.
 * 
 * Part of TealTiger v1.1.0 - Zero Infrastructure AI Security
 */

/**
 * Monitoring Event
 * Represents a single event to be tracked
 */
export interface MonitoringEvent {
  /** Agent identifier */
  agentId: string;
  /** Event type */
  type: 'request' | 'tool_use' | 'cost' | 'error' | 'custom';
  /** Event timestamp */
  timestamp: Date;
  /** Request details (if type is 'request') */
  request?: {
    action: string;
    model?: string;
    success: boolean;
    duration: number;
  };
  /** Tool usage details (if type is 'tool_use') */
  tool?: {
    name: string;
    parameters?: Record<string, any>;
  };
  /** Cost details (if type is 'cost') */
  cost?: {
    amount: number;
    currency: string;
    model?: string;
  };
  /** Error details (if type is 'error') */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  /** Custom event data */
  metadata?: Record<string, any>;
}

/**
 * Agent Metrics
 * Aggregated metrics for a single agent
 */
export interface AgentMetrics {
  /** Agent identifier */
  agentId: string;
  /** Last updated timestamp */
  lastUpdated: Date;
  /** Cost metrics */
  cost: {
    /** Total cost */
    total: number;
    /** Hourly cost */
    hourly: number;
    /** Daily cost */
    daily: number;
    /** Trend (% change from baseline) */
    trend: number;
  };
  /** Request metrics */
  requests: {
    /** Total requests */
    total: number;
    /** Successful requests */
    successful: number;
    /** Failed requests */
    failed: number;
    /** Requests per minute */
    rate: number;
  };
  /** Tool usage metrics */
  tools: {
    [toolName: string]: {
      /** Number of times used */
      count: number;
      /** Last used timestamp */
      lastUsed: Date;
    };
  };
  /** Detected anomalies */
  anomalies: Anomaly[];
}

/**
 * Anomaly
 * Represents a detected anomaly in agent behavior
 */
export interface Anomaly {
  /** Anomaly type */
  type: 'cost_spike' | 'unusual_tool_usage' | 'high_error_rate' | 'rate_spike' | 'custom';
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Current value */
  current: number;
  /** Baseline value */
  baseline: number;
  /** Ratio (current / baseline) */
  ratio: number;
  /** Detection timestamp */
  timestamp: Date;
  /** Additional details */
  details?: Record<string, any>;
}

/**
 * Baseline
 * Baseline metrics for anomaly detection
 */
export interface Baseline {
  /** Hourly cost baseline */
  hourly: number;
  /** Daily cost baseline */
  daily: number;
  /** Request rate baseline (requests per minute) */
  requestRate: number;
  /** Tool usage baseline */
  toolUsage: {
    [toolName: string]: number;
  };
}

/**
 * TealMonitor Configuration
 */
export interface TealMonitorConfig {
  /** Anomaly detection threshold (e.g., 2.0 = 200% of baseline) */
  anomalyThreshold?: number;
  /** Baseline calculation window in milliseconds (default: 7 days) */
  baselineWindow?: number;
  /** Maximum age of stored metrics in milliseconds (default: 30 days) */
  maxMetricsAge?: number;
  /** Enable automatic baseline calculation */
  autoBaseline?: boolean;
  /** Alert callback for anomalies */
  onAnomaly?: (anomaly: Anomaly, agentId: string) => void;
}

/**
 * TealMonitor - Behavioral Monitoring System
 * 
 * Tracks agent behavior, calculates baselines, and detects anomalies.
 * All data is stored in-memory for zero infrastructure deployment.
 */
export class TealMonitor {
  private config: Required<TealMonitorConfig>;
  private metrics: Map<string, AgentMetrics>;
  private events: Map<string, MonitoringEvent[]>;
  private baselines: Map<string, Baseline>;

  constructor(config: TealMonitorConfig = {}) {
    this.config = {
      anomalyThreshold: config.anomalyThreshold ?? 2.0,
      baselineWindow: config.baselineWindow ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxMetricsAge: config.maxMetricsAge ?? 30 * 24 * 60 * 60 * 1000, // 30 days
      autoBaseline: config.autoBaseline ?? true,
      onAnomaly: config.onAnomaly ?? (() => {})
    };

    this.metrics = new Map();
    this.events = new Map();
    this.baselines = new Map();
  }

  /**
   * Track a monitoring event
   * 
   * @param event - Event to track
   */
  track(event: MonitoringEvent): void {
    const { agentId } = event;

    // Store event
    if (!this.events.has(agentId)) {
      this.events.set(agentId, []);
    }
    this.events.get(agentId)!.push(event);

    // Update metrics
    this.updateMetrics(event);

    // Cleanup old events
    this.cleanupEvents(agentId);

    // Auto-calculate baseline if enabled
    if (this.config.autoBaseline) {
      this.calculateBaseline(agentId);
    }

    // Detect anomalies
    const anomalies = this.detectAnomalies(agentId);
    if (anomalies.length > 0) {
      const currentMetrics = this.metrics.get(agentId)!;
      currentMetrics.anomalies.push(...anomalies);

      // Trigger alert callbacks
      anomalies.forEach(anomaly => {
        this.config.onAnomaly(anomaly, agentId);
      });
    }
  }

  /**
   * Get metrics for an agent
   * 
   * @param agentId - Agent identifier
   * @returns Agent metrics or null if not found
   */
  getMetrics(agentId: string): AgentMetrics | null {
    return this.metrics.get(agentId) ?? null;
  }

  /**
   * Get all tracked agents
   * 
   * @returns Array of agent IDs
   */
  getAgents(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Set baseline for an agent
   * 
   * @param agentId - Agent identifier
   * @param baseline - Baseline metrics
   */
  setBaseline(agentId: string, baseline: Baseline): void {
    this.baselines.set(agentId, baseline);
  }

  /**
   * Get baseline for an agent
   * 
   * @param agentId - Agent identifier
   * @returns Baseline or null if not found
   */
  getBaseline(agentId: string): Baseline | null {
    return this.baselines.get(agentId) ?? null;
  }

  /**
   * Calculate baseline from historical data
   * 
   * @param agentId - Agent identifier
   */
  private calculateBaseline(agentId: string): void {
    const events = this.events.get(agentId);
    if (!events || events.length < 10) {
      // Need at least 10 events to calculate baseline
      return;
    }

    const now = Date.now();
    const windowStart = now - this.config.baselineWindow;
    const recentEvents = events.filter(e => e.timestamp.getTime() >= windowStart);

    if (recentEvents.length < 5) {
      return;
    }

    // Calculate cost baseline
    const costEvents = recentEvents.filter(e => e.type === 'cost' && e.cost);
    const hourlyCosts = this.calculateHourlyCosts(costEvents);
    const dailyCosts = this.calculateDailyCosts(costEvents);

    // Calculate request rate baseline
    const requestEvents = recentEvents.filter(e => e.type === 'request');
    const requestRate = this.calculateRequestRate(requestEvents);

    // Calculate tool usage baseline
    const toolEvents = recentEvents.filter(e => e.type === 'tool_use' && e.tool);
    const toolUsage = this.calculateToolUsage(toolEvents);

    const baseline: Baseline = {
      hourly: this.average(hourlyCosts),
      daily: this.average(dailyCosts),
      requestRate,
      toolUsage
    };

    this.baselines.set(agentId, baseline);
  }

  /**
   * Update metrics based on event
   * 
   * @param event - Monitoring event
   */
  private updateMetrics(event: MonitoringEvent): void {
    const { agentId } = event;

    // Initialize metrics if not exists
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, {
        agentId,
        lastUpdated: new Date(),
        cost: { total: 0, hourly: 0, daily: 0, trend: 0 },
        requests: { total: 0, successful: 0, failed: 0, rate: 0 },
        tools: {},
        anomalies: []
      });
    }

    const metrics = this.metrics.get(agentId)!;
    metrics.lastUpdated = event.timestamp;

    // Update based on event type
    switch (event.type) {
      case 'cost':
        if (event.cost) {
          metrics.cost.total += event.cost.amount;
          this.recalculateCostMetrics(agentId);
        }
        break;

      case 'request':
        if (event.request) {
          metrics.requests.total++;
          if (event.request.success) {
            metrics.requests.successful++;
          } else {
            metrics.requests.failed++;
          }
          this.recalculateRequestRate(agentId);
        }
        break;

      case 'tool_use':
        if (event.tool) {
          const toolName = event.tool.name;
          if (!metrics.tools[toolName]) {
            metrics.tools[toolName] = { count: 0, lastUsed: event.timestamp };
          }
          metrics.tools[toolName].count++;
          metrics.tools[toolName].lastUsed = event.timestamp;
        }
        break;
    }
  }

  /**
   * Recalculate cost metrics (hourly, daily)
   * 
   * @param agentId - Agent identifier
   */
  private recalculateCostMetrics(agentId: string): void {
    const events = this.events.get(agentId);
    if (!events) return;

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const costEvents = events.filter(e => e.type === 'cost' && e.cost);
    
    const hourlyCost = costEvents
      .filter(e => e.timestamp.getTime() >= oneHourAgo)
      .reduce((sum, e) => sum + (e.cost?.amount ?? 0), 0);

    const dailyCost = costEvents
      .filter(e => e.timestamp.getTime() >= oneDayAgo)
      .reduce((sum, e) => sum + (e.cost?.amount ?? 0), 0);

    const metrics = this.metrics.get(agentId)!;
    metrics.cost.hourly = hourlyCost;
    metrics.cost.daily = dailyCost;

    // Calculate trend
    const baseline = this.baselines.get(agentId);
    if (baseline) {
      metrics.cost.trend = baseline.hourly > 0 
        ? ((hourlyCost - baseline.hourly) / baseline.hourly) * 100
        : 0;
    }
  }

  /**
   * Recalculate request rate
   * 
   * @param agentId - Agent identifier
   */
  private recalculateRequestRate(agentId: string): void {
    const events = this.events.get(agentId);
    if (!events) return;

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const recentRequests = events.filter(
      e => e.type === 'request' && e.timestamp.getTime() >= oneMinuteAgo
    );

    const metrics = this.metrics.get(agentId)!;
    metrics.requests.rate = recentRequests.length;
  }

  /**
   * Detect anomalies for an agent
   * 
   * @param agentId - Agent identifier
   * @returns Array of detected anomalies
   */
  private detectAnomalies(agentId: string): Anomaly[] {
    const metrics = this.metrics.get(agentId);
    const baseline = this.baselines.get(agentId);

    if (!metrics || !baseline) {
      return [];
    }

    const anomalies: Anomaly[] = [];

    // Detect cost spike
    if (baseline.hourly > 0 && metrics.cost.hourly > baseline.hourly * this.config.anomalyThreshold) {
      anomalies.push({
        type: 'cost_spike',
        severity: this.calculateSeverity(metrics.cost.hourly / baseline.hourly),
        current: metrics.cost.hourly,
        baseline: baseline.hourly,
        ratio: metrics.cost.hourly / baseline.hourly,
        timestamp: new Date()
      });
    }

    // Detect rate spike
    if (baseline.requestRate > 0 && metrics.requests.rate > baseline.requestRate * this.config.anomalyThreshold) {
      anomalies.push({
        type: 'rate_spike',
        severity: this.calculateSeverity(metrics.requests.rate / baseline.requestRate),
        current: metrics.requests.rate,
        baseline: baseline.requestRate,
        ratio: metrics.requests.rate / baseline.requestRate,
        timestamp: new Date()
      });
    }

    // Detect unusual tool usage
    for (const [toolName, toolData] of Object.entries(metrics.tools)) {
      const toolBaseline = baseline.toolUsage[toolName] ?? 0;
      if (toolBaseline > 0 && toolData.count > toolBaseline * this.config.anomalyThreshold) {
        anomalies.push({
          type: 'unusual_tool_usage',
          severity: this.calculateSeverity(toolData.count / toolBaseline),
          current: toolData.count,
          baseline: toolBaseline,
          ratio: toolData.count / toolBaseline,
          timestamp: new Date(),
          details: { toolName }
        });
      }
    }

    // Detect high error rate
    if (metrics.requests.total > 10) {
      const errorRate = metrics.requests.failed / metrics.requests.total;
      if (errorRate > 0.2) { // 20% error rate
        anomalies.push({
          type: 'high_error_rate',
          severity: errorRate > 0.5 ? 'critical' : 'high',
          current: errorRate,
          baseline: 0.05, // 5% baseline
          ratio: errorRate / 0.05,
          timestamp: new Date()
        });
      }
    }

    return anomalies;
  }

  /**
   * Calculate severity based on ratio
   * 
   * @param ratio - Current / baseline ratio
   * @returns Severity level
   */
  private calculateSeverity(ratio: number): 'low' | 'medium' | 'high' | 'critical' {
    if (ratio >= 5.0) return 'critical';
    if (ratio >= 3.0) return 'high';
    if (ratio >= 2.0) return 'medium';
    return 'low';
  }

  /**
   * Cleanup old events
   * 
   * @param agentId - Agent identifier
   */
  private cleanupEvents(agentId: string): void {
    const events = this.events.get(agentId);
    if (!events) return;

    const now = Date.now();
    const cutoff = now - this.config.maxMetricsAge;

    const filtered = events.filter(e => e.timestamp.getTime() >= cutoff);
    this.events.set(agentId, filtered);
  }

  /**
   * Calculate hourly costs from events
   * 
   * @param events - Cost events
   * @returns Array of hourly costs
   */
  private calculateHourlyCosts(events: MonitoringEvent[]): number[] {
    const hourlyBuckets = new Map<number, number>();

    events.forEach(event => {
      if (!event.cost) return;
      
      const hour = Math.floor(event.timestamp.getTime() / (60 * 60 * 1000));
      const current = hourlyBuckets.get(hour) ?? 0;
      hourlyBuckets.set(hour, current + event.cost.amount);
    });

    return Array.from(hourlyBuckets.values());
  }

  /**
   * Calculate daily costs from events
   * 
   * @param events - Cost events
   * @returns Array of daily costs
   */
  private calculateDailyCosts(events: MonitoringEvent[]): number[] {
    const dailyBuckets = new Map<number, number>();

    events.forEach(event => {
      if (!event.cost) return;
      
      const day = Math.floor(event.timestamp.getTime() / (24 * 60 * 60 * 1000));
      const current = dailyBuckets.get(day) ?? 0;
      dailyBuckets.set(day, current + event.cost.amount);
    });

    return Array.from(dailyBuckets.values());
  }

  /**
   * Calculate request rate from events
   * 
   * @param events - Request events
   * @returns Average requests per minute
   */
  private calculateRequestRate(events: MonitoringEvent[]): number {
    if (events.length === 0) return 0;

    const timeSpan = Date.now() - events[0].timestamp.getTime();
    const minutes = timeSpan / (60 * 1000);

    return minutes > 0 ? events.length / minutes : 0;
  }

  /**
   * Calculate tool usage from events
   * 
   * @param events - Tool usage events
   * @returns Tool usage counts
   */
  private calculateToolUsage(events: MonitoringEvent[]): { [toolName: string]: number } {
    const usage: { [toolName: string]: number } = {};

    events.forEach(event => {
      if (!event.tool) return;
      
      const toolName = event.tool.name;
      usage[toolName] = (usage[toolName] ?? 0) + 1;
    });

    return usage;
  }

  /**
   * Calculate average of numbers
   * 
   * @param values - Array of numbers
   * @returns Average value
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Clear all metrics and events
   */
  clear(): void {
    this.metrics.clear();
    this.events.clear();
    this.baselines.clear();
  }

  /**
   * Clear metrics for a specific agent
   * 
   * @param agentId - Agent identifier
   */
  clearAgent(agentId: string): void {
    this.metrics.delete(agentId);
    this.events.delete(agentId);
    this.baselines.delete(agentId);
  }
}
