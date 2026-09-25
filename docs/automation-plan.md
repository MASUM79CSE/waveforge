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

### A6 build addendum (ratified scope, build-level API)

**A6a — graph-kind ramps.** `BuiltGraph` gains `auto?: Record<string,
GraphAutoTarget>` — `{ params: [{param, apply(v)}], min, max }` — so
builders expose exactly the automatable AudioParams (delay: time /
feedback / mix→wet+dry equal-power law; reverb: mix; pgeq: 3 gains +
midFreq + midQ; geq10/20: band gains; distortion: NONE — WaveShaper
curve is an attribute, not a-rate). Pure scheduler `src/fx/
fxCurves.ts` (`scheduleFxAuto`): no curves → ZERO calls; constant
curve → single `setValueAtTime` at t=0 (== the static `.value` path);
otherwise anchor + `linearRampToValueAtTime` per knot at `at/sr`,
knots beyond the render window (frames incl. tail) ignored, values
clamped to the target domain. `renderEffectOffline(..., curves?)`
calls it; curve `at` is REGION-relative samples. Anchor style: unit
anchors on the SCHEDULE (recording fakes); real-render between-knot
behavior is WebAudio's ramp (deterministic per engine) — documented,
not unit-anchored.

**A6b — kernel-kind (biquads first).** `EffectRunContext.paramCurves?`
(Record<paramKey, curve>; keys `b{I}Freq|Gain|Q` for pgeq8). Per-sample
coefficient recomputation via the EXISTING `designBiquad`, recursion =
the existing TDF with state carried across coefficient updates;
per-sample values from `mulTable` (the A1 table — same on-point/
endpoint-clamp semantics, so sweep tables == evalCurve exactly).
Non-swept bands take the static section path (bit-identical); constant
curves must equal `processParamEq` bit-for-bit. Anchors: independent
test-side reference (per-sample design + TDF), hold-after-last,
cascade continuity (24 dB/oct), sweep-direction RMS check. Other
kernels get curves in later per-kernel follow-ups (each needs its own
anchors).

**Gates:** constant curve == static path everywhere (graph: schedule
level; kernel: bit-for-bit audio); RED→GREEN per part; all existing
gates stay green.

### A7 — FX envelope authoring (UI follow-up, build-level scope)

WaveForge effects are OFFLINE BOUNCES (apply → new audio), so param
curves are authored at the EFFECT DIALOG and BAKED IN on apply — no
draft-schema change (the audio carries the result). Ratified scope:

- `automationUi` generalizes to domain-parametric primitives
  (`curveYIn` / `valueAtIn` / `hitPointIn` / `beginEnvelopeGesture` /
  `dragEnvelopeTo` / `removeEnvelopePointAt`); the A4 track overlay
  (volume/pan) delegates — existing anchors stay green.
- `fxEnvelope.ts`: draft state for the open dialog
  (curves keyed by paramKey + selected param + region length); apply
  resets it; `fxCurvesOrUndefined()` feeds `EffectRunContext`.
- EffectDialog: every numeric param row gains a ∿ toggle; the selected
  param renders `FxCurveEditor` (canvas: x = region samples 0..len,
  y = spec.min..spec.max, dashed static-value baseline, knot squares;
  click-add / drag-move / right-click-delete; Clear button).
- Threading: kernels get curves via `ctx.paramCurves` (preview AND
  apply — zero kernel-path changes); graph preview schedules
  `scheduleFxAuto` on the live graph (PreviewPlan.curves); graph apply
  passes `ctx?.paramCurves` to `renderEffectOffline`. Curves outside a
  key's sweepable set are IGNORED by the kernels (A6 scope rule) — the
  ∿ toggle is offered for all numeric params and inert where N/A.
- 38th e2e: author a tremolo depth envelope → apply → undo → redo,
  console-clean.

## Standing constraints (unchanged)

- Shortcuts single-source (`A` goes through `resolveShortcut`); no
  regressions to M0–M9 flows; D-series visuals; pure client-side;
  RED→GREEN per phase; conventional commits per phase; ≤400-line files;
  every existing e2e stays green untouched.

## Status stamp (A1–A5 SHIPPED, 2026-09-25)

| Phase | State | Evidence |
| --- | --- | --- |
| A1 kernel | ✅ `d5049a8` | 11 unit anchors (eval/insert/move/remove/mulTable/panWeights; constant-curve all-exact-ones guard) |
| A2 model+render | ✅ `a7839b6`/`e2713d0` | bit-identity: constant curves == no-automation byte-for-byte (fast + reference); 0-byte history entries; interleave with clip ops |
| A3 playback | ✅ `55a64e8`/`beb4110` | leg ramps re-stamped per loop pass; zero param calls without curves; updateMix yields on automated legs; monitor-vs-render tolerance documented in-code |
| A4 envelope UI | ✅ `fe6cf9e`/`d463c70` | `A` toggles (single-source shortcuts); per-lane VOL/PAN picker; overlay claims pointers only in mode; one entry/gesture; +2 tokens `--cv-automation`/`--cv-automation-line` |
| A5 persistence | ✅ `ac56e65`/`f51a2e6` | drafts v2/v3 optional `automation` (≤4096 pts, integral `at`), no version bump; round-trip renders bit-identically; 37th e2e draw→play→save→reload |
| A6 FX params | ⏳ follow-up package | deviation logged above (graph-kind ramps first, then kernel-kind per-kernel) |

