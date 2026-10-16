/**
 * frame2 flag (UX-2.1) — `ui.cleanSlateLayout`, default OFF.
 *
 * Resolution order:
 *   1. URL param `ui2` present → it WINS ('1'/'true' ON, anything else OFF).
 *   2. otherwise localStorage `ui.cleanSlateLayout` ∈ {'1','true'} → ON.
 *   3. otherwise OFF.
 *
 * Pure resolution lives in `resolveFrame2()`; `isFrame2()` caches per page
 * load (the flag must not flip mid-session — a reload re-evaluates).
 */

export const FRAME2_FLAG_KEY = 'ui.cleanSlateLayout';
export const FRAME2_URL_PARAM = 'ui2';

export function resolveFrame2(search: string, store: { get(key: string): string | null }): boolean {
  const params = new URLSearchParams(search);
  if (params.has(FRAME2_URL_PARAM)) {
    const v = params.get(FRAME2_URL_PARAM);
    return v === '1' || v === 'true';
  }
  const stored = store.get(FRAME2_FLAG_KEY);
  return stored === '1' || stored === 'true';
}

let cached: boolean | null = null;

/** Resolved once per page load. */
export function isFrame2(): boolean {
  if (cached === null) {
    cached =
      typeof window !== 'undefined' &&
      resolveFrame2(window.location.search, {
        get: (k) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k)),
      });
  }
  return cached;
}

/** Test hook — the cache is intentionally not part of the public contract. */
export function resetFrame2Cache(): void {
  cached = null;
}
