/**
 * WF-013/WF-014 — dependency provenance hygiene (permanent guard).
 *
 * Rules enforced here:
 *  1. Every runtime dependency in package.json is actually imported by
 *     the app (no dead deps like the removed `libflacjs`).
 *  2. docs/THIRD_PARTY_NOTICES.md credits only REAL dependencies — no
 *     phantom npm packages (e.g. `@echogarden/rnnoise-wasm`; the
 *     RNNoise build is vendored at src/vendor/rnnoise), and the
 *     LGPL-licensed encoder (the one licence that legally requires
 *     attribution) is credited.
 *  3. Vendored runtimes ship their licence text and the files the code
 *     actually fetches exist — including the single libFLAC wasm copy
 *     at public/workers/ (the runtime resolves the wasm relative to the
 *     worker script; a second copy in public/vendor/ would be a dead
 *     duplicate).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, p), 'utf8')) as Record<string, unknown>;
}

function allSource(): string {
  const files: string[] = [];
  const push = (d: string): void => {
    for (const e of readdirSync(resolve(root, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) push(rel);
      else if (/\.(ts|tsx|js)$/.test(e.name)) files.push(rel);
    }
  };
  push('src');
  push('public/workers');
  return files.map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n');
}

describe('dependency provenance hygiene', () => {
  it('every runtime dependency is imported somewhere in src or the classic worker', () => {
    const deps = Object.keys(readJson('package.json').dependencies as Record<string, string>);
    expect(deps.length).toBeGreaterThan(0);
    const source = allSource();
    const dead = deps.filter((d) => {
      const patterns = [`from '${d}'`, `from "${d}"`, `import('${d}')`, `import("${d}")`, `'${d}/`];
      return !patterns.some((p) => source.includes(p));
    });
    expect(dead, `dead runtime dependencies: ${dead.join(', ')}`).toEqual([]);
  });

  it('THIRD_PARTY_NOTICES credits only real dependencies (no phantom packages)', () => {
    const notices = readFileSync(resolve(root, 'docs/THIRD_PARTY_NOTICES.md'), 'utf8');
    // phantom: packages that were never npm deps of this app
    expect(notices).not.toContain('@echogarden/rnnoise-wasm');
    expect(notices).not.toContain('libflacjs');
    expect(notices).not.toContain('libflac.js');
    // the LGPL encoder attribution is legally required and must stay
    expect(notices).toContain('@breezystack/lamejs');
    expect(notices).toMatch(/LGPL/i);
  });

  it('vendored runtimes ship licence text, and only the live libFLAC wasm copy exists', () => {
    expect(existsSync(resolve(root, 'src/vendor/rnnoise/COPYING'))).toBe(true);
    // files the code actually fetches at runtime
    expect(existsSync(resolve(root, 'public/vendor/libflac.min.wasm.js'))).toBe(true);
    expect(existsSync(resolve(root, 'public/workers/libflac.min.wasm.wasm'))).toBe(true);
    expect(existsSync(resolve(root, 'public/workers/flac-export.worker.js'))).toBe(true);
    // the duplicate at public/vendor/libflac.min.wasm.wasm is dead
    // (emscripten resolves the wasm relative to the worker script dir)
    expect(existsSync(resolve(root, 'public/vendor/libflac.min.wasm.wasm'))).toBe(false);
  });

  it('docs naming a Preact major version agree with the declared dependency', () => {
    // WF-006 guard: README/ARCHITECTURE once claimed "Preact 11" while
    // package.json declared ^10.29.8. Any "Preact <major>" mention in
    // the docs must match the declared major.
    const deps = readJson('package.json').dependencies as Record<string, string>;
    const declared = /^[^\d]*(\d+)/.exec(String(deps.preact ?? ''))?.[1] ?? '';
    expect(declared).toMatch(/^\d+$/);
    for (const doc of ['README.md', 'docs/ARCHITECTURE.md']) {
      const text = readFileSync(resolve(root, doc), 'utf8');
      const claimed = [...text.matchAll(/Preact (\d+)/g)].map((m) => m[1]);
      for (const c of claimed) {
        expect(c, `${doc} claims Preact ${c}, package.json declares ${declared}`).toBe(declared);
      }
    }
  });

  it('README does not credit phantom npm packages', () => {
    const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
    expect(readme).not.toContain('@echogarden/rnnoise-wasm');
    expect(readme).not.toContain('libflacjs');
  });
});
