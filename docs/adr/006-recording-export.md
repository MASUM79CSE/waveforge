# ADR 006 — Recording & export: worklet recorder, worker encoders, save API

Status: accepted (M4) · Date: 2026-09-24

## Context

M4 adds microphone recording and export to WAV/MP3/FLAC (Build Plan §10).
Exit gates: bit-exact WAV fixtures, valid MP3/FLAC at all settings, e2e
flows #3/#4, and a mandatory security review of the file system and binary
output paths.

## Decision

1. **Recording.** `getUserMedia` → `AudioWorkletNode` (`wf-recorder`, served
   from `public/worklets/`) accumulating transferable chunks into a pure
   `RecordBuffer` (unit tested). ScriptProcessorNode remains the fallback
   for browsers without AudioWorklet. Mic constraints (echo cancellation,
   noise suppression, auto gain) are user-toggles in a settings dialog;
   the device list comes from `enumerateDevices`. Stopping produces a new
   AudioDocument installed as the active document (v1 single-track parity;
   multitrack takes are an M8+ concern). Metering = peak/RMS from an
   AnalyserNode tap, pure level-math helper unit tested.
2. **Export = pure encoders in workers.**
   - **WAV:** our own writer (`src/io/wavEncoder.ts`, pure, golden-tested
     byte-for-byte: RIFF/WAVE, PCM 16/24-bit and IEEE float 32-bit). Runs
     on the main thread — it is O(bytes) memcpy-speed.
   - **MP3:** `@breezystack/lamejs` in a **module worker** (`mp3` encoder,
     128/192/256/320 kbps), per-block `postMessage` progress, cancel flag
     checked between blocks, transferable output.
   - **FLAC:** libflacjs's emscripten build (`libflac.min.wasm.js` + wasm)
     vendored to `public/vendor/` and driven by a **classic worker**
     (`public/workers/flac-export.worker.js`) via `importScripts` — the
     exact AudioMass-proven pattern (bundler-free wasm loading). 16/24-bit,
     compression 0–8, progress + cancel.
   - Worker messages are validated at the boundary (zod on the main-thread
     side, defensive checks in the classic worker).
3. **Saving.** `showSaveFilePicker` is called **inside the Export click**
   (transient activation) to get a handle first, then encoding runs, then
   the stream is written. Fallback: `<a download>` + object URL, revoked
   after use. Filenames pass through a pure sanitizer (control chars,
   separators, length) with a safe default.
4. **Selection semantics.** Export scope = selection when one exists,
   else the whole document (AudioMass parity).
5. **Validation gate (revised during bring-up).** `scripts/validate-
   encoders.mjs` encodes in Node and asserts MP3 frame sync + size bounds
   at all four bitrates. FLAC's emscripten wasm build only runs in a real
   worker environment (the Node/vm route fought the runtime and lost), so
   FLAC validity is asserted by the Playwright suite instead — encoding a
   tone through the actual worker and checking the `fLaC` container. That
   is the stronger check anyway: it exercises the exact production path.

## Security review targets (mandatory per §10 M4)

- No `innerHTML`/`dangerous` sinks for filenames or progress UI.
- Object URLs revoked; no `data:` URLs for binaries.
- `getUserMedia` streams fully stopped (tracks + node + source) on stop and
  on error; recorder state machine cannot double-start.
- Worker messages: defensive validation (classic worker) / zod (typed side);
  no `eval`, no remote code in workers.

## Consequences

- New browser-only surfaces (`RecorderEngine`, workers, save APIs) are
  excluded from unit coverage like AudioEngine; everything pure around them
  (WAV writer, RecordBuffer, meter math, sanitizer, size estimate, rate
  conversion) is covered.
- Bundle stays lean: lamejs + libflac load only inside workers/`vendor/`,
  fetched on first export.
