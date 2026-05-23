import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

const SCHEMA_PATH = path.resolve(__dirname, '..', 'schemas', 'tealengine-policy.json');

function printHelp(): void {
  console.log(`
Usage: npx ts-node scripts/validate-policy.ts <policy-file>

Validate a policy JSON file against the TealEngine policy schema.

Arguments:
  <policy-file>   Path to the policy JSON file to validate

Options:
  --help          Show this help message

Exit Codes:
  0   Validation passed
  1   Validation failed

Examples:
  npx ts-node scripts/validate-policy.ts ./my-policy.json
  npx ts-node scripts/validate-policy.ts examples/policy-test-example.json
`);
}

function loadJson(filePath: string): unknown {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error: Invalid JSON in ${resolvedPath}`);
    if (err instanceof SyntaxError) {
      console.error(`  ${err.message}`);
    }
    process.exit(1);
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const policyPath = args[0];
  const policy = loadJson(policyPath);

  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Error: Schema file not found at ${SCHEMA_PATH}`);
    process.exit(1);
  }

  const schema = loadJson(SCHEMA_PATH);

  const ajv = new Ajv({ allErrors: true, verbose: true });
  const validate = ajv.compile(schema as object);
  const valid = validate(policy);

  if (valid) {
    console.log('✓ Policy validation passed');
    process.exit(0);
  }

  console.error('✗ Policy validation failed');
  for (const err of validate.errors ?? []) {
    const instancePath = err.instancePath || '/';
    console.error(`  - ${instancePath}: ${err.message}`);
    if (err.params) {
      const params = Object.entries(err.params)
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      if (params) {
        console.error(params);
      }
    }
  }
  process.exit(1);
}

main();
