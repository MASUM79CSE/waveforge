#!/usr/bin/env node
// Bundle-size guard (Smart RAG P0.7): the main entry chunk must stay within
// BASELINE + TOLERANCE gzipped. All RAG code is lazy — this is the tripwire.
// Usage: node scripts/check-bundle-size.mjs [--baseline scripts/bundle-baseline.json]
// Env: BUNDLE_TOLERANCE_BYTES (default 2048).

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pure comparison — unit-tested in tests/rag/bundleSize.test.ts. */
export function evaluateSize(mainGzipBytes, baselineBytes, toleranceBytes) {
  const inputsFinite =
    Number.isFinite(mainGzipBytes) &&
    Number.isFinite(baselineBytes) &&
    Number.isFinite(toleranceBytes);
  if (!inputsFinite || mainGzipBytes < 0 || baselineBytes < 0 || toleranceBytes < 0) {
    return { ok: false, delta: NaN, limit: NaN, overshoot: NaN };
  }
  const limit = baselineBytes + toleranceBytes;
  const delta = mainGzipBytes - baselineBytes;
  const ok = mainGzipBytes <= limit;
  return { ok, delta, limit, overshoot: ok ? 0 : mainGzipBytes - limit };
}

function gzip(path) {
  return gzipSync(readFileSync(path)).length;
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dist = resolve(here, '../dist');
  const htmlPath = join(dist, 'index.html');
  if (!existsSync(htmlPath)) {
    console.error('✗ dist/index.html not found — run `npm run build` first.');
    process.exit(2);
  }
  const html = readFileSync(htmlPath, 'utf8');
  const entry = /<script[^>]+type="module"[^>]+src="([^"]+\.js)"/.exec(html);
  if (!entry) {
    console.error('✗ no module entry <script> found in dist/index.html');
    process.exit(2);
  }
  const entryPath = resolve(dist, entry[1].replace(/^\//, '').replace(/^assets\//, 'assets/'));

  const baselinePath = resolve(here, 'bundle-baseline.json');
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).mainGzipBytes;
  const tolerance = Number(process.env.BUNDLE_TOLERANCE_BYTES ?? 2048);

  const mainGz = gzip(entryPath);
  const verdict = evaluateSize(mainGz, baseline, tolerance);

  console.log('Bundle check (gzip bytes):');
  console.log(`  entry:        ${entry[1]}`);
  console.log(`  main gzip:    ${mainGz}`);
  console.log(`  baseline:     ${baseline}`);
  console.log(`  tolerance:    ${tolerance}`);
  console.log(`  limit:        ${verdict.limit}`);
  console.log(`  delta:        ${verdict.delta >= 0 ? '+' : ''}${verdict.delta}`);

  const chunks = [];
  for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/g)) {
    chunks.push(m[1]);
  }
  const moduleDir = join(dist, 'assets');
  for (const f of readdirSync(moduleDir).sort()) {
    if (!f.endsWith('.js')) continue;
    const p = join(moduleDir, f);
    const sz = statSync(p).size;
    if (sz > 20_000) chunks.push(`/assets/${f}`);
  }
  const seen = new Set();
  for (const c of chunks) {
    if (seen.has(c)) continue;
    seen.add(c);
    const p = resolve(dist, c.replace(/^\//, ''));
    if (existsSync(p)) console.log(`    ${String(gzip(p)).padStart(9)} B gz  ${c}`);
  }

  if (verdict.ok) {
    console.log('✓ bundle within budget');
  } else {
    console.error(`✗ bundle OVER budget by ${verdict.overshoot} B (limit ${verdict.limit}).`);
    console.error('  RAG code must be lazy-loaded; models never enter the entry chunk.');
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
