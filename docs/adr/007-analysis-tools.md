# ADR 007 — Analysis & tools: LUFS, BPM, ID3, spectrum tap

Status: accepted (M5) · Date: 2026-09-24

## Context

M5 adds spectrum/frequency analysers, LUFS metering (ITU-R BS.1770 kernels
tested against reference values), BPM detection + beat markers + snap, and
an ID3 editor (Zod-validated, escaped output). Exit gates: LUFS ±0.5 LU of
reference, BPM ±1 on test set, kernel profiling data captured, review clean.

## Decision

1. **LUFS (BS.1770-4).** Pure `engine/lufs.ts`: K-weighting = high-shelf
   (+3.9998 dB, Q 0.7072, fc 1681.97 Hz) followed by RLB high-pass
   (Q 0.5003, fc 38.135 Hz), designed at runtime for ANY sample rate via
   the standard analog-prototype + bilinear-transform-with-prewarping
   redesign (same constants/approach as pyloudnorm; the 48 kHz table
   coefficients only hold at 48 kHz). Blocks: 400 ms, 75% overlap;
   block loudness = −0.691 + 10log10(Σ Gᵢ·zᵢ), G = 1 for L/R, 0 for
   unused-surround; gating = absolute −70 LUFS then relative −10 LU.
   Reports integrated / momentary max / short-term max. Anchored on the
   EBU Tech 3341 test case (997 Hz stereo sine at −23 dBFS → −23.0 LUFS).
2. **BPM.** Pure `engine/bpm.ts`: onset envelope = RMS energy per 10 ms
   frame, half-wave-rectified first difference; tempo = autocorrelation
   over 60–180 BPM with a mild 120 BPM-leaning prior (half/double-tempo
   ambiguity), parabolic peak refinement; beat phase = offset maximising
   the comb-summed envelope, beats emitted at the winning period.
   Runs in a module worker (`bpm.worker.ts`, zod boundary) and reports
   **profiling ms** with the result (§10 M5 profiling gate → task list).
3. **Beat markers + snap.** `WaveRenderer.setBeats(seconds[])` draws faint
   beat lines; "snap to beats" toggles selection snapping onto the nearest
   beat (same commit path as zero-cross snap; beats win when both on).
4. **Spectrum analyser.** AudioEngine gains a master-tap `AnalyserNode`
   (2048 FFT, always connected, zero cost when the panel is closed). The
   Analysis panel draws a dB-scaled spectrum (bars + curve) via rAF while
   open. Browser-only drawing; nothing pure to unit test beyond the
   engine-tap wiring.
5. **ID3 v2.4.** Pure `io/id3.ts`: `buildId3Tag` (syncsafe sizes, UTF-8
   text frames TIT2/TPE1/TALB/TCON/TRCK/TDRC + TXXX for software) and
   `parseId3` (v2.3/2.4 read-back for prefill). `id3Schema` (zod) bounds
   lengths and strips control characters — validation before any bytes
   are written; nothing is ever interpolated into HTML. MP3 export
   prepends the tag bytes on the main thread (no worker change).
6. **Deviation (logged).** The automation envelope editor deferred from
   M3 (ADR 005) requires per-param time-varying kernels + ramp wiring in
   every graph builder + overlay UI. It does NOT fit M5's exit gates and
   shipping it rushed would risk the M5 kernels' quality bar. It is
   re-scheduled as its own work package after M6 (persistence) — tracked
   in task list; ParamSpec keeps its reservation.

## Consequences

- lufs/bpm/id3 are pure → full unit coverage incl. profiling numbers.
- The analyser tap + panel drawing are browser-only (excluded like
  AudioEngine); panel logic stays thin.
- ID3 only rides MP3 export in v1 (WAV/FLAC metadata is a v2 concern).
