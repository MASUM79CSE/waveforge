# PRD — WaveForge v1 (seed)

> Source of truth: `../WaveForge-Build-Plan.md` §2 (kept in the workspace root).
> This file is the repo-side copy `ecc:doc-updater` maintains. Summarized here.

## Vision

A free, private, installable web audio editor: trim, clean, effect, record,
and export audio **entirely in the browser**. No uploads, no accounts, no tracking.

## v1 scope (AudioMass single-track parity)

- **Load:** aac aif aiff flac m4a mp3 oga ogg opus wav webm — picker, drag&drop, URL (CORS), sample
- **Record:** mic via AudioWorklet, constraints toggles, level meter
- **Selection:** drag region, select-all, zero-cross snap, seamless loop
- **Edits:** cut/copy/paste/trim/silence/delete/flip/mute/gain/normalize/reverse/invert/remove-silence
- **Effects:** gain, fades, PG-EQ, G-EQ 10/20, compressor, limiter, delay, distortion, reverb,
  speed (pitch-preserving stretch — promoted Z1), playback rate, audio repair — A/B preview + automation
- **Analysis:** spectrum/frequency analysers, LUFS, BPM + beat markers + snap
- **Metadata:** ID3v2 on MP3 export
- **Export:** WAV 16/24/32f (+dither), MP3 (bitrate), FLAC (level); mono/stereo; selection-only
- **Persistence:** IndexedDB drafts + autosave ring (crash recovery)
- **Platform:** PWA install, offline, keyboard parity, EN i18n catalog

## Non-goals (v1)

Multitrack (M8+) · cloud accounts/sync (M12: Vercel Functions + MongoDB Atlas) ·
RNNoise ML denoise (stretch) · plugin API.

## Acceptance criteria

- 60 fps interaction on 1-hour files (mid-tier laptop)
- ≥ 100 undo steps on 30-min audio under ~250 MB memory
- Effect preview toggle < 100 ms; apply faster than realtime
- Lighthouse ≥ 95/95/100/100 · zero console errors in e2e suite

## Milestones

M0 scaffold ✅ → M1 engine → M2 editing/history → M3 effects → M4 record/export →
M5 analysis → M6 persistence/PWA → M7 hardening/release. (M8+ parked.)
