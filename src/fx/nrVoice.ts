/**
 * E7b — "AI Voice Clarity": RNNoise (recurrent-neural-net noise
 * suppression) as a kernel effect. Vendored WASM (BSD-3-Clause, see
 * src/vendor/rnnoise/COPYING) exposing the C contract: 480-sample frames
 * @ 48 kHz MONO, f32 frames in s16 scale (−32768..32767), per-frame VAD
 * speech probability out, GRU state carried across frames. Deterministic.
 *
 * Stereo is processed per channel with independent states (image
 * preserved). Non-48k material is resampled through the existing varispeed
 * `resample` kernel and brought back to the exact input length. `mix`
 * (0..1) is a per-sample dry/wet law AFTER the model — mix 0 is bit-exact
 * passthrough (the constant-curve guard pattern from the automation work).
 *
 * Worker deviation (docs/effects-nr-e7b-plan.md §2): main-thread by
 * default — per-frame cost is ~an order below the E7a WOLA engine that
 * already ships main-thread; a worker is a pure optimization behind the
 * same signature, deferred.
 */
import { signal } from '@preact/signals';
import { logger } from '../core/logger-instance';
import { resample } from './resample';

export type RnVoiceStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export const rnvoiceStatus = signal<RnVoiceStatus>('unloaded');

/** Shape of the vendored emscripten module we rely on (duck-typed). */
interface RnNoiseModule {
  HEAPF32: Float32Array;
  _rnnoise_get_frame_size(): number;
  _rnnoise_create(model: number): number;
  _rnnoise_destroy(state: number): void;
  _rnnoise_process_frame(state: number, out: number, input: number): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
}

let mod: RnNoiseModule | null = null;
let loading: Promise<void> | null = null;

const S16 = 32768;
const FRAME = 480; // verified against _rnnoise_get_frame_size (anchored)

/** Fetch/derive the wasm bytes from a vite `?url` asset in any environment. */
async function wasmBytes(url: string): Promise<ArrayBuffer> {
  if (typeof window === 'undefined') {
    // node (vitest): the url is a file URL, an absolute path, or a
    // root-relative dev URL — resolve the candidates that exist. The
    // dynamic imports stay opaque to bundlers (@vite-ignore): browsers
    // never take this branch, and node resolves them at runtime.
    const fs = await import(/* @vite-ignore */ 'node:fs');
    const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url');
    const candidates = [
      url.startsWith('file:') ? fileURLToPath(url) : null,
      url.startsWith('/') ? url : null,
      url.startsWith('/') ? `${process.cwd()}${url}` : null,
    ].filter((c): c is string => c !== null);
    for (const path of candidates) {
      try {
        const buf = fs.readFileSync(path);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      } catch {
        /* try the next candidate */
      }
    }
    throw new Error(`rnvoice: wasm asset not found for ${url}`);
  }
  const res = await fetch(url);
  return res.arrayBuffer();
}

/** Lazy-load the vendored module + wasm (idempotent; signal-tracked). */
export function ensureRnVoice(): Promise<void> {
  if (rnvoiceStatus.value === 'ready') return Promise.resolve();
  if (loading) return loading;
  rnvoiceStatus.value = 'loading';
  loading = (async (): Promise<void> => {
    try {
      const factory = (await import('../vendor/rnnoise/rnnoise.js')).default;
      const url = (await import('../vendor/rnnoise/rnnoise.wasm?url')).default as string;
      const binary = await wasmBytes(url);
      mod = (await factory({ wasmBinary: binary })) as unknown as RnNoiseModule;
      rnvoiceStatus.value = 'ready';
    } catch (error: unknown) {
      logger.error('rnvoice model failed to load', { detail: String(error) });
      mod = null;
      rnvoiceStatus.value = 'error';
      loading = null; // allow a retry on reopen
      throw error;
    }
  })();
  return loading;
}

export function rnVoiceReady(): boolean {
  return rnvoiceStatus.value === 'ready' && mod !== null;
}

/** The model's frame contract (throws when the model is not loaded). */
export function rnvoiceFrameSize(): number {
  if (!mod) throw new Error('rnvoice: model not loaded');
  const got = mod._rnnoise_get_frame_size();
  if (got !== FRAME) throw new Error(`rnvoice: unexpected frame size ${got}`);
  return got;
}

interface DenoiseState {
  state: number;
  inPtr: number;
  outPtr: number;
}

function createDenoiseState(m: RnNoiseModule): DenoiseState {
  const state = m._rnnoise_create(0); // 0 = default built-in model
  return { state, inPtr: m._malloc(FRAME * 4), outPtr: m._malloc(FRAME * 4) };
}

function destroyDenoiseState(m: RnNoiseModule, st: DenoiseState): void {
  m._rnnoise_destroy(st.state);
  m._free(st.inPtr);
  m._free(st.outPtr);
}

