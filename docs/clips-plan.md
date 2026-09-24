# M9 Clips — build plan (scope of docs/clips-analysis.md)

Phases M9a→M9f; RED→green, full gates, conventional commits. Visual/D-series
rules unchanged. Sample-domain throughout; no-overlap policy; COW bounces.

## M9a — clip core (pure TS, `src/engine/clips.ts`)

```ts
interface AudioAsset { id: string; sampleRate: number; channels: Float32Array[] }
interface AudioClip  { id: string; assetId: string; start: number; offset: number; duration: number }
interface ClipTrack  { clips: AudioClip[] } // sorted by start, non-overlapping
```

Kernels (pure): `clipEnd(clip)`, `findClipAt(track, sample)`,
`insertClip(track, clip)` (sorted; throws on overlap), `removeClip`,
`splitClip(track, clipId, at)` → [left, right] (offset math),
`moveClip(track, clipId, delta)` (clamps to neighbours, never overlaps),
`trimClip(track, clipId, edge, newEdge)` (start/end trim clamped by asset
length / neighbour edges), `duplicateClip(assets, track, clipId)` → new
clip after the original (throws if no gap), `timelineDuration(track)`.

Render: `renderClipTrack(track, assets, outLen?)` → Float32Array[] stereo
out (mono asset → both channels; balance-free placement), fixed clip order
Float64 accumulate + single f32 round — **bit-anchored against a slow
reference** `renderClipTrackReference`. Also `renderRegion(track, assets,
from, len)` for the effects bounce path.

Gates (§M9a, literal):
- split math: offset accumulates; right clip = { start: at, offset:
  offset + (at − start), duration: end − at } exactly.
- trim preserves offset on start-trim (offset += delta) and duration on
  end-trim; clamps at asset bounds and neighbour edges.
- move clamps into the free gap between neighbours (both directions).
- render: two sequential clips == concatenation (bit-equal); overlapping
  placements across tracks sum in order (two-track anchor == M8 mixdown
  when each track has one full clip).
- duplicate shares assetId; render of duplicate==original region bit-equal.
- determinism: two renders bit-identical; empty track → silent len 0.
- [profile] 60 s single-clip track render ≤ 120 ms; 200-clip timeline
  render of 60 s audio ≤ 400 ms (smoke 1.5 s).

## M9b — asset store + lane bridge (`src/engine/clipAssets.ts`) — DONE (aa8580b)

`AssetLibrary` (Map + refcounts), `addAsset`, `releaseAsset` (GC when
refcount 0), `ensureLaneClip(project)` — every M8 lane gets an implicit
asset+clip on project open (lanes keep working); effects/quick-command
targets resolve to the track's clip timeline (render region → COW bounce
→ replace). Drafts v2 unchanged in this phase.

Gates: refcount lifecycle; lane-bridge parity (render of a bridged lane ==
original channels bit-exact); bounce write-back (single-clip region ==
in-place edit result bit-exact; shared-asset bounce leaves the sibling
clip's audio untouched).

## M9c — playback (`ProjectPlayback` clip scheduling) — DONE

One source per clip; balance gains per track unchanged; seek maps to
per-clip offsets; loop restarts (parity with current restart-on-loop).
Gates (fake ctx): N clips → N sources with start(when, offset, dur);
muted/solo'd tracks skip scheduling; position math unchanged.

## M9d — arrangement UI (lane canvas → clip blocks)

Per-clip envelopes (buckets per asset), clip name + edge handles; click
selects (active clip), drag moves (snap: beats when SNAP on, else
free), edge-drag trims, split-at-cursor (Cmd/Ctrl+E? — single-source
shortcuts module), duplicate (Ctrl+D), delete (removes clip, asset
retained). Overlaps impossible by construction (kernels clamp).

Gates: unit (reducers) + e2e: import → split at cursor → drag second
half right → undo ×2 → duplicate → play.

## M9e — history + commands

Clip ops ride `ProjectHistoryOp` (timeline payloads, byte-light); bounce
entries charge new-asset bytes; unified undo unchanged. Split/duplicate/
trim/move commands wired into commands.ts + menus + shortcuts.

Gates: interleaved clip-op undo/redo (incl. bounce entries) restores the
rendered timeline bit-exactly at every step.

## M9f — persistence + export

Drafts v3: `assets[]` (PCM blocks, deduped) + tracks as clip lists;
v2/v1 load via the lane bridge. Mixdown/stems render from clip timelines
(bit-parity anchors vs M8 single-clip). Record/import land assets+clips.

Gates: v3 round-trip bit-exact; v2 load → single-clip project; mixdown
parity anchor; e2e save/reload of a split/arranged project.

## Standing constraints

- Shortcuts single-source; no regressions to M0–M8 flows (every existing
  e2e must stay green untouched); D-series visuals; pure client-side.
- Effects v2 §8 gate discipline applies to all new kernels.
