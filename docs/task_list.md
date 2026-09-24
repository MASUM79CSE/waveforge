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

## M5 — Analysis & tools (complete)

Analysis kernels are pure + worker-resident; the UI reads signals only
(ADR 007). The automation envelope editor moved to its own post-M6 package
(ADR 007 §deviation, supersedes ADR 005 placement).

- [x] **LUFS** (BS.1770-4 / EBU Tech 3341): K-weighting via libebur128's
      exact 48 kHz biquads (hardcoded; other rates via `redesignBiquad`
      exact bilinear redesign — identity at 48 kHz), 400 ms blocks with
      absolute (−70 LUFS) + relative (−10 LU) gating, momentary + short-term
      tracks. Anchors: −23 dBFS 997 Hz stereo → −23.0 ±0.5 @48k AND @44.1k;
      ±10 LU linearity; mono/stereo +3 dB; 10 kHz shelf +1..6 dB; silence
      → −∞; gate invariance (8 s silence padding ≤ 0.5 LU delta).
- [x] **BPM**: onset envelope (10 ms RMS frames, positive diff) →
      autocorrelation 60–180 BPM with 120 BPM prior → comb phase alignment
      → beats (seconds) + confidence. Anchors: 100–140 click tracks ±1 BPM;
      90 holds; beat[0] ≤ 1 period; constant tone → no onsets.
- [x] **ID3v2.4 writer + v2.3/v2.4 reader** (`src/io/id3.ts`): syncsafe
      sizes, UTF-8 text frames, zod boundary (500-char text, digits-only
      track, control-char strip, 4-digit year). Song Info dialog; tag is
      prepended to MP3 exports when any field is set; loader sniffs a
      leading ID3 tag and prefills Song Info.
- [x] **Spectrum panel**: master-tap AnalyserNode (2048 FFT, parallel
      branch), 48 log-spaced bands (pure `spectrum.ts` mapping), rAF draw
      while open; LUFS + BPM readouts; Measure/Detect buttons; beat-grid
      toggle. Panel + beat toggles persist (localStorage).
- [x] **Snap-to-beats**: selection edges snap to the nearest beat within
      min(80 ms, period/4); beats take priority over zero-crossings when
      both enabled (per-edge fallback).
- [x] **analysis.worker.ts**: module worker, zod-validated `detect-bpm` /
      `measure-lufs` commands over the standard {cmd,id} protocol; replies
      carry kernel timings (logged `[profile]`).
- [x] **Profiling (§8.5 B1 trigger)**: LUFS 60 s stereo 48 kHz ≈ 400 ms
      (< 2 s gate ✓); BPM 60 s stereo 44.1 kHz ≈ 12 ms. No B1 trigger.
- [x] i18n strings (Analyze menu, panel, metadata, toasts); commands
      `analyze.{lufs,bpm,beats,panel}` in a new top-level Analyze menu.

### Defects fixed during M5 bring-up

- [x] RBJ-from-spec K-weighting shelf gave +13 dB @99 Hz (wrong) → replaced
      with libebur128's exact 48 kHz coefficients + exact bilinear redesign
      for other rates (see Errors log in ADR 007)
- [x] Chromium cannot transfer TypedArray views to workers → transfer the
      underlying ArrayBuffers (with plain-clone fallback); channel copies
      are made first so document memory is never detached
- [x] LUFS gate invariance bound set to 0.5 LU (partially-toned edge blocks
      legitimately flip gate membership; math verified against anchors)
- [x] ID3 constants wired into the zod schema (was hardcoded 500)
- [x] BPM envelope frame 0 zeroed (frame-0 ramp is not an onset)

## M6 — Persistence & PWA (complete)

Storage is a pure-testable layer (`src/storage/`, ADR 008) behind a
Repository pattern; the browser bridge lives in `draftActions`.

- [x] **DraftRepository** (`idb` v8): metadata store + payload store split
      (lists never deserialize PCM); `findAll/findById/save/update/delete`
      + autosave ring (`writeAutosave/readAutosave/clearAutosave`).
