# Automation package — analysis (ADR 007 follow-up)

Status: analysis for the post-M9 automation work package · Date: 2026-09-25

## 1. Market grounding (2026)

- **BandLab** (help center, Aug 2026): per-track automation lanes, toggled
  with `A`; a per-track parameter dropdown (Volume default, Pan, then
  every FX parameter of the track's effects); click on the curve adds a
  breakpoint, drag moves it, multi-select + Ctrl/Cmd+C/V copy-paste,
  right-click Delete / Reset Automation; optional MIDI-controller
  recording of moves (arm button). Curves overlay the track's own lane.
- **Soundtrap** (review sites, May 2026): automation limited to Volume +
  Pan envelopes; reviewers explicitly call the ABSENCE of FX-parameter
  automation a gap that keeps it out of "professional production" class.
- **Takeaway:** the 2026 table stake is per-parameter breakpoint lanes
  over the timeline (mix params + effect params). WaveForge matching
  BandLab's FX-param automation exceeds Soundtrap and fits the "beyond
  the reference editor" charter (the reference editor has static per-dialog envelopes only).

## 2. Codebase constraints (what it must attach to)

- **Parameter surface** (`src/fx/types.ts`): `ParamSpec {key, labelKey,
  kind, min, max, step, default}` — the M3 reservation ("labelKey/step
  metadata so envelope animation can attach per-param later") is intact.
  `Params = Record<string, number|boolean>` is STATIC today.
- **Apply path** (two kinds, ADR 005): graph-kind → `buildGraph(ctx,
  graphId, params)` rendered in an OfflineAudioContext
  (`offlineRender.ts`); kernel-kind → pure sample kernels.
  Both end in the M9d1 COW bounce (`commitTrackChannels`), so automated
  renders ride the SAME history/bounce machinery — no new destructive
  path needed.
- **Playback**: `startClips` schedules per-clip passes with STATIC leg
  gains (`panGains × trackEffectiveGain` evaluated once at start). Live
  automation needs scheduled ramps on the leg gains per pass
  (linearRampToValueAtTime), re-applied on loop restarts.
- **Model** (M9d1): `TrackState {gain, pan, clips}` over
  `ProjectState.assets`. History ops: `setClips` snapshot pattern is the
  template for a byte-light `setAutomation` op. Drafts v3 are
  schema-validated optional-field-friendly (add `automation?` to track
  meta WITHOUT a version bump — v3 readers ignore it).
- **UI**: `ClipLaneCanvas` owns lane geometry (xAtTimePx, pointer
  plumbing, drag-preview pattern) — an envelope overlay reuses it;
  signal `activeAutomation` (per-lane visible parameter) mirrors
  `activeClip`.

## 3. Decision (shape)

1. **Track-level envelopes** (BandLab's model), timeline-domain, sample
   breakpoints: `AutomationCurve { points: Array<{at, value}> }` sorted,
   piecewise-LINEAR (curves/stepped later). Lives on `TrackState.
   automation: Record<paramKey, AutomationCurve>`; clips do NOT carry
   automation in v1 (clip-level automation = follow-up; moving clips
   with attached envelopes is a UX problem of its own).
2. **v1 automatable parameters**: `volume` (0..1.5, the strip gain),
   `pan` (−1..1, balance law), and per-effect NUMERIC params of
   kernel-kind effects via per-sample curve evaluation; graph-kind
   effects render via scheduled AudioParam ramps (declared tolerance vs
   sample-domain — different math, both anchored).
3. **Pure kernel first** (`engine/automation.ts`): `evalCurve` (exact
   linear interpolation, endpoint clamps), `insertPoint` (sorted,
   dedupe-by-at), `movePoint`, `removePoint`, `renderAutomationMul`
   (volume: per-sample multiplier table, Float64 multiply into the mix),
   and a block-step table builder for graph ramps. Bit-exact anchors:
   a constant curve MUST be bit-identical to no automation (the
   degenerate case protects every existing path).
4. **Playback parity**: legs get ramp schedules (start value = curve at
   pass start, linear ramps to each breakpoint, re-scheduled per loop
   pass). Tolerance-anchored against the render path (ramp vs sample
   math differs by design; documented per ADR 009).
5. **UI**: automation toggle per lane → parameter picker (Volume, Pan,
   + effect params of that lane's applied effects later); overlay
   polyline on the lane canvas; click adds point, drag moves (x free /
   y clamped to the param range), double-click deletes, Escape/deselect
   clears. One history entry per gesture (`setAutomation` op).
6. **Persistence**: drafts v3 gain optional `automation` per track meta
   (no version bump — optional field, v3 readers ignore unknown keys via
   zod passthrough policy change IF needed; else bump to v4 with v3
   fallback reading unchanged). Decided at plan time after checking the
   zod schema strictness (draftHeaderSchema is not .strict() — optional
   field is safe → keep v3).

## 4. Risks

- **Render parity for volume automation**: mixdown must apply
  `gain × curve(t)` per sample with the SAME Float64 accumulation
  discipline (one final f32 round). Constant-curve bit-equality anchor
  is the guard.
- **Ramp-vs-sample drift on playback**: linearRampToValueAtTime runs in
  the audio thread's block-rate updates — not sample-exact vs the
  render. Acceptable (monitoring path); mixdown/export uses the exact
  sample-domain path. Tolerance anchor documents the delta.
- **Overlay hit-testing on the lane canvas**: clips already own pointer
  gestures; the envelope layer must claim pointer events only when the
  automation toggle is on (mode switch, not event fights).
- **Bundle growth**: ~2–3 KB (kernel + overlay). LH gate re-run after
  the milestone (M9 landed at 99/100/100/100 with 108 KiB).

## 5. Exit gates (candidate, finalized in the plan)

- evalCurve/insertPoint/movePoint/removePoint literal anchors; constant
  curve == no automation bit-equality (render + mixdown + playback).
- Volume-automation mixdown anchor vs hand-computed reference; pan
  automation balance-law anchor (hard-L stays exactly 0 on R).
- Effect-param automation render anchor (kernel kind) + graph-kind
  tolerance anchor.
- Envelope-gesture undo/redo rides the project history (interleave with
  clip ops — bit-exact at every step).
- Drafts v3 round-trip with automation field (old drafts load; new
  drafts keep envelopes).
- e2e: draw a volume fade on a lane → play → save → reload → envelope
  intact; all 36 existing e2e stay green untouched.
