/**
 * Doctor self-diagnostics (Build Plan §6.3 #7).
 *
 * A hidden diagnostics panel that runs capability self-tests and renders a
 * pass/fail report — mirrors the ECC `doctor` pattern. Everything is local:
 * the probe never sends data anywhere.
 */

export interface CheckResult {
  ok: boolean;
  detail: string;
}

export interface DoctorCheck {
  id: string;
  label: string;
  run: () => CheckResult | Promise<CheckResult>;
}

export interface DoctorRow extends CheckResult {
  id: string;
  label: string;
  ms: number;
}

/** Run checks sequentially, capturing timing and any thrown error as a fail. */
export async function runDoctorChecks(checks: DoctorCheck[]): Promise<DoctorRow[]> {
  const rows: DoctorRow[] = [];
  for (const c of checks) {
    const t0 = performance.now();
    let result: CheckResult;
    try {
      result = await c.run();
    } catch (err) {
      result = { ok: false, detail: String((err as Error)?.message ?? err) };
    }
    rows.push({ id: c.id, label: c.label, ms: Math.round(performance.now() - t0), ...result });
  }
  return rows;
}

// ---- individual probes ----------------------------------------------------

const WASM_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** Minimal WebAssembly instantiate — the DSP kernel load path. */
export async function wasmProbe(): Promise<CheckResult> {
  const { instance } = await WebAssembly.instantiate(WASM_BYTES);
  return { ok: instance instanceof WebAssembly.Instance, detail: 'wasm module instantiated' };
}

async function webAudioProbe(): Promise<CheckResult> {
  if (typeof OfflineAudioContext === 'undefined') {
    return { ok: false, detail: 'OfflineAudioContext unavailable' };
  }
  const ctx = new OfflineAudioContext(1, 128, 44100);
  const buf = ctx.createBuffer(1, 128, ctx.sampleRate);
  const rendered = await ctx.startRendering();
  return {
    ok: rendered.length === 128 && buf.length === 128,
    detail: `OfflineAudioContext renders at ${ctx.sampleRate} Hz`,
  };
}

async function workletProbe(): Promise<CheckResult> {
  if (typeof AudioWorkletNode === 'undefined') {
    return { ok: false, detail: 'AudioWorkletNode unavailable' };
  }
  if (typeof AudioContext === 'undefined') {
    return { ok: true, detail: 'AudioWorkletNode present (no AudioContext to addModule)' };
  }
  const src = 'class P extends AudioWorkletProcessor {}\nregisterProcessor("p", P);';
  const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
  const ctx = new AudioContext();
  try {
    await ctx.audioWorklet.addModule(url);
    return { ok: true, detail: 'worklet module added' };
  } finally {
    void ctx.close();
    URL.revokeObjectURL(url);
  }
}

async function idbProbe(): Promise<CheckResult> {
  if (typeof indexedDB === 'undefined') return { ok: false, detail: 'indexedDB unavailable' };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('wf-doctor-probe', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('open failed'));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put('v', 'k');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('put failed'));
    });
    return { ok: true, detail: 'open + write ok' };
  } finally {
    db.close();
    void indexedDB.deleteDatabase('wf-doctor-probe');
  }
}

async function storageProbe(): Promise<CheckResult> {
  if (!navigator.storage?.estimate) {
    return { ok: false, detail: 'storage.estimate unavailable' };
  }
  const { usage, quota } = await navigator.storage.estimate();
  const mb = (n: number | undefined): string => `${Math.round((n ?? 0) / 1048576)} MB`;
  return { ok: (quota ?? 0) > 0, detail: `${mb(usage)} used / ${mb(quota)} quota` };
}

function presenceProbe(id: string, label: string, present: boolean, detail: string): DoctorCheck {
  return { id, label, run: () => ({ ok: present, detail: present ? detail : `${detail} — fallback in use` }) };
}

async function fetchProbe(): Promise<CheckResult> {
  try {
    const res = await fetch('/samples/demo.wav', { method: 'HEAD' });
    return { ok: res.ok, detail: `same-origin HEAD ${res.status}` };
  } catch (err) {
    return { ok: false, detail: String((err as Error)?.message ?? err) };
  }
}

/** The default browser check list (order = panel display order). */
export function defaultDoctorChecks(): DoctorCheck[] {
  return [
    { id: 'webaudio', label: 'WebAudio (OfflineAudioContext render)', run: webAudioProbe },
    { id: 'worklet', label: 'AudioWorklet addModule', run: workletProbe },
    { id: 'idb', label: 'IndexedDB open + write', run: idbProbe },
    { id: 'wasm', label: 'WebAssembly instantiate', run: wasmProbe },
    presenceProbe(
      'compression',
      'CompressionStream (draft gzip)',
      typeof CompressionStream !== 'undefined',
      'CompressionStream available',
    ),
    { id: 'storage', label: 'Storage estimate', run: storageProbe },
    presenceProbe(
      'savepicker',
      'File System Access save picker',
      typeof window !== 'undefined' && 'showSaveFilePicker' in window,
      'showSaveFilePicker available',
    ),
    presenceProbe(
      'offscreen',
      'OffscreenCanvas',
      typeof OffscreenCanvas !== 'undefined',
      'OffscreenCanvas available',
    ),
    { id: 'fetch', label: 'Same-origin fetch (sample asset)', run: fetchProbe },
  ];
}
