/**
 * Unit tests for content redaction
 * 
 * Tests RedactionLevel enum and redactContent() function
 * Part of TealTiger v1.1.x - Enterprise Adoption Features (Task 3.2)
 */

import {
  RedactionLevel,
  redactContent,
  computeSHA256Hash,
  categorizeContent,
  isValidRedactionLevel,
  getDefaultRedactionLevel
} from '../redaction';

describe('RedactionLevel enum', () => {
  it('should have all required redaction levels', () => {
    expect(RedactionLevel.NONE).toBe('NONE');
    expect(RedactionLevel.HASH).toBe('HASH');
    expect(RedactionLevel.SIZE_ONLY).toBe('SIZE_ONLY');
    expect(RedactionLevel.CATEGORY_ONLY).toBe('CATEGORY_ONLY');
    expect(RedactionLevel.FULL).toBe('FULL');
  });
  
  it('should validate valid redaction levels', () => {
    expect(isValidRedactionLevel(RedactionLevel.NONE)).toBe(true);
    expect(isValidRedactionLevel(RedactionLevel.HASH)).toBe(true);
    expect(isValidRedactionLevel(RedactionLevel.SIZE_ONLY)).toBe(true);
    expect(isValidRedactionLevel(RedactionLevel.CATEGORY_ONLY)).toBe(true);
    expect(isValidRedactionLevel(RedactionLevel.FULL)).toBe(true);
  });
  
  it('should reject invalid redaction levels', () => {
    expect(isValidRedactionLevel('INVALID')).toBe(false);
    expect(isValidRedactionLevel(null)).toBe(false);
    expect(isValidRedactionLevel(undefined)).toBe(false);
    expect(isValidRedactionLevel(123)).toBe(false);
  });
  
  it('should return HASH as default redaction level', () => {
    expect(getDefaultRedactionLevel()).toBe(RedactionLevel.HASH);
  });
});

describe('redactContent() - NONE level', () => {
  it('should include raw content with warning for NONE level', () => {
    const content = 'sensitive data';
    const result = redactContent(content, RedactionLevel.NONE);
    
    expect(result.raw).toBe(content);
    expect(result.warning).toBe('DEBUG_MODE_ENABLED');
    expect(result.size).toBe(content.length);
  });
  
  it('should include raw content for empty string', () => {
    const result = redactContent('', RedactionLevel.NONE);
    
    expect(result.raw).toBe('');
    expect(result.warning).toBe('DEBUG_MODE_ENABLED');
    expect(result.size).toBe(0);
  });
  
  it('should include category when provided', () => {
    const content = 'SELECT * FROM users';
    const result = redactContent(content, RedactionLevel.NONE, 'code');
    
    expect(result.raw).toBe(content);
    expect(result.category).toBe('code');
  });
});

describe('redactContent() - HASH level', () => {
  it('should return SHA-256 hash and size for HASH level', () => {
    const content = 'sensitive data';
    const result = redactContent(content, RedactionLevel.HASH);
    
    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.size).toBe(content.length);
    expect(result.raw).toBeUndefined();
  });
  
  it('should produce consistent hashes for same content', () => {
    const content = 'test content';
    const result1 = redactContent(content, RedactionLevel.HASH);
    const result2 = redactContent(content, RedactionLevel.HASH);
    
    expect(result1.hash).toBe(result2.hash);
  });
  
  it('should produce different hashes for different content', () => {
    const result1 = redactContent('content1', RedactionLevel.HASH);
    const result2 = redactContent('content2', RedactionLevel.HASH);
    
    expect(result1.hash).not.toBe(result2.hash);
  });
  
  it('should include category when provided', () => {
    const content = 'prompt text';
    const result = redactContent(content, RedactionLevel.HASH, 'prompt');
    
    expect(result.hash).toBeDefined();
    expect(result.size).toBe(content.length);
    expect(result.category).toBe('prompt');
  });
  
  it('should handle empty content', () => {
    const result = redactContent('', RedactionLevel.HASH);
    
    expect(result.hash).toBeDefined();
    expect(result.size).toBe(0);
  });
  
  it('should handle large content efficiently', () => {
    // Generate 10KB content
    const largeContent = 'x'.repeat(10 * 1024);
    
    const startTime = performance.now();
    const result = redactContent(largeContent, RedactionLevel.HASH);
    const endTime = performance.now();
    
    expect(result.hash).toBeDefined();
    expect(result.size).toBe(largeContent.length);
    
    // Performance target: < 5ms for 10KB content (Requirement 10.4)
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(5);
  });
});

