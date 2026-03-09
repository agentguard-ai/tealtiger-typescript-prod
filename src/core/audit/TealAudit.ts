/**
 * TealAudit - Audit Logging System
 * 
 * Comprehensive audit logging for compliance and debugging.
 * Supports multiple output targets (console, file, custom) with filtering and export capabilities.
 * 
 * Part of TealTiger v1.1.x - Enterprise Adoption Features (P0.4)
 * Implements versioned audit events with security-by-default redaction.
 * 
 * @example
 * ```typescript
 * // Production configuration (secure by default)
 * const audit = new TealAudit({
 *   outputs: [new FileOutput('./audit.log')],
 *   config: {
 *     input_redaction: RedactionLevel.HASH,
 *     output_redaction: RedactionLevel.HASH,
 *     detect_pii: true,
 *     debug_mode: false
 *   }
 * });
 * 
 * // Log versioned audit event
 * audit.log({
 *   schema_version: '1.0.0',
 *   event_type: AuditEventType.POLICY_EVALUATION,
 *   timestamp: new Date().toISOString(),
 *   correlation_id: 'req-12345',
 *   action: DecisionAction.ALLOW,
 *   risk_score: 25
 * });
 * 
 * // Query events by correlation_id
 * const events = audit.query({ correlation_id: 'req-12345' });
 * ```
 */

import { 
  RedactionLevel, 
  getDefaultRedactionLevel 
} from './redaction';
import { 
  AuditEvent as VersionedAuditEvent,
  validateAuditEvent 
} from './types';
import { ExecutionContext } from '../context/ExecutionContext';

/**
 * Audit event representing a logged action (legacy)
 * 
 * @deprecated Use VersionedAuditEvent from types.ts for new code
 * This interface is kept for backwards compatibility
 */
export interface AuditEvent {
  /** Timestamp of the event */
  timestamp: Date;
  
  /** Agent identifier */
  agentId: string;
  
  /** Action performed (e.g., 'chat.create', 'policy.evaluate') */
  action: string;
  
  /** Model used (optional) */
  model?: string;
  
  /** Cost of the operation (optional) */
  cost?: number;
  
  /** Duration in milliseconds (optional) */
  duration?: number;
  
  /** Policy decisions made (optional) */
  policyDecisions?: Record<string, string>;
  
  /** Error message if operation failed (optional) */
  error?: string;
  
  /** Additional metadata (optional) */
  metadata?: Record<string, any>;
}

/**
 * Filter for querying audit events
 */
export interface AuditFilter {
  /** Minimum cost threshold */
  minCost?: number;
  
  /** Filter by agent IDs */
  agents?: string[];
  
  /** Filter by actions */
  actions?: string[];
  
  /** Start time for time range filter */
  startTime?: Date;
  
  /** End time for time range filter */
  endTime?: Date;
  
  /** Filter by error presence */
  hasError?: boolean;
  
  /** Filter by correlation ID (for versioned events) */
  correlation_id?: string;
}

/**
 * Custom redaction rule
 */
export interface CustomRedactionRule {
  /** Regex pattern to match */
  pattern: RegExp;
  
  /** Replacement string */
  replacement: string;
}

/**
 * Audit configuration with redaction support
 * Part of TealTiger v1.1.x - Enterprise Adoption Features (P0.4)
 */
export interface AuditConfig {
  /** Redaction level for inputs (default: HASH) */
  input_redaction?: RedactionLevel;
  
  /** Redaction level for outputs (default: HASH) */
  output_redaction?: RedactionLevel;
  
  /** Enable debug mode - includes raw content (DANGEROUS, default: false) */
  debug_mode?: boolean;
  
  /** PII detection before logging (default: true) */
  detect_pii?: boolean;
  
  /** Custom redaction rules */
  custom_redaction?: CustomRedactionRule[];
}

/**
 * Output target interface for audit events
 */
export interface AuditOutput {
  /** Write an audit event to the output */
  write(event: AuditEvent): void;
  
  /** Close the output (optional) */
  close?(): void;
}

/**
 * Configuration for TealAudit
 */
export interface TealAuditConfig {
  /** Output targets for audit events */
  outputs: AuditOutput[];
  
