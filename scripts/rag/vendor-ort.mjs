#!/usr/bin/env node
/**
 * P2.5 — vendor ONNX Runtime wasm assets into `public/rag-assets/ort/`.
 *
 * Why vendored: transformers.js would otherwise fetch ort wasm from a
 * CDN (jsdelivr) — a NEW egress host. Vendoring keeps the CSP
 * allow-list unchanged (self + documented model hosts only).
 *
 * Generated at build time (`npm run build`), NOT committed: the files
 * land in dist/ but are excluded from the service-worker precache via
 * the `globIgnores` entry in vite.config.ts (models/runtimes never in
 * precache — standing invariant).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = 'node_modules/onnxruntime-web/dist';
const dstDir = 'public/rag-assets/ort';

if (!existsSync(srcDir)) {
  console.error('vendor-ort: onnxruntime-web is not installed');
  process.exit(1);
}
mkdirSync(dstDir, { recursive: true });

let count = 0;
for (const f of readdirSync(srcDir)) {
  if (f.endsWith('.wasm') || f.endsWith('.mjs')) {
    copyFileSync(join(srcDir, f), join(dstDir, f));
    count++;
  }
}
console.log(`vendor-ort: copied ${count} files -> ${dstDir}`);
void cpSync; // (kept out: single-file copy is enough)
