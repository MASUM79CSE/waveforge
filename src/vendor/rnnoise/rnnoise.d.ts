/**
 * Hand-written module types for the vendored echogarden rnnoise-wasm
 * emscripten build (BSD-3-Clause — see COPYING). Only the C-API surface
 * WaveForge uses is declared; the full emscripten module has more.
 */

export interface RNNoiseModule {
  HEAPF32: Float32Array;
  _rnnoise_get_frame_size(): number;
  /** 0 = built-in default model. Returns the state pointer. */
  _rnnoise_create(model: number): number;
  _rnnoise_destroy(state: number): void;
  /** Returns the per-frame VAD speech probability (0..1). */
  _rnnoise_process_frame(state: number, out: number, input: number): number;
  _malloc(size: number): void;
  _free(ptr: number): void;
}

export default function rnnoiseFactory(overrides?: {
  wasmBinary?: ArrayBuffer;
  [key: string]: unknown;
}): Promise<RNNoiseModule>;
