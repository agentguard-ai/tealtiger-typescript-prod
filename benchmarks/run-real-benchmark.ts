/**
 * Real Benchmark Runner — Runs Garak + PINT probes against TealTiger's actual guardrails.
 * 
 * This uses TealGuard with PromptInjectionGuardrail, PIIDetectionGuardrail,
 * and ContentModerationGuardrail to evaluate the benchmark datasets.
 * 
 * Usage: npx ts-node benchmarks/run-real-benchmark.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

// Import TealTiger guardrails
import { TealGuard } from '../src/core/guard/TealGuard';
import { PromptInjectionGuardrail } from '../src/guardrails/prompt-injection';
import { PIIDetectionGuardrail } from '../src/guardrails/pii-detection';
import { ContentModerationGuardrail } from '../src/guardrails/content-moderation';
import { DecisionAction } from '../src/core/engine/types';
import { classifySample, computeClassificationMetrics } from './runner/metrics';

interface GarakProbe {
  id: string;
  category: string;
  probe: string;
  source: string;
}

interface PINTSample {
  text: string;
  category: string;
  label: boolean;
}

interface CategoryStats {
  total: number;
  blocked: number;
  allowed: number;
  errors: number;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TealTiger v1.2 — Full Benchmark (Real Guardrails)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Initialize TealGuard with all guardrails
  const guard = new TealGuard({
    policyDriven: false,
    enableCache: false,
  });

  guard.registerGuardrail(new PromptInjectionGuardrail({ sensitivity: 'high' }));
  guard.registerGuardrail(new PIIDetectionGuardrail({ action: 'block' }));
  guard.registerGuardrail(new ContentModerationGuardrail({ threshold: 0.5 }));

  // ═══ GARAK BENCHMARK ═══
  console.log('── GARAK BENCHMARK ──────────────────────────────────────\n');

  const garakDir = path.resolve(__dirname, 'datasets', 'garak');
  const garakFiles = ['jailbreak.yaml', 'prompt-injection.yaml', 'data-leakage.yaml', 'encoding.yaml'];

  const allProbes: GarakProbe[] = [];
  for (const file of garakFiles) {
    const content = fs.readFileSync(path.join(garakDir, file), 'utf-8');
    const probes = yaml.load(content) as GarakProbe[];
    allProbes.push(...probes);
  }

  console.log(`Loaded ${allProbes.length} Garak probes\n`);

  const garakStats = new Map<string, CategoryStats>();
  const garakStart = Date.now();

  for (const probe of allProbes) {
    if (!garakStats.has(probe.category)) {
      garakStats.set(probe.category, { total: 0, blocked: 0, allowed: 0, errors: 0 });
    }
    const stats = garakStats.get(probe.category)!;
    stats.total++;

    try {
      const decision = await guard.check(probe.probe);
      if (decision.action === DecisionAction.DENY) {
        stats.blocked++;
      } else {
        stats.allowed++;
      }
    } catch {
      stats.errors++;
    }
  }

  const garakDuration = Date.now() - garakStart;

  console.log('┌────────────────────┬───────┬─────────┬─────────┬────────────────┐');
  console.log('│ Category           │ Total │ Blocked │ Allowed │ Detection Rate │');
  console.log('├────────────────────┼───────┼─────────┼─────────┼────────────────┤');

  let gTotalBlocked = 0, gTotalAllowed = 0;
  for (const [category, stats] of garakStats) {
    const rate = stats.blocked + stats.allowed > 0
      ? (stats.blocked / (stats.blocked + stats.allowed) * 100).toFixed(1)
      : '0.0';
    console.log(`│ ${category.padEnd(18)} │${String(stats.total).padStart(5)} │${String(stats.blocked).padStart(7)} │${String(stats.allowed).padStart(7)} │${`${rate}%`.padStart(14)} │`);
    gTotalBlocked += stats.blocked;
    gTotalAllowed += stats.allowed;
  }

  const gOverall = gTotalBlocked + gTotalAllowed > 0
    ? (gTotalBlocked / (gTotalBlocked + gTotalAllowed) * 100).toFixed(1) : '0.0';
  console.log('├────────────────────┼───────┼─────────┼─────────┼────────────────┤');
  console.log(`│ OVERALL            │${String(allProbes.length).padStart(5)} │${String(gTotalBlocked).padStart(7)} │${String(gTotalAllowed).padStart(7)} │${`${gOverall}%`.padStart(14)} │`);
  console.log('└────────────────────┴───────┴─────────┴─────────┴────────────────┘');
  console.log(`Execution time: ${garakDuration}ms\n`);

  // ═══ PINT BENCHMARK ═══
  console.log('── PINT BENCHMARK ───────────────────────────────────────\n');

  const pintFile = path.resolve(__dirname, 'datasets', 'pint', 'pint-dataset.yaml');
  const pintContent = fs.readFileSync(pintFile, 'utf-8');
  const pintSamples = yaml.load(pintContent) as PINTSample[];

  console.log(`Loaded ${pintSamples.length} PINT samples\n`);

  const pintStart = Date.now();
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const pintCatStats = new Map<string, { tp: number; fp: number; tn: number; fn: number; total: number }>();

  for (const sample of pintSamples) {
    if (!pintCatStats.has(sample.category)) {
      pintCatStats.set(sample.category, { tp: 0, fp: 0, tn: 0, fn: 0, total: 0 });
    }
    const stats = pintCatStats.get(sample.category)!;
    stats.total++;

    try {
      const decision = await guard.check(sample.text);
      const action = decision.action === DecisionAction.DENY ? 'DENY' as const : 'ALLOW' as const;
      const classification = classifySample(sample.label, action);

      switch (classification) {
        case 'TP': stats.tp++; tp++; break;
        case 'FP': stats.fp++; fp++; break;
        case 'TN': stats.tn++; tn++; break;
        case 'FN': stats.fn++; fn++; break;
      }
    } catch {
      // skip errors
    }
  }

  const pintDuration = Date.now() - pintStart;
  const metrics = computeClassificationMetrics(tp, fp, tn, fn);

  console.log('Aggregate Classification Metrics:');
  console.log(`  Accuracy:  ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score:  ${(metrics.f1Score * 100).toFixed(1)}%`);
  console.log(`  TP: ${tp}  FP: ${fp}  TN: ${tn}  FN: ${fn}\n`);

  console.log('┌────────────────────┬───────┬────┬────┬────┬────┬───────────┬────────┬────────┐');
  console.log('│ Category           │ Total │ TP │ FP │ TN │ FN │ Precision │ Recall │   F1   │');
  console.log('├────────────────────┼───────┼────┼────┼────┼────┼───────────┼────────┼────────┤');

  for (const [category, stats] of pintCatStats) {
    const m = computeClassificationMetrics(stats.tp, stats.fp, stats.tn, stats.fn);
    console.log(`│ ${category.padEnd(18)} │${String(stats.total).padStart(5)} │${String(stats.tp).padStart(3)} │${String(stats.fp).padStart(3)} │${String(stats.tn).padStart(3)} │${String(stats.fn).padStart(3)} │${`${(m.precision * 100).toFixed(0)}%`.padStart(9)} │${`${(m.recall * 100).toFixed(0)}%`.padStart(6)} │${`${(m.f1Score * 100).toFixed(0)}%`.padStart(6)} │`);
  }

  console.log('└────────────────────┴───────┴────┴────┴────┴────┴───────────┴────────┴────────┘');
  console.log(`Execution time: ${pintDuration}ms`);
  console.log(`\nTotal benchmark time: ${garakDuration + pintDuration}ms`);
}

main().catch(console.error);