describe('redactContent() - SIZE_ONLY level', () => {
  it('should return only size for SIZE_ONLY level', () => {
    const content = 'sensitive data';
    const result = redactContent(content, RedactionLevel.SIZE_ONLY);
    
    expect(result.size).toBe(content.length);
    expect(result.hash).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.raw).toBeUndefined();
  });
  
  it('should handle empty content', () => {
    const result = redactContent('', RedactionLevel.SIZE_ONLY);
    
    expect(result.size).toBe(0);
  });
  
  it('should handle unicode content correctly', () => {
    const content = '你好世界'; // Chinese characters
    const result = redactContent(content, RedactionLevel.SIZE_ONLY);
    
    expect(result.size).toBe(content.length);
  });
});

describe('redactContent() - CATEGORY_ONLY level', () => {
  it('should return only category for CATEGORY_ONLY level', () => {
    const content = 'sensitive data';
    const result = redactContent(content, RedactionLevel.CATEGORY_ONLY, 'data');
    
    expect(result.category).toBe('data');
    expect(result.size).toBeUndefined();
    expect(result.hash).toBeUndefined();
    expect(result.raw).toBeUndefined();
  });
  
  it('should auto-categorize when category not provided', () => {
    const content = 'SELECT * FROM users';
    const result = redactContent(content, RedactionLevel.CATEGORY_ONLY);
    
    expect(result.category).toBe('code');
  });
  
  it('should use provided category over auto-categorization', () => {
    const content = 'SELECT * FROM users';
    const result = redactContent(content, RedactionLevel.CATEGORY_ONLY, 'prompt');
    
    expect(result.category).toBe('prompt');
  });
});

describe('redactContent() - FULL level', () => {
  it('should return only redacted flag for FULL level', () => {
    const content = 'sensitive data';
    const result = redactContent(content, RedactionLevel.FULL);
    
    expect(result.redacted).toBe(true);
    expect(result.size).toBeUndefined();
    expect(result.hash).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.raw).toBeUndefined();
  });
  
  it('should handle empty content', () => {
    const result = redactContent('', RedactionLevel.FULL);
    
    expect(result.redacted).toBe(true);
  });
});

describe('redactContent() - edge cases', () => {
  it('should handle null content', () => {
    const result = redactContent(null as any, RedactionLevel.HASH);
    
    expect(result.hash).toBeDefined();
    expect(result.size).toBe(0);
  });
  
  it('should handle undefined content', () => {
    const result = redactContent(undefined as any, RedactionLevel.HASH);
    
    expect(result.hash).toBeDefined();
    expect(result.size).toBe(0);
  });
  
  it('should fallback to FULL redaction for unknown level', () => {
    const content = 'sensitive data';
    const result = redactContent(content, 'UNKNOWN' as any);
    
    expect(result.redacted).toBe(true);
    expect(result.raw).toBeUndefined();
  });
});

