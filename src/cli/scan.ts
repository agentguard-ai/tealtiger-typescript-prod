import * as fs from 'fs';
import * as path from 'path';
import { BundleExporter } from '../dashboard/BundleExporter';
import { TealSecrets } from '../secrets/TealSecrets';

export interface SecretScanOptions {
  format?: 'console' | 'json' | 'junit' | 'sarif';
  output?: string;
}

const SCANNABLE_EXTENSIONS = new Set([
  '.cjs',
  '.env',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const IGNORED_SCAN_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);

function isScannableFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename.startsWith('.env') || SCANNABLE_EXTENSIONS.has(path.extname(filePath));
}

function collectScanFiles(inputs: string[]): string[] {
  const files: string[] = [];

  function addEntry(entryPath: string, explicitFile: boolean): void {
    const stats = fs.statSync(entryPath);
    if (stats.isFile()) {
      if (explicitFile || isScannableFile(entryPath)) {
        files.push(entryPath);
      }
      return;
    }
    if (!stats.isDirectory()) {
      return;
    }

    for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
        continue;
      }
      addEntry(path.join(entryPath, entry.name), false);
    }
  }

  for (const input of inputs) {
    addEntry(input, true);
  }

  return Array.from(new Set(files)).sort();
}

function repositoryRelativeUri(filePath: string): string {
  const relativePath = path.relative(process.cwd(), path.resolve(filePath));
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) {
    throw new Error(`Scanned file must be within the current repository: ${filePath}`);
  }
  return relativePath.split(path.sep).join('/');
}

/**
 * Scan files for secrets and write SARIF without logging secret contents.
 */
export function runSecretScan(inputs: string[], options: SecretScanOptions): number {
  if (options.format !== 'sarif') {
    console.error('Error: Secret scanning requires --format sarif');
    return 1;
  }

  try {
    const scanner = new TealSecrets();
    const sources = collectScanFiles(inputs).map((filePath) => ({
      uri: repositoryRelativeUri(filePath),
      findings: scanner.scan(fs.readFileSync(filePath, 'utf-8')),
    }));
    const output = BundleExporter.exportSecretFindingsSARIF(sources);

    if (options.output) {
      fs.writeFileSync(options.output, output, 'utf-8');
      console.log(`SARIF report written to ${options.output}`);
    } else {
      console.log(output);
    }

    return 0;
  } catch (error) {
    console.error('Error scanning source files:');
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
