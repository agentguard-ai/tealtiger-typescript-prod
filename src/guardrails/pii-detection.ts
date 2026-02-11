/**
 * PII Detection Guardrail
 * 
 * Detects and handles Personally Identifiable Information (PII) in text:
 * - Email addresses
 * - Phone numbers (US and international formats)
 * - Social Security Numbers (SSN)
 * - Credit card numbers
 * - Names (basic pattern matching)
 * 
 * Performance Optimizations (v1.1.0):
 * - Pre-compiled regex patterns with optimized flags
 * - Pattern caching for repeated detections
 * - Early exit on empty/short text
 * - Optimized text extraction logic
 * - Reduced string allocations
 */

import { Guardrail, GuardrailConfig, GuardrailResult } from './base';

interface PIIDetection {
  type: string;
  value: string;
  position: number;
  length: number;
}

export interface PIIDetectionConfig extends GuardrailConfig {
  detectTypes?: string[];
  action?: 'block' | 'redact' | 'mask' | 'allow';
  riskScores?: Record<string, number>;
  /** Enable pattern caching (default: true) */
  enableCache?: boolean;
  /** Minimum text length to scan (default: 3) */
  minTextLength?: number;
}

/**
 * Optimized PII Detection Guardrail
 * 
 * Performance improvements:
 * - Pre-compiled patterns with sticky flag where applicable
 * - Pattern result caching
 * - Early exit for short text
 * - Optimized text extraction
 */
export class PIIDetectionGuardrail extends Guardrail {
  // Pre-compiled patterns (compiled once at construction)
  private readonly patterns: Record<string, RegExp>;
  private readonly detectTypes: string[];
  private readonly action: 'block' | 'redact' | 'mask' | 'allow';
  private readonly riskScores: Record<string, number>;
  private readonly enableCache: boolean;
  private readonly minTextLength: number;
  
  // Pattern cache for repeated text
  private patternCache: Map<string, PIIDetection[]> = new Map();
  private readonly maxCacheSize = 100;

  constructor(config: PIIDetectionConfig = {}) {
    super({
      name: 'PIIDetection',
      description: 'Detects personally identifiable information in text',
      version: '1.1.0',
      ...config,
    });

    // Pre-compile patterns with optimized flags
    // Using 'g' flag for global matching, patterns are compiled once
    this.patterns = {
      // Optimized email pattern - more specific to reduce false positives
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      // Optimized phone pattern - handles common formats
      phone: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      // SSN pattern - strict format
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      // Credit card pattern - handles spaces and dashes
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      // Name pattern - basic capitalized words
      name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
    };

    this.detectTypes = config.detectTypes || ['email', 'phone', 'ssn', 'creditCard'];
    this.action = config.action || 'block';
    this.riskScores = config.riskScores || {
      email: 30,
      phone: 40,
      ssn: 90,
      creditCard: 95,
      name: 20,
    };
    this.enableCache = config.enableCache !== false; // Default true
    this.minTextLength = config.minTextLength || 3;
  }

  /**
   * Evaluate input for PII detection
   * 
   * Optimizations:
   * - Early exit for empty/short text
   * - Cache lookup for repeated text
   * - Optimized text extraction
   */
  async evaluate(input: any, _context?: Record<string, any>): Promise<GuardrailResult> {
    const text = this.extractText(input);

    // Early exit for empty or very short text
    if (!text || text.length < this.minTextLength) {
      return new GuardrailResult({
        passed: true,
        action: 'allow',
        reason: 'Text too short for PII detection',
        metadata: { detections: [] },
        riskScore: 0,
      });
    }

    // Check cache first
    let detections: PIIDetection[];
    if (this.enableCache) {
      const cached = this.patternCache.get(text);
      if (cached) {
        detections = cached;
      } else {
        detections = this.detectPII(text);
        this.addToCache(text, detections);
      }
    } else {
      detections = this.detectPII(text);
    }

    if (detections.length === 0) {
      return new GuardrailResult({
        passed: true,
        action: 'allow',
        reason: 'No PII detected',
        metadata: { detections: [] },
        riskScore: 0,
      });
    }

    const maxRiskScore = Math.max(...detections.map((d) => this.riskScores[d.type] || 50));
    const action = this.action;
    const passed = action === 'allow' || action === 'redact' || action === 'mask';

    const metadata: Record<string, any> = { detections };
    if (action === 'redact') {
      metadata.redactedText = this.redactPII(text, detections);
    } else if (action === 'mask') {
      metadata.maskedText = this.maskPII(text, detections);
    }

    return new GuardrailResult({
      passed,
      action,
      reason: `Detected ${detections.length} PII instance(s): ${detections.map((d) => d.type).join(', ')}`,
      metadata,
      riskScore: maxRiskScore,
    });
  }

  /**
   * Extract text from various input formats
   * 
   * Optimized to minimize string allocations
   */
  private extractText(input: any): string {
    // Fast path for string input
    if (typeof input === 'string') {
      return input;
    }

    // Check common properties without creating intermediate objects
    if (input.prompt) {
      return input.prompt;
    }

    if (input.text) {
      return input.text;
    }

    // Handle messages array efficiently
    if (input.messages && Array.isArray(input.messages)) {
      // Pre-allocate array for better performance
      const parts: string[] = new Array(input.messages.length);
      for (let i = 0; i < input.messages.length; i++) {
        parts[i] = input.messages[i].content || '';
      }
      return parts.join(' ');
    }

    // Fallback to JSON stringify
    return JSON.stringify(input);
  }

  /**
   * Detect PII in text using pre-compiled patterns
   * 
   * Optimized with pattern reuse and minimal allocations
   */
  private detectPII(text: string): PIIDetection[] {
    const detections: PIIDetection[] = [];

    for (const type of this.detectTypes) {
      const pattern = this.patterns[type];
      if (!pattern) continue;

      // Reset regex lastIndex for reuse
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        detections.push({
          type,
          value: match[0],
          position: match.index,
          length: match[0].length,
        });
      }
    }

    return detections;
  }

  /**
   * Add detection result to cache with LRU eviction
   */
  private addToCache(text: string, detections: PIIDetection[]): void {
    // Simple LRU: if cache is full, clear it
    // More sophisticated LRU could be added if needed
    if (this.patternCache.size >= this.maxCacheSize) {
      this.patternCache.clear();
    }
    this.patternCache.set(text, detections);
  }

  /**
   * Clear the pattern cache
   */
  clearCache(): void {
    this.patternCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.patternCache.size,
      maxSize: this.maxCacheSize,
    };
  }

  private redactPII(text: string, detections: PIIDetection[]): string {
    let redacted = text;

    // Sort by position in reverse to maintain indices
    const sorted = [...detections].sort((a, b) => b.position - a.position);

    for (const detection of sorted) {
      const before = redacted.substring(0, detection.position);
      const after = redacted.substring(detection.position + detection.length);
      redacted = before + `[REDACTED_${detection.type.toUpperCase()}]` + after;
    }

    return redacted;
  }

  private maskPII(text: string, detections: PIIDetection[]): string {
    let masked = text;

    // Sort by position in reverse to maintain indices
    const sorted = [...detections].sort((a, b) => b.position - a.position);

    for (const detection of sorted) {
      const before = masked.substring(0, detection.position);
      const after = masked.substring(detection.position + detection.length);
      masked = before + '*'.repeat(detection.length) + after;
    }

    return masked;
  }
}
