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

const DEFAULT_BUDGET = 120_084 + 2_048; // 122,132 B gz
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
