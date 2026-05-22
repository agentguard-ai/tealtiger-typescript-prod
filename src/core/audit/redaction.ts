/**
 * TealAudit - Content Redaction
 * 
 * Implements security-by-default content redaction for audit logging.
 * Part of TealTiger v1.1.x - Enterprise Adoption Features (P0.4)
 * 
 * @module core/audit/redaction
 */

import { createHash } from 'crypto';
import { SafeContent } from './types';
import { getDefaultLogger } from '../../utils/logger';

/**
 * Redaction level enumeration
 * Defines strategies for removing sensitive content from audit logs
 * 
 * @enum {string}
 */
export enum RedactionLevel {
  /** No redaction - includes raw content (DANGEROUS: debug mode only) */
  NONE = 'NONE',
  
  /** Hash content using SHA-256 (default, secure) */
  HASH = 'HASH',
  
  /** Show size/length only */
  SIZE_ONLY = 'SIZE_ONLY',
  
  /** Show category/type only */
  CATEGORY_ONLY = 'CATEGORY_ONLY',
  
  /** Complete redaction - no metadata */
  FULL = 'FULL'
}

/**
 * Content category for categorization
 */
export type ContentCategory = 
  | 'prompt'
  | 'response'
  | 'tool_params'
  | 'tool_result'
  | 'code'
  | 'data'
  | 'unknown';

/**
 * Safe content with raw data (debug mode only)
 */
export interface SafeContentWithRaw extends SafeContent {
  /** Raw content (only present when RedactionLevel.NONE) */
  raw?: string;
  
  /** Warning message (present when raw content is included) */
  warning?: string;
  
  /** Redacted flag (present when RedactionLevel.FULL) */
  redacted?: boolean;
  
  /** Additional metadata (PII detection, errors, etc.) */
  metadata?: {
    /** PII was detected in content */
    pii_detected?: boolean;
    
    /** Number of PII instances detected */
    pii_count?: number;
    
    /** Types of PII detected */
    pii_types?: string[];
    
    /** PII detection failed */
    pii_detection_failed?: boolean;
    
    /** Error message if detection failed */
    error?: string;
    
    /** Additional metadata */
    [key: string]: any;
  };
}

/**
 * Redacts content according to the specified redaction level
 * 
 * This function implements the core redaction algorithm with security-by-default.
 * Raw content is NEVER included unless RedactionLevel.NONE is explicitly used.
 * 
 * Performance target: < 5ms for 10KB content (Requirement 10.4)
 * 
 * @param content - Content to redact
 * @param redactionLevel - Redaction strategy to apply
 * @param category - Optional content category for CATEGORY_ONLY level
 * @returns SafeContent object with redacted metadata
 * 
 * @example
 * ```typescript
 * // Hash redaction (default, secure)
 * const safe = redactContent('sensitive data', RedactionLevel.HASH);
 * // { hash: 'sha256:abc123...', size: 14 }
 * 
 * // Size only
 * const safe = redactContent('sensitive data', RedactionLevel.SIZE_ONLY);
 * // { size: 14 }
 * 
 * // Category only
 * const safe = redactContent('SELECT * FROM users', RedactionLevel.CATEGORY_ONLY, 'code');
 * // { category: 'code' }
 * 
 * // Full redaction
 * const safe = redactContent('sensitive data', RedactionLevel.FULL);
 * // { redacted: true }
 * 
 * // Debug mode (DANGEROUS)
 * const safe = redactContent('sensitive data', RedactionLevel.NONE);
 * // { raw: 'sensitive data', warning: 'DEBUG_MODE_ENABLED' }
 * ```
 */
export function redactContent(
  content: string,
  redactionLevel: RedactionLevel,
  category?: ContentCategory
): SafeContentWithRaw {
  // Handle null/undefined content
  if (content === null || content === undefined) {
    content = '';
  }
  
  // Apply redaction based on level
  switch (redactionLevel) {
    case RedactionLevel.NONE:
      // DANGEROUS: Only for debug mode
      // Raw content is included with explicit warning
      return {
        raw: content,
        warning: 'DEBUG_MODE_ENABLED',
        size: content.length,
        ...(category && { category })
      };
    
    case RedactionLevel.HASH:
      // Default secure mode: SHA-256 hash + size
      // Provides content verification without exposing raw data
      return {
        hash: computeSHA256Hash(content),
        size: content.length,
        ...(category && { category })
      };
    
    case RedactionLevel.SIZE_ONLY:
      // Minimal metadata: size only
      return {
        size: content.length
      };
    
    case RedactionLevel.CATEGORY_ONLY:
      // Minimal metadata: category only
      return {
        category: category || categorizeContent(content)
      };
    
    case RedactionLevel.FULL:
      // Complete redaction: no metadata
      return {
        redacted: true
      } as SafeContentWithRaw;
    
    default:
      // Fallback to FULL redaction for unknown levels (safe default)
      return {
        redacted: true
      } as SafeContentWithRaw;
  }
}

