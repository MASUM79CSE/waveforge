/**
 * Smart RAG feature flag (P0.8). Default OFF — the app is behaviorally
 * identical to main when disabled (dark ship). Nothing heavy may be
 * imported from this module.
 *
 * Enabled when ANY of (OR):
 *  - build env `VITE_RAG=1`
 *  - URL param `?rag=1`
 *  - localStorage `wf.rag = '1'`
 * Strict string `'1'`; all external access try/catch-guarded.
 */

export interface RagFlagSources {
  /** Value of `import.meta.env.VITE_RAG` ('' when unset). */
  env: string;
  /** Value of the `rag` URL param, null when absent. */
  urlParam: string | null;
  /** Value of localStorage['wf.rag'], null when absent or unavailable. */
  stored: string | null;
}

/** Pure decision — unit-tested in tests/rag/flag.test.ts. */
export function resolveRagFlag(s: RagFlagSources): boolean {
  return s.env === '1' || s.urlParam === '1' || s.stored === '1';
}

function readRuntimeSources(): RagFlagSources {
  let env = '';
  try {
    env = String(import.meta.env?.VITE_RAG ?? '');
  } catch {
    env = '';
  }
  let urlParam: string | null = null;
  try {
    urlParam = new URLSearchParams(window.location.search).get('rag');
  } catch {
    urlParam = null;
  }
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem('wf.rag');
  } catch {
    stored = null;
  }
  return { env, urlParam, stored };
}

/** Runtime entry point (impure wrapper around the pure resolver). */
export function isRagEnabled(): boolean {
  return resolveRagFlag(readRuntimeSources());
}
