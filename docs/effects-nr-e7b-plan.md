# E7b — RNNoise "AI Voice" mode — build plan

**Date:** 2026-09-25 · **Extends:** `docs/effects-nr-v3-plan.md` §1 (market analysis,
Phase-2 option) · **Un-parks:** the E7b note (task_list §11 v1 deltas).

> **STATUS: SHIPPED (2026-09-25).** Vendor+plan `ecd3751` · feat `f936f7a`
> (kernel `src/fx/nrVoice.ts` + def/menu/command + gated dialog + i18n/css)
> · test `710542e` (9 unit gates + 39th e2e). Full gates at ship: 666/666
> unit (77 files), 39/39 e2e, lint 0, tsc clean, build OK. §2 deviation
> shipped as documented (main-thread; `createRnVoiceStream` is the worker
> seam). §3 pitch anchor landed as physics-verified literals: ACF lag
> 218 = 48000/220 preserved, tone level within −0.02 dB, crossings
> converge to 2f (noise removal LOWERS ZCR — the naive ±25 % input-ZCR
> band was backwards).

## 0. What ships

A new kernel effect **`fx.rnvoice` — "AI Voice Clarity"** (RNNoise WASM), the
ML speech-separator lineage alongside the statistical E7a `nr3` engine.
Voice-first by design (RNNoise degrades music) — it is a SEPARATE effect,
never a default, and its dialog/label say voice.

## 1. Vendor + license

- `@echogarden/rnnoise-wasm` **0.2.0**, BSD-3-Clause (Mozilla / Jean-Marc
  Valin / Xiph.Org / Mark Borgerding–kissfft) — the sole license-clean
  vendor per the E7 analysis. Raw emscripten module (no opinionated
  wrapper): `rnnoise_create / rnnoise_process_frame / rnnoise_destroy /
  rnnoise_get_frame_size`, default model built in, 480-sample frames
  @ 48 kHz mono, **f32 frames in s16 scale (−32768..32767)**, returns the
  VAD speech probability per frame.
- Vendored like the libflac precedent: `src/vendor/rnnoise/rnnoise.js` +
  `rnnoise.wasm` + `COPYING`; row added to `THIRD_PARTY_NOTICES.md`.
- wasm resolves via `?url` import (vite asset, lazy-loaded only when the
  effect opens); node tests read the same URL through an fs shim.

## 2. Architecture (worker deviation, documented)

The park note assumed a worker; **v1 runs on the main thread** like every
other kernel effect (`kernelProcess` path) — RNNoise's per-frame cost is
~an order below the E7a WOLA engine that already ships main-thread, and
offline apply has no deadline. A worker move is a pure optimization
behind the same kernel signature, deferred.

- `src/fx/nrVoice.ts`:
  - `rnvoiceStatus` signal: `unloaded | loading | ready | error`;
    `ensureRnVoice(): Promise<void>` lazy-loads (dynamic `import()` of the
    vendored module + wasm bytes), idempotent.
  - `rnVoiceProcess(channels, sampleRate, { mix })`: per-channel
    `DenoiseState`; project rate ≠ 48 kHz → resample via the existing
    `resample()` kernel (factor 44100/48000 varispeed convention),
    process, resample back, trim/pad to exact input length. Frames in
    s16 scale (×32768 in/out). Last short frame zero-padded. `mix`
    (0..1) is a per-sample dry/wet law AFTER the model: `mix = 0` is
    BIT-EXACT passthrough (the constant-curve guard pattern).
  - Determinism: the WASM is deterministic; same input + fresh state ⇒
    identical output (anchored).
- defs entry: specs `mix` only (0..1, step 0.01, default 1). The model has
  no strength knob — mix IS the intensity control; the noise floor is
  the model's business.
- EffectDialog: when `def.id === 'fx.rnvoice'`, kicks `ensureRnVoice()` on
  open, shows a status line (loading model… / error), and disables
  Preview/Apply until `ready` (the sync kernel path must not run early).

## 3. Gates (§8 style — literal anchors where possible)

Unit (real WASM in vitest, node environment):
1. Frame-size contract: `rnvoiceFrameSize() === 480`.
2. **Determinism:** the same input through two fresh states is
   bit-identical.
3. Digital silence → all-zero output (model outputs exact zeros on
   s16-zero frames).
4. **Noise suppression:** white noise @ −20 dBFS, ≥ 1 s @ 48 kHz →
   output RMS ≥ 6 dB below input RMS.
5. **Pitch preserved:** 220 Hz sine @ −6 dBFS in noise → output
   zero-crossing rate within ±25 % of input (RNNoise must not shift
   pitch — it is gain-only per band).
6. Chunk invariance: one call over N frames == N sequential single-frame
   calls through the same state (streaming contract).
7. `mix = 0` → bit-exact passthrough; `mix = 1` → pure wet.
8. 44.1 kHz round trip: output length == input length (trim/pad law).

e2e (39th): open AI Voice Clarity on the sample → dialog shows the model
status → apply → toast + undo/redo, console-clean.

## 4. Non-goals (this phase)

- No worker offload (documented above), no custom model import, no VAD
  export UI, no real-time monitoring mode.
