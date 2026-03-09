/**
 * TealAudit - Audit Logging Module
 */

export { TealAudit, ConsoleOutput, CustomOutput } from './TealAudit';
export { FileOutput } from './FileOutput';
export type { 
  AuditEvent, 
  AuditFilter, 
  AuditOutput, 
  TealAuditConfig,
  AuditConfig,
  CustomRedactionRule
} from './TealAudit';
export type { FileOutputConfig } from './FileOutput';

// Enterprise Adoption Features (v1.1.x) - P0.4: Audit Schema + Redaction
export {
  AUDIT_SCHEMA_VERSION,
  AuditEventType,
  isValidAuditEventType,
  validateAuditEvent,
  createAuditEvent
} from './types';
export type {
  SafeContent,
  AuditComponentVersions,
  CostMetadata
} from './types';
// Export versioned AuditEvent with alias to avoid conflict with legacy AuditEvent
export type { AuditEvent as VersionedAuditEvent } from './types';

// Redaction module (Task 3.2)
export {
  RedactionLevel,
  redactContent,
  computeSHA256Hash,
  categorizeContent,
  isValidRedactionLevel,
  getDefaultRedactionLevel,
  // PII detection integration (Task 3.3)
  detectPIIPatterns,
  redactPIIFromContent,
  redactContentWithPII
} from './redaction';
export type {
  ContentCategory,
  SafeContentWithRaw,
  PIIDetection
} from './redaction';
