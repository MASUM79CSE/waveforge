# WaveForge — Memory & State Design

> **Status:** Production · v1.0 · 2026-09-25
> **Applies to:** `c0a1baa` and later
> **Related:** [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md)   

"Memory" in WaveForge spans four layers: **runtime audio memory**,
**undo/history memory**, **session/selection state**, and **durable
memory** (IndexedDB). This document specifies each layer's model, its
budgets, and the invariants that keep long editing sessions flat and
crash-safe.

---

## 1. Layer overview

```
┌────────────────────────────────────────────────────────────────┐
│ RUNTIME (RAM, main thread)                                     │
│   AudioDocument  — immutable Float32[] channels (f32/sample)   │
│   Project assets — deduplicated source buffers (COW bounces)   │
│   Peaks mip cache— zoom-level summary (≈ w/1024 per level)     │
│   History (EDL)  — edit operations + retained tail bytes       │
├────────────────────────────────────────────────────────────────┤
│ WORKER MEMORY                                                  │
│   encode/analysis scratch — transferable in, transferable out  │
├────────────────────────────────────────────────────────────────┤
│ DURABLE (IndexedDB, origin-scoped)                             │
│   drafts (WFD3) · autosave ring · asset blobs · presets        │
│   noise prints (in draft + autosave headers)                   │
└────────────────────────────────────────────────────────────────┘
```

## 2. Runtime document model

- **`AudioDocument`** = `{ sampleRate, channels: Float32Array[] }` and is
  **immutable**. Any edit returns a *new* document; the previous one is
  never mutated (ADR 004). Consequences: aliasing is safe across lanes,
  clips, preview and history; the GC reclaims superseded generations.
- **Copy-on-write bounces**: multitrack operations that would rewrite a
  whole lane instead reference shared *assets* and record placement;
  rendering bounces produces new buffers only for the affected span.
- **Retention**: superseded generations are kept **only** if the undo
  history references their bytes (§3) — nothing else holds them.

## 3. History (undo) memory — the EDL budget

ADR 002 chose **edit lists over snapshots**. Each history entry stores
the operation (splice points, paste payload, effect-rendered region) —
not full document copies.

| Invariant | Guarantee |
|---|---|
| Depth | ≥ **100 steps** for typical edits |
| Budget | retained undo bytes **< 250 MB** (verified literally by unit test `a1157f8`) |
| Granularity | exactly one user action = one undo step (including punch-in splices and rack applies) |
| Eviction | oldest entries drop first; retained tail bytes are what the budget measures (`retainedBytes()`, public + typed for tests) |

Big-payload ops (paste, mixdown, rendered effects) carry their byte cost
in the entry so eviction is exact, not estimated.

## 4. Peaks cache

One build per document generation, in `peaks.worker`: per-channel
min/max pairs at successive decimations (≈ `width/1024` per level,
transferable). Zoom/scroll paint is then O(viewport). Invalidation is
generation-keyed — a new document never repaints from a stale cache.

## 5. Worker memory discipline

Export/analysis workers communicate by message with explicit buffer
ownership (WF-002 audit):

- **Worker requests.** By default the channel `Float32Array`s are
  structured-cloned at the `postMessage` boundary — one transient
  full-size copy, measured at ~46 ms / +40 MB RSS for a 120 s stereo
  44.1 kHz document (40.4 MB payload). This is deliberate: the
  canonical AudioDocument buffers must never be listed in a transfer
  list (transfer would detach them). Callers that hold **exclusive**
  buffers they never read again (the range-export `sliceRegion`
  copies) set `transferChannels: true` and the request is moved
  zero-copy instead — measured 22 ms vs 72 ms for the same payload
  (Node 20, median of 5; see audit EVIDENCE_LOG E-006). Stem export
  intentionally keeps the clone: `trackChannels` has a zero-copy fast
  path that can return asset PCM references.
- **Worker results** (MP3/FLAC output bytes) are transferred back
  (`[out.buffer]`) and wrapped in a `Blob` on the main thread.
- Analysis (LUFS/BPM/report) jobs receive transferred copies made at
  the call site (`PeakClient` slices per channel before transfer).
- Cancellation frees the job at chunk boundaries (MP3) or via
  worker-side flags (FLAC/analysis). The export cancel watcher stops
  on every terminal path (WF-001), so no job closure outlives its
  export.
- WAV encoding runs in its own module worker (WF-003): the pure
  `encodeWavChunked` kernel converts in 65,536-frame chunks with real
  progress and cancel between chunks; the main thread only orchestrates
  and wraps the transferred result in a `Blob` (measured main-thread
  blocking moved from 134/137/1161 ms to zero long tasks for a 120 s
  stereo export; audit EVIDENCE_LOG E-007).

## 6. Session state (non-durable)

UI/session state lives in signals and plain module state, deliberately
*small*:

- dialog flags (`welcomeOpen`, `exportOpen`, `effectDialogId`, …),
- selection/time/zoom/loop, transport position,
- record session state (armed/rolling, takes list metadata),
- toast ring, local **error-log ring** (bounded, diagnostic-only).

The position clock, selection, and scroll are view state — intentionally
not persisted (a reopened draft opens at zero, matching pro-tool
convention).

## 7. Durable memory → see DATABASE.md

Durable memory (drafts WFD3, autosave ring, deduped assets, presets,
noise prints, settings) is specified in [DATABASE.md](DATABASE.md),
including schema, versioning/migrations, and the crash-recovery flow.
Summary: **autosave** writes debounced snapshots to a bounded ring;
launch compares `autosave` vs last manual draft and offers recovery;
noise prints persist inside draft headers so NR survives reload.

## 8. Budgets & observed numbers

| Item | Budget / observed |
|---|---|
| Undo retention | < 250 MB hard, ≥ 100 steps (tested) |
| Decoded audio (document/asset/IR) | ≤ 512 MiB decoded PCM — WF-009 guard (≈45 min stereo 44.1 kHz); files > 512 MB rejected pre-decode; decode watchdog 60 s |
| Peaks cache | ~ KBs–low MBs (mip levels × channels) |
| Main JS bundle | ≈ 118 KB gzipped (entry 118,171 B, CI budget 122,132 B — WF-007 gate) |
| Autosave ring | bounded (oldest snapshots evicted) |
| Error log ring | bounded entries, session-scoped |
| Long-session behavior | memory flat after eviction; no per-keystroke growth |

## 9. Invariants (test-enforced)

1. Immutability: no kernel mutates input channels (kernel suites assert
   input snapshots).
2. One action = one history entry (undo e2e across edit/record/rack).
3. Budget literalism: `retainedBytes() < 250e6` at depth 100+.
4. Generation-keyed repaint: no stale peaks after any edit (e2e).
5. Crash safety: autosave written on a debounce; recovery banner e2e.
6. Automation/mixdown bit-identity: automated renders equal their manual
   reference within anchor tolerance (A-series tests).

---

*Any change to history economics, cache strategy, or payload shape must
update this file and its unit gates in the same series (ECC rule).*