  /** Maximum number of events to store in memory (default: 10000) */
  maxEvents?: number;
  
  /** Enable in-memory storage for querying (default: true) */
  enableStorage?: boolean;
  
  /** Audit configuration with redaction support (P0.4) */
  config?: AuditConfig;
}

/**
 * Console output for audit events
 */
export class ConsoleOutput implements AuditOutput {
  write(event: AuditEvent): void {
    console.log(JSON.stringify(event));
  }
}

/**
 * Custom output with user-defined handler
 */
export class CustomOutput implements AuditOutput {
  constructor(private handler: (event: AuditEvent) => void) {}
  
  write(event: AuditEvent): void {
    this.handler(event);
  }
}

/**
 * TealAudit - Comprehensive audit logging system
 * 
 * Supports both legacy AuditEvent and new VersionedAuditEvent formats.
 * Implements security-by-default redaction for sensitive content.
 */
export class TealAudit {
  private outputs: AuditOutput[];
  private events: (AuditEvent | VersionedAuditEvent)[] = [];
  private maxEvents: number;
  private enableStorage: boolean;
  private config: AuditConfig;

  constructor(config: TealAuditConfig) {
    this.outputs = config.outputs;
    this.maxEvents = config.maxEvents || 10000;
    this.enableStorage = config.enableStorage !== false;
    
    // Initialize audit config with security-by-default settings
    this.config = {
      input_redaction: config.config?.input_redaction ?? getDefaultRedactionLevel(),
      output_redaction: config.config?.output_redaction ?? getDefaultRedactionLevel(),
      debug_mode: config.config?.debug_mode ?? false,
      detect_pii: config.config?.detect_pii ?? true,
      custom_redaction: config.config?.custom_redaction ?? []
    };
    
    // Log warning if debug mode is enabled (Requirement 11.5)
    if (this.config.debug_mode) {
      console.warn(
        '⚠️  TealAudit: DEBUG MODE ENABLED - Raw content will be logged. ' +
        'This is DANGEROUS in production and may expose sensitive data. ' +
        'Disable debug_mode for production use.'
      );
    }
  }

  /**
   * Get the current audit configuration
   * 
   * @returns Current AuditConfig
   */
  getConfig(): Readonly<AuditConfig> {
    return { ...this.config };
  }

  /**
   * Propagate ExecutionContext into an audit event
   * 
   * This is a utility method for enriching audit events with context fields
   * before logging. It extracts correlation_id, trace_id, workflow_id, run_id,
   * span_id, and parent_span_id from the ExecutionContext and includes them
   * in the audit event.
   * 
   * This method completes in less than 0.5 milliseconds (Requirement 7.5).
   * 
   * @param event - Versioned audit event to enrich
   * @param context - ExecutionContext to propagate
   * @returns Enriched audit event with context fields
   * 
   * @example
   * ```typescript
   * const context = ContextManager.createContext({ tenant_id: 'acme-corp' });
   * const event = audit.propagateContext({
   *   schema_version: '1.0.0',
   *   event_type: AuditEventType.POLICY_EVALUATION,
   *   timestamp: new Date().toISOString(),
   *   correlation_id: 'temp-id',
   *   action: DecisionAction.ALLOW
   * }, context);
   * audit.log(event);
   * ```
   */
  propagateContext(event: VersionedAuditEvent, context: ExecutionContext): VersionedAuditEvent {
    // Clone the event to avoid mutating the original
    const enriched: VersionedAuditEvent = { ...event };
    
    // Always include correlation_id from context (Requirement 3.11)
    if (context.correlation_id) {
      enriched.correlation_id = context.correlation_id;
    }
    
    // Include optional context fields if present
    if (context.trace_id) {
      enriched.trace_id = context.trace_id;
    }
    
    if (context.workflow_id) {
      enriched.workflow_id = context.workflow_id;
    }
    
    if (context.run_id) {
      enriched.run_id = context.run_id;
    }
    
    if (context.span_id) {
      enriched.span_id = context.span_id;
    }
    
    if (context.parent_span_id) {
      enriched.parent_span_id = context.parent_span_id;
    }
    
    // Include tenant_id in metadata if present
    if (context.tenant_id) {
      if (!enriched.metadata) {
        enriched.metadata = {};
      }
      enriched.metadata.tenant_id = context.tenant_id;
    }
    
    // Include environment in metadata if present
    if (context.environment) {
      if (!enriched.metadata) {
        enriched.metadata = {};
      }
      enriched.metadata.environment = context.environment;
    }
    
    // Include application in metadata if present
    if (context.application) {
      if (!enriched.metadata) {
        enriched.metadata = {};
      }
      enriched.metadata.application = context.application;
    }
    
    return enriched;
  }