describe('computeSHA256Hash()', () => {
  it('should compute SHA-256 hash with prefix', () => {
    const hash = computeSHA256Hash('hello world');
    
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  
  it('should produce consistent hashes', () => {
    const content = 'test content';
    const hash1 = computeSHA256Hash(content);
    const hash2 = computeSHA256Hash(content);
    
    expect(hash1).toBe(hash2);
  });
  
  it('should produce different hashes for different content', () => {
    const hash1 = computeSHA256Hash('content1');
    const hash2 = computeSHA256Hash('content2');
    
    expect(hash1).not.toBe(hash2);
  });
  
  it('should handle empty string', () => {
    const hash = computeSHA256Hash('');
    
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  
  it('should handle unicode content', () => {
    const hash = computeSHA256Hash('你好世界');
    
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  
  it('should match known SHA-256 hash', () => {
    // Known SHA-256 hash for 'hello world'
    const hash = computeSHA256Hash('hello world');
    const expected = 'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    
    expect(hash).toBe(expected);
  });
});

describe('categorizeContent()', () => {
  it('should categorize SQL code', () => {
    expect(categorizeContent('SELECT * FROM users')).toBe('code');
    expect(categorizeContent('INSERT INTO users VALUES (1, "test")')).toBe('code');
    expect(categorizeContent('UPDATE users SET name = "test"')).toBe('code');
    expect(categorizeContent('DELETE FROM users WHERE id = 1')).toBe('code');
  });
  
  it('should categorize JavaScript code', () => {
    expect(categorizeContent('function test() { return true; }')).toBe('code');
    expect(categorizeContent('const x = 10;')).toBe('code');
    expect(categorizeContent('let y = 20;')).toBe('code');
    expect(categorizeContent('var z = 30;')).toBe('code');
  });
  
  it('should categorize Python code', () => {
    expect(categorizeContent('def test():\n    return True')).toBe('code');
    expect(categorizeContent('class MyClass:\n    pass')).toBe('code');
  });
  
  it('should categorize JSON data', () => {
    expect(categorizeContent('{"key": "value"}')).toBe('data');
    expect(categorizeContent('[1, 2, 3]')).toBe('data');
  });
  
  it('should categorize XML data', () => {
    expect(categorizeContent('<root><item>value</item></root>')).toBe('data');
  });
  
  it('should categorize tool-related content', () => {
    expect(categorizeContent('tool: file_read')).toBe('tool_params');
    expect(categorizeContent('{"function_call": "test"}')).toBe('tool_params');
  });
  
  it('should default to prompt for natural language', () => {
    expect(categorizeContent('Hello, how are you?')).toBe('prompt');
    expect(categorizeContent('What is the weather today?')).toBe('prompt');
  });
  
  it('should return unknown for empty content', () => {
    expect(categorizeContent('')).toBe('unknown');
    expect(categorizeContent('   ')).toBe('unknown');
  });
});

describe('redactContent() - security properties', () => {
  it('should never include raw content except for NONE level', () => {
    const content = 'sensitive data';
    const levels: RedactionLevel[] = [
      RedactionLevel.HASH,
      RedactionLevel.SIZE_ONLY,
      RedactionLevel.CATEGORY_ONLY,
      RedactionLevel.FULL
    ];
    
    for (const level of levels) {
      const result = redactContent(content, level);
      expect(result.raw).toBeUndefined();
    }
  });
  
  it('should not leak content through hash for different inputs', () => {
    const content1 = 'secret1';
    const content2 = 'secret2';
    
    const result1 = redactContent(content1, RedactionLevel.HASH);
    const result2 = redactContent(content2, RedactionLevel.HASH);
    
    // Hashes should be different
    expect(result1.hash).not.toBe(result2.hash);
    
    // Hashes should not contain original content
    expect(result1.hash).not.toContain(content1);
    expect(result2.hash).not.toContain(content2);
  });
  
  it('should handle PII-like content safely', () => {
    const piiContent = 'SSN: 123-45-6789, Email: test@example.com';
    
    const result = redactContent(piiContent, RedactionLevel.HASH);
    
    expect(result.raw).toBeUndefined();
    expect(result.hash).toBeDefined();
    expect(result.hash).not.toContain('123-45-6789');
    expect(result.hash).not.toContain('test@example.com');
  });
});

describe('redactContent() - performance', () => {
  it('should handle small content quickly', () => {
    const content = 'small content';
    
    const startTime = performance.now();
    redactContent(content, RedactionLevel.HASH);
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(1); // Should be sub-millisecond
  });
  
  it('should handle 10KB content within performance target', () => {
    // Requirement 10.4: < 5ms for 10KB content
    const largeContent = 'x'.repeat(10 * 1024);
    
    const startTime = performance.now();
    redactContent(largeContent, RedactionLevel.HASH);
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(5);
  });
  
  it('should handle SIZE_ONLY faster than HASH', () => {
    const content = 'x'.repeat(10 * 1024);
    
    const startHash = performance.now();
    redactContent(content, RedactionLevel.HASH);
    const endHash = performance.now();
    const hashDuration = endHash - startHash;
    
    const startSize = performance.now();
    redactContent(content, RedactionLevel.SIZE_ONLY);
    const endSize = performance.now();
    const sizeDuration = endSize - startSize;
    
    // SIZE_ONLY should be faster (no hashing overhead)
    expect(sizeDuration).toBeLessThan(hashDuration);
  });
});