/** One denoise frame through a persistent state (s16 scale in/out). */
function processFrame(m: RnNoiseModule, st: DenoiseState, frame: Float32Array): void {
  const inView = m.HEAPF32.subarray(st.inPtr >> 2, (st.inPtr >> 2) + FRAME);
  const outView = m.HEAPF32.subarray(st.outPtr >> 2, (st.outPtr >> 2) + FRAME);
  for (let i = 0; i < FRAME; ++i) inView[i] = frame[i]! * S16;
  m._rnnoise_process_frame(st.state, st.outPtr, st.inPtr);
  for (let i = 0; i < FRAME; ++i) frame[i] = outView[i]! / S16;
}

/**
 * Streaming handle: arbitrary chunk sizes through ONE state per channel
 * (the GRU is sequential — chunked processing stitches BIT-IDENTICALLY to
 * one-shot; anchor-tested). `flush()` zero-pads the sub-frame remainder
 * and returns its output trimmed to the real remainder length.
 */
export interface RnVoiceStream {
  process(channels: Float32Array[]): Float32Array[];
  flush(): Float32Array[];
  dispose(): void;
}

export function createRnVoiceStream(): RnVoiceStream {
  const m = mod;
  if (!m) throw new Error('rnvoice: model not loaded');
  const states = [createDenoiseState(m), createDenoiseState(m)];
  const carry: Float32Array[] = [];

  const pending = (c: number): Float32Array => (carry[c] ??= new Float32Array(0));

  const processCh = (c: number, chunk: Float32Array): Float32Array => {
    const head = pending(c);
    const all = new Float32Array(head.length + chunk.length);
    all.set(head, 0);
    all.set(chunk, head.length);
    const whole = Math.floor(all.length / FRAME) * FRAME;
    // out covers the WHOLE processed prefix: the carried head's outputs
    // are emitted by the chunk that finally completes their frame
    const out = new Float32Array(whole);
    const frame = new Float32Array(FRAME);
    for (let off = 0; off < whole; off += FRAME) {
      frame.set(all.subarray(off, off + FRAME));
      processFrame(m, states[c]!, frame);
      out.set(frame.subarray(0, Math.min(FRAME, whole - off)), off);
    }
    carry[c] = all.slice(whole);
    return out;
  };

  return {
    process(channels: Float32Array[]): Float32Array[] {
      return channels.map((ch, c) => processCh(c, ch));
    },
    flush(): Float32Array[] {
      const out: Float32Array[] = [];
      const count = Math.max(1, carry.length);
      for (let c = 0; c < count; ++c) {
        const head = pending(c);
        const frame = new Float32Array(FRAME);
        frame.set(head.subarray(0, Math.min(head.length, FRAME)));
        processFrame(m, states[c]!, frame);
        const tail = new Float32Array(head.length);
        for (let i = 0; i < tail.length; ++i) tail[i] = frame[i]!;
        out.push(tail);
        carry[c] = new Float32Array(0);
      }
      return out;
    },
    dispose(): void {
      for (const st of states) destroyDenoiseState(m, st);
    },
  };
}

export interface RnVoiceParams {
  /** Dry/wet after the model; 0 = bit-exact passthrough. */
  mix: number;
}

/**
 * Denoise the channels (AI Voice) — one-shot: a stream per call. `mix`
 * law per sample; non-48k rates round-trip through the varispeed
 * resampler with an exact-length law.
 */
export function rnVoiceProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: RnVoiceParams,
): Float32Array[] {
  const mix = Math.min(Math.max(params.mix, 0), 1);

  const processAt = (chans: Float32Array[]): Float32Array[] => {
    if (mix === 0) return chans; // bit-exact passthrough (no model work)
    const stream = createRnVoiceStream();
    try {
      const wet = stream.process(chans);
      const tail = stream.flush();
      return chans.map((ch, c) => {
        const w = new Float32Array(ch.length);
        w.set(wet[c]!.subarray(0, ch.length));
        const t = tail[c] ?? [];
        for (let i = wet[c]!.length; i < ch.length; ++i) w[i] = t[i - wet[c]!.length] ?? 0;
        const out = new Float32Array(ch.length);
        for (let i = 0; i < ch.length; ++i) out[i] = ch[i]! * (1 - mix) + w[i]! * mix;
        return out;
      });
    } finally {
      stream.dispose();
    }
  };

  if (sampleRate === 48000) return processAt(channels);

  // round trip through 48 kHz (varispeed convention: out = len / factor)
  const up = resample(channels, 44100 / 48000);
  const denoised = processAt(up);
  const back = resample(denoised, 48000 / 44100);
  const len = channels[0]?.length ?? 0;
  return back.map((ch) => {
    if (ch.length === len) return ch;
    const out = new Float32Array(len);
    out.set(ch.subarray(0, Math.min(ch.length, len)));
    return out;
  });
}
