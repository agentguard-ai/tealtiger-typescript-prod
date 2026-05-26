/**
 * TealVerify — SARIF v2.1.0 Exporter
 *
 * Generates SARIF v2.1.0 JSON from SecretFinding arrays.
 * Secrets are redacted by default. Secret scans preserve their
 * source locations and detector fingerprints for Code Scanning.
 *
 * @module verify/SARIFExporter
 */

import type { SecretFinding } from '../core/engine/v1.2/types';
import { builtInDetectors } from '../secrets/detectors';
import type {
  SARIFLog,
  SARIFRun,
  SARIFRule,
  SARIFResult,
  SARIFExportOptions,
  SARIFSecretFinding,
  SARIFSecretSource,
} from './types';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

/** Map severity string to SARIF level. */
function severityToLevel(severity: string): 'error' | 'warning' | 'note' {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'error';
  if (s === 'MEDIUM') return 'warning';
  return 'note';
}

function severityToSecurityScore(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return '9.0';
    case 'HIGH': return '7.0';
    case 'MEDIUM': return '5.0';
    case 'LOW': return '3.0';
    default: return '1.0';
  }
}

function ruleFor(finding: SARIFSecretFinding): SARIFRule {
  const detector = builtInDetectors.find((candidate) => candidate.id === finding.type);
  const description = detector?.description ?? `Secret detector: ${finding.type}`;

  return {
    id: finding.type,
    name: finding.type,
    shortDescription: { text: description },
    fullDescription: {
      text: `TealSecrets detected a ${finding.category} credential pattern. Remove the credential from source control and rotate it if it is active.`,
    },
    helpUri: 'https://tealtiger.ai/docs/v1.2/secrets',
    properties: {
      tags: ['security', 'secrets', finding.category],
      'security-severity': severityToSecurityScore(finding.severity),
    },
  };
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
    ctx: Record<string, unknown>,
  ): SARIFLog {
    const artifactUri =
      typeof ctx.artifactUri === 'string' ? ctx.artifactUri : 'tealsecrets://runtime/input';

    return this.exportSources([{ uri: artifactUri, findings }]);
  }

  /**
   * Generate GitHub Code Scanning-compatible SARIF from file-based scans.
   */
  exportSources(sources: SARIFSecretSource[]): SARIFLog {
    const rulesMap = new Map<string, SARIFRule>();
    const results: SARIFResult[] = [];

    for (const source of sources) {
      for (const finding of source.findings) {
        const ruleId = finding.type;

        if (!rulesMap.has(ruleId)) {
          rulesMap.set(ruleId, ruleFor(finding));
        }

        const message = this.redactSecrets
          ? `Secret detected: type=${finding.type}, severity=${finding.severity}, confidence=${finding.confidence}`
          : `Secret detected: type=${finding.type}, severity=${finding.severity}, confidence=${finding.confidence}`;

        const artifactLocation = source.uri.startsWith('tealsecrets://')
          ? { uri: source.uri }
          : { uri: source.uri, uriBaseId: '%SRCROOT%' };
        const physicalLocation = finding.location
          ? {
              artifactLocation,
              region: {
                startLine: finding.location.line,
                startColumn: finding.location.column,
                endColumn: finding.location.column + Math.max(finding.location.length ?? 1, 1),
              },
            }
          : { artifactLocation };

        const result: SARIFResult = {
          ruleId,
          level: severityToLevel(finding.severity),
          message: { text: message },
          fingerprints: { '0': finding.fingerprint },
          partialFingerprints: { primaryLocationLineHash: finding.fingerprint },
          locations: [
            {
              physicalLocation,
            },
          ],
        };

        results.push(result);
      }
    }

    const rules = Array.from(rulesMap.values());

    const run: SARIFRun = {
      tool: {
        driver: {
          name: this.toolName,
          version: this.toolVersion,
          informationUri: 'https://tealtiger.ai',
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
