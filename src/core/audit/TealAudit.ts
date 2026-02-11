/**
 * TealAudit - Audit Logging System
 * 
 * Comprehensive audit logging for compliance and debugging.
 * Supports multiple output targets (console, file, custom) with filtering and export capabilities.
 * 
 * @example
 * ```typescript
 * const audit = new TealAudit({
 *   outputs: [
 *     new ConsoleOutput(),
 *     new FileOutput('./audit.log')
 *   ]
 * });
 * 
 * audit.log({
 *   timestamp: new Date(),
 *   agentId: 'agent-1',
 *   action: 'chat.create',
 *   model: 'gpt-4',
 *   cost: 0.05,
 *   duration: 1200
 * });
 * 
 * // Query events
 * const events = audit.query({
 *   minCost: 0.01,
 *   startTime: new Date('2026-01-01')
 * });
 * 
 * // Export to JSON
 * const json = audit.export('json');
 * ```
 */

/**
 * Audit event representing a logged action
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
 */
export class TealAudit {
  private outputs: AuditOutput[];
  private events: AuditEvent[] = [];
  private maxEvents: number;
  private enableStorage: boolean;

  constructor(config: TealAuditConfig) {
    this.outputs = config.outputs;
    this.maxEvents = config.maxEvents || 10000;
    this.enableStorage = config.enableStorage !== false;
  }

  /**
   * Log an audit event
   * 
   * @param event - Audit event to log
   */
  log(event: AuditEvent): void {
    // Write to all outputs
    for (const output of this.outputs) {
      try {
        output.write(event);
      } catch (error) {
        console.error('TealAudit: Failed to write to output:', error);
      }
    }

    // Store in memory if enabled
    if (this.enableStorage) {
      this.events.push(event);

      // Enforce max events limit
      if (this.events.length > this.maxEvents) {
        this.events.shift(); // Remove oldest event
      }
    }
  }

  /**
   * Query audit events with optional filters
   * 
   * @param filter - Filter criteria
   * @returns Filtered audit events
   */
  query(filter?: AuditFilter): AuditEvent[] {
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
   */
  private matchesFilter(event: AuditEvent, filter: AuditFilter): boolean {
    if (filter.minCost !== undefined && (!event.cost || event.cost < filter.minCost)) {
      return false;
    }

    if (filter.agents && !filter.agents.includes(event.agentId)) {
      return false;
    }

    if (filter.actions && !filter.actions.includes(event.action)) {
      return false;
    }

    if (filter.startTime && event.timestamp < filter.startTime) {
      return false;
    }

    if (filter.endTime && event.timestamp > filter.endTime) {
      return false;
    }

    if (filter.hasError !== undefined) {
      const hasError = !!event.error;
      if (hasError !== filter.hasError) {
        return false;
      }
    }

    return true;
  }

  /**
   * Export events to CSV format
   */
  private exportToCsv(events: AuditEvent[]): string {
    if (events.length === 0) {
      return '';
    }

    // CSV header
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

    // CSV rows
    for (const event of events) {
      const row = [
        event.timestamp.toISOString(),
        this.escapeCsv(event.agentId),
        this.escapeCsv(event.action),
        event.model ? this.escapeCsv(event.model) : '',
        event.cost !== undefined ? event.cost.toString() : '',
        event.duration !== undefined ? event.duration.toString() : '',
        event.error ? this.escapeCsv(event.error) : '',
        event.policyDecisions ? this.escapeCsv(JSON.stringify(event.policyDecisions)) : '',
        event.metadata ? this.escapeCsv(JSON.stringify(event.metadata)) : ''
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
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
