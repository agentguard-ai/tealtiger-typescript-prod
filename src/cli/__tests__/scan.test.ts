import * as fs from 'fs';
import * as path from 'path';
import { runSecretScan } from '../scan';

describe('tealtiger scan', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(process.cwd(), '.tealtiger-scan-test-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('writes SARIF with relative paths, source locations, and stable fingerprints', () => {
    const input = path.join(directory, 'config.ts');
    const output = path.join(directory, 'results.sarif');
    fs.writeFileSync(input, '\nconst accessKey = "AKIAIOSFODNN7EXAMPLE";\n', 'utf-8');

    const exitCode = runSecretScan(
      [directory],
      { format: 'sarif', output },
    );
    const sarif = JSON.parse(fs.readFileSync(output, 'utf-8'));
    const result = sarif.runs[0].results[0];

    expect(exitCode).toBe(0);
    expect(result.ruleId).toBe('aws-access-key-id');
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toContain(
      '.tealtiger-scan-test-',
    );
    expect(result.locations[0].physicalLocation.region.startLine).toBe(2);
    expect(result.partialFingerprints.primaryLocationLineHash).toBeDefined();
  });
});