Final gates at A5: **596/596 unit (71 files), 37/37 e2e, lint 0, build
1.19 s, Lighthouse 99/100/100/100** (FCP 1.5 s, LCP 1.8 s; br transfer
96.5 KiB vs M9's 95 KiB — +1.5 KiB for the whole feature).
LH artifact: `docs/perf/lighthouse-a5.json`.

A6 lesson stamped for the follow-up: the A2 bit-identity pattern
(constant curve == no-automation, byte-for-byte) transfers directly to
graph-kind FX params; per-kernel literal anchors follow §8 of
`docs/effects-v2-plan.md`.

## Status stamp (A6 SHIPPED, 2026-09-25)

| Part | State | Evidence |
| --- | --- | --- |
| A6a graph-kind | ✅ `5ebc9f2` | BuiltGraph.auto (delay/reverb/pgeq/geq; distortion none), scheduleFxAuto (zero calls / constant==static / law-per-knot / window clamp), renderEffectOffline curves param — 12 unit anchors |
| A6b kernel-kind | ✅ `7db91b6`/`4ec6967` | paramCurves on EffectRunContext; processParamEqSwept (per-sample designBiquad, TDF state continuity, f32 section discipline → constant==static BIT-IDENTICAL); fx.pgeq8 wired — 9 anchors incl. per-sample reference + cascade + physics |

Gates at A6: **614/614 unit (73 files), 37/37 e2e, lint 0, build
0.96 s**. The constant-curve==static gate holds at BOTH levels
(schedule-level for graphs, bit-for-bit audio for kernels).

Next per-kernel follow-ups (each with its own anchors, in rough
demand order): dynamics (compressor/limiter/gate gain computer),
modulation (chorus/flanger/phaser LFO depth+rate), tremolo/vibrato,
reverb2 mix. UI: an FX-envelope lane in the A4 overlay can now drive
`paramCurves` / `renderEffectOffline(curves)` — no renderer work left.

## Status stamp (A6c dynamics SHIPPED, 2026-09-25)

| Part | State | Evidence |
| --- | --- | --- |
| A6c dynamics | ✅ `efbb473`/`030479f` | compressKernelSwept (threshold/ratio/knee/makeup; attack/release deliberately static), noiseGateSwept (threshold/ratio), truePeakLimitSwept (ceiling); all constant==static bit-for-bit; per-sample references exact; physics anchors (compression, gating, ceiling pull-down) — 14 anchors |

Gates at A6c: **628/628 unit (74 files), 37/37 e2e, lint 0, build
0.99 s**.

Per-kernel curve follow-ups remaining (demand order): modulation
(chorus/flanger/phaser depth+rate — LFO phase integrates per-sample
rate), tremolo/vibrato, reverb2 mix. Scope rule that emerged: only
AUDIO-SHAPING params are sweepable; detector/time-constant params
(attack, release, lookahead) stay static and curves under those keys
are ignored (anchored). Reference-lesson: any intermediate the static
kernel f32-rounds (e.g. the gate's gains array) must be f32 in the
test reference too, or constant-vs-reference anchors diverge in the
last bits.

## Status stamp (A6d modulation + reverb2 SHIPPED, 2026-09-25) — KERNEL CURVES COMPLETE

| Part | State | Evidence |
| --- | --- | --- |
| A6d modulation | ✅ `0ddac9a` | modulationCurves.ts: chorus/vibrato/tremolo/flanger/phaser swept (audio-shaping params; rateHz/shape/stages ignored-anchored); constants bit-identical; verbatim per-sample refs; offset continuity; exact-passthrough physics |
| A6d reverb2 | ✅ `0ddac9a` | wet path extracted verbatim (reverb2Wet); per-sample mix; constant==static BIT-FOR-BIT; mix 0 == EXACT passthrough, mix 1 == exact wet (identity anchors instead of an FDN reference) |

Gates at A6d: **650/650 unit (75 files), 37/37 e2e, lint 0, build
0.97 s**. modulation.ts 302 lines / modulationCurves.ts 255 (≤400 kept).

**Every kernel effect now accepts paramCurves** (audio-shaping params).
Remaining follow-ups: per-kernel UI (FX envelope lane authoring
paramCurves), and curves for any FUTURE kernels follow the A6c/A6d
pattern + scope rule (audio-shaping sweepable; time-base/detector/
structural static, anchored).

## Status stamp (A7 SHIPPED, 2026-09-25) — FX ENVELOPE AUTHORING

| Part | State | Evidence |
| --- | --- | --- |
| A7 dialog authoring | ✅ `a5abbc2`/`5ca6655` | domain-parametric primitives (A4 delegates), fxEnvelope draft state, ∿ toggle per numeric param, FxCurveEditor canvas (region-x, spec-domain-y, baseline, knots), curves ride ctx into preview+apply, graph preview schedules via scheduleFxAuto; 7 unit anchors + 38th e2e (author→preview→apply→undo→redo) |

Gates at A7: **657/657 unit (76 files), 38/38 e2e, lint 0, build
0.99 s**.

THE AUTOMATION PROJECT IS COMPLETE: track envelopes (A1–A5), graph-kind
FX ramps (A6a), kernel curves for EVERY kernel effect (A6b–A6d), and
UI authoring (A7). Future work = new canvases only: any future kernel
follows the A6c/A6d pattern + scope rule; future curve surfaces (e.g.
draft-persisted LIVE FX chains, if ever built) reuse the same
primitives and scheduler.
