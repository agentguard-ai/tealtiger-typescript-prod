import * as fs from 'fs';
import * as path from 'path';

interface PackageJson {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface VersionInfoOptions {
  cwd?: string;
  packageRoot?: string;
  auditLogPath?: string;
}

interface ObserveAuditInfo {
  path: string;
  exists: boolean;
  eventCount?: number;
}

export interface VersionInfo {
  sdkVersion: string;
  nodeVersion: string;
  platform: string;
  typescriptVersion: string;
  providers: string[];
  observeAudit: ObserveAuditInfo;
}

const PROVIDER_PACKAGES: Record<string, string[]> = {
  openai: ['openai'],
  anthropic: ['@anthropic-ai/sdk'],
  gemini: ['@google/generative-ai'],
  bedrock: ['@aws-sdk/client-bedrock-runtime'],
  'azure-openai': ['@azure/openai'],
  cohere: ['cohere-ai'],
  mistral: ['@mistralai/mistralai'],
  groq: ['groq-sdk'],
  deepseek: ['@deepseek-ai/sdk'],
  together: ['together-ai'],
  xai: ['@xai-sdk/client', 'xai-sdk'],
};

function readPackageJson(filePath: string): PackageJson | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageJson;
  } catch {
    return undefined;
  }
}

function getPackageRoot(options: VersionInfoOptions): string {
  return options.packageRoot ?? path.resolve(__dirname, '..', '..');
}

function getSdkVersion(packageRoot: string): string {
  return readPackageJson(path.join(packageRoot, 'package.json'))?.version ?? 'unknown';
}

function getProjectPackage(cwd: string): PackageJson | undefined {
  return readPackageJson(path.join(cwd, 'package.json'));
}

function getTypescriptVersion(cwd: string, packageRoot: string): string {
  try {
    const typescriptPackagePath = require.resolve('typescript/package.json', {
      paths: [cwd, packageRoot],
    });
    return readPackageJson(typescriptPackagePath)?.version ?? 'not found';
  } catch {
    return 'not found';
  }
}

function collectDependencies(packageJson: PackageJson | undefined): Set<string> {
  return new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
    ...Object.keys(packageJson?.optionalDependencies ?? {}),
    ...Object.keys(packageJson?.peerDependencies ?? {}),
  ]);
}

function detectProviders(packageJson: PackageJson | undefined): string[] {
  const dependencies = collectDependencies(packageJson);
  return Object.entries(PROVIDER_PACKAGES)
    .filter(([, packageNames]) => packageNames.some(packageName => dependencies.has(packageName)))
    .map(([provider]) => provider);
}

function countAuditEvents(auditLogPath: string): ObserveAuditInfo {
  if (!fs.existsSync(auditLogPath)) {
    return { path: auditLogPath, exists: false };
  }

  const content = fs.readFileSync(auditLogPath, 'utf8');
  const eventCount = content.split(/\r?\n/).filter(line => line.trim().length > 0).length;
  return { path: auditLogPath, exists: true, eventCount };
}

export function getVersionInfo(options: VersionInfoOptions = {}): VersionInfo {
  const cwd = options.cwd ?? process.cwd();
  const packageRoot = getPackageRoot(options);
  const auditLogPath = options.auditLogPath ?? path.join(cwd, 'tealtiger-observe.audit.log');
  const projectPackage = getProjectPackage(cwd);

  return {
    sdkVersion: getSdkVersion(packageRoot),
    nodeVersion: process.version,
    platform: `${process.platform} (${process.arch})`,
    typescriptVersion: getTypescriptVersion(cwd, packageRoot),
    providers: detectProviders(projectPackage),
    observeAudit: countAuditEvents(auditLogPath),
  };
}

function formatObserveAudit(info: ObserveAuditInfo): string {
  if (!info.exists) {
    return `${info.path} (not found)`;
  }

  const suffix = info.eventCount === 1 ? 'event' : 'events';
  return `${info.path} (exists, ${info.eventCount ?? 0} ${suffix})`;
}

export function formatVersionInfo(info: VersionInfo): string {
  const rows = [
    ['TealTiger SDK', info.sdkVersion],
    ['Node.js', info.nodeVersion],
    ['Platform', info.platform],
    ['TypeScript', info.typescriptVersion],
    ['Providers found', info.providers.length > 0 ? `${info.providers.join(', ')} (from package.json)` : 'none'],
    ['Observe data', formatObserveAudit(info.observeAudit)],
  ];

  const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 1;
  return rows.map(([label, value]) => `${`${label}:`.padEnd(labelWidth + 1)} ${value}`).join('\n');
}

export function main(): void {
  console.log(formatVersionInfo(getVersionInfo()));
}

if (require.main === module) {
  main();
}
