# Automation package — plan (ADR 007 follow-up)

Status: plan ready to build · Date: 2026-09-25
Analysis: `docs/automation-analysis.md` (market, constraints, risks).

## Deviation from the analysis (logged, ADR-style)

The analysis put **kernel-kind effect-param automation** in v1. Plan-time
walk of the kernels shows why ADR 007 deferred this twice: time-varying
params need per-kernel curve support (biquad coefficient interpolation,
gate/limiter state trajectories) — one accuracy anchor set PER KERNEL.
Slice-apply at breakpoints is NOT accurate for stateful kernels and
violates the effects-v2 §8 discipline. Decision:

- **This package** = mix automation (volume/pan) end-to-end + envelopes
  UI + persistence, with the constant-curve==no-automation bit-equality
  guard everywhere.
- **Effect-param automation moves to A6 (follow-up package)**: graph-kind
  first (native AudioParam ramps, tolerance-anchored), then kernel-kind
  per-kernel with its own anchors. Soundtrap-level parity is shipped in
  THIS package (volume/pan); BandLab FX-param parity lands in A6.

## Phases

### A1 — automation kernel (`src/engine/automation.ts`, pure) — RED→GREEN

- `AutomationPoint {at: number; value: number}` (samples, sorted by `at`);
  `AutomationCurve = AutomationPoint[]` (empty/undefined = no automation).
- `evalCurve(points, at)` — exact linear interpolation; before first /
  after last → endpoint values (clamps); exact on a point → its value.
- `insertPoint(curve, at, value)` — sorted insert; same-`at` replaces
  (dedupe); immutable (returns new array).
- `movePoint(curve, index, newAt, newValue, {min, max, prevAt, nextAt})`
  — x clamped to (prevAt+1 .. nextAt−1), y clamped to [min, max].
- `removePoint(curve, index)` — may empty the curve (== disabled).
- `mulTable(points, len)` — Float64Array per-sample multipliers, filled
  per SEGMENT (no per-sample eval); 0/1 points → constant table.
- `panWeights(points, len)` — per-sample (gl, gr) using the EXACT
  balance law (`pan >= 0 ? 1-pan : 1` / `pan <= 0 ? 1+pan : 1`) —
  hard-L keeps gR exactly 0 for every pan ≥ −1.

**Gates (unit, literal):** eval anchors (midpoint 0.25@25 of 0@0→1@100,
endpoint clamps, on-point exactness); insert sort/dedupe; move clamps
(both axes); remove-to-empty; mulTable segment anchors + constant table;
panWeights hard-L/hard-R exact zeros + center (1,1). Constant-curve
mulTable is ALL EXACT ONES for value 1 (bit-identity guard).

### A2 — model + history + render (volume/pan automation)

- `TrackState.automation?: Record<string, AutomationPoint[]>` — v1 keys
  `'volume'` (multiplies the strip gain, 0..1.5) and `'pan'`
  (−1..1, balance law). `createTrack` leaves it undefined.
- History: `{kind: 'setAutomation'; trackId; paramKey; before; after}`
  riding `ProjectHistoryOp`; `AudioProjectEditor.executeAutomationEdit`
  (bytes 0 — points are tiny; gate asserts 0 charge). Undo/redo in
  `applyProjectSide` (empty after → delete the key).
- `mixTracks`/`mixdownReference`: with a volume curve, the lane weight
  becomes `wl·curve[i]` inside the SAME Float64 accumulation (single f32
  round unchanged); NO curve → the EXISTING loop is used untouched.
  Pan curve → per-sample (gl, gr) from `panWeights`.
- `trackChannels`/peaks/playback views untouched (automation is a mix
  concern, not a lane-audio concern).

**Gates:** (1) **bit-identity**: mixdown of projects WITH
`automation: {volume: [constant 1], pan: [constant 0]}` is byte-equal to
today's `mixTracks` output (the universal regression guard); (2)
volume-automation anchor vs a hand-computed Float64 reference (fade
0→1 across a 1000-sample lane, literal expected f32 values at sampled
indices); (3) pan automation hard-L stays exactly 0 on the right channel
at every sample of a pan sweep; (4) undo/redo restores the curve and the
render bit-exactly; (5) interleaving with clip ops (M9e pattern) holds.

