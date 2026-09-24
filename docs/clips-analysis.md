# M9 Clips/Arrangement — analysis (2026-09-25)

Sequence: analysis → report → plan → build. This extends M8's lane model;
it does not replace it (every lane becomes a single-clip track — see §3).

## 1. Market (2026, live)

- **BandLab Mix Editor**: audio/MIDI **regions** on a bar-beat timeline —
  move, resize (trim), split, copy/paste, extend/timestretch, per-region
  gain and fade handles, snap-to-grid; duplicate/paste across sections is
  the primary song-building workflow.
- **Soundtrap / Soundation**: same region model on shared timelines.
- **Desktop DAWs (Live/Cubase/Pro Tools)**: clips/regions reference shared
  audio pools — non-destructive arrangement on top of recorded takes.
- Takeaway: region editing is table stakes for an "advanced beyond
  AudioMass" editor. WaveForge's lane model covers recording/mixing;
  **arrangement (split/move/copy/duplicate without destroying takes) is the
  gap M9 closes**.

## 2. Codebase facts (constraints from M8)

- `TrackState.channels: Float32Array[]` — one full-length buffer per lane.
  All destructive ops (slice-ops, effects via `makeOverwritePaste`, quick
  commands via `safeTrackEdit`) edit that buffer in place through history.
- History: `SliceOp`s (sample-domain) + `ProjectHistoryOp` structural ops;
  byte-budgeted, LIFO across doc + project.
- Selection/cursor: global timeline in seconds; spp-based renderer; lane
  drawing via 256-sample envelope buckets (`laneBuckets`).
- Playback: `ProjectPlayback` = one source per track (full buffer), balance
  gains; mixdown kernel = fixed-order Float64 sum; drafts v2 carry per-lane
  PCM.
- Undo/redo unified via timestamp rule (`undoPolicy`); record-into-lane,
  import (rate-conformed), effects/quick-commands route by active lane.

## 3. Architecture decision

**Clip model: tracks hold a sorted list of non-overlapping clips that
reference shared assets (copy-on-write).**

- `AudioAsset { id, sampleRate, channels: Float32Array[] }` — immutable
  take data (import/record/bounce output). `AudioClip { id, assetId,
  start, offset, duration }` — placement on the track timeline (SAMPLES,
  matching the engine; `offset` = where in the asset the clip begins).
- **No overlap within a track** (Audacity-class, deterministic; BandLab
  allows overlap only as take-layering — rejected for v1): kernels refuse/
  clamp, UI snaps.
- **Single-clip compatibility**: an M8 lane == one clip covering the whole
  asset at offset 0. All existing flows keep working unchanged; split/
  copy/duplicate activate the clip machinery gradually. Drafts v2 load as
  one full-length clip per lane (no migration needed).
- **Copy-on-write for destructive ops**: effects/quick-commands on a clip
  region bounce the affected audio into a NEW asset (the original may be
  shared by other clips — e.g. after copy). Region fully inside one clip →
  replace that clip with clips over the bounced asset; spanning clips →
  auto-split at region edges first. Private assets (fresh takes) bounce
  in place (no duplication).
- **Playback**: schedule one source per clip (`start(when, offset,
  duration)`) — WebAudio-native, sample-accurate enough at ctx resolution;
  per-track balance gains unchanged. Mixdown = sum of placed asset regions
  (same gain law as M8 → bit-comparable anchors).
- **Undo**: clip ops (add/remove/move/split/trim) are structural payload
  ops on the existing project history (tiny — no PCM in entries); COW
  bounces charge bytes for new assets.
- Memory: assets shared across clip copies; duplication only on bounce —
  strictly better than lane copies (duplicate = new clip, zero PCM).

Rejected: overlapping/take-layering clips (UI + render ambiguity, not v1);
MIDI clips (no MIDI engine); timestretch-in-clip (WSOLA exists as an
effect; stretch-on-drag is a later add-on).

## 4. Risk register

- Effects write-back complexity → mitigated by the bounce kernel being
  pure and anchor-tested before any UI.
- Timeline UI drag/snap interactions → v1 keeps interaction minimal
  (click-select clip, drag-move, edge-trim, split at cursor) reusing the
  existing pointer/snap utilities.
- Drafts v3 size — clips reference assets; the payload keeps per-asset PCM
  blocks (dedupe) — v2 records stay readable forever.