/**
 * Computes SHA-256 hash of content
 * 
 * Uses Node.js crypto module for secure, collision-resistant hashing.
 * Hash is prefixed with 'sha256:' for clarity.
 * 
 * @param content - Content to hash
 * @returns SHA-256 hash with 'sha256:' prefix
 * 
 * @example
 * ```typescript
 * const hash = computeSHA256Hash('hello world');
 * // 'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
 * ```
 */
export function computeSHA256Hash(content: string): string {
  const hash = createHash('sha256');
  hash.update(content, 'utf8');
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Categorizes content based on heuristics
 * 
 * Attempts to determine content type for CATEGORY_ONLY redaction level.
 * Uses simple pattern matching - not intended for security decisions.
 * 
 * @param content - Content to categorize
 * @returns Content category
 * 
 * @example
 * ```typescript
 * categorizeContent('SELECT * FROM users');  // 'code'
 * categorizeContent('{"key": "value"}');     // 'data'
 * categorizeContent('Hello, how are you?');  // 'prompt'
 * ```
 */
export function categorizeContent(content: string): ContentCategory {
  if (!content || content.length === 0) {
    return 'unknown';
  }
  
  // Trim for analysis
  const trimmed = content.trim();
  
  // Check for empty after trim
  if (trimmed.length === 0) {
    return 'unknown';
  }
  
  // Check for tool-related content (before JSON check)
  if (trimmed.includes('tool:') || trimmed.includes('function_call')) {
    return 'tool_params';
  }
  
  // Check for code patterns
  if (
    trimmed.startsWith('SELECT') ||
    trimmed.startsWith('INSERT') ||
    trimmed.startsWith('UPDATE') ||
    trimmed.startsWith('DELETE') ||
    trimmed.includes('function ') ||
    trimmed.includes('const ') ||
    trimmed.includes('let ') ||
    trimmed.includes('var ') ||
    trimmed.includes('def ') ||
    trimmed.includes('class ')
  ) {
    return 'code';
  }
  
  // Check for structured data (JSON, XML)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('<') && trimmed.endsWith('>'))
  ) {
    return 'data';
  }
  
  // Default to prompt for natural language
  return 'prompt';
}

/**
 * Validates that a RedactionLevel value is valid
 * 
 * @param level - The redaction level to validate
 * @returns true if valid, false otherwise
 */
export function isValidRedactionLevel(level: any): level is RedactionLevel {
  return Object.values(RedactionLevel).includes(level);
}

/**
 * Gets the default redaction level (HASH)
 * 
 * This is the security-by-default redaction level used in production.
 * 
 * @returns Default RedactionLevel (HASH)
 */
export function getDefaultRedactionLevel(): RedactionLevel {
  return RedactionLevel.HASH;
}

/**
 * PII pattern definitions
 * Pre-compiled regex patterns for detecting common PII types
 */
const PII_PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  
  // Phone numbers (US and international formats)
  phone: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  
  // Social Security Numbers (SSN)
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  
  // Credit card numbers (with spaces or dashes)
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  
  // IP addresses (IPv4)
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  
  // API keys and tokens (common patterns)
  apiKey: /\b[A-Za-z0-9_-]{32,}\b/g
};

/**
 * PII detection result
 */
export interface PIIDetection {
  /** Type of PII detected */
  type: string;
  
  /** Detected value */
  value: string;
  
  /** Position in text */
  position: number;
  
  /** Length of detected value */
  length: number;
}

/**
 * Detects PII patterns in content
 * 
 * This function scans content for common PII patterns including:
 * - Email addresses
 * - Phone numbers
 * - Social Security Numbers (SSN)
 * - Credit card numbers
 * - IP addresses
 * - API keys and tokens
 * 
 * Performance: Optimized with pre-compiled regex patterns
 * 
 * @param content - Content to scan for PII
 * @returns Array of detected PII instances
 * 
 * @example
 * ```typescript
 * const detections = detectPIIPatterns('Email: test@example.com, SSN: 123-45-6789');
 * // [
 * //   { type: 'email', value: 'test@example.com', position: 7, length: 16 },
 * //   { type: 'ssn', value: '123-45-6789', position: 30, length: 11 }
 * // ]
 * ```
 */
