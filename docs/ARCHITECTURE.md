# WaveForge — Architecture

> **Status:** Production · v1.0 · 2026-09-25
> **Applies to:** `c0a1baa` and later
> **Related:** [DESIGN.md](DESIGN.md) · [MEMORY.md](MEMORY.md) · [DATABASE.md](DATABASE.md) · [PROJECT_BREAKDOWN.md](PROJECT_BREAKDOWN.md)

WaveForge is a **pure client-side web audio editor**. Every byte of audio,
every DSP operation, and every encode/decode task executes inside the
user's browser. There is no backend in v1: the deploy target is a static
host (Vercel) plus a service worker. This document describes the system
architecture that makes that viable at production quality.

---

## 1. Architectural principles

| # | Principle | Enforced by |
|---|-----------|-------------|
| 1 | **Worker-first DSP** — nothing audio-sized runs on the main thread | ADR 003; encode/decode/analysis/peaks all in workers |
| 2 | **Immutability at the document boundary** — edits never mutate live buffers | ADR 004; single `performEdit` gateway, copy-on-write bounces |
| 3 | **EDL undo, not snapshots** — history stores edit operations with byte budgeting | ADR 002; ≥ 100 steps under a 250 MB budget |
| 4 | **One command registry** — menus, shortcuts, and toolbar bind to the same command objects | unit-gated; drift is a test failure |
| 5 | **Pure kernels, thin shells** — DSP and edit logic are pure functions; UI is a shell | RED-first kernel tests with analytic anchors |
| 6 | **Accurate output** — effects verified against analytic/reference anchors, not eyeballing | per-kernel anchor suites (RED→green) |
| 7 | **Accessible by construction** — keyboard operability + axe-core WCAG 2.1 AA gate in e2e | permanent axe suite (zero violations) |
| 8 | **Privacy is structural** — no network path exists for user audio | CSP `connect-src 'self' data: blob:` |

## 2. System overview

