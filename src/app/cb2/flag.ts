/**
 * Control Bar v2 feature flag (master prompt: build-time + URL param +
 * guarded localStorage; default OFF in every path — CB-2.1).
 *
 * Resolution order (first match wins, evaluated ONCE at boot):
 *   1. URL param  ?cbv2=1 | ?cbv2=0
 *   2. Build flag VITE_CB_V2 === '1'
 *   3. localStorage 'ui.controlBarV2' === '1' | '0'
 *   4. OFF
 */
function resolve(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('cbv2');
    if (param === '1') return true;
    if (param === '0') return false;
  } catch {
    /* no location (SSR/tests) → fall through */
  }
  try {
    // vite statically replaces import.meta.env; absent key === undefined
    if (import.meta.env.VITE_CB_V2 === '1') return true;
  } catch {
    /* non-vite environment */
  }
  try {
    const ls = window.localStorage.getItem('ui.controlBarV2');
    if (ls === '1') return true;
    if (ls === '0') return false;
  } catch {
    /* private mode */
  }
  return false;
}

/** Read-once module constant: the flag never flips mid-session. */
export const cbV2: boolean = resolve();
