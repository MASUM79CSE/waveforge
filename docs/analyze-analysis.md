# Professional analysis suite — market analysis

**Date:** 2026-09-25 · **Feeds:** `docs/analyze-plan.md` (P-series) ·
Extends the M5 analysis stack (LUFS, BPM, spectrum, meters).

## 1. Market (2026-09)

- **Loudness normalization is table stakes everywhere**: Spotify, YouTube,
  Amazon, Tidal normalize to **−14 LUFS**, Apple Music to **−16**, Deezer
  ≈ −15, EBU R128 broadcast **−23 ±1 LU**, Netflix −27 LKFS @ **−2 dBTP**;
  podcasts cluster at **−16 stereo / −19 mono** (AES). Every 2026 mastering
  guide converges on: deliver **−14 LUFS integrated with a −1 dBTP true
  peak ceiling** (corroborated: soundbridge.io, process.audio,
  musicpulse.app — all 2026).
- **The metrics pros actually watch** (RX / Insight / Auphonic / process.audio
  consensus): integrated LUFS, **true peak dBTP** (lossy-encoding safety),
  **LRA** (does it breathe), **PLR** (peak-to-loudness ratio = remaining
  limiter headroom), correlation / **mono compatibility**, and spectral
  balance.
- **iZotope RX** made the *analysis pass* a product: a single scan producing
  clipped-sample locations, DC offset, phase problems, and loudness stats
  — with **jump-to-offender** as the interaction. Audition's diagnostics
  and Auphonic's reports follow the same pattern.
- WaveForge today: integrated/momentary/short-term LUFS (BS.1770-4,
  worker), BPM + beat grid, live meters/spectrum. Missing: the *report*
  layer (targets, ranges, audits, verdicts) that makes those numbers
  professional.

## 2. Product take

The gap is a one-scan **professional report**: every delivery metric, a
verdict against the streaming table, and actionable offender navigation.
All the hard DSP already exists (K-weighting, true-peak, FFT) — this is
composition + product, which is exactly where a web editor can beat the
"meter app" field. Voice-first framing matches our E7b/E7a story
(podcasters get the −16 verdict row up top).
