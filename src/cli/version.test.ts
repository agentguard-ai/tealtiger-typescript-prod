import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { formatVersionInfo, getVersionInfo } from './version';

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('tealtiger version CLI diagnostics', () => {
  let tempDir: string;
  let projectDir: string;
  let packageRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tealtiger-version-'));
    projectDir = path.join(tempDir, 'project');
    packageRoot = path.join(tempDir, 'tealtiger-sdk');

    writeJson(path.join(packageRoot, 'package.json'), {
      name: 'tealtiger',
      version: '1.3.0-test',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports SDK, runtime, provider, TypeScript, and observe audit details', () => {
    writeJson(path.join(projectDir, 'package.json'), {
      dependencies: {
        openai: '^6.0.0',
        '@anthropic-ai/sdk': '^1.0.0',
      },
    });
    writeJson(path.join(projectDir, 'node_modules', 'typescript', 'package.json'), {
      name: 'typescript',
      version: '5.9.3',
    });
    const auditPath = path.join(projectDir, 'tealtiger-observe.audit.log');
    fs.writeFileSync(auditPath, '{"event":1}\n{"event":2}\n');

    const info = getVersionInfo({ cwd: projectDir, packageRoot, auditLogPath: auditPath });
    const output = formatVersionInfo(info);

    expect(info.sdkVersion).toBe('1.3.0-test');
    expect(info.typescriptVersion).toBe('5.9.3');
    expect(info.providers).toEqual(['openai', 'anthropic']);
    expect(info.observeAudit).toMatchObject({ exists: true, eventCount: 2 });
    expect(output).toContain('TealTiger SDK:');
    expect(output).toContain('Providers found:');
    expect(output).toContain('openai, anthropic (from package.json)');
    expect(output).toContain('exists, 2 events');
  });

  it('handles missing optional project information gracefully', () => {
    fs.mkdirSync(projectDir, { recursive: true });
    const auditPath = path.join(projectDir, 'tealtiger-observe.audit.log');

    const info = getVersionInfo({ cwd: projectDir, packageRoot, auditLogPath: auditPath });
    const output = formatVersionInfo(info);

    expect(info.typescriptVersion).toBe('not found');
    expect(info.providers).toEqual([]);
    expect(info.observeAudit.exists).toBe(false);
    expect(output).toContain('TypeScript:');
    expect(output).toContain('not found');
    expect(output).toContain('Providers found:');
    expect(output).toContain('none');
    expect(output).toContain('Observe data:');
    expect(output).toContain('(not found)');
  });
});
