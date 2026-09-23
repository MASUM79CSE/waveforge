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

### Defects fixed (post-M3, user-reported)

- [x] **Stereo playback silent** (M2 regression, critical): AudioEngine built
      splitter → gains → merger but never wired splitter outputs INTO the
      gains — every stereo file (incl. demo.wav) played silence with a moving
      playhead; mono files were unaffected, so smoke tests missed it.
      Fix: `splitter.connect(gain, ch, 0)` + regression note here (engine
      routing stays browser-only/untested until a WebAudio harness exists).
- [x] Shared AudioContext (decode/preview) was never resumed → silent effect
      preview; added `resumeSharedContext()` + preview call.
- [x] Blocked autoplay now degrades gracefully: resume raced with 400 ms
      timeout, `engine.onBlocked` → WF-E301 toast once per episode, playback
      still starts so a gesture unlock makes it audible; global
      pointerdown/keydown unlock listeners in runtime.

## M4 — Recording & export (complete)

- [x] Recording: `RecorderEngine` — getUserMedia (constraints UI: device pick,
      echo-cancellation/noise-suppression/auto-gain toggles persisted) →
      AudioWorklet `wf-recorder` (4096-frame transferable chunks) with
      ScriptProcessor fallback; pure `RecordBuffer` accumulator; peak/RMS
      meter (pure meterLevel) in the transport + duration guard (10 min);
      stop installs the take as the active document
- [x] Export: WAV (own writer — golden byte fixtures, 16/24-bit PCM +
      32-bit float with fmt(18)+fact), MP3 (lamejs in a module worker,
      128–320 kbps, progress/cancel/transferables), FLAC (vendored
      libflac wasm build driven by a classic worker — the AudioMass
      wiring; 16/24-bit, levels 0–8, progress/cancel)
- [x] Export UX: dialog with format/quality/scope (selection or whole
      file)/filename/size estimate/progress/cancel; File System Access
      picker opened inside the click gesture, `<a download>` fallback with
      revoked object URLs; filenames via pure sanitizer
- [x] e2e (Playwright, chromium + fake media): flow #1 (load→play→select→
      cut→undo — the M1 deferral), flow #3 (record a take), flow #4
      (WAV RIFF bytes / MP3 frame sync / FLAC fLaC magic through the real
      workers) — **5/5 green**
- [x] Encoder validation: `npm run validate:encoders` — MP3 at all 4
      bitrates in Node (frame sync + size bounds); FLAC validated in-browser
      by the e2e suite (wasm only runs there; ADR 006 §5 revised)
- [x] Security review (mandatory §10): no HTML-injection sinks, no data:
      URLs, no eval; object URLs revoked; getUserMedia streams + nodes fully
      torn down; worker messages validated (zod module worker / defensive
      checks classic worker); no remote code in workers

### Defects fixed during M4 e2e bring-up

- [x] ExportDialog reset effect raced user input (could revert format after
      open) → dialogs now mount fresh per open
- [x] Shift-shortcuts missed synthesized key events (`z`+shift vs `Z`) →
      shift cases now match both; MenuBar interactions unaffected
- [x] FLAC worker: awaited `Flac.isReady()` before encoding; derived params
      moved into the encode path; wasm served next to the worker script
      (emscripten resolves it relative to the worker URL)
- [x] lamejs pre-bundled (optimizeDeps) — first export no longer triggers a
      mid-session vite re-optimization page reload

## M5+ — see Build Plan §10 (roadmap)