```
┌────────────────────────────────── Browser ───────────────────────────────┐
│                                                                          │
│  ┌── UI shell (Preact 11 + @preact/signals) ─────────────────────────┐  │
│  │  MenuBar (grouped)   TransportBar (zones)   LaneStack / Strips    │  │
│  │  Dialogs (welcome, export, record, effects, about, shortcuts…)    │  │
│  │  WaveCanvas (canvas renderer + envelope overlays)                 │  │
│  └──────────────┬────────────────────────────────────────────────────┘  │
│                 │ signals · command registry · keyboard router           │
│                 ▼                                                        │
│  ┌── Application core (src/app) ─────────────────────────────────────┐  │
│  │  state signals   actions   commands   menus   shortcuts   i18n    │  │
│  └──────────────┬────────────────────────────────────────────────────┘  │
│                 │ pure calls (no I/O)                                    │
│                 ▼                                                        │
│  ┌── Engine layer (src/engine) ──────────────────────────────────────┐  │
│  │  AudioDocument (immutable) · editOps · history (byte budget)      │  │
│  │  AudioProject (lanes/clips/assets, COW bounces) · AudioEditor     │  │
│  │  AudioEngine (drift-free transport) · Recorder · Punch · Takes    │  │
│  │  analysis kernels (BS.1770 LUFS, BPM, report) · conform           │  │
│  └──────┬───────────────┬───────────────┬───────────────┬────────────┘  │
│         │               │               │               │               │
│         ▼               ▼               ▼               ▼               │
│  peaks.worker   analysis.worker  mp3Export.worker  flac-export.worker   │
│  (mip cache)    (LUFS/BPM/rpt)   (lamejs)          (libFLAC wasm)        │
│                                                                          │
│  AudioContext graph: source → per-channel gain/pan → analyser → dest     │
│  Recorder: MediaStream → recorder.worklet (AudioWorklet) → accumulator   │
│                                                                          │
│  ┌── Persistence (src/io) ───────────────────────────────────────────┐  │
│  │  IndexedDB: drafts (WFD3) + autosave ring + deduped assets        │  │
│  │  localStorage: settings · Service Worker: precache (PWA)          │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. Module map

| Module | LOC | Responsibility |
|---|---|---|
| `src/app` | 12,600 | UI shell: signals, actions, command registry, menus, keyboard, dialogs, transport/menu components, i18n, brand |
| `src/engine` | 5,130 | Pure audio core: documents, edits, history, projects/clips, transport, recorder/punch/takes, meters, analysis kernels |
| `src/fx` | 4,579 | Effect definitions + DSP kernels (registry `defs.ts`): dynamics, EQ, modulation, reverb, NR, stretch/pitch |
| `src/io` | 651 | Decode, export service + format catalog, WAV writer, ID3v2, draft repository |
| `src/workers` | 276 | MP3 export, analysis (LUFS/BPM/report), peaks mip builder |
| `src/worklets` | 56 | `recorder.worklet` — real-time capture off the main thread |
| `public/workers` | — | FLAC export worker (libFLAC WASM), vendored runtimes |
| `tests/` | 13,980 | 720 unit tests (86 files) + 59 Playwright e2e (incl. axe gate) |

## 4. Key data flows

### 4.1 Load → view
`File/URL/drag/sample → decode (AudioContext.decodeAudioData) → AudioDocument
(immutable Float32 channels) → peaks.worker builds multi-resolution mip
cache (transferable) → canvas renderer paints from cache → status/selection
signals update.` The main thread never touches full-resolution samples
after decode.

### 4.2 Edit → undo
`user gesture → command (registry) → edit reducer (pure editOps) →
new AudioDocument + history entry (EDL op, byte-costed) → peaks invalidate
→ repaint`. Undo/redo walks the history list; copy-on-write bounces keep
multitrack operations cheap. Every user-visible action is exactly one
undo step.

### 4.3 Record (studio flow)
`arm → recorder.worklet streams frames into a pure accumulator (meter tap
in parallel) → optional count-in (metronome click, BPM-aware) → roll →
stop splices the take via the standard overwrite-edit path (punch uses
the same path with in/out + pre-roll) → one undoable edit; the take is
also listed in the session takes panel.`

### 4.4 Analyze → report
`selection/document → analysis.worker → BS.1770-4 gating (integrated /
short-term / momentary), true-peak (4× oversample), LRA, correlation,
clipping integrity, BPM → streaming verdicts → report UI → CSV/clipboard
export.` Platform delivery targets (Spotify, Apple, YouTube, Netflix,
EBU) are evaluated against measured LUFS/TP.

### 4.5 Export
`format catalog (exportFormats.ts) → dialog state → exportService →
worker encode (WAV native / lamejs MP3 / libFLAC WASM; cancelable,
progress-reporting) → blob → File System Access API picker when
available, fallback download; ID3v2.4 tags embedded for MP3.`

### 4.6 Persist
`autosave ring writes debounced snapshots (IndexedDB, WFD3 payload) →
drafts manager lists/restores → crash-recovery banner on next launch →
manual saves are versioned drafts; clip arrangements persist as
placement lists over deduplicated assets.`

## 5. Threading model

| Thread | Owns | Never does |
|---|---|---|
| Main | UI, signals, command dispatch, canvas paint from mip cache | full-res DSP, encode, decode of large files |
| Audio (render) | AudioContext graph, recorder worklet | allocation-heavy work |
| Workers | peaks mips, LUFS/BPM/report, MP3/FLAC encode | DOM, signals |

Worker contracts use transferable buffers (zero-copy) and
cancelable jobs with progress messages. The FLAC worker runs the vendored
libFLAC WASM; the MP3 worker runs lamejs in chunks to keep progress
granular and cancellation responsive.

## 6. Playback & recording graph

```
AudioDestinationProvider (shared context, resume-on-gesture)
└── AudioEngine (transport on the context clock — drift-free)
    ├── single-doc mode: AudioBufferSource → channelGain → panner → analyser → destination
    └── project mode: per-clip sources (one per audible clip) → lane strip (gain/pan/mute/solo)
                      → mixdown-parity summing → analyser → destination
