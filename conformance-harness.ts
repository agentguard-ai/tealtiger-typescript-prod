/**
 * Conformance harness — runs a language-neutral corpus against this build.
 *
 * Obligations from the conformance specification:
 *   H-1  report the identity of the build under test
 *   H-2  fail loudly if the loaded build is not the intended one
 *   H-3  score by the same rules as every other implementation
 *   H-4  report per-category outcomes, never a bare pass rate
 */

import * as fs from 'fs';
import * as path from 'path';
import { TealEngine } from './src/core/engine/TealEngine';

const corpusPath =
  process.argv[2] ??
  path.resolve(
    __dirname,
    '../tealtiger-aidlc/conformance/tool-allowlist.v0.1.json'
  );

// ── H-1 / H-2: establish and assert build identity ──────────────────────
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
);
const enginePath = require.resolve('./src/core/engine/TealEngine');

console.log('build under test');
console.log(`  package : ${pkg.name}@${pkg.version}`);
console.log(`  engine  : ${enginePath}`);
console.log(`  corpus  : ${corpusPath}`);

if (!enginePath.includes('tealtiger-typescript-prod')) {
  console.error(
    `\nH-2 FAILED: engine resolved outside the repository under test:\n  ${enginePath}`
  );
  process.exit(2);
}
if (!fs.existsSync(corpusPath)) {
  console.error(`\nH-2 FAILED: corpus not found at ${corpusPath}`);
  process.exit(2);
}

const suite = JSON.parse(fs.readFileSync(corpusPath, 'utf-8'));
console.log(`  suite   : ${suite.suite_id} (${suite.tests.length} cases)`);
console.log(`  spec    : ${suite.spec_version}\n`);

// ── H-3: judgement rules, applied identically to every case ─────────────
interface Outcome {
  test_id: string;
  passed: boolean;
  category: string;
  failures: string[];
  actual: {
    action: string;
    reason_codes: string[];
    triggering_clause: string;
  } | null;
}

const outcomes: Outcome[] = [];

for (const t of suite.tests) {
  const exp = t.expected;
  const failures: string[] = [];
  let actual: Outcome['actual'] = null;
  let category = 'PASS';

  try {
    const engine = new TealEngine(t.policy ?? {});
    const d = engine.evaluateWithMode(t.input.request);

    actual = {
      action: String(d.action),
      reason_codes: (d.reason_codes ?? []).map(String),
      triggering_clause: String(d.triggering_clause),
    };

    if (actual.action !== exp.decision_action) {
      failures.push(
        `action: expected ${exp.decision_action}, got ${actual.action}`
      );
      category = 'WRONG_ACTION';
    }

    const missing = (exp.reason_codes ?? []).filter(
      (c: string) => !actual!.reason_codes.includes(c)
    );
    if (missing.length) {
      failures.push(`missing reason codes: ${missing.join(', ')}`);
      if (category === 'PASS') category = 'WRONG_CODES';
    }

    const forbidden = (exp.reason_codes_absent ?? []).filter((c: string) =>
      actual!.reason_codes.includes(c)
    );
    if (forbidden.length) {
      failures.push(`forbidden reason codes present: ${forbidden.join(', ')}`);
      if (category === 'PASS') category = 'WRONG_CODES';
    }

    // CV-2: a correct verdict from the wrong clause is not a pass.
    if (actual.triggering_clause !== exp.triggering_clause) {
      failures.push(
        `triggering_clause: expected ${exp.triggering_clause}, got ${actual.triggering_clause}`
      );
      if (category === 'PASS') category = 'WRONG_MECHANISM';
    }
  } catch (e) {
    failures.push(`exception: ${e instanceof Error ? e.message : String(e)}`);
    category = 'ERROR';
  }

  outcomes.push({
    test_id: t.test_id,
    passed: failures.length === 0,
    category: failures.length === 0 ? 'PASS' : category,
    failures,
    actual,
  });
}

// ── H-4: per-category reporting ─────────────────────────────────────────
const byCategory = new Map<string, number>();
for (const o of outcomes) {
  byCategory.set(o.category, (byCategory.get(o.category) ?? 0) + 1);
}

const passed = outcomes.filter((o) => o.passed).length;
const total = outcomes.length;

console.log('outcomes by category');
for (const [c, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(16)} ${n}`);
}

const denyCases = suite.tests.filter(
  (t: any) => t.expected.decision_action === 'DENY'
).length;
const denyPassed = outcomes.filter(
  (o, i) => o.passed && suite.tests[i].expected.decision_action === 'DENY'
).length;

console.log('\ngovernance signal');
console.log(`  DENY-expecting cases passed : ${denyPassed}/${denyCases}`);
console.log(
  `  ALLOW-expecting cases passed: ${passed - denyPassed}/${total - denyCases}`
);

if (passed < total) {
  console.log('\nfailures');
  for (const o of outcomes.filter((x) => !x.passed)) {
    console.log(`  ${o.test_id}  [${o.category}]`);
    for (const f of o.failures) console.log(`      ${f}`);
    if (o.actual)
      console.log(
        `      actual: ${o.actual.action} clause=${o.actual.triggering_clause} codes=[${o.actual.reason_codes.join(',')}]`
      );
  }
}

const out = {
  build: { package: `${pkg.name}@${pkg.version}`, engine: enginePath },
  suite: suite.suite_id,
  spec_version: suite.spec_version,
  total,
  passed,
  failed: total - passed,
  by_category: Object.fromEntries(byCategory),
  deny_cases: denyCases,
  deny_passed: denyPassed,
  outcomes,
};
const target =
  process.argv[3] ?? 'c:/work/tealtiger-workspace/.phase0/conformance-results.json';
fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf-8');

console.log(`\n${passed}/${total} conformant`);
console.log(`written=${target}`);
process.exit(passed === total ? 0 : 1);
