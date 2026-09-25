# P-series — professional analysis report (build plan)

**Date:** 2026-09-25 · **Extends:** `docs/analyze-analysis.md` · Reuses:
`engine/lufs.ts` (BS.1770-4 K-weighting), `fx/mastering.truePeakDb`,
`fx/fft.ts` (radix-2), the analysis worker protocol, AnalysisPanel.

> **STATUS: SHIPPED (2026-09-25).** Kernel+UI `48bd6c2`. Gates at ship:
> 700/700 unit (83 files — 8 new analytic anchors), 48/48 e2e (48th spec:
> generated clipped wav → full report → verdicts → jump-to-offender),
> lint 0, tsc clean, build OK. Ship notes: LRA is the documented
> momentary-block approximation; CLIP_EPS 1e−4 (≈0 dBFS) after the e2e
> caught short-run resample smearing — long flat runs are the robust
> fixture pattern.

## P1 — report kernel (pure, this phase)

`src/engine/analysisReport.ts` — UI-free, worker-runnable, deterministic:

- `analyzeReport(channels, sampleRate): AnalysisReport` with sections:
  - **Loudness**: integrated LUFS (via `integrateLoudness`), momentary/ST
    max, **LRA** (EBU percentile method 10th–95th over the 400 ms momentary
    blocks — documented approximation of the 3 s short-term form), **PLR**
    = truePeakDb − integrated.
  - **Stereo** (null for mono): inter-channel **correlation** (50 ms blocks,
    energy-gated above −60 dBFS; mean + min), **mid/side energy %**.
  - **Integrity**: clipped samples + clipped runs (≥3 consecutive
    |x| ≥ 1−1e−6), first run [start, len] for jump-to-offender, DC offset
    per channel, sample peak dB.
  - **Balance**: 10 octave bands 31.25 Hz–16 kHz — average power spectrum
    (8192-point FFTs, Hann, 50 % overlap, ≤ 120 windows) summed per band,
    reported as % of total power.
  - **Noise**: 50 ms frame RMS distribution — floor = p10 (dBFS), loud =
    p95, **SNR estimate** = p95 − p10, silence % = frames ≤ −60 dBFS.
- `STREAM_TARGETS`: Spotify −14/−1, YouTube −14/−1, Apple Music −16/−1,
  Apple Podcasts −16/−1, Amazon −14/−1, Tidal −14/−1, Deezer −15/−1,
  EBU R128 −23/−1, Netflix −27/−2.
- `verdicts(report)`: per target → gain needed (target − integrated) and
  TP-safe flag (truePeakDb + gain ≤ ceiling + 0.1 tolerance).

### P1 gates (analytic anchors)

1. EBU anchor parity: 997 Hz stereo −23 dBFS → integrated in [−23.5, −22.5]
   (matches the existing lufs.test anchor); LRA ≈ 0 (constant program);
   correlation mean = 1 ± 1e−6; side% ≈ 0.
2. LRA: −12 / −32 dBFS segments → LRA in [18, 22]; silence tail →
   silence% ≥ 20.
3. Correlation −1 (L = −R) and near-0 (independent noises); L = −R →
   side% ≈ 100.
4. Clipping audit: 5 injected runs of 5 samples at ±1 → clippedSamples 25,
   clippedRuns 5, firstRun start exact; DC +0.01 → |dc − 0.01| < 1e−6.
5. Balance: 100 Hz sine → the 62.5/125 Hz bands hold ≥ 60 % of power.
6. Mono: stereo section null; 44.1 kHz runs; determinism: two calls
   bit-identical.

## P2 — worker + actions + panel

- Worker protocol: `analysis-report` request/reply (transferable channels),
  reusing the analysis worker.
- `analysisActions.runFullReport()` — busy state (`'report'`), result in
  `S.analysisReport`; menu command `analyze.report` opens the panel and
  runs it; "Select first clipped run" writes the selection signal + toast.
- AnalysisPanel: report section — loudness row (LUFS/LRA/PLR/TP), streaming
  verdict table (target, gain, TP-safe), stereo row, integrity row with
  the select button, balance bars (CSS-width %), noise row. i18n keys; css.

## P3 — e2e + close

- 48th e2e: import a generated clipped wav (file-picker fixture with
  ±full-scale runs) → Analyze → Full report → metrics render (LUFS format,
  clipping count, verdict table rows) → "Select first clipped run" →
  selection toast/console-clean.
- Full gates + doc stamps.

## Non-goals (this series)

Live spectrogram view (the canvas meters already stream); codec-simulation
TP; EN 3341 full gate compliance beyond the anchors; report export (PDF/CSV
— future); multichannel > 2.