Recorder: getUserMedia (device picker + constraints) → AudioWorklet capture
          → Float32 frames (postMessage, transferable) → accumulator
Metronome: scheduled clicks (context-clock), count-in bars, BPM from detector
Monitoring: source → destination tap, default OFF (feedback-safe)
```

## 7. Effects pipeline

- **Registry**: `src/fx/defs.ts` is the single source of effect truth
  (id, name, section, params, kernel kind, curve support). Menus,
  dialogs, rack, and tests all derive from it.
- **Two kernel kinds**: *graph-kind* effects build Web Audio subgraphs
  (biquads, convolver, delays); *kernel-kind* effects render sample-wise
  in pure TypeScript (dynamics, NR, stretch). Automation supports both
  (graph: scheduled ramps; kernel: swept parameters).
- **FX Rack**: serial chain model validated at the boundary with zod;
  folds through the same registry (async == sync composition is
  unit-proven, incl. bypass/identity laws). Built-in recipes = named
  chains; user presets persist in IndexedDB.
- **Accuracy gates**: every kernel ships with analytic or reference
  anchors (true-peak ≤ tolerance, RBJ parity, RT60 ±5 %, WOLA
  reconstruction, SNR improvement, bit-identity when bypassed).

## 8. State management

UI state lives in `@preact/signals` (`src/app/state.ts`): one source of
truth per dialog/panel flag, no prop drilling. Document/project state is
**not** in signals — it lives in the engine layer and is exposed through
narrow observables, so kernels stay UI-agnostic. Keyboard routing
(`keyboard.ts`) consults a dialog-chain in fixed order (welcome → about →
shortcuts → doctor → effect → record settings → export → app), so Escape
and shortcuts behave deterministically with stacked dialogs.

## 9. Performance strategy

- Peaks mip cache: one build per edit, O(1) zoom painting.
- Autosave debounced + byte-budgeted history (≤ 250 MB) → long sessions
  stay flat in memory.
- Encode/analysis in workers → UI never blocks; Lighthouse TBT stays low.
- Precached PWA (vite-plugin-pwa) → instant repeat loads, offline use.
- Verified: Lighthouse **99 / 100 / 100 / 100** desktop, **99** mobile
  performance; main JS ≈ 119.5 KB gzipped.

## 10. Security & privacy

- **CSP** (Report-Only header via `vercel.json`): `default-src 'self'`;
  `wasm-unsafe-eval` for libFLAC/RNNoise; `img-src` includes the avatar
  CDN; no third-party script/style origins.
- **No telemetry, no uploads** — structural, not policy: the app makes
  no network requests for user data; URL import is user-initiated fetch.
- Drafts live in origin-scoped IndexedDB; cleared client-side only.

## 11. Extensibility

**Add an effect:** define params + kernel in `src/fx` → register in
`defs.ts` (section = one of the 9 menu groups) → dialog derives
automatically → add analytic anchor tests → menu/e2e update. The registry
gates keep menus, docs, and behavior from drifting.

**Add an export format:** extend `exportFormats.ts` catalog (id, presets,
hint, size estimator) → implement the worker → register in
`exportService` → catalog-driven dialog and tests follow.

**Phase-2 cloud (deferred, M12):** see [DATABASE.md](DATABASE.md) §3 —
MongoDB Atlas behind Vercel serverless; the client persistence interface
(`DraftRepository`) is the seam.

## 12. Decision record index

| ADR | Decision |
|---|---|
| 000 | Scaffold & toolchain (Vite + TS + Preact, CI gates) |
| 001 | Custom canvas renderer over WaveSurfer |
| 002 | EDL undo over snapshots |
| 003 | Worker topology |
| 004 | Immutability vs in-place DSP |
| 005 | FX architecture (registry, graph vs kernel) |
| 006 | Recording & export core |
| 007 | Analysis & tools |
| 008 | Persistence & PWA |
| 009 | Effects v2 architecture (accuracy gates, automation) |

---

*Maintained per ECC workflow: every architectural change updates this
file in the same commit series.*