- [x] **Payload format `WFD1`/`WFR1`** (`draftPayload.ts`, pure): 4-byte
      BE magic + u32 LE header length + zod-validated JSON header +
      interleaved float32 PCM; gzip via CompressionStream when available
      (sniffed by gzip magic), raw fallback self-describing and readable
      forever; every decode failure maps to WF-E402. SHA-256 `hashPcm`
      (FNV-1a fallback without WebCrypto).
- [x] **Drafts manager**: open/rename/delete per row, usage footer,
      empty state; corrupt rows stay listed (open → WF-E402 toast, delete
      works) — never blocks the list (§6.3). Save prompt defaults to the
      document name; draft loads rebuild via `bufferFactory` + installDoc
      (cursor restored).
- [x] **Autosave ring** (§6.3.2): 30 s debounce after the last edit OR
      every 8 committed edit ops (1 s micro-debounce collapses bursts);
      injectable sink + settings kill-switch (`autosaveEnabled`);
      write failures never reach the edit path.
- [x] **Crash recovery**: boot probe shows a restore banner when a ring
      record exists; Restore rebuilds the session (name/cursor), Discard
      drops it; any explicit load supersedes the offer.
- [x] **Quota guard** (§6.3.5): `storage.estimate()` ≥ 90% before writes
      → WF-E401 toast + drafts manager opens; `QuotaExceededError` on
      write maps to the same typed path.
- [x] **Settings boundary** (`storage/settings.ts`): namespaced JSON with
      zod-validated reads + silent fallback; Node-safe store shim for
      tests; legacy `'1'/'0'` flags still readable.
- [x] **PWA** (`vite-plugin-pwa` 1.3, Workbox 7, ADR 008 D6): full precache
      (21 entries ≈ 2.6 MB incl. workers/wasm/demo), `prompt` update flow —
      UpdateBanner offers Reload, never auto-applies mid-session; manifest
      + brand icons (SVG → 192/512/maskable PNG).
- [x] **e2e**: flow #5 (save → reload → reopen → same document), #5b
      (edit burst → reload → restore banner → session back), #6 (offline:
      production preview + real SW, go offline, reload, load sample). The
      M5 analysis specs were retitled `analysis:` to free plan numbering.

### Security review (IDB layer + SW — M6 exit gate)

- No `innerHTML`/`document.write`/`eval`/`new Function` in the M6 surface.
- SW is Workbox-generated: same-origin precache only (revision-hashed),
  `SKIP_WAITING` is its sole message handler, navigation fallback to
  index.html; no runtime caching rules, no remote importScripts.
- Untrusted bytes enter only through `decodeDraft` → zod header schema +
  length checks; all structural failures typed WF-E402 (list unaffected).
- Draft/autosave writes structured-clone into IDB — document buffers are
  never detached or shared; no postMessage in the storage layer.
- localStorage access is centralised (`settings.ts` namespaced + validated;
  M4 record settings keep their own reviewed namespace).

## Effects v2 — E2 8-band parametric EQ (complete)

Per `docs/effects-v2-plan.md` §E2 with ADR 009 (effects v2 architecture).

- [x] **`src/fx/biquad.ts`** (pure, 100% line coverage): RBJ cookbook
      designs (peaking/low-shelf/high-shelf/notch/HPF/LPF) in float64,
      DF2T recurrence, analytic `biquadMagnitudeDb` — the same function
      draws the dialog curve and anchors the tests.
- [x] **`src/fx/paramEq.ts`**: 8-band model; flat-param bridge
      (`eqBandsFromParams`/`bandsToParams`) keeps the generic registry
      validation + apply + preview plumbing (ADR 009 D2); HPF/LPF 12/24
      dB-oct (Butterworth Qs 0.5412/1.3066 cascaded); bit-exact bypass by
      skipping inert bands (ADR 009 D4).
- [x] **Gates met**: peaking 1 kHz +12 dB Q4 → centre 12 ± 0.25, octave
      leak ≤ 0.5 dB (Q1 skirt pinned at 3.9–4.1 dB = bandwidth behaviour);
      shelves ±0.25 dB at the stop, ≤ 0.5 dB at the far band; notch Q8
      ≥ 40 dB; HPF 4th-order −6 dB at cutoff, ≤ −40 dB at −2 oct, 12/24
      dB-oct separated ≥ 15 dB; analytic-vs-audio ± 0.3 dB; bypass
      bit-exact; 10 s worst-case stack bounded/NaN-free; clamping through
      registry specs; **[profile] E2: 219 ms / 60 s stereo** (budget
      600 ms ✓, no B1 trigger).
