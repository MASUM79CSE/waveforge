# ADR 001 — Custom Waveform Renderer vs WaveSurfer 8 / peaks.js

**Status:** Accepted (verdict: custom renderer) · **Phase:** M1 gate (spike done 2026-09)

## Research findings (ECC step 0)

| Candidate | Version | Finding |
| --- | --- | --- |
| wavesurfer.js | 8.0.0 | Self-described **"Audio waveform player"** — architecture centered on playback (pre-rendered peaks, its own zoom model, regions plugin aimed at annotations, not editor interactions). Adapting it to editor-grade needs (viewport-only tile fetching from *our* worker, per-channel UI state, zero-cross snapping, sample-level raw slices) means fighting its render pipeline at every step. |
| peaks.js | 4.0.0 | Excellent **peak-preparation design** (mip levels computed in a web worker, segment/point layers) — but a 4.4 MB unpacked install with its own messaging/UI stack; renderer is not separable from its controller. |

## Decision

**Build the custom Canvas2D renderer**, adopting peaks.js's *design* (not code):

- mip levels at standard sample-per-bucket sizes (16 → 65536), built in our
  `peaks.worker`, served as cached tiles (`peaksCompute.ts` keeps it pure/testable)
- viewport-only redraw; progressive refinement when tile batches land
- raw-sample polyline path for sample-level zoom (spp < 1)
- view math (`viewState.ts`) and position math (`transportMath.ts`) are pure
  modules — the renderer and engine stay thin and reviewable

## Rationale (why not adopt)

Integration cost of bending a player-oriented library to editor semantics was
judged higher than ~600 lines of fully-owned canvas code — consistent with the
Build Plan §8.0 verdict and the ADR 000 reuse-first gate (both libraries *were*
evaluated; peaks.js design is reused; that satisfies the gate's intent:
adopt proven approaches where they fit, own the thin layer where they don't).

## Consequences

- `PeakClient`/worker boundary is renderer-agnostic → remains reversible at
  bounded cost if a future GPU renderer (§8.5 B2/B3) replaces the draw loop.
- Renderer complexity is capped by moving all math into pure modules (TDD'd).
