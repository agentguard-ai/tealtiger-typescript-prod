/**
 * Governance Control Catalog — Embedded Constants
 *
 * Source-of-truth control list for the v1.2 governance bundle.
 * 38 implemented controls + key planned controls for v1.3.
 * Follows the same embedded-constants pattern as TEECRegistryLoader.
 *
 * @module dashboard/controls
 */

import type { ControlInfo } from './types';

// ── 38 Implemented Controls ──────────────────────────────────────

export const IMPLEMENTED_CONTROLS: ControlInfo[] = [
  // SEC — Security Dimension (TealSecrets) — 10 controls
  { control_id: 'SEC-001', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Secret detection (500+ patterns)' },
  { control_id: 'SEC-002', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Confidence scoring (entropy, structural, context, FP)' },
  { control_id: 'SEC-003', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Custom pattern registration' },
  { control_id: 'SEC-004', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Threshold-based enforcement (DENY/REDACT/MONITOR)' },
  { control_id: 'SEC-005', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Multi-layer detection cache (L1 LRU, L2 content-hash)' },
  { control_id: 'SEC-006', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Credential TTL enforcement' },
  { control_id: 'SEC-007', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Credential rotation warnings' },
  { control_id: 'SEC-008', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Performance budget enforcement' },
  { control_id: 'SEC-009', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Evidence redaction (no raw secrets in output)' },
  { control_id: 'SEC-010', dimension: 'SEC', maturity: 'stable', module: 'TealSecrets', status: 'implemented', description: 'Deterministic finding IDs and fingerprints' },

  // MEM — Memory Dimension (TealMemory) — 8 controls
  { control_id: 'MEM-001', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'Write governance (secret/PII scan)' },
  { control_id: 'MEM-002', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'Read governance (scope enforcement)' },
  { control_id: 'MEM-003', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'Classification clearance enforcement' },
  { control_id: 'MEM-004', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'TTL required enforcement' },
  { control_id: 'MEM-005', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'TTL max enforcement' },
  { control_id: 'MEM-006', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'Evidence emission with redaction' },
  { control_id: 'MEM-007', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'Memory forget governance' },
  { control_id: 'MEM-008', dimension: 'MEM', maturity: 'stable', module: 'TealMemory', status: 'implemented', description: 'Adapter abstraction (pluggable backends)' },

  // REL — Reliability Dimension (TealReliability) — 6 controls
  { control_id: 'REL-001', dimension: 'REL', maturity: 'stable', module: 'TealReliability', status: 'implemented', description: 'Bounded retry with budget' },
  { control_id: 'REL-002', dimension: 'REL', maturity: 'stable', module: 'TealReliability', status: 'implemented', description: 'Fallback chain (priority-ordered)' },
  { control_id: 'REL-003', dimension: 'REL', maturity: 'stable', module: 'TealReliability', status: 'implemented', description: 'Deterministic degrade' },
  { control_id: 'REL-004', dimension: 'REL', maturity: 'stable', module: 'TealReliability', status: 'implemented', description: 'Circuit breaker (CLOSED/OPEN/HALF_OPEN)' },
  { control_id: 'REL-005', dimension: 'REL', maturity: 'stable', module: 'TealReliability', status: 'implemented', description: 'Transient failure detection' },
  { control_id: 'REL-006', dimension: 'REL', maturity: 'stable', module: 'TealReliability', status: 'implemented', description: 'Budget exhaustion handling' },

  // EVID — Evidence Dimension (TealVerify) — 6 controls
  { control_id: 'EVID-001', dimension: 'EVID', maturity: 'stable', module: 'TealVerify', status: 'implemented', description: 'SARIF v2.1.0 export' },
  { control_id: 'EVID-002', dimension: 'EVID', maturity: 'stable', module: 'TealVerify', status: 'implemented', description: 'JUnit XML export' },
  { control_id: 'EVID-003', dimension: 'EVID', maturity: 'stable', module: 'TealVerify', status: 'implemented', description: 'JSON summary export' },
  { control_id: 'EVID-004', dimension: 'EVID', maturity: 'stable', module: 'TealVerify', status: 'implemented', description: 'Golden test runner' },
  { control_id: 'EVID-005', dimension: 'EVID', maturity: 'stable', module: 'TealVerify', status: 'implemented', description: 'Red-team harness' },
  { control_id: 'EVID-006', dimension: 'EVID', maturity: 'stable', module: 'TealVerify', status: 'implemented', description: 'TEEC validation commands' },

  // REG — Registry Dimension (TealRegistry) — 6 controls
  { control_id: 'REG-001', dimension: 'REG', maturity: 'stable', module: 'TealRegistry', status: 'implemented', description: 'Model allowlist enforcement' },
  { control_id: 'REG-002', dimension: 'REG', maturity: 'stable', module: 'TealRegistry', status: 'implemented', description: 'Tool allowlist enforcement' },
  { control_id: 'REG-003', dimension: 'REG', maturity: 'stable', module: 'TealRegistry', status: 'implemented', description: 'Build provenance verification' },
  { control_id: 'REG-004', dimension: 'REG', maturity: 'stable', module: 'TealRegistry', status: 'implemented', description: 'Supply chain scoring' },
  { control_id: 'REG-005', dimension: 'REG', maturity: 'stable', module: 'TealRegistry', status: 'implemented', description: 'Entry versioning and hashing' },
  { control_id: 'REG-006', dimension: 'REG', maturity: 'stable', module: 'TealRegistry', status: 'implemented', description: 'Multi-catalog support (models, tools, detectors, policies)' },

  // COST — Cost Dimension (TealMonitor) — 2 controls
  { control_id: 'COST-001', dimension: 'COST', maturity: 'beta', module: 'TealMonitor', status: 'implemented', description: 'Cost budget enforcement' },
  { control_id: 'COST-002', dimension: 'COST', maturity: 'beta', module: 'TealMonitor', status: 'implemented', description: 'Cost velocity anomaly detection' },
];

// ── Planned Controls (v1.3 targets) ─────────────────────────────

export const PLANNED_CONTROLS: ControlInfo[] = [
  { control_id: 'SEC-011', dimension: 'SEC', maturity: 'planned', module: 'TealSecrets', status: 'planned', description: 'ML-based secret detection' },
  { control_id: 'SEC-012', dimension: 'SEC', maturity: 'planned', module: 'TealSecrets', status: 'planned', description: 'Secret rotation automation' },
  { control_id: 'MEM-009', dimension: 'MEM', maturity: 'planned', module: 'TealMemory', status: 'planned', description: 'Cross-tenant memory isolation' },
  { control_id: 'MEM-010', dimension: 'MEM', maturity: 'planned', module: 'TealMemory', status: 'planned', description: 'Memory encryption at rest' },
  { control_id: 'REL-007', dimension: 'REL', maturity: 'planned', module: 'TealReliability', status: 'planned', description: 'Adaptive retry budgets' },
  { control_id: 'EVID-007', dimension: 'EVID', maturity: 'planned', module: 'TealVerify', status: 'planned', description: 'CycloneDX SBOM export' },
  { control_id: 'REG-007', dimension: 'REG', maturity: 'planned', module: 'TealRegistry', status: 'planned', description: 'Remote registry sync' },
  { control_id: 'COST-003', dimension: 'COST', maturity: 'planned', module: 'TealMonitor', status: 'planned', description: 'Cost forecasting' },
  { control_id: 'COST-004', dimension: 'COST', maturity: 'planned', module: 'TealMonitor', status: 'planned', description: 'Per-agent cost attribution' },
];