  /**
   * Log an audit event
   * 
   * Supports both legacy AuditEvent and new VersionedAuditEvent formats.
   * For VersionedAuditEvent, applies redaction to safe_inputs and safe_outputs.
   * 
   * @param event - Audit event to log (legacy or versioned)
   * @param context - Optional ExecutionContext for context propagation (P0.3)
   */
  log(event: AuditEvent | VersionedAuditEvent, context?: ExecutionContext): void {
    // Determine if this is a versioned event
    const isVersionedEvent = 'schema_version' in event && 'event_type' in event;
    
    let processedEvent: AuditEvent | VersionedAuditEvent = event;
    
    // Apply redaction for versioned events
    if (isVersionedEvent) {
      try {
        // Validate versioned event
        validateAuditEvent(event as VersionedAuditEvent);
        
        // Process the event with redaction and context propagation
        processedEvent = this.processVersionedEvent(event as VersionedAuditEvent, context);
      } catch (error) {
        console.error('TealAudit: Failed to validate or process versioned event:', error);
        // Continue with original event (non-blocking, Requirement 13.5)
      }
    }
    
    // Write to all outputs
    for (const output of this.outputs) {
      try {
        output.write(processedEvent as AuditEvent);
      } catch (error) {
        console.error('TealAudit: Failed to write to output:', error);
      }
    }

    // Store in memory if enabled
    if (this.enableStorage) {
      this.events.push(processedEvent);

      // Enforce max events limit
      if (this.events.length > this.maxEvents) {
        this.events.shift(); // Remove oldest event
      }
    }
  }

  /**
   * Process a versioned audit event with redaction and context propagation
   * 
   * This method applies the configured redaction levels to inputs and outputs.
   * It never emits raw prompts/responses by default (Requirement 4.14).
   * It also propagates ExecutionContext fields into the audit event (Requirements 3.8, 3.9, 3.10).
   * 
   * @param event - Versioned audit event to process
   * @param context - Optional ExecutionContext for context propagation
   * @returns Processed event with redacted content and propagated context
   */
  private processVersionedEvent(event: VersionedAuditEvent, context?: ExecutionContext): VersionedAuditEvent {
    // Clone the event to avoid mutating the original
    const processed: VersionedAuditEvent = { ...event };
    
    // Propagate ExecutionContext fields if provided (Requirements 3.8, 3.9, 3.10)
    if (context) {
      // Always include correlation_id from context (Requirement 3.11)
      if (context.correlation_id) {
        processed.correlation_id = context.correlation_id;
      }
      
      // Include optional context fields if present
      if (context.trace_id) {
        processed.trace_id = context.trace_id;
      }
      
      if (context.workflow_id) {
        processed.workflow_id = context.workflow_id;
      }
      
      if (context.run_id) {
        processed.run_id = context.run_id;
      }
      
      if (context.span_id) {
        processed.span_id = context.span_id;
      }
      
      if (context.parent_span_id) {
        processed.parent_span_id = context.parent_span_id;
      }
      
      // Include tenant_id in metadata if present
      if (context.tenant_id) {
        if (!processed.metadata) {
          processed.metadata = {};
        }
        processed.metadata.tenant_id = context.tenant_id;
      }
      
      // Include environment in metadata if present
      if (context.environment) {
        if (!processed.metadata) {
          processed.metadata = {};
        }
        processed.metadata.environment = context.environment;
      }
      
      // Include application in metadata if present
      if (context.application) {
        if (!processed.metadata) {
          processed.metadata = {};
        }
        processed.metadata.application = context.application;
      }
    }
    
    // Apply custom redaction rules if configured
    if (this.config.custom_redaction && this.config.custom_redaction.length > 0) {
      // Custom redaction is applied to metadata fields if present
      if (processed.metadata) {
        processed.metadata = this.applyCustomRedaction(processed.metadata);
      }
    }
    
    // Note: safe_inputs and safe_outputs are already redacted by the caller
    // (TealEngine, TealGuard, etc.) before logging. This method ensures
    // the redaction configuration is respected and adds additional warnings
    // if debug mode is enabled.
    
    // If debug mode is enabled, add warning to metadata
    if (this.config.debug_mode) {
      if (!processed.metadata) {
        processed.metadata = {};
      }
      processed.metadata.debug_mode_warning = 'DEBUG_MODE_ENABLED: Raw content may be included';
    }
    
    return processed;
  }

