# Task List

> Living breakdown per ECC `development-workflow.md` (planner output). One
> checkbox = one reviewed+tested unit.

## M0 — Skeleton, governance & branding

- [x] Research & reuse gate → `adr/000` (toolchain pinned, TS 5.9 vs 7 decision)
- [x] Scaffold: Vite + TS strict + Preact; ESLint/Prettier; CI workflow; vercel.json
- [x] Project hooks (`.claude/settings.json` + PostToolUse format hook)
- [x] Docs set: prd / architecture / tech_doc / task_list + ADR 000–004
- [x] TDD RED→GREEN: `core/format`, `core/zoom`
- [x] TDD RED→GREEN: `core/result`, `core/errors`, `core/logger`, `core/bus`, `core/schemas`
- [x] i18n catalog + error-message map (codes → keys → copy)
- [x] App shell: MenuBar, TransportBar (disabled), StatusBar, Toasts, Modal base,
      Welcome + About dialogs, keyboard (Escape), ErrorBoundary, empty state
- [x] Design tokens + brand.ts rebrand skin
- [x] Exit gates: typecheck ✓ lint ✓ coverage ≥ 80% core ✓ build ✓ dev-server smoke ✓
- [x] Review pass (checklist in tech_doc) — findings fixed

## M1 — Core engine: load, render, transport (next)

- [x] R&R spike: wavesurfer.js 8 / peaks.js 4 evaluated → `adr/001` closed (custom renderer)
- [x] TDD RED→GREEN: `viewState`, `transportMath`, `peaksCompute`, `protocol` (Zod),
      `AudioDocument`, `PeakClient` (fake-transport protocol tests)
- [x] `workers/peaks.worker` (mip cache, byte budget) + `WaveRenderer`
      (lanes, DPR, zoom/scroll, ruler, progressive tiles, raw path, pointer+wheel)
- [x] `AudioEngine` transport (play/pause/stop/seek/loop, drift-free clock)
- [x] Loading: file picker / drag&drop / URL (Zod + progress) / generated sample
      (`scripts/gen-sample.mjs` → `public/samples/demo.wav`)
- [x] Keyboard map (Space/arrows/Home/End/L/±/0/Tab/Q/Shift+A/Ctrl+O), follow cursor
- [x] URL dialog, loading overlay, status bar (selection/zoom/position)
- [ ] e2e flow #1 — **moved to M4** with the Playwright suite (deviation logged:
      §8.4 schedules Playwright from M4; M1 verified via live-server smoke of all
      modules + pure-math integration tests instead)

## M2 — Editing & History (complete)

- [x] Pure edit kernel `engine/editOps.ts` — SliceOp (remove/insert/write),
      region kernels (slice/remove/insert/write, gain/fade/reverse/invert),
      normalizeRange (factor 1 when silent), silenceRanges, findZeroCross,
      makeCut/makeInsert + composites makeOverwritePaste/makeTrim/makeRemoveSilence
      (round-trip tested: redo replays original→edited, undo edited→original)
- [x] `engine/history.ts` — byte-budgeted undo/redo stacks (256 MB, min-keep 10),
      push clears redo + trims oldest; `engine/AudioEditor.ts` — adopt/reset/execute
      stage-then-swap (new doc per edit, previous buffers untouched, ADR 002/004)
- [x] Engine support: `AudioEngine` stereo channel routing (splitter→ch gains→
      merger), setChannelMute/setChannelsSwapped; `WaveRenderer.setDocument`
      keepView; shared AudioContext via `io/decode.getSharedContext`
- [x] App wiring: `runtime.ts` installDoc/swapDoc/performEdit/runUndo/runRedo +
      zero-cross selection snap (persisted toggle); `editActions.ts` clipboard +
      13 edit ops with safeEdit recover-and-report; commands (Shift+X/C/V/N,
      Shift+Z/Y, Del), Edit+Effects menus, keyboard map, gain/normalize prompt
      dialogs, transport L/R mute + swap buttons, i18n block
- [x] Review fixes: trim tail offset (was clamped no-op), removeSilence undo
      order (ascending restore), insertSilence undo (was re-inserting shifted
      audio), history cleared on document close, composites promoted from
      untested app code into tested editOps

## M3 — Effects system (complete; envelope editor → M5, logged)

- [x] `src/fx` registry + UI-free effect definitions (ADR 005): 10 effects —
      compressor, hard limiter, distortion, delay, reverb, parametric EQ,
      graphic EQ 10/20, noise gate (NR fallback per §11), varispeed rate
- [x] Two kinds, one apply path: pure sample kernels (limiter/gate/rate —
      golden-tested) + native node graphs via `buildGraph(ctx, …)` rendered
      in OfflineAudioContext for apply (construction-tested with fake ctx)
- [x] Numeric boundaries seeded + pure (ADR 005 §4): distortion waveshaper
      curve (x3 scale = unity at 0 drive), reverb IR (mulberry32), equal-power
      mix; delay tail from feedback decay to −60 dB
- [x] A/B preview: dual dry/wet sources + 30 ms gain crossfade (no transport
      restart); params clamp before preview/apply; apply = makeOverwritePaste
      → undoable stage-then-swap, keeps wet tail (region grows)
- [x] Generic EffectDialog rendered from param specs (slider+number+bool),
      Esc closes; Effects menu expanded; 10 fx.* commands
- [x] Deltas from AudioMass logged in ADR 005 §5 (limiter algorithm, mix
      law, tail retention, GEQ20 band layout, rate = varispeed)
- [ ] **Automation envelope editor → scheduled with M5** (needs the canvas
      timeline infra landing with the analysers; deviation logged in ADR 005)
- [ ] RNNoise denoise + pitch-preserving stretch remain parked (§11 v1 deltas)

## M4+ — see Build Plan §10 (roadmap)