export function detectPIIPatterns(content: string): PIIDetection[] {
  // Handle null/undefined/empty content
  if (!content || typeof content !== 'string' || content.length === 0) {
    return [];
  }
  
  const detections: PIIDetection[] = [];
  
  // Scan for each PII pattern type
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    // Reset regex lastIndex for reuse
    pattern.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      detections.push({
        type,
        value: match[0],
        position: match.index,
        length: match[0].length
      });
    }
  }
  
  return detections;
}

/**
 * Redacts PII patterns from content
 * 
 * Replaces detected PII with redaction markers (e.g., [REDACTED_EMAIL]).
 * Processes detections in reverse order to maintain string indices.
 * 
 * @param content - Content to redact
 * @param detections - PII detections to redact
 * @returns Content with PII redacted
 * 
 * @example
 * ```typescript
 * const content = 'Email: test@example.com, SSN: 123-45-6789';
 * const detections = detectPIIPatterns(content);
 * const redacted = redactPIIFromContent(content, detections);
 * // 'Email: [REDACTED_EMAIL], SSN: [REDACTED_SSN]'
 * ```
 */
export function redactPIIFromContent(content: string, detections: PIIDetection[]): string {
  // Handle null/undefined/empty content
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  // No detections, return original content
  if (!detections || detections.length === 0) {
    return content;
  }
  
  let redacted = content;
  
  // Sort detections by position in reverse order to maintain indices
  const sorted = [...detections].sort((a, b) => b.position - a.position);
  
  // Replace each detection with redaction marker
  for (const detection of sorted) {
    const before = redacted.substring(0, detection.position);
    const after = redacted.substring(detection.position + detection.length);
    const marker = `[REDACTED_${detection.type.toUpperCase()}]`;
    redacted = before + marker + after;
  }
  
  return redacted;
}

/**
 * Redacts content with PII detection enabled
 * 
 * This is the main entry point for PII-aware redaction.
 * It combines PII detection with the standard redaction logic.
 * 
 * Process:
 * 1. Detect PII patterns in content
 * 2. If PII detected, redact PII first
 * 3. Apply standard redaction level to the redacted content
 * 4. If PII detection fails, fall back to FULL redaction (Requirement 13.3)
 * 
 * Security guarantee: Never logs raw PII in audit events (Requirement 11.2)
 * 
 * @param content - Content to redact
 * @param redactionLevel - Redaction strategy to apply
 * @param category - Optional content category
 * @param detectPII - Enable PII detection (default: true)
 * @returns SafeContent object with PII-aware redaction
 * 
 * @example
 * ```typescript
 * // With PII detection (default)
 * const safe = redactContentWithPII('Email: test@example.com', RedactionLevel.HASH);
 * // Content is first PII-redacted, then hashed
 * 
 * // Without PII detection
 * const safe = redactContentWithPII('Hello world', RedactionLevel.HASH, undefined, false);
 * // Standard redaction without PII detection
 * ```
 */
export function redactContentWithPII(
  content: string,
  redactionLevel: RedactionLevel,
  category?: ContentCategory,
  detectPII: boolean = true
): SafeContentWithRaw {
  // Handle null/undefined content
  if (content === null || content === undefined) {
    content = '';
  }
  
  // If PII detection is disabled, use standard redaction
  if (!detectPII) {
    return redactContent(content, redactionLevel, category);
  }
  
  try {
    // Detect PII patterns
    const detections = detectPIIPatterns(content);
    
    // If PII detected, redact it first
    let processedContent = content;
    if (detections.length > 0) {
      processedContent = redactPIIFromContent(content, detections);
    }
    
    // Apply standard redaction to the PII-redacted content
    const result = redactContent(processedContent, redactionLevel, category);
    
    // Add PII detection metadata
    if (detections.length > 0) {
      return {
        ...result,
        metadata: {
          pii_detected: true,
          pii_count: detections.length,
          pii_types: [...new Set(detections.map(d => d.type))]
        }
      };
    }
    
    return result;
  } catch (error) {
    // Requirement 13.3: Fall back to FULL redaction if PII detection fails
    getDefaultLogger().error('PII detection failed, falling back to FULL redaction:', error);
    return {
      redacted: true,
      metadata: {
        pii_detection_failed: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } as SafeContentWithRaw;
  }
}