### A3 — playback ramps (`startClips` legs)

- `ClipPlaybackTrack` gains `automation` (volume/pan point arrays).
- `makeLeg` initial values = curve at pass start; `schedulePass` then
  schedules `setValueAtTime` + `linearRampToValueAtTime` on the legs for
  breakpoints inside the pass window (volume on both legs equally; pan
  through the balance-law transform per breakpoint). Loop restarts
  re-schedule (schedulePass runs per pass).
- No curves → ZERO extra scheduling calls (existing graph tests must
  pass byte-for-byte unchanged).
- Deviation (documented): monitor ramps are block-rate — playback is
  tolerance-class vs the sample-exact mixdown (ADR 009 note). Strip
  moves during automation: curve wins (BandLab behavior); updateMix
  unchanged (no throw; ramps continue).

**Gates (fake ctx):** known curve → expected setValueAtTime/ramp
times+values on gL/gR; pan curve transforms through the balance law;
loop restart reschedules from the loop start value; no-automation emits
no scheduling calls; position math untouched.

### A4 — envelope UI (lane overlay + gestures)

- Signals: `automationMode` (bool, per app) + `automationParam` per
  active lane (v1 picker: Volume, Pan). Shortcut `A` toggles the mode
  (BandLab convention; plain `a` is free — Ctrl+A stays selectAll);
  commands `automation.toggle` + picker in the lane strip; menu entry
  under Edit; i18n keys; new tokens `--cv-automation` +
  `--cv-automation-line` (dark + light).
- `AutomationOverlay` inside `ClipLaneCanvas`'s effect scope: claims
  pointer events ONLY while the mode is on (mode switch, not event
  fights — clips keep their gestures otherwise). Polyline from curve →
  lane pixels; click on the line adds a point; drag moves (x free
  sample-domain, y clamped to the param range); double-click deletes;
  switching param/mode off clears the selection. Every gesture commits
  ONE `setAutomation` history entry on pointer-up (dragPreview pattern
  from clips).
- Volume maps 0..1.5 → lane height; pan maps −1..1 → lane height.

**Gates (unit):** pure mapping helpers (curve→pixel polyline, pixel→
sample/value inverse with clamps); gesture reducers (add/move/delete
through A1 kernels; one-entry-per-gesture assertion via the editor).
e2e comes in A5.

### A5 — persistence + e2e + perf sanity

- Drafts v3: `draftTrackSchema.automation?` (optional record of point
  arrays; bounded ≤ 4096 points/curve) — NO version bump (optional
  field, zod default strip semantics safe); `exportProjectClips` carries
  it; `buildClipProject` restores it; old drafts unaffected.
- e2e (37th): draw a volume fade on a lane (mode → click 2 points →
  drag), play, save draft, reload, reopen — envelope intact + clip count
  unchanged; console-clean. All 36 existing e2e stay green untouched.
- Full gates + Lighthouse re-run (≥95/95/100/100; M9 baseline
  99/100/100/100 @ 108 KiB).

**Gates:** v3 round-trip with automation (bit-exact points incl. float
values); v2 draft loads (no automation key) unchanged; the e2e above.

### A6 — effect-param automation (FOLLOW-UP package, not this milestone)

Graph-kind first (expose automatable AudioParams from `buildGraph`,
schedule ramps in `renderEffectOffline`, tolerance anchors vs constant
renders); then kernel-kind per-kernel curve support with per-kernel
literal anchors (biquads first). Tracked in task list after this
package ships.

## Standing constraints (unchanged)

- Shortcuts single-source (`A` goes through `resolveShortcut`); no
  regressions to M0–M9 flows; D-series visuals; pure client-side;
  RED→GREEN per phase; conventional commits per phase; ≤400-line files;
  every existing e2e stays green untouched.