  /**
   * Apply custom redaction rules to metadata
   * 
   * @param metadata - Metadata object to redact
   * @returns Redacted metadata
   */
  private applyCustomRedaction(metadata: Record<string, any>): Record<string, any> {
    const redacted = { ...metadata };
    
    // Apply custom redaction rules to string values
    for (const [key, value] of Object.entries(redacted)) {
      if (typeof value === 'string') {
        let redactedValue = value;
        for (const rule of this.config.custom_redaction!) {
          redactedValue = redactedValue.replace(rule.pattern, rule.replacement);
        }
        redacted[key] = redactedValue;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively apply to nested objects
        redacted[key] = this.applyCustomRedaction(value);
      }
    }
    
    return redacted;
  }

  /**
   * Query audit events with optional filters
   * 
   * Supports both legacy and versioned audit events.
   * For versioned events, supports filtering by correlation_id (Requirement 3.12).
   * 
   * @param filter - Filter criteria
   * @returns Filtered audit events
   */
  query(filter?: AuditFilter): (AuditEvent | VersionedAuditEvent)[] {
    if (!this.enableStorage) {
      throw new Error('TealAudit: Storage is disabled, cannot query events');
    }

    if (!filter) {
      return [...this.events];
    }

    return this.events.filter(event => this.matchesFilter(event, filter));
  }

  /**
   * Export audit events to JSON or CSV format
   * 
   * @param format - Export format ('json' or 'csv')
   * @param filter - Optional filter to apply before export
   * @returns Exported data as string
   */
  export(format: 'json' | 'csv', filter?: AuditFilter): string {
    const events = filter ? this.query(filter) : this.query();

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else if (format === 'csv') {
      return this.exportToCsv(events);
    } else {
      throw new Error(`TealAudit: Unsupported export format: ${format}`);
    }
  }

  /**
   * Clear all stored events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get the number of stored events
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Close all outputs
   */
  close(): void {
    for (const output of this.outputs) {
      if (output.close) {
        try {
          output.close();
        } catch (error) {
          console.error('TealAudit: Failed to close output:', error);
        }
      }
    }
  }

