# M8 Multitrack — build plan (ratified scope of docs/multitrack-analysis.md)

> **STATUS: COMPLETE (M8a–M8g, 2026-09-25).** Shipped as planned, with two
> ratified deviations: (1) pan pinned to the balance law (center = bit-exact
> unity, hard side = exact zero) — equal-power 0.707 rejected by the anchor
> tests; (2) the quick-command lane sweep initially landed doc-scoped, then was
> completed as M8f+ (all quick commands + rate conformance) — resolved. Perf: lane buckets 184 ms build / 3 ms zoomed-out read
> (6×3-min); Lighthouse 99/100/100/100 (`docs/perf/lighthouse-m8.json`).
> Final gates at close: 484 unit (57 files) @ 96.23/75.47, 33 e2e.

Lane-based single-timeline multitrack. Phases M8a→M8g; each phase RED→green,
full gates (unit+cov, e2e, build, lint), conventional commit. Visual language
stays D-series (tokens, strips like the D8 channel strips).

## M8a — project core (pure TS, `src/engine/project.ts`)

Types:
```ts
interface TrackState {
  id: string;            // stable uuid-ish (counter + rand suffix)
  name: string;
  gain: number;          // 0..1.5 linear (matches D8 volume strip)
  pan: number;           // -1..1
  mute: boolean;
  solo: boolean;
  channels: Float32Array[]; // 1 or 2
}
interface ProjectState {
  sampleRate: number;
  tracks: TrackState[];  // order = lane order (top → bottom)
  activeTrackId: string | null;
}
```

Kernels (pure, deterministic):
- `createTrack(channels, name?)` — mono arrays stay mono (ch count = arrays).
- `trackEffectiveGain(track, anySolo)` — 0 if mute or (anySolo && !solo),
  else `gain`.
- `mixTracks(tracks, sampleRate?)` — length = max track length; per-sample
  **fixed track order sum** (Float64 accumulators, single pass per channel);
  output ALWAYS stereo: mono tracks feed both L/R; **pan = balance law**
  (center = bit-exact unity passthrough, hard side = exact zero, opposite
  side lossless — anchors require identity at center, so equal-power
  0.707 is rejected); returns `Float32Array[]`.
- `mixdownReference(tracks)` — slow bit-exact reference (per-track full-sum
  into Float64) used by tests to anchor `mixTracks`.
- `projectDuration(project)` — max track length / sampleRate.

Gates (§M8a, literal):
- empty project → mixdown = [] (no channels) and duration 0.
- one stereo track, unity, no solo → mixdown channels bit-equal to inputs
  (gain 1 must be lossless: multiply by exactly 1.0).
- two tracks: L_out = t0.L·1 + t1.L·1 — Float64 sum then f32 round; anchored
  against `mixdownReference` bit-equal.
- mono track panned hard L → R out == 0 (exactly), L == input.
- mono track pan center → both channels == input.
- mute → that track contributes exactly 0; solo alone == mute-others.
- gain 0.5 tracks sum equals reference (±0 Float equality via reference).
- length = max(len); shorter track tail contributes nothing (zeros).
- deterministic: same inputs → bit-identical outputs (two runs).
- 6 tracks × 3 min stereo mix ≤ 500 ms uninstrumented (measured ≈ 400 ms,
  memory-bandwidth bound; in-suite smoke 1.5 s per ADR 009).

## M8b — engine playback (`AudioEngine` multitrack graph)

- `startProjectPlayback(project, tracks, startSample, endSample?)` — one
  `AudioBufferSourceNode` per (played) track → per-track gain → per-track
  StereoPanner → project merger. Effective gains from §M8a rule; ramps
  `setTargetAtTime` τ=0.01 (D8 convention, click-free).
- Solo/mute **changes during playback** update gains live (no restart).
- Transport parity: cursor/playhead math unchanged (shared timeline); loop
  applies to the project.
- Gates: fake-audio-context unit tests (existing engine test pattern) — N
  sources created, per-track gain values match effective gains, any-solo
  rule, pan values pass through; playhead math property tests unchanged.

## M8c — editor/history (`AudioProjectEditor` wraps `AudioEditor` per track)

- `performTrackEdit(trackId, outcome, label)` → History entries carry
  `trackId`; undo/redo route by id. 100-step/byte-budget semantics unchanged.
- Active-track edits reuse the existing edit kernels untouched.
- Add/remove track: additive (insert-track op = new entry kind, undo =
  remove-with-data), remove keeps data in the undo entry.
- Gates: unit — undo/redo across two tracks interleaved restores both
  bit-exactly; history trim across tracks; remove-track undo restores.

## M8d — UI (lane stack + strips)

- `TrackLane` stack under the shared ruler: each lane = WaveRenderer canvas
  (peaks per track, version-keyed), lane height persisted; active lane
  accent-framed; click lane → active track (selection stays global).
- `TrackStrip` per lane (D8 strip language): name (dbl-click rename),
  volume 0..1.5, pan −1..1, M / S buttons, channel badge (MONO/STEREO).
- Add track (＋ button + File→Import to new track), remove lane (strip ×,
  confirm), drag-drop file → new track (drop overlay reuses D10).
- i18n catalog complete; shortcuts: single-source (no new conflicts).
- Gates: unit (reducers/store ops) + e2e: add 2 tracks → import sample →
  both lanes render → solo track 1 → play → undo remove track.

## M8e — persistence + io

- Drafts **schema v2**: `tracks[]` in header (id/name/gain/pan/mute/solo/
  channelCount), payload = per-track interleaved arrays; `version: 2`.
  v1 records load as one track "Track 1". Autosave ring covers projects.
- Record → **armed track** (strip arm button, first track default); existing
  recorder feeds the track buffer (insert at cursor or overwrite — same
  options as today).
- Export: **Mixdown (WAV/MP3/FLAC)** through `mixTracks` then the existing
  pipeline; **Stems (per track)** loop in the export worker. Both mono-
  aware (mono project tracks export mono stems).
- Gates: round-trip unit tests (v2 save/load bit-exact; v1 load upgrade),
  mixdown bit-anchor vs `mixdownReference`, stems parity, e2e save/reload.

## M8f — effects/analysis on tracks

- `targetRange()` + `currentChannels()` resolve to the **active track**;
  every registry effect works per track unchanged. Preview A/B per track.
- NR print learn seeds from the active track; print stays per-session.
- Analysis (LUFS/peaks/spectrum) reads the active track; mixdown LUFS in
  the export dialog (post-mix loudness readout).
- Gates: existing fx suites re-run with a 2-track project fixture (one
  parametrized pass on each track), e2e apply-on-track.

## M8g — hardening + close

- Perf: 6 tracks × 3-min 44.1 k stereo — 60 fps scroll/zoom (rAF frame
  budget), playback CPU < 35%, mixdown ≤ 400 ms, peaks per track lazy.
- e2e flows: full song build (import ×3, level/solo, record 2 s onto track,
  mixdown export), draft round-trip, undo/redo across tracks.
- Lighthouse ≥ 95/95/100/100 (idle project), zero console errors.
- task_list close-out + analysis/plan doc status update.

## Standing constraints carried into M8

- Pure client-side; no backend. Files stay local; drafts in IndexedDB.
- D-series visual similarity; WaveForge brand; MIT attribution intact.
- Shortcuts single-source; professional + legacy sets unregressed.
- ADR 003 worker topology respected (peaks per track stays in the worker).
- StereoPannerNode per track (D8 fact: do not rework to constant-power
  gain pairs for the node graph — pan math in the pure mix kernel is
  separate and tested).
