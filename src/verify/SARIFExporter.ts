/**
 * TealVerify — SARIF v2.1.0 Exporter
 *
 * Generates SARIF v2.1.0 JSON from SecretFinding arrays.
 * Secrets are redacted by default. Fingerprints are stable
 * (SHA-256 of type + finding_id).
 *
 * @module verify/SARIFExporter
 */

import type { SecretFinding } from '../core/engine/v1.2/types';
import type {
  SARIFLog,
  SARIFRun,
  SARIFRule,
  SARIFResult,
  SARIFExportOptions,
} from './types';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

/** Map secret type strings to stable rule IDs. */
const RULE_ID_MAP: Record<string, string> = {
  'aws-access-key-id': 'TT-SEC-001',
  'aws-secret-access-key': 'TT-SEC-002',
  'github-token': 'TT-SEC-003',
  'github-pat': 'TT-SEC-004',
  'openai-api-key': 'TT-SEC-005',
  'anthropic-api-key': 'TT-SEC-006',
  'google-api-key': 'TT-SEC-007',
  'azure-key': 'TT-SEC-008',
  'stripe-key': 'TT-SEC-009',
  'database-url': 'TT-SEC-010',
  'jwt-token': 'TT-SEC-011',
  'ssh-private-key': 'TT-SEC-012',
  'slack-token': 'TT-SEC-013',
  'generic-api-key': 'TT-SEC-014',
  'generic-secret': 'TT-SEC-015',
};

/** Deterministic rule ID for a secret type. */
function ruleIdFor(secretType: string): string {
  return RULE_ID_MAP[secretType] ?? `TT-SEC-${stableHash(secretType)}`;
}

/** Simple deterministic numeric hash for unknown types. */
function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return String(Math.abs(h) % 10000).padStart(4, '0');
}

/** SHA-256 hex digest (sync, using Node crypto). */
function sha256Hex(data: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Map severity string to SARIF level. */
function severityToLevel(severity: string): 'error' | 'warning' | 'note' {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'error';
  if (s === 'MEDIUM') return 'warning';
  return 'note';
}

export class SARIFExporter {
  private readonly toolName: string;
  private readonly toolVersion: string;
  private readonly redactSecrets: boolean;

  constructor(options?: SARIFExportOptions) {
    this.toolName = options?.toolName ?? 'TealTiger';
    this.toolVersion = options?.toolVersion ?? '1.2.0';
    this.redactSecrets = options?.redactSecrets !== false; // default true
  }

  /**
   * Generate a SARIF v2.1.0 log from secret findings.
   */
  export(
    findings: SecretFinding[],
    _ctx: Record<string, unknown>,
  ): SARIFLog {
    const rulesMap = new Map<string, SARIFRule>();
    const results: SARIFResult[] = [];

    for (const f of findings) {
      const ruleId = ruleIdFor(f.type);

      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: f.type,
          shortDescription: {
            text: `Detected secret of type: ${f.type} (category: ${f.category})`,
          },
        });
      }

      // Stable fingerprint: SHA-256(type + finding_id)
      const fingerprint = sha256Hex(`${f.type}:${f.finding_id}`);

      // Build message — never include raw secret values
      const message = this.redactSecrets
        ? `Secret detected: type=${f.type}, severity=${f.severity}, confidence=${f.confidence}`
        : `Secret detected: type=${f.type}, severity=${f.severity}, confidence=${f.confidence}`;

      const result: SARIFResult = {
        ruleId,
        level: severityToLevel(f.severity),
        message: { text: message },
        fingerprints: { '0': fingerprint },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'tealsecrets://runtime/input' },
            },
          },
        ],
      };

      results.push(result);
    }

    const rules = Array.from(rulesMap.values());

    const run: SARIFRun = {
      tool: {
        driver: {
          name: this.toolName,
          version: this.toolVersion,
          rules,
        },
      },
      results,
    };

    return {
      $schema: SARIF_SCHEMA,
      version: '2.1.0',
      runs: [run],
    };
  }

  /**
   * Write SARIF log to a file.
   */
  async exportToFile(
    findings: SecretFinding[],
    ctx: Record<string, unknown>,
    filePath: string,
  ): Promise<void> {
    const log = this.export(findings, ctx);
    const fs = require('fs') as typeof import('fs');
    const { promisify } = require('util') as typeof import('util');
    const writeFile = promisify(fs.writeFile);
    await writeFile(filePath, JSON.stringify(log, null, 2), 'utf-8');
  }
}