- [x] **`Pgeq8Dialog`**: live analytic response canvas (log axis, grid,
      redraw on every param change), 8 compact band rows (type/freq/gain/Q
      + slope for filters), A/B preview + apply through the shared kernel
      plumbing; mounted from App on the `fx.pgeq8` dialog id.
- [x] **Registry/menu**: `fx.pgeq8` (kernel, 32 specs) + command + menu
      row; registry-order test updated (the intentional review gate).
- [x] **e2e**: EQ dialog renders curve + 8 rows, band edit applies,
      length preserved, Ctrl+Z undo (14/14 total).

## Effects v2 — E1 Precision mastering (complete)

Per `docs/effects-v2-plan.md` §E1 (RED → green, analytic gates). ADR 009
pending — record with the E2 phase.

- [x] **`src/fx/mastering.ts`**: 4× oversampled true-peak engine (65-tap
      Kaiser β 8.5 polyphase, cutoff at the old Nyquist, DC gain exact ×4;
      passband flat to 18 kHz, stopband −80 dB @ 30 kHz, −94 dB @ 32 kHz);
      `truePeakLimit` (hardLimit's lookahead skeleton fed from the TP
      envelope, program-adaptive 5 ms fast-unload after 20 ms of < 1 dB GR);
      `applyNormalizeLufs` (M5 BS.1770-4 kernels + flat gain clamped ±24 dB
      + optional −1 dBTP ceiling pass); `truePeakDb` estimator.
- [x] **`src/fx/compressor.ts`**: soft-knee compressor kernel — 10 ms RMS
      sliding-window detection per channel, exact piecewise static curve
      (continuous at both knee edges), one-pole attack/release in dB,
      makeup after gain. Replaces the DynamicsCompressorNode graph def.
- [x] **Gates met**: sweep {997 Hz…15.5 kHz} @ −0.5 dBFS into −1 dBTP →
      TP ≤ −0.9 dBTP (all six); fs/4@45° intersample witness (samples read
      −3.5 dB, TP estimate −0.5 ± 0.3); LUFS round-trip −23 dBFS → −14 LUFS
      within ±0.3; bypass nulls bit-exact; linked-stereo image preserved;
      release monotone (no step > 0.5 dB/frame); steady-state GR ladder
      −60…0 dB matches the static curve ±0.1 dB; 30 s worst-case stability;
      `[profile]` 60 s stereo 44.1 kHz: tplimiter 867 ms, normalizeLufs
      1147 ms, compressor 621 ms (budgets 1.5 s ✓, no B1 trigger).
- [x] **Registry/menu**: `fx.compressor` → kernel (knee 0–24 dB, attack
      0.5–100 ms); `fx.limiter` → true-peak (ceiling −1 dBTP default,
      lookahead 5 ms); new `fx.normalizeLufs` (target −24…−9 LUFS, default
      −14, ceiling toggle) in the Effects menu + command + i18n.
- [x] **e2e** (`tests/e2e/effects.spec.ts`): LUFS Normalize applies at full
      length (9.27 s preserved) + undo; true-peak Limiter applies + undoes.

### UX hardening (user-reported): standard undo/redo shortcuts

- [x] Undo/redo were bound only to the AudioMass legacy Shift+Z/Shift+Y —
      Ctrl+Z / Ctrl+Y did nothing. New pure shortcut table
      (`src/app/shortcuts.ts`, 10 unit tests): Ctrl/Cmd+Z undo, Ctrl+Y AND
      Ctrl+Shift+Z redo (both conventions), Ctrl/Cmd+X/C/V cut/copy/paste,
      Ctrl/Cmd+A select all, Ctrl+O open; legacy shift-letter set kept.
      Alt combos and unmapped combos stay with the browser.
- [x] Menu shortcut hints are now platform-aware (⌘ glyphs on macOS,
      Ctrl elsewhere) and rendered from the same table.
