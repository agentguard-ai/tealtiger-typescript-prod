/**
 * TealAudit Configuration Tests
 * 
 * Tests for Task 3.4: Update TealAudit to use new schema and redaction
 * Validates AuditConfig integration with security-by-default settings
 */

import { 
  TealAudit, 
  ConsoleOutput, 
  RedactionLevel,
  AuditEventType,
  createAuditEvent,
  getDefaultRedactionLevel
} from '../index';

describe('TealAudit - Configuration (Task 3.4)', () => {
  let consoleWarnSpy: jest.SpyInstance;
  
  beforeEach(() => {
    // Spy on console.warn to verify debug mode warnings
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Security-by-Default Configuration', () => {
    it('should use HASH redaction by default for inputs', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const config = audit.getConfig();
      expect(config.input_redaction).toBe(RedactionLevel.HASH);
    });

    it('should use HASH redaction by default for outputs', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const config = audit.getConfig();
      expect(config.output_redaction).toBe(RedactionLevel.HASH);
    });

    it('should enable PII detection by default', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const config = audit.getConfig();
      expect(config.detect_pii).toBe(true);
    });

    it('should disable debug mode by default', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const config = audit.getConfig();
      expect(config.debug_mode).toBe(false);
    });

    it('should not log warning when debug mode is disabled', () => {
      new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Custom Configuration', () => {
    it('should accept custom input_redaction level', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          input_redaction: RedactionLevel.SIZE_ONLY
        }
      });
      
      const config = audit.getConfig();
      expect(config.input_redaction).toBe(RedactionLevel.SIZE_ONLY);
    });

    it('should accept custom output_redaction level', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          output_redaction: RedactionLevel.CATEGORY_ONLY
        }
      });
      
      const config = audit.getConfig();
      expect(config.output_redaction).toBe(RedactionLevel.CATEGORY_ONLY);
    });

    it('should accept custom detect_pii setting', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          detect_pii: false
        }
      });
      
      const config = audit.getConfig();
      expect(config.detect_pii).toBe(false);
    });

    it('should accept custom redaction rules', () => {
      const customRules = [
        { pattern: /secret/gi, replacement: '[REDACTED]' }
      ];
      
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          custom_redaction: customRules
        }
      });
      
      const config = audit.getConfig();
      expect(config.custom_redaction).toEqual(customRules);
    });
  });

  describe('Debug Mode (Requirement 11.4, 11.5)', () => {
    it('should require explicit opt-in for debug mode', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          debug_mode: true
        }
      });
      
      const config = audit.getConfig();
      expect(config.debug_mode).toBe(true);
    });

    it('should log warning when debug mode is enabled (Requirement 11.5)', () => {
      new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          debug_mode: true
        }
      });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG MODE ENABLED')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DANGEROUS')
      );
    });

    it('should warn about production use when debug mode is enabled', () => {
      new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          debug_mode: true
        }
      });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('production')
      );
    });
  });

  describe('Configuration Immutability', () => {
    it('should return readonly config', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()],
        config: {
          input_redaction: RedactionLevel.HASH
        }
      });
      
      const config = audit.getConfig();
      
      // Attempt to modify should not affect internal config
      (config as any).input_redaction = RedactionLevel.NONE;
      
      const config2 = audit.getConfig();
      expect(config2.input_redaction).toBe(RedactionLevel.HASH);
    });
  });

  describe('Backwards Compatibility (Requirement 12.4)', () => {
    it('should work without config parameter', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      expect(audit).toBeDefined();
      expect(audit.getConfig()).toBeDefined();
    });

    it('should use secure defaults when config is not provided', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const config = audit.getConfig();
      expect(config.input_redaction).toBe(getDefaultRedactionLevel());
      expect(config.output_redaction).toBe(getDefaultRedactionLevel());
      expect(config.detect_pii).toBe(true);
      expect(config.debug_mode).toBe(false);
    });
  });

  describe('Versioned Event Logging', () => {
    it('should accept and log versioned audit events', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput]
      });
      
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'test-correlation-id',
        {
          policy_id: 'test-policy',
          risk_score: 50
        }
      );
      
      audit.log(event);
      
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.objectContaining({
          schema_version: '1.0.0',
          event_type: AuditEventType.POLICY_EVALUATION,
          correlation_id: 'test-correlation-id'
        })
      );
    });

    it('should handle legacy audit events', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput]
      });
      
      const legacyEvent = {
        timestamp: new Date(),
        agentId: 'agent-1',
        action: 'chat.create',
        model: 'gpt-4'
      };
      
      audit.log(legacyEvent);
      
      expect(mockOutput.write).toHaveBeenCalledWith(legacyEvent);
    });
  });

  describe('Custom Redaction Rules', () => {
    it('should apply custom redaction to metadata', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput],
        config: {
          custom_redaction: [
            { pattern: /secret-key-\d+/g, replacement: '[REDACTED_KEY]' }
          ]
        }
      });
      
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'test-correlation-id',
        {
          metadata: {
            api_key: 'secret-key-12345'
          }
        }
      );
      
      audit.log(event);
      
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            api_key: '[REDACTED_KEY]'
          })
        })
      );
    });

    it('should apply multiple custom redaction rules', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput],
        config: {
          custom_redaction: [
            { pattern: /password/gi, replacement: '[REDACTED_PASSWORD]' },
            { pattern: /token/gi, replacement: '[REDACTED_TOKEN]' }
          ]
        }
      });
      
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'test-correlation-id',
        {
          metadata: {
            auth: 'password: secret, token: abc123'
          }
        }
      );
      
      audit.log(event);
      
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            auth: '[REDACTED_PASSWORD]: secret, [REDACTED_TOKEN]: abc123'
          })
        })
      );
    });

    it('should handle nested metadata objects', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput],
        config: {
          custom_redaction: [
            { pattern: /secret/gi, replacement: '[REDACTED]' }
          ]
        }
      });
      
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'test-correlation-id',
        {
          metadata: {
            nested: {
              value: 'secret data'
            }
          }
        }
      );
      
      audit.log(event);
      
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            nested: expect.objectContaining({
              value: '[REDACTED] data'
            })
          })
        })
      );
    });
  });

  describe('Error Handling (Requirement 13.2, 13.5)', () => {
    it('should not throw when event validation fails (non-blocking)', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput]
      });
      
      const invalidEvent = {
        schema_version: '1.0.0',
        event_type: 'invalid_type',
        // Missing required fields
      } as any;
      
      expect(() => audit.log(invalidEvent)).not.toThrow();
    });

    it('should continue logging even if validation fails', () => {
      const mockOutput = {
        write: jest.fn()
      };
      
      const audit = new TealAudit({
        outputs: [mockOutput]
      });
      
      const invalidEvent = {
        schema_version: '1.0.0',
        event_type: 'invalid_type'
      } as any;
      
      audit.log(invalidEvent);
      
      // Should still attempt to write the event
      expect(mockOutput.write).toHaveBeenCalled();
    });
  });

  describe('Query by Correlation ID (Requirement 3.12)', () => {
    it('should support querying by correlation_id', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const event1 = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'correlation-1'
      );
      
      const event2 = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'correlation-2'
      );
      
      audit.log(event1);
      audit.log(event2);
      
      const results = audit.query({ correlation_id: 'correlation-1' });
      
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        correlation_id: 'correlation-1'
      });
    });

    it('should return empty array when correlation_id not found', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const event = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'correlation-1'
      );
      
      audit.log(event);
      
      const results = audit.query({ correlation_id: 'non-existent' });
      
      expect(results).toHaveLength(0);
    });

    it('should return all events with matching correlation_id', () => {
      const audit = new TealAudit({
        outputs: [new ConsoleOutput()]
      });
      
      const event1 = createAuditEvent(
        AuditEventType.POLICY_EVALUATION,
        'correlation-1'
      );
      
      const event2 = createAuditEvent(
        AuditEventType.GUARDRAIL_CHECK,
        'correlation-1'
      );
      
      const event3 = createAuditEvent(
        AuditEventType.LLM_REQUEST,
        'correlation-2'
      );
      
      audit.log(event1);
      audit.log(event2);
      audit.log(event3);
      
      const results = audit.query({ correlation_id: 'correlation-1' });
      
      expect(results).toHaveLength(2);
      expect(results.every(e => 'correlation_id' in e && e.correlation_id === 'correlation-1')).toBe(true);
    });
  });
});
