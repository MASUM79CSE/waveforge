# ADR 001 — Custom Waveform Renderer vs WaveSurfer 7 / peaks.js

**Status:** Open — verdict due at M1 kickoff (ECC Research & Reuse spike) · **Phase:** M1 gate

## Context

Build Plan v2.2 §8.0 mandates reuse-first: before building the custom canvas
renderer, evaluate WaveSurfer 7 and peaks.js for editor-grade needs:

- multi-channel lanes with per-channel UI state
- sample-level zoom + progressive min/max peak tiles from our worker
- selection overlay + zero-cross snapping + playhead + ruler
- 60 fps viewport-only redraws on hour-long files

## Leanings (pre-spike, to be confirmed or overturned)

- **WaveSurfer 7**: playback-oriented architecture; editor interactions
  (region editing semantics, channel UI) historically fight the API.
- **peaks.js**: strong peak-preparation design (mip levels, web worker) —
  likely source of **design inspiration**, if not code.
- Custom renderer cost is bounded: peaks pipeline + canvas layers are well
  understood (AudioMass proves the approach at 2.0.5-era tech).

## Decision

Pending M1 spike. Either outcome is recorded here with the evaluation notes.

## Consequences

- M1 cannot start renderer implementation before this ADR closes.
- Whichever path is chosen, the `PeakClient`/worker boundary stays identical,
  so the decision remains reversible at bounded cost.