- [x] e2e: apply LUFS Normalize → Ctrl+Z → "Undid" → Ctrl+Y → "Redid"
      (duration preserved); legacy Shift+Z path still asserted.

### Defects fixed during E1

- [x] **M3 defect: the effect registry was never populated in the browser**
      — nothing in `src/` imported `fx/defs.ts`, so `getEffect` always
      returned undefined and *every* effect dialog silently rendered null.
      Unit tests import defs directly (registered there), and no earlier
      e2e opened an effect dialog. Fixed with a side-effect import at the
      fx composition root (`fxActions`); e2e now covers dialog open/apply.

### E3 — modulation set (chorus / flanger / phaser / tremolo / vibrato)

- [x] **Kernels** (`src/fx/modulation.ts`, pure — no AudioContext): shared
      deterministic 4096-entry cosine LUT + Catmull-Rom 4-tap fractional
      delay (≤0.02-sample error measured via DFT phase ratio at 1 kHz);
      every LFO is a function of ABSOLUTE sample time (no phase
      accumulators), so chunked processing with overlap stitches
      bit-identically to one-shot. Chorus = 3 voices 120° apart, right
      channel runs a 60°-offset phase SET (a permutation of the same set is
      FP-commutative and cancels stereo width — caught by an anchor test).
      Flanger = modulated feedback comb with explicit carried `DelayState`;
      phaser = RBJ all-pass cascade (α = sin(ω0)/2) with ±1-octave stage
      spread, centre clamped 20 Hz–20 kHz / ω0 clamped below π, feedback via
      one-sample loop delay with carried `PhaserChannelState`. Tremolo:
      y = x·(1 − d/2·(1 − lfo)), sine or triangle LFO; vibrato = pure
      wobbling-delay read.
- [x] **Analytic anchors** (18 unit tests, `tests/unit/fx2/modulation.test.ts`):
      frac-delay error ≤0.02 samples + zero-padded edges; inert bypass
      (mix 0 / depth 0) bit-exact; chunked stitching bit-identical
      (chorus overlap; phaser through carried state); tremolo sidebands at
      ±rate match the Bessel ratio 20·log10((d/4)/(1−d/2)) ±0.3 dB,
      symmetric ±0.1 dB, 2nd-order ≤−50 dB; flanger fb 0.95 bounded ≤4 with
      ≤1e-3 tail over 30 s; phaser sweep shapes a tone −1…−40 dB with both
      clamp bounds exercised; 30 s all-effects stability; stereo
      decorrelation L ≠ R; `[profile]` chorus 60 s stereo within the 0.8 s
      uninstrumented budget.
- [x] **Registry/menu**: five new kernel defs — `fx.chorus` (base/depth ms,
      rate, mix), `fx.flanger` (+ feedback ≤0.95), `fx.phaser` (stages 2–8,
      centre Hz, feedback, mix), `fx.tremolo` (rate, depth, LFO shape),
      `fx.vibrato` (rate, depth ms) — flat scalar specs, generic
      EffectDialog, no custom dialog needed. i18n labels + params,
      commands, Effects-menu group (after Delay/Reverb).
- [x] **e2e**: Chorus applies through the real menu/dialog, toast
      "Applied: Chorus", duration preserved (9.27 s), Ctrl+Z undo +
      Ctrl+Y redo (suite 14 → 15).

### E4 — reverb v2 (Studio Reverb): seeded IR set + pure partitioned convolver

- [x] **Pure DSP stack** (`src/fx/fft.ts`, `reverbIr.ts`, `convolver.ts`,
      `reverb2.ts`): radix-2 float64 FFT with cached tables; seeded IR
      synthesis (mulberry32 only — envelope `g(n)=10^(−3n/(RT60·Fs))` is
      exactly −60 dB at n=RT60·Fs; plate = damped white tail + 5 ms
      diffusion ramp; room/hall = 8–16 / 16–24 seeded ER taps
      (5–35 / 20–80 ms, exponential density) over a stochastic tail;
      spring = 3 parallel feedback combs through 2 all-passes); partitioned
      overlap-save convolver (hop 8192, per-channel spectral FIFOs,
      conjugate-half accumulation, stereo packed into one complex FFT via
      L+iR ⇒ one forward + one inverse per block); reverb2 kernel =
      IR → convolve → predelay (exact leading silence) → wet/dry mix,
      output length == input length.
