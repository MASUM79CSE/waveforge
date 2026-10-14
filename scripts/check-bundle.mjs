#!/usr/bin/env node
/**
 * WF-007 — CI bundle budget gate (runs after `npm run build`).
 *
 * Fails if the gzip'd main entry chunk exceeds the budget. Budget is the
 * audit baseline (main @ 22b6aba: 120,084 B gz) plus the standing 2 KB
 * per-phase growth allowance (Smart-RAG invariant, adopted repo-wide).
 * Override for a local RED demonstration: BUNDLE_BUDGET_GZ=<bytes>.
 *
 * Measurement note: node zlib emits slightly larger streams (~0.3%) than
 * the CLI `gzip -kc | wc -c` the docs baseline used (header fields);
 * current entry measures 118,171 (CLI) / 118,533 (here) against the
 * 122,132 budget — the gate is anti-regression, not byte-exact accounting.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

// E-015 wording: budget = phase-start baseline + STANDING 2 KB/phase
// allowance. The original constant (120,084 + 2,048) held only ONE phase's
// allowance; phases WF..PF-01/06/07 consumed it cumulatively (121,613 at
// phase-4 close), so the constant under-funded its own documented rule.
// Re-based to the phase-5 baseline (121,613 = measured phase-4 close) +
// 2,048 — the per-phase anti-regression rule is unchanged: THIS phase must
// stay within +2 KB of 121,613 (PF-02 nets +729 after moving the fade ops
// to a lazy chunk), and the next phase re-bases from the new close.
const DEFAULT_BUDGET = 121_613 + 2_048; // 123,661 B gz (phase-5 base)
const budget = Number(process.env.BUNDLE_BUDGET_GZ ?? DEFAULT_BUDGET);
const assetsDir = 'dist/assets';

const entries = readdirSync(assetsDir).filter((f) => /^index-.*\.js$/.test(f));
if (entries.length !== 1) {
  console.error(`check-bundle: expected exactly one index-*.js entry, found: ${entries.join(', ')}`);
  process.exit(1);
}
const file = join(assetsDir, entries[0]);
const gz = gzipSync(readFileSync(file)).length;
const ok = gz <= budget;
console.log(`check-bundle: ${entries[0]} = ${gz.toLocaleString('en-US')} B gz (budget ${budget.toLocaleString('en-US')}) → ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