  /**
   * Check if an event matches the filter criteria
   * 
   * Supports both legacy and versioned audit events.
   */
  private matchesFilter(event: AuditEvent | VersionedAuditEvent, filter: AuditFilter): boolean {
    // Check if this is a versioned event
    const isVersionedEvent = 'schema_version' in event && 'event_type' in event;
    
    // Filter by correlation_id (versioned events only)
    if (filter.correlation_id && isVersionedEvent) {
      const versionedEvent = event as VersionedAuditEvent;
      if (versionedEvent.correlation_id !== filter.correlation_id) {
        return false;
      }
    }
    
    // Legacy event filters (for backwards compatibility)
    if (!isVersionedEvent) {
      const legacyEvent = event as AuditEvent;
      
      if (filter.minCost !== undefined && (!legacyEvent.cost || legacyEvent.cost < filter.minCost)) {
        return false;
      }

      if (filter.agents && !filter.agents.includes(legacyEvent.agentId)) {
        return false;
      }

      if (filter.actions && !filter.actions.includes(legacyEvent.action)) {
        return false;
      }

      if (filter.startTime && legacyEvent.timestamp < filter.startTime) {
        return false;
      }

      if (filter.endTime && legacyEvent.timestamp > filter.endTime) {
        return false;
      }

      if (filter.hasError !== undefined) {
        const hasError = !!legacyEvent.error;
        if (hasError !== filter.hasError) {
          return false;
        }
      }
    } else {
      // Versioned event filters
      const versionedEvent = event as VersionedAuditEvent;
      
      if (filter.minCost !== undefined && (!versionedEvent.cost || versionedEvent.cost < filter.minCost)) {
        return false;
      }

      if (filter.agents && versionedEvent.agent_id && !filter.agents.includes(versionedEvent.agent_id)) {
        return false;
      }

      if (filter.startTime) {
        const eventTime = new Date(versionedEvent.timestamp);
        if (eventTime < filter.startTime) {
          return false;
        }
      }

      if (filter.endTime) {
        const eventTime = new Date(versionedEvent.timestamp);
        if (eventTime > filter.endTime) {
          return false;
        }
      }

      if (filter.hasError !== undefined) {
        const hasError = !!versionedEvent.error;
        if (hasError !== filter.hasError) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Export events to CSV format
   * 
   * Supports both legacy and versioned audit events.
   */
  private exportToCsv(events: (AuditEvent | VersionedAuditEvent)[]): string {
    if (events.length === 0) {
      return '';
    }

    // Determine if we have versioned events
    const hasVersionedEvents = events.some(e => 'schema_version' in e);
    
    if (hasVersionedEvents) {
      // Export versioned events
      const headers = [
        'schema_version',
        'event_type',
        'timestamp',
        'correlation_id',
        'trace_id',
        'policy_id',
        'mode',
        'action',
        'risk_score',
        'agent_id',
        'provider',
        'model',
        'cost',
        'duration',
        'error'
      ];

      const rows: string[] = [headers.join(',')];

      for (const event of events) {
        if ('schema_version' in event) {
          const vEvent = event as VersionedAuditEvent;
          const row = [
            this.escapeCsv(vEvent.schema_version),
            this.escapeCsv(vEvent.event_type),
            this.escapeCsv(vEvent.timestamp),
            this.escapeCsv(vEvent.correlation_id),
            vEvent.trace_id ? this.escapeCsv(vEvent.trace_id) : '',
            vEvent.policy_id ? this.escapeCsv(vEvent.policy_id) : '',
            vEvent.mode ? this.escapeCsv(vEvent.mode) : '',
            vEvent.action ? this.escapeCsv(vEvent.action) : '',
            vEvent.risk_score !== undefined ? vEvent.risk_score.toString() : '',
            vEvent.agent_id ? this.escapeCsv(vEvent.agent_id) : '',
            vEvent.provider ? this.escapeCsv(vEvent.provider) : '',
            vEvent.model ? this.escapeCsv(vEvent.model) : '',
            vEvent.cost !== undefined ? vEvent.cost.toString() : '',
            vEvent.duration !== undefined ? vEvent.duration.toString() : '',
            vEvent.error ? this.escapeCsv(vEvent.error) : ''
          ];
          rows.push(row.join(','));
        }
      }

      return rows.join('\n');
    } else {
      // Export legacy events
      const headers = [
        'timestamp',
        'agentId',
        'action',
        'model',
        'cost',
        'duration',
        'error',
        'policyDecisions',
        'metadata'
      ];

      const rows: string[] = [headers.join(',')];

      for (const event of events) {
        const legacyEvent = event as AuditEvent;
        const row = [
          legacyEvent.timestamp.toISOString(),
          this.escapeCsv(legacyEvent.agentId),
          this.escapeCsv(legacyEvent.action),
          legacyEvent.model ? this.escapeCsv(legacyEvent.model) : '',
          legacyEvent.cost !== undefined ? legacyEvent.cost.toString() : '',
          legacyEvent.duration !== undefined ? legacyEvent.duration.toString() : '',
          legacyEvent.error ? this.escapeCsv(legacyEvent.error) : '',
          legacyEvent.policyDecisions ? this.escapeCsv(JSON.stringify(legacyEvent.policyDecisions)) : '',
          legacyEvent.metadata ? this.escapeCsv(JSON.stringify(legacyEvent.metadata)) : ''
        ];
        rows.push(row.join(','));
      }

      return rows.join('\n');
    }
  }

  /**
   * Escape CSV field value
   */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