- [x] **Analytic anchors** (18 unit tests): convolver vs direct ≤1e-6
      (single AND stereo-packed paths, 2-partition random IRs); RT60 via
      Schroeder −5→−35 dB within ±5 % for 1/2/4/8 s (plate) and all four
      types @2 s; predelay 25 ms → leading silence 1102 ± 1 samples;
      same seed → bit-identical IR; stereo decorrelation; ER spans; ≥3
      spring comb notches ≥12 dB; ctx-IR routing + 15 s import cap;
      mix-0 bit-exact bypass; 30 s worst-case stability; `[profile]`
      **1281 ms** / 60 s stereo uninstrumented (budget 1.5 s ✓).
- [x] **Tail mechanism (§0)**: `KernelEffectDef.tail?: (params, ctx) =>
      number` + `EffectRunContext` (imported-IR side channel);
      `fxActions.kernelProcess` slices len + tail·sr frames (post-region
      context where audio follows, zero-padded past doc end) and the
      overwrite paste grows the document — undo restores the exact
      original duration.
- [x] **Wiring**: `fx.reverb2` kernel def (type / useImported / RT60
      0.2–12 s / damping / predelay 0–120 ms / mix / seed), i18n, command,
      menu row after legacy Reverb, registry order + kinds + tail tests.
- [x] **Reverb2Dialog**: generic param rows + IR import (decode via the
      existing decodeAudioData pipeline → resample to doc rate → 15 s
      cap → ctx), A/B preview and Apply through the same kernel path.
      *Plan deviation (intent kept): preview uses the pure kernel wet
      instead of ConvolverNode — preview == apply by construction.*
- [x] **e2e**: Studio Reverb grows the status-bar duration 9.27 →
      ~11.11 s (region growth asserted) and Ctrl+Z restores 9.27 s
      (suite 15 → 16).

**Plan corrections recorded during E4**

- "Partitioned OLA at 2048 ≈ a few hundred ms" measured **2.7 s** for 60 s
  stereo; shipped CONV_BLOCK 8192 + half-spectrum MACs + L·iR packing →
  1281 ms uninstrumented (no B1 worker route needed).
- Spring "3 cascaded combs" would convolve into a t²·e^(−at) ramp and miss
  the ±5 % RT60 gate → parallel combs, each individually carrying the full
  RT60 (per-iteration feedback `c = 10^(−3·D_sec/RT60)`).

### E6 — spectral repair (noise-print NR v2 + de-esser)

