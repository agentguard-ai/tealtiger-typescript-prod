/**
 * TealTiger SDK v1.1.x - Enterprise Adoption Features
 * P0.3: Correlation IDs and Traceability
 * 
 * ContextManager utility for creating and managing ExecutionContext
 * 
 * @module core/context/ContextManager
 * @version 1.1.0
 */

import { 
  ExecutionContext, 
  ExecutionContextOptions,
  CONTEXT_HEADERS,
  isValidUUIDv4,
  isValidCorrelationId,
  validateExecutionContext
} from './ExecutionContext';

/**
 * Generates a cryptographically random UUID v4
 * Uses crypto.randomUUID() if available, falls back to custom implementation
 * 
 * @returns UUID v4 string
 */
export function generateUUIDv4(): string {
  // Use native crypto.randomUUID() if available (Node.js 16.7.0+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  // Fallback implementation for older environments
  // Uses crypto.getRandomValues() for cryptographic randomness
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
    
    // Convert to hex string with dashes
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  
  // Last resort: Math.random() (NOT cryptographically secure, should not be used in production)
  console.warn('TealTiger: Using Math.random() for UUID generation. This is NOT cryptographically secure. Please upgrade to Node.js 16.7.0+ or use a modern browser.');
  
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generates a new correlation ID (UUID v4)
 * 
 * @returns Correlation ID string (UUID v4)
 */
export function generateCorrelationId(): string {
  return generateUUIDv4();
}

/**
 * Generates a new span ID (8 bytes hex)
 * Compatible with OpenTelemetry span ID format
 * 
 * @returns Span ID string (16 hex characters)
 */
export function generateSpanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback for older environments
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Generates a W3C Trace Context compatible trace ID (32 hex characters)
 * 
 * @returns Trace ID string (32 hex characters)
 */
export function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback for older environments
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * ContextManager utility class for creating and managing ExecutionContext
 * Provides methods for context creation, propagation, and HTTP header conversion
 */
export class ContextManager {
  /**
   * Creates a new ExecutionContext with auto-generated correlation ID
   * 
   * @param options - Optional context options
   * @returns New ExecutionContext with generated correlation_id
   */
  static createContext(options: ExecutionContextOptions = {}): ExecutionContext {
    const context: ExecutionContext = {
      correlation_id: options.correlation_id || generateCorrelationId(),
      created_at: new Date().toISOString()
    };
    
    // Add optional fields if provided
    if (options.trace_id) context.trace_id = options.trace_id;
    if (options.workflow_id) context.workflow_id = options.workflow_id;
    if (options.run_id) context.run_id = options.run_id;
    if (options.span_id) context.span_id = options.span_id;
    if (options.parent_span_id) context.parent_span_id = options.parent_span_id;
    if (options.tenant_id) context.tenant_id = options.tenant_id;
    if (options.application) context.application = options.application;
    if (options.environment) context.environment = options.environment;
    if (options.agent_purpose) context.agent_purpose = options.agent_purpose;
    if (options.session_id) context.session_id = options.session_id;
    if (options.user_id) context.user_id = options.user_id;
    if (options.metadata) context.metadata = { ...options.metadata };
    
    return context;
  }
  
  /**
   * Creates a new ExecutionContext from HTTP headers
   * Extracts context information from standard headers
   * 
   * @param headers - HTTP headers object (key-value pairs)
   * @returns ExecutionContext extracted from headers
   */
  static fromHeaders(headers: Record<string, string | string[] | undefined>): ExecutionContext {
    const getHeader = (key: string): string | undefined => {
      // Try exact match first
      if (headers[key]) {
        const value = headers[key];
        return Array.isArray(value) ? value[0] : value;
      }
      
      // Try case-insensitive match
      const lowerKey = key.toLowerCase();
      for (const headerKey of Object.keys(headers)) {
        if (headerKey.toLowerCase() === lowerKey) {
          const value = headers[headerKey];
          return Array.isArray(value) ? value[0] : value;
        }
      }
      
      return undefined;
    };
    
    const options: Partial<ExecutionContextOptions> = {};
    
    const correlationId = getHeader(CONTEXT_HEADERS.CORRELATION_ID);
    if (correlationId) options.correlation_id = correlationId;
    
    const traceId = getHeader(CONTEXT_HEADERS.TRACE_ID);
    if (traceId) options.trace_id = traceId;
    
    const workflowId = getHeader(CONTEXT_HEADERS.WORKFLOW_ID);
    if (workflowId) options.workflow_id = workflowId;
    
    const runId = getHeader(CONTEXT_HEADERS.RUN_ID);
    if (runId) options.run_id = runId;
    
    const spanId = getHeader(CONTEXT_HEADERS.SPAN_ID);
    if (spanId) options.span_id = spanId;
    
    const parentSpanId = getHeader(CONTEXT_HEADERS.PARENT_SPAN_ID);
    if (parentSpanId) options.parent_span_id = parentSpanId;
    
    const tenantId = getHeader(CONTEXT_HEADERS.TENANT_ID);
    if (tenantId) options.tenant_id = tenantId;
    
    const application = getHeader(CONTEXT_HEADERS.APPLICATION);
    if (application) options.application = application;
    
    const environment = getHeader(CONTEXT_HEADERS.ENVIRONMENT);
    if (environment) options.environment = environment;
    
    const agentPurpose = getHeader(CONTEXT_HEADERS.AGENT_PURPOSE);
    if (agentPurpose) options.agent_purpose = agentPurpose;
    
    const sessionId = getHeader(CONTEXT_HEADERS.SESSION_ID);
    if (sessionId) options.session_id = sessionId;
    
    const userId = getHeader(CONTEXT_HEADERS.USER_ID);
    if (userId) options.user_id = userId;
    
    return this.createContext(options as ExecutionContextOptions);
  }
  
  /**
   * Converts ExecutionContext to HTTP headers for propagation
   * 
   * @param context - ExecutionContext to convert
   * @returns HTTP headers object
   */
  static toHeaders(context: ExecutionContext): Record<string, string> {
    const headers: Record<string, string> = {
      [CONTEXT_HEADERS.CORRELATION_ID]: context.correlation_id
    };
    
    if (context.trace_id) headers[CONTEXT_HEADERS.TRACE_ID] = context.trace_id;
    if (context.workflow_id) headers[CONTEXT_HEADERS.WORKFLOW_ID] = context.workflow_id;
    if (context.run_id) headers[CONTEXT_HEADERS.RUN_ID] = context.run_id;
    if (context.span_id) headers[CONTEXT_HEADERS.SPAN_ID] = context.span_id;
    if (context.parent_span_id) headers[CONTEXT_HEADERS.PARENT_SPAN_ID] = context.parent_span_id;
    if (context.tenant_id) headers[CONTEXT_HEADERS.TENANT_ID] = context.tenant_id;
    if (context.application) headers[CONTEXT_HEADERS.APPLICATION] = context.application;
    if (context.environment) headers[CONTEXT_HEADERS.ENVIRONMENT] = context.environment;
    if (context.agent_purpose) headers[CONTEXT_HEADERS.AGENT_PURPOSE] = context.agent_purpose;
    if (context.session_id) headers[CONTEXT_HEADERS.SESSION_ID] = context.session_id;
    if (context.user_id) headers[CONTEXT_HEADERS.USER_ID] = context.user_id;
    
    return headers;
  }
  
  /**
   * Propagates context by creating a new child context
   * Preserves correlation_id, workflow_id, run_id
   * Generates new span_id and sets parent_span_id
   * 
   * @param parentContext - Parent ExecutionContext
   * @param options - Optional overrides for child context
   * @returns New child ExecutionContext
   */
  static propagate(
    parentContext: ExecutionContext,
    options: Partial<ExecutionContextOptions> = {}
  ): ExecutionContext {
    validateExecutionContext(parentContext);
    
    const childContext: ExecutionContext = {
      // Required field
      correlation_id: parentContext.correlation_id,
      
      // Generate new span
      span_id: generateSpanId(),
      
      // Timestamp
      created_at: new Date().toISOString()
    };
    
    // Set parent_span_id only if parent has span_id
    if (parentContext.span_id) {
      childContext.parent_span_id = parentContext.span_id;
    }
    
    // Preserve optional fields from parent if they exist
    if (parentContext.workflow_id) childContext.workflow_id = parentContext.workflow_id;
    if (parentContext.run_id) childContext.run_id = parentContext.run_id;
    if (parentContext.trace_id) childContext.trace_id = parentContext.trace_id;
    if (parentContext.tenant_id) childContext.tenant_id = parentContext.tenant_id;
    if (parentContext.application) childContext.application = parentContext.application;
    if (parentContext.environment) childContext.environment = parentContext.environment;
    if (parentContext.agent_purpose) childContext.agent_purpose = parentContext.agent_purpose;
    if (parentContext.session_id) childContext.session_id = parentContext.session_id;
    if (parentContext.user_id) childContext.user_id = parentContext.user_id;
    
    // Merge metadata
    if (parentContext.metadata || options.metadata) {
      childContext.metadata = {
        ...parentContext.metadata,
        ...options.metadata
      };
    }
    
    // Apply overrides (only set if defined)
    if (options.trace_id) childContext.trace_id = options.trace_id;
    if (options.workflow_id) childContext.workflow_id = options.workflow_id;
    if (options.run_id) childContext.run_id = options.run_id;
    if (options.span_id) childContext.span_id = options.span_id;
    if (options.tenant_id) childContext.tenant_id = options.tenant_id;
    if (options.application) childContext.application = options.application;
    if (options.environment) childContext.environment = options.environment;
    if (options.agent_purpose) childContext.agent_purpose = options.agent_purpose;
    if (options.session_id) childContext.session_id = options.session_id;
    if (options.user_id) childContext.user_id = options.user_id;
    
    return childContext;
  }
  
  /**
   * Enriches an existing context with additional metadata
   * 
   * @param context - ExecutionContext to enrich
   * @param metadata - Additional metadata to add
   * @returns New ExecutionContext with enriched metadata
   */
  static enrich(
    context: ExecutionContext,
    metadata: Record<string, any>
  ): ExecutionContext {
    return {
      ...context,
      metadata: {
        ...context.metadata,
        ...metadata
      }
    };
  }
  
  /**
   * Validates that a context is valid
   * 
   * @param context - ExecutionContext to validate
   * @returns true if valid, false otherwise
   */
  static isValid(context: ExecutionContext): boolean {
    try {
      validateExecutionContext(context);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Extracts context from various sources (headers, existing context, or creates new)
   * 
   * @param source - Headers object, ExecutionContext, or undefined
   * @returns ExecutionContext
   */
  static extract(
    source?: Record<string, string | string[] | undefined> | ExecutionContext
  ): ExecutionContext {
    if (!source) {
      return this.createContext();
    }
    
    // If already an ExecutionContext, validate and return
    if ('correlation_id' in source) {
      validateExecutionContext(source as ExecutionContext);
      return source as ExecutionContext;
    }
    
    // Otherwise treat as headers
    return this.fromHeaders(source as Record<string, string | string[] | undefined>);
  }
}

// Export utility functions
export {
  ExecutionContext,
  ExecutionContextOptions,
  CONTEXT_HEADERS,
  isValidUUIDv4,
  isValidCorrelationId,
  validateExecutionContext
};
