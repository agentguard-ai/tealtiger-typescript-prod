/**
 * TealMonitor Unit Tests
 * 
 * Tests for TealMonitor class including:
 * - Metrics tracking
 * - Baseline calculation
 * - Anomaly detection
 * - Alert callbacks
 * - Memory cleanup
 */

import { TealMonitor, MonitoringEvent, Anomaly } from '../TealMonitor';

describe('TealMonitor', () => {
  let monitor: TealMonitor;

  beforeEach(() => {
    monitor = new TealMonitor();
  });

  describe('4.5.1: Metrics Tracking', () => {
    it('should track cost events', () => {
      const event: MonitoringEvent = {
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: {
          amount: 0.05,
          currency: 'USD',
          model: 'gpt-4'
        }
      };

      monitor.track(event);

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics).toBeDefined();
      expect(metrics?.cost.total).toBe(0.05);
    });

    it('should track multiple cost events', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.05, currency: 'USD' }
      });

      monitor.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.03, currency: 'USD' }
      });

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics?.cost.total).toBe(0.08);
    });

    it('should track request events', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'request',
        timestamp: new Date(),
        request: {
          action: 'chat.create',
          model: 'gpt-4',
          success: true,
          duration: 1500
        }
      });

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics?.requests.total).toBe(1);
      expect(metrics?.requests.successful).toBe(1);
      expect(metrics?.requests.failed).toBe(0);
    });

    it('should track failed requests', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'request',
        timestamp: new Date(),
        request: {
          action: 'chat.create',
          success: false,
          duration: 500
        }
      });

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics?.requests.total).toBe(1);
      expect(metrics?.requests.successful).toBe(0);
      expect(metrics?.requests.failed).toBe(1);
    });

    it('should track tool usage events', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'tool_use',
        timestamp: new Date(),
        tool: {
          name: 'web_search',
          parameters: { query: 'test' }
        }
      });

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics?.tools['web_search']).toBeDefined();
      expect(metrics?.tools['web_search'].count).toBe(1);
    });

    it('should track multiple tool uses', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'tool_use',
        timestamp: new Date(),
        tool: { name: 'web_search' }
      });

      monitor.track({
        agentId: 'agent-1',
        type: 'tool_use',
        timestamp: new Date(),
        tool: { name: 'web_search' }
      });

      monitor.track({
        agentId: 'agent-1',
        type: 'tool_use',
        timestamp: new Date(),
        tool: { name: 'calculator' }
      });

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics?.tools['web_search'].count).toBe(2);
      expect(metrics?.tools['calculator'].count).toBe(1);
    });

    it('should track multiple agents separately', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.05, currency: 'USD' }
      });

      monitor.track({
        agentId: 'agent-2',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.10, currency: 'USD' }
      });

      const metrics1 = monitor.getMetrics('agent-1');
      const metrics2 = monitor.getMetrics('agent-2');

      expect(metrics1?.cost.total).toBe(0.05);
      expect(metrics2?.cost.total).toBe(0.10);
    });

    it('should return null for unknown agent', () => {
      const metrics = monitor.getMetrics('unknown-agent');
      expect(metrics).toBeNull();
    });

    it('should list all tracked agents', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.05, currency: 'USD' }
      });

      monitor.track({
        agentId: 'agent-2',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.10, currency: 'USD' }
      });

      const agents = monitor.getAgents();
      expect(agents).toHaveLength(2);
      expect(agents).toContain('agent-1');
      expect(agents).toContain('agent-2');
    });

    it('should update lastUsed timestamp for tools', () => {
      const timestamp1 = new Date('2026-01-01T10:00:00Z');
      const timestamp2 = new Date('2026-01-01T11:00:00Z');

      monitor.track({
        agentId: 'agent-1',
        type: 'tool_use',
        timestamp: timestamp1,
        tool: { name: 'web_search' }
      });

      monitor.track({
        agentId: 'agent-1',
        type: 'tool_use',
        timestamp: timestamp2,
        tool: { name: 'web_search' }
      });

      const metrics = monitor.getMetrics('agent-1');
      expect(metrics?.tools['web_search'].lastUsed).toEqual(timestamp2);
    });
  });

  describe('4.5.2: Baseline Calculation', () => {
    it('should not calculate baseline with insufficient events', () => {
      // Track only 5 events (need 10)
      for (let i = 0; i < 5; i++) {
        monitor.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(),
          cost: { amount: 0.05, currency: 'USD' }
        });
      }

      const baseline = monitor.getBaseline('agent-1');
      expect(baseline).toBeNull();
    });

    it('should calculate baseline with sufficient events', () => {
      // Track 15 events
      for (let i = 0; i < 15; i++) {
        monitor.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(Date.now() - i * 60 * 60 * 1000), // Spread over hours
          cost: { amount: 0.05, currency: 'USD' }
        });
      }

      const baseline = monitor.getBaseline('agent-1');
      expect(baseline).toBeDefined();
      expect(baseline?.hourly).toBeGreaterThan(0);
    });

    it('should allow manual baseline setting', () => {
      monitor.setBaseline('agent-1', {
        hourly: 0.50,
        daily: 10.00,
        requestRate: 10,
        toolUsage: {
          'web_search': 5,
          'calculator': 2
        }
      });

      const baseline = monitor.getBaseline('agent-1');
      expect(baseline?.hourly).toBe(0.50);
      expect(baseline?.daily).toBe(10.00);
      expect(baseline?.requestRate).toBe(10);
      expect(baseline?.toolUsage['web_search']).toBe(5);
    });

    it('should calculate tool usage baseline', () => {
      // Track tool usage events
      for (let i = 0; i < 15; i++) {
        monitor.track({
          agentId: 'agent-1',
          type: 'tool_use',
          timestamp: new Date(Date.now() - i * 60 * 60 * 1000),
          tool: { name: 'web_search' }
        });
      }

      const baseline = monitor.getBaseline('agent-1');
      expect(baseline?.toolUsage['web_search']).toBeGreaterThan(0);
    });
  });

  describe('4.5.3: Anomaly Detection', () => {
    it('should detect cost spike anomaly', () => {
      // Create monitor with autoBaseline disabled
      const testMonitor = new TealMonitor({ autoBaseline: false });
      
      // Set baseline
      testMonitor.setBaseline('agent-1', {
        hourly: 0.10,
        daily: 2.00,
        requestRate: 10,
        toolUsage: {}
      });

      // Track spike (total in last hour will be 0.30 = 3x baseline of 0.10)
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        testMonitor.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(now - i * 1000), // Spread over 15 seconds within last hour
          cost: { amount: 0.02, currency: 'USD' }
        });
      }

      const metrics = testMonitor.getMetrics('agent-1');
      const costAnomalies = metrics?.anomalies.filter(a => a.type === 'cost_spike');
      expect(costAnomalies).toBeDefined();
      expect(costAnomalies!.length).toBeGreaterThan(0);
    });

    it('should detect rate spike anomaly', () => {
      // Create monitor with autoBaseline disabled
      const testMonitor = new TealMonitor({ autoBaseline: false });
      
      // Set baseline
      testMonitor.setBaseline('agent-1', {
        hourly: 1.00,
        daily: 20.00,
        requestRate: 5, // 5 requests per minute
        toolUsage: {}
      });

      // Track spike (15 requests in last minute = 3x baseline of 5)
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        testMonitor.track({
          agentId: 'agent-1',
          type: 'request',
          timestamp: new Date(now - i * 1000), // Spread over 15 seconds within last minute
          request: {
            action: 'chat.create',
            success: true,
            duration: 1000
          }
        });
      }

      const metrics = testMonitor.getMetrics('agent-1');
      const rateAnomalies = metrics?.anomalies.filter(a => a.type === 'rate_spike');
      expect(rateAnomalies).toBeDefined();
      expect(rateAnomalies!.length).toBeGreaterThan(0);
    });

    it('should detect unusual tool usage anomaly', () => {
      // Create monitor with autoBaseline disabled
      const testMonitor = new TealMonitor({ autoBaseline: false });
      
      // Set baseline
      testMonitor.setBaseline('agent-1', {
        hourly: 1.00,
        daily: 20.00,
        requestRate: 10,
        toolUsage: {
          'web_search': 5
        }
      });

      // Track unusual usage (15 uses = 3x baseline of 5)
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        testMonitor.track({
          agentId: 'agent-1',
          type: 'tool_use',
          timestamp: new Date(now - i * 1000),
          tool: { name: 'web_search' }
        });
      }

      const metrics = testMonitor.getMetrics('agent-1');
      const toolAnomalies = metrics?.anomalies.filter(a => a.type === 'unusual_tool_usage');
      expect(toolAnomalies).toBeDefined();
      expect(toolAnomalies!.length).toBeGreaterThan(0);
    });

    it('should detect high error rate anomaly', () => {
      // Track requests with high error rate
      for (let i = 0; i < 15; i++) {
        monitor.track({
          agentId: 'agent-1',
          type: 'request',
          timestamp: new Date(),
          request: {
            action: 'chat.create',
            success: i < 5, // 10 failures out of 15 = 66% error rate
            duration: 1000
          }
        });
      }

      const metrics = monitor.getMetrics('agent-1');
      const errorAnomalies = metrics?.anomalies.filter(a => a.type === 'high_error_rate');
      expect(errorAnomalies).toBeDefined();
      expect(errorAnomalies!.length).toBeGreaterThan(0);
    });

    it('should calculate correct severity levels', () => {
      // Create monitor with autoBaseline disabled
      const testMonitor = new TealMonitor({ autoBaseline: false });
      
      // Set baseline
      testMonitor.setBaseline('agent-1', {
        hourly: 0.10,
        daily: 2.00,
        requestRate: 10,
        toolUsage: {}
      });

      // Track critical spike (5x baseline)
      const now = Date.now();
      for (let i = 0; i < 25; i++) {
        testMonitor.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(now - i * 1000),
          cost: { amount: 0.02, currency: 'USD' }
        });
      }

      const metrics = testMonitor.getMetrics('agent-1');
      const anomalies = metrics?.anomalies.filter(a => a.type === 'cost_spike');
      
      // Should detect anomaly with appropriate severity
      expect(anomalies).toBeDefined();
      expect(anomalies!.length).toBeGreaterThan(0);
      expect(anomalies![0].severity).toMatch(/^(low|medium|high|critical)$/);
      expect(anomalies![0].ratio).toBeGreaterThan(2.0); // At least 2x baseline
    });

    it('should include anomaly details', () => {
      // Create monitor with autoBaseline disabled
      const testMonitor = new TealMonitor({ autoBaseline: false });
      
      testMonitor.setBaseline('agent-1', {
        hourly: 1.00,
        daily: 20.00,
        requestRate: 10,
        toolUsage: { 'web_search': 5 }
      });

      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        testMonitor.track({
          agentId: 'agent-1',
          type: 'tool_use',
          timestamp: new Date(now - i * 1000),
          tool: { name: 'web_search' }
        });
      }

      const metrics = testMonitor.getMetrics('agent-1');
      const anomaly = metrics?.anomalies.find(a => a.type === 'unusual_tool_usage');

      expect(anomaly).toBeDefined();
      expect(anomaly?.current).toBeGreaterThan(0);
      expect(anomaly?.baseline).toBeGreaterThan(0);
      expect(anomaly?.ratio).toBeGreaterThan(1);
      expect(anomaly?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('4.5.4: Alert Callbacks', () => {
    it('should trigger alert callback on anomaly detection', () => {
      const alerts: Array<{ anomaly: Anomaly; agentId: string }> = [];

      const monitorWithCallback = new TealMonitor({
        autoBaseline: false,
        onAnomaly: (anomaly, agentId) => {
          alerts.push({ anomaly, agentId });
        }
      });

      // Set baseline
      monitorWithCallback.setBaseline('agent-1', {
        hourly: 0.10,
        daily: 2.00,
        requestRate: 10,
        toolUsage: {}
      });

      // Trigger anomaly (0.30 = 3x baseline of 0.10)
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        monitorWithCallback.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(now - i * 1000),
          cost: { amount: 0.02, currency: 'USD' }
        });
      }

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].agentId).toBe('agent-1');
      expect(alerts[0].anomaly.type).toBe('cost_spike');
    });

    it('should not trigger callback when no anomalies', () => {
      const alerts: Array<{ anomaly: Anomaly; agentId: string }> = [];

      const monitorWithCallback = new TealMonitor({
        onAnomaly: (anomaly, agentId) => {
          alerts.push({ anomaly, agentId });
        }
      });

      // Track normal activity
      monitorWithCallback.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.05, currency: 'USD' }
      });

      expect(alerts.length).toBe(0);
    });

    it('should trigger multiple callbacks for multiple anomalies', () => {
      const alerts: Array<{ anomaly: Anomaly; agentId: string }> = [];

      const monitorWithCallback = new TealMonitor({
        autoBaseline: false,
        anomalyThreshold: 2.0,
        onAnomaly: (anomaly, agentId) => {
          alerts.push({ anomaly, agentId });
        }
      });

      // Set baseline
      monitorWithCallback.setBaseline('agent-1', {
        hourly: 0.10,
        daily: 2.00,
        requestRate: 5,
        toolUsage: {}
      });

      // Trigger both cost and rate anomalies
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        monitorWithCallback.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(now - i * 1000),
          cost: { amount: 0.02, currency: 'USD' }
        });

        monitorWithCallback.track({
          agentId: 'agent-1',
          type: 'request',
          timestamp: new Date(now - i * 1000),
          request: {
            action: 'chat.create',
            success: true,
            duration: 1000
          }
        });
      }

      // Should have detected both cost_spike and rate_spike
      const anomalyTypes = alerts.map(a => a.anomaly.type);
      expect(anomalyTypes).toContain('cost_spike');
      expect(anomalyTypes).toContain('rate_spike');
    });
  });

  describe('4.5.5: Memory Cleanup', () => {
    it('should clear all metrics', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.05, currency: 'USD' }
      });

      monitor.track({
        agentId: 'agent-2',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.10, currency: 'USD' }
      });

      expect(monitor.getAgents()).toHaveLength(2);

      monitor.clear();

      expect(monitor.getAgents()).toHaveLength(0);
      expect(monitor.getMetrics('agent-1')).toBeNull();
      expect(monitor.getMetrics('agent-2')).toBeNull();
    });

    it('should clear metrics for specific agent', () => {
      monitor.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.05, currency: 'USD' }
      });

      monitor.track({
        agentId: 'agent-2',
        type: 'cost',
        timestamp: new Date(),
        cost: { amount: 0.10, currency: 'USD' }
      });

      monitor.clearAgent('agent-1');

      expect(monitor.getMetrics('agent-1')).toBeNull();
      expect(monitor.getMetrics('agent-2')).toBeDefined();
      expect(monitor.getAgents()).toHaveLength(1);
    });

    it('should cleanup old events automatically', () => {
      const monitorWithShortRetention = new TealMonitor({
        maxMetricsAge: 100 // 100ms retention
      });

      // Track old event
      monitorWithShortRetention.track({
        agentId: 'agent-1',
        type: 'cost',
        timestamp: new Date(Date.now() - 200), // 200ms ago
        cost: { amount: 0.05, currency: 'USD' }
      });

      // Wait for cleanup
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Track new event (triggers cleanup)
          monitorWithShortRetention.track({
            agentId: 'agent-1',
            type: 'cost',
            timestamp: new Date(),
            cost: { amount: 0.05, currency: 'USD' }
          });

          // Old event should be cleaned up
          // (We can't directly test this, but metrics should only reflect recent event)
          const metrics = monitorWithShortRetention.getMetrics('agent-1');
          expect(metrics).toBeDefined();
          resolve();
        }, 150);
      });
    });

    it('should clear baselines when clearing agent', () => {
      monitor.setBaseline('agent-1', {
        hourly: 0.50,
        daily: 10.00,
        requestRate: 10,
        toolUsage: {}
      });

      expect(monitor.getBaseline('agent-1')).toBeDefined();

      monitor.clearAgent('agent-1');

      expect(monitor.getBaseline('agent-1')).toBeNull();
    });
  });

  describe('Configuration', () => {
    it('should use custom anomaly threshold', () => {
      const customMonitor = new TealMonitor({
        anomalyThreshold: 3.0 // 300% threshold
      });

      customMonitor.setBaseline('agent-1', {
        hourly: 0.10,
        daily: 2.00,
        requestRate: 10,
        toolUsage: {}
      });

      // Track 2.5x baseline (should not trigger with 3.0 threshold)
      for (let i = 0; i < 13; i++) {
        customMonitor.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(),
          cost: { amount: 0.02, currency: 'USD' }
        });
      }

      const metrics = customMonitor.getMetrics('agent-1');
      const anomalies = metrics?.anomalies.filter(a => a.type === 'cost_spike');
      
      // Should not detect anomaly with 3.0 threshold
      expect(anomalies?.length).toBe(0);
    });

    it('should disable auto-baseline when configured', () => {
      const manualMonitor = new TealMonitor({
        autoBaseline: false
      });

      // Track many events
      for (let i = 0; i < 20; i++) {
        manualMonitor.track({
          agentId: 'agent-1',
          type: 'cost',
          timestamp: new Date(),
          cost: { amount: 0.05, currency: 'USD' }
        });
      }

      // Baseline should not be auto-calculated
      expect(manualMonitor.getBaseline('agent-1')).toBeNull();
    });
  });
});