- [x] **E6a noise-print NR** (`src/fx/nrPrint.ts`, pure STFT): 2048 frame /
      512 hop, Hann analysis + Hann² synthesis (WOLA, exact per-sample
      window-sum denominator), zero padding ×2 (4096-point FFT) to bound
      circularity; learn = per-frame magnitudes averaged across CHANNELS
      IN THE MAGNITUDE DOMAIN (a time-domain channel mix cancels
      independent noise and biases the print √2 low — caught by the stereo
      anchor) with EMA 0.3 across frames; apply = per-bin
      `|Ŝ(k)| = max(|Y(k)| − α·|N̂(k)|, β·|Y(k)|)`, phase = noisy phase;
      print routed via `EffectRunContext.noisePrint`; empty/missing print
      = bit-exact identity. α 1–4 (2), β 0.01–0.2 (0.05). In-session hold
      ships; draft-store persistence landed in M7 (optional `noisePrint`
      header field, autosave ring + drafts both carry it, cleared when a
      fresh document loads — e2e flow #5c).
- [x] **E6a anchors**: α=0 WOLA reconstruction ≤1e-6 (sample 1..n−1 —
      Hann(0)=0 by definition); +6 dB SNR tone+noise → SNR gain ≥10 dB;
      tone-peak loss ≤1 dB; musical-noise frame-energy variance ratio
      ≤2.5; learn/process determinism bit-identical; stereo honesty (both
      channels ≥10 dB with a shared print); `[profile]` **3591 ms**
      / 60 s stereo uninstrumented (budget 4 s ✓ — `Math.hypot`→`sqrt` in
      the bin loops took it from 4492 ms; no B1 worker route needed).
- [x] **E6b de-esser** (`src/fx/deesser.ts`, pure): Linkwitz-Riley 4th-order
      2-way crossover — **Butterworth-2 squared (Q = √½ per section)**,
      sine-peak-calibrated HF RMS detector (20·log10(rms·√2), 10 ms
      one-pole, denormal flush), static downward ratio on the HF band
      only, bands re-summed; ratio ≤1 = bit-exact bypass.
      *Plan correction: "−3.01 ± 0.2 dB both bands" contradicts the plan's
      own "two cascaded Butterworth per way" — the squared-Butterworth LR4
      puts each band at −6.02 dB at fc with an exactly flat complement
      ([0.5412, 1.3066] is the 4th-order Butterworth prototype: bands at
      −3.01 dB IN PHASE, sum +3 dB hot). Gate corrected to −6.02 ± 0.2 +
      flat-sum ±0.2 at fc/2, fc, 2fc.*
- [x] **E6b anchors**: band/sum crossover gates above; 6.5 kHz tone @
      −10 dBFS into threshold −20 ratio 4 (crossover 2500 — at 4000 the
      LP-band leak masks ~0.3 dB of the reduction) → 7.5 ± 0.5 dB;
      300 Hz tone untouched ±0.1 dB; level-below-threshold no-op; 30 s
      worst-case pink + impulse bounded ≤4, no NaN, mono + stereo.
- [x] **Wiring**: `fx.deesser` (generic dialog: crossover 3–9 kHz,
      threshold −60…0 dB, ratio 1–12) + `fx.nrPrint` (custom dialog:
      α/β rows + "Learn print from selection" → ctx) after Noise Gate in
      the Effects menu; commands, i18n, registry order/kinds, coverage.
- [x] **e2e**: De-esser applies via the generic dialog (duration
      preserved, Ctrl+Z/Ctrl+Y); Noise Reduction learns the print from the
      selection, applies, undoes (suite 16 → 18).

## E5 — WSOLA time-stretch / pitch-shift (effects-v2) ✅

- [x] **E5 kernel** (`src/fx/wsola.ts`, pure): WSOLA with frame 2028
      (46 ms), hop-s 1014, hop-a = round(hs/ratio), search τ = ±441
      (±10 ms); Hann analysis + exact per-sample window-sum denominator.
      Decision signal: onset map (energy flux > 3× median on **signed**
      ch0; MA(9) + hysteresis metering during anchor development only)
      → onset-locked δ = round((ratio−1)(k·ha−onset)) clamped ±τ; else
      normalized cross-correlation of signed ch0 vs the **continuation
      template** (signal immediately after the frame read), 3× decimated
      coarse search + ±3 refine. `pitchShift(n)` = stretch(2^(n/12)) then
      `resample(·, 2^(n/12))`. ratio 1 → bit-exact copies; outLen is
      exactly round(inLen·ratio). (Plan deviations ratified: rectified
      decision signal and self-template both produced OLA cancellation
      notches / +5 Hz pitch bias — caught by the pitch anchor.)
- [x] **E5 anchors** (8 tests): ×1.00/+0 st bit-exact; 10 s ×1.25 →
      551250±88, ×0.8 → 352800±88; 440 Hz +3 st → 523.25 Hz ±0.5 %
      zero-cross; click train ×1.5 → grid ±2 ms; stereo channels
      bit-identical; 30 s ×1.7 / ×0.6 bounded ≤4 no NaN; guard rails
      (bad ratio, empty input); profile 60 s stereo ×1.25 ≈ 1.1–1.2 s
      uninstrumented (budget 3 s).
- [x] **E5 wiring**: `experimentalFx` signal (localStorage-gated) +
      View-menu toggle (`view.experimental`); `fx.stretch` command +
      Stretch / Pitch dialog (linked stretch↔semitones controls with an
      independent escape hatch; stretch==1 && st==0 → bit-exact).
      MenuBar: click after a hover-switch keeps the freshly-opened menu
      open (native-menu behaviour; the click no longer instantly closes
      it). Registry 21 effects; e2e suite 18 → 19 (hidden until enabled,
      then View → Stretch / Pitch → ×1.25 → 11.5 s → Ctrl+Z).

## M7 — Hardening & release ✅

- [x] **a11y / focus management**: base modal traps focus (initial focus on
      the first focusable, Tab/Shift+Tab wrap, unmount restores the opener);
      `--text-faint` contrast bumped 2.78 → 5.29:1 on panel backgrounds.
- [x] **Local error log** (§6.3 #8): last 100 errors ring-buffered in memory
      (window error + unhandledrejection + crash boundary), export-to-JSON via
      the doctor panel. No network telemetry.
- [x] **Doctor diagnostics** (§6.3 #7): Help → Diagnostics runs capability
      self-tests (WebAudio offline render, AudioWorklet addModule, IndexedDB
      write, wasm instantiate, CompressionStream, storage estimate, save
      picker, OffscreenCanvas, same-origin fetch) with pass/fail + timing;
      unit-tested runner, e2e via the real menu with the §2.3
      zero-console-errors assertion.
- [x] **Refactor pass**: `WaveRenderer.ts` (478 lines) split — painting
      extracted to `engine/waveDraw.ts` (239) behind a `WaveDrawCtx`; the
      renderer keeps lifecycle/zoom/interaction (281). All source files now
      within the ≤400-line budget; remaining >50-line functions are JSX
      render components and hot DSP kernels already reviewed at their
      milestones (splitting them would churn reviewed code for no gain).
- [x] **Perf / Lighthouse gate** (§2.3, mobile emulation — the strict preset):
      **99 Performance / 100 Accessibility / 100 Best Practices / 100 SEO**
      against the production build served with brotli (report:
      `docs/perf/lighthouse-mobile.json`). Pre-fix runs: 93/96/100/100 —
      perf was capped by the sandbox's uncompressed static server, a11y by
      the contrast token (fixed).
- [x] **NR print persistence** (E6 deferral closed): the learned noise
      print rides in draft + autosave headers (`noisePrint` bins array,
      backward-compatible schema), is restored with the document, and the
      NR dialog shows "Print restored from draft". New document loads
      clear it (a print belongs to its audio).
- [x] **Legal + deploy**: `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md` with the
      AudioMass MIT attribution, and `vercel.json` (build/output, cleanUrls,
      immutable asset cache, nosniff / frame-guard / referrer-policy) shipped
      at M0 — verified present and complete.

## D-series — AudioMass UI parity + advance (design-parity-plan.md)

Analysis: `docs/design-analysis-audiomass.md` (live-site token extraction,
2026-09-24). Sequence D1→D7, each phase gated like a milestone.

- [x] **D1** token convergence (bg/fg ladders, cyan accent + glow roles,
      radii 2/4/8, spacing, 160 ms motion, panel-group anatomy) + AA guard
      (script 6/6 PASS; `3da77ef`)
- [x] **D2** icon toolbar → command registry — 15 icons in 3 groups, labels
      resolved from the registry (no drift), disabled without a doc; e2e:
      cut via icon → 0:06 clock → Shift+Z → 0:09.272 (`5b0…` this commit)
- [x] **D3** selection readout group (Start/End/Duration + Clear Q) with
      unit + e2e coverage, embedded in the AM control row
- [x] **D4** canvas skin — green `#9dff6a` wave, `#ff8c35` playhead, `#d9d955`
      ruler labels on black, `#365457` grid; bottom amplitude axis (-Inf..0,
      2 dB steps) + L/R rail with the View → Amplitude Axis toggle
      (persisted, e2e-verified); pointer/wheel math rail-aware
- [x] **D5** zoom bar (floating, horiz ±/R + **vertical ±** with `vzoom`
      0.5..3 persisted state) + BEAT/SNAP control-row group (markers,
      snap-to-beat gate, live BPM readout); unit + 4 e2e
- [ ] **D6** dialog/overlay restyle + keyboard-shortcuts overlay
- [ ] **D7** hardening: Lighthouse ≥95/95/100/100 holds, screenshots, docs

## M8+ — post-v1 (see Build Plan §10 roadmap)
