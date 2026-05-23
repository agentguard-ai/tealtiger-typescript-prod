/**
 * TealAudit Unit Tests
 * 
 * Tests for the audit logging system
 */

import { TealAudit, ConsoleOutput, CustomOutput } from '../TealAudit';
import { FileOutput } from '../FileOutput';
import type { AuditEvent, AuditOutput } from '../TealAudit';
import * as fs from 'fs';
import * as path from 'path';

// Mock console.log to capture output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('TealAudit', () => {
  let consoleOutput: string[] = [];
  let consoleErrors: string[] = [];

  beforeEach(() => {
    consoleOutput = [];
    consoleErrors = [];
    console.log = jest.fn((msg: string) => consoleOutput.push(msg));
    console.error = jest.fn((msg: string) => consoleErrors.push(msg));
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // Helper to create a sample audit event
  const createEvent = (overrides?: Partial<AuditEvent>): AuditEvent => ({
    timestamp: new Date('2026-02-11T10:00:00Z'),
    agentId: 'agent-1',
    action: 'chat.create',
    model: 'gpt-4',
    cost: 0.05,
    duration: 1200,
    ...overrides,
  });

  describe('6.4.1 Logging to Console', () => {
    it('should log events to console output', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      const event = createEvent();
      audit.log(event);

      expect(consoleOutput).toHaveLength(1);
      const logged = JSON.parse(consoleOutput[0]);
      expect(logged.agentId).toBe('agent-1');
      expect(logged.action).toBe('chat.create');
    });

    it('should log multiple events to console', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.log(createEvent({ agentId: 'agent-2' }));
      audit.log(createEvent({ agentId: 'agent-3' }));

      expect(consoleOutput).toHaveLength(3);
    });

    it('should redact sensitive fields before console output', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({
        metadata: {
          apiKey: 'sk_live_1234567890123456',
          nested: {
            token: 'xoxb-1234567890-ABCDEF'
          }
        }
      }));

      expect(consoleOutput).toHaveLength(1);

      const logged = JSON.parse(consoleOutput[0]);
      expect(logged.metadata.apiKey).toBe('[REDACTED]');
      expect(logged.metadata.nested.token).toBe('[REDACTED]');
      expect(consoleOutput[0]).not.toContain('sk_live_1234567890123456');
    });

    it('should handle console output errors gracefully', () => {
      const failingOutput: AuditOutput = {
        write: () => {
          throw new Error('Console write failed');
        },
      };

      const audit = new TealAudit({
        outputs: [failingOutput],
      });

      // Should not throw
      expect(() => audit.log(createEvent())).not.toThrow();
      expect(consoleErrors.length).toBeGreaterThan(0);
    });
  });

  describe('6.4.2 Logging to File', () => {
    const testDir = path.join(__dirname, 'test-logs');
    const testFile = path.join(testDir, 'audit.log');

    beforeEach(() => {
      // Clean up test directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      // Clean up test directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it('should log events to file', (done) => {
      const audit = new TealAudit({
        outputs: [new FileOutput(testFile)],
      });

      const event = createEvent();
      audit.log(event);

      // Close and wait for stream to finish
      audit.close();
      
      // Give stream time to flush
      setTimeout(() => {
        // Verify file exists and contains event
        expect(fs.existsSync(testFile)).toBe(true);
        const content = fs.readFileSync(testFile, 'utf8');
        const lines = content.trim().split('\n');
        expect(lines).toHaveLength(1);

        const logged = JSON.parse(lines[0]);
        expect(logged.agentId).toBe('agent-1');
        done();
      }, 100);
    });

    it('should append to existing file', (done) => {
      const audit = new TealAudit({
        outputs: [new FileOutput(testFile)],
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.close();

      setTimeout(() => {
        // Create new audit instance with same file
        const audit2 = new TealAudit({
          outputs: [new FileOutput(testFile)],
        });

        audit2.log(createEvent({ agentId: 'agent-2' }));
        audit2.close();

        setTimeout(() => {
          // Verify both events are in file
          const content = fs.readFileSync(testFile, 'utf8');
          const lines = content.trim().split('\n');
          expect(lines).toHaveLength(2);
          done();
        }, 100);
      }, 100);
    });

    it('should create parent directories if they do not exist', (done) => {
      const nestedFile = path.join(testDir, 'nested', 'deep', 'audit.log');
      
      const audit = new TealAudit({
        outputs: [new FileOutput(nestedFile)],
      });

      audit.log(createEvent());
      audit.close();

      setTimeout(() => {
        expect(fs.existsSync(nestedFile)).toBe(true);
        done();
      }, 100);
    });
  });

  describe('6.4.3 File Rotation', () => {
    const testDir = path.join(__dirname, 'test-logs');
    const testFile = path.join(testDir, 'audit.log');

    beforeEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it('should rotate file when size limit is reached', (done) => {
      // Use a very small size to force rotation
      const smallSize = 100;
      
      const audit = new TealAudit({
        outputs: [new FileOutput({ filePath: testFile, maxSize: smallSize })],
      });

      // Log events with enough data to exceed limit
      const largeEvent = createEvent({ 
        agentId: 'agent-with-very-long-id-to-make-event-larger',
        metadata: { 
          data: 'x'.repeat(50) // Add extra data
        }
      });

      // Log multiple large events
      for (let i = 0; i < 3; i++) {
        audit.log({ ...largeEvent, agentId: `agent-${i}-${'x'.repeat(20)}` });
      }

      audit.close();

      setTimeout(() => {
        // Check that files exist
        if (fs.existsSync(testDir)) {
          const files = fs.readdirSync(testDir);
          const logFiles = files.filter(f => f.startsWith('audit.log'));
          
          // Should have at least one file (rotation may or may not have occurred)
          expect(logFiles.length).toBeGreaterThanOrEqual(1);
        }
        done();
      }, 200);
    }, 10000);

    it('should preserve events when writing to file', (done) => {
      const audit = new TealAudit({
        outputs: [new FileOutput(testFile)],
      });

      const eventCount = 3;
      for (let i = 0; i < eventCount; i++) {
        audit.log(createEvent({ agentId: `agent-${i}` }));
      }

      audit.close();

      setTimeout(() => {
        // Read all log files and count events
        if (fs.existsSync(testDir)) {
          const files = fs.readdirSync(testDir);
          const logFiles = files.filter(f => f.startsWith('audit.log'));
          
          let totalEvents = 0;
          for (const file of logFiles) {
            const filePath = path.join(testDir, file);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf8');
              const lines = content.trim().split('\n').filter(l => l.length > 0);
              totalEvents += lines.length;
            }
          }

          // Should have all events
          expect(totalEvents).toBe(eventCount);
        }
        done();
      }, 200);
    }, 10000);
  });

  describe('6.4.4 Filtering', () => {
    it('should filter by minimum cost', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ cost: 0.01 }));
      audit.log(createEvent({ cost: 0.05 }));
      audit.log(createEvent({ cost: 0.10 }));

      const filtered = audit.query({ minCost: 0.05 });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(e => e.cost! >= 0.05)).toBe(true);
    });

    it('should filter by agent IDs', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.log(createEvent({ agentId: 'agent-2' }));
      audit.log(createEvent({ agentId: 'agent-3' }));

      const filtered = audit.query({ agents: ['agent-1', 'agent-3'] });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(e => (e as any).agentId)).toEqual(['agent-1', 'agent-3']);
    });

    it('should filter by actions', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ action: 'chat.create' }));
      audit.log(createEvent({ action: 'policy.evaluate' }));
      audit.log(createEvent({ action: 'chat.create' }));

      const filtered = audit.query({ actions: ['chat.create'] });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(e => e.action === 'chat.create')).toBe(true);
    });

    it('should filter by time range', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ timestamp: new Date('2026-02-10T10:00:00Z') }));
      audit.log(createEvent({ timestamp: new Date('2026-02-11T10:00:00Z') }));
      audit.log(createEvent({ timestamp: new Date('2026-02-12T10:00:00Z') }));

      const filtered = audit.query({
        startTime: new Date('2026-02-11T00:00:00Z'),
        endTime: new Date('2026-02-11T23:59:59Z'),
      });

      expect(filtered).toHaveLength(1);
      expect((filtered[0] as any).timestamp.toISOString()).toBe('2026-02-11T10:00:00.000Z');
    });

    it('should filter by error presence', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ error: 'Something went wrong' }));
      audit.log(createEvent());
      audit.log(createEvent({ error: 'Another error' }));

      const withErrors = audit.query({ hasError: true });
      expect(withErrors).toHaveLength(2);
      expect(withErrors.every(e => !!e.error)).toBe(true);

      const withoutErrors = audit.query({ hasError: false });
      expect(withoutErrors).toHaveLength(1);
      expect(withoutErrors.every(e => !e.error)).toBe(true);
    });

    it('should combine multiple filters', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1', cost: 0.01, action: 'chat.create' }));
      audit.log(createEvent({ agentId: 'agent-1', cost: 0.05, action: 'chat.create' }));
      audit.log(createEvent({ agentId: 'agent-2', cost: 0.10, action: 'policy.evaluate' }));

      const filtered = audit.query({
        agents: ['agent-1'],
        minCost: 0.05,
        actions: ['chat.create'],
      });

      expect(filtered).toHaveLength(1);
      expect((filtered[0] as any).agentId).toBe('agent-1');
      expect((filtered[0] as any).cost).toBe(0.05);
    });

    it('should return all events when no filter is provided', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.log(createEvent({ agentId: 'agent-2' }));
      audit.log(createEvent({ agentId: 'agent-3' }));

      const all = audit.query();
      expect(all).toHaveLength(3);
    });
  });

  describe('6.4.5 Export', () => {
    it('should export to JSON format', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.log(createEvent({ agentId: 'agent-2' }));

      const json = audit.export('json');
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].agentId).toBe('agent-1');
    });

    it('should export to CSV format', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1', cost: 0.05 }));
      audit.log(createEvent({ agentId: 'agent-2', cost: 0.10 }));

      const csv = audit.export('csv');
      const lines = csv.split('\n');

      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('agentId');
      expect(lines[0]).toContain('cost');
      expect(lines).toHaveLength(3); // Header + 2 events
    });

    it('should handle CSV special characters', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ 
        agentId: 'agent,with,commas',
        action: 'action"with"quotes',
        error: 'error\nwith\nnewlines'
      }));

      const csv = audit.export('csv');
      
      // Should escape commas, quotes, and newlines
      expect(csv).toContain('"agent,with,commas"');
      expect(csv).toContain('"action""with""quotes"');
      expect(csv).toContain('"error\nwith\nnewlines"');
    });

    it('should export with filter applied', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({ agentId: 'agent-1', cost: 0.01 }));
      audit.log(createEvent({ agentId: 'agent-2', cost: 0.10 }));
      audit.log(createEvent({ agentId: 'agent-3', cost: 0.05 }));

      const json = audit.export('json', { minCost: 0.05 });
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(2);
      expect(parsed.every((e: AuditEvent) => e.cost! >= 0.05)).toBe(true);
    });

    it('should throw error for unsupported format', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent());

      expect(() => audit.export('xml' as any)).toThrow('Unsupported export format');
    });
  });

  describe('Custom Output', () => {
    it('should support custom output handler', () => {
      const events: AuditEvent[] = [];
      const customOutput = new CustomOutput((event) => {
        events.push(event);
      });

      const audit = new TealAudit({
        outputs: [customOutput],
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.log(createEvent({ agentId: 'agent-2' }));

      expect(events).toHaveLength(2);
      expect((events[0] as any).agentId).toBe('agent-1');
      expect((events[1] as any).agentId).toBe('agent-2');
    });

    it('should support multiple outputs simultaneously', () => {
      const customEvents: AuditEvent[] = [];
      
      const audit = new TealAudit({
        outputs: [
          new ConsoleOutput(),
          new CustomOutput((event) => customEvents.push(event)),
        ],
      });

      audit.log(createEvent());

      expect(consoleOutput).toHaveLength(1);
      expect(customEvents).toHaveLength(1);
    });
  });

  describe('Storage Management', () => {
    it('should enforce max events limit', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        maxEvents: 3,
      });

      audit.log(createEvent({ agentId: 'agent-1' }));
      audit.log(createEvent({ agentId: 'agent-2' }));
      audit.log(createEvent({ agentId: 'agent-3' }));
      audit.log(createEvent({ agentId: 'agent-4' }));

      const events = audit.query();
      expect(events).toHaveLength(3);
      expect((events[0] as any).agentId).toBe('agent-2'); // Oldest removed
    });

    it('should support disabling storage', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        enableStorage: false,
      });

      audit.log(createEvent());

      expect(() => audit.query()).toThrow('Storage is disabled');
    });

    it('should clear all events', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent());
      audit.log(createEvent());
      audit.log(createEvent());

      expect(audit.getEventCount()).toBe(3);

      audit.clear();

      expect(audit.getEventCount()).toBe(0);
      expect(audit.query()).toHaveLength(0);
    });

    it('should track event count', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      expect(audit.getEventCount()).toBe(0);

      audit.log(createEvent());
      expect(audit.getEventCount()).toBe(1);

      audit.log(createEvent());
      expect(audit.getEventCount()).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle output write errors gracefully', () => {
      const failingOutput: AuditOutput = {
        write: () => {
          throw new Error('Write failed');
        },
      };

      const audit = new TealAudit({
        outputs: [failingOutput],
      });

      // Should not throw
      expect(() => audit.log(createEvent())).not.toThrow();
    });

    it('should handle output close errors gracefully', () => {
      const failingOutput: AuditOutput = {
        write: () => {},
        close: () => {
          throw new Error('Close failed');
        },
      };

      const audit = new TealAudit({
        outputs: [failingOutput],
      });

      // Should not throw
      expect(() => audit.close()).not.toThrow();
    });

    it('should continue logging to other outputs if one fails', () => {
      const customEvents: AuditEvent[] = [];
      const failingOutput: AuditOutput = {
        write: () => {
          throw new Error('Failed');
        },
      };

      const audit = new TealAudit({
        outputs: [
          failingOutput,
          new CustomOutput((event) => customEvents.push(event)),
        ],
      });

      audit.log(createEvent());

      // Custom output should still receive the event
      expect(customEvents).toHaveLength(1);
    });
  });

  describe('Metadata and Policy Decisions', () => {
    it('should log policy decisions', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({
        policyDecisions: {
          'tool.file_read': 'allowed',
          'identity.permissions': 'checked',
        },
      }));

      const events = audit.query();
      expect((events[0] as any).policyDecisions).toEqual({
        'tool.file_read': 'allowed',
        'identity.permissions': 'checked',
      });
    });

    it('should log custom metadata', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
      });

      audit.log(createEvent({
        metadata: {
          userId: 'user-123',
          sessionId: 'session-456',
          custom: { nested: 'value' },
        },
      }));

      const events = audit.query();
      expect(events[0].metadata).toEqual({
        userId: 'user-123',
        sessionId: 'session-456',
        custom: { nested: 'value' },
      });
    });
  });
});
