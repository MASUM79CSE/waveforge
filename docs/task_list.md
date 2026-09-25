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
- [x] e2e flow #1 — **moved to M4** with the Playwright suite (deviation logged:
      §8.4 schedules Playwright from M4; M1 verified via live-server smoke of all
      modules + pure-math integration tests instead). RESOLVED: the Playwright
      suite has run every milestone since M4 (47 specs as of X-series).

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
- [x] **Automation envelope editor → SHIPPED as A7** (docs/automation-plan.md;
      the ADR 005 deviation resolved — per-param FX curves + track automation
      lanes all landed with the A-series)
- [x] RNNoise denoise shipped as E7b `fx.rnvoice` (see E-series) — un-parks
      this note; pitch-preserving stretch SHIPPED as E5 WSOLA
      (`fx.stretch`, stretch/semitones with the pitch anchor) — gated
      behind View → Experimental effects by design, so nothing remains
      parked from the §11 v1 deltas

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
      then View → Stretch / Pitch → ×1.25 → 11.5 s → Ctrl+Z). **PROMOTED
      Z1 (2026-09-25):** first-class Effects item, experimental gate
      machinery removed (e2e now asserts direct menu apply).

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
- [x] **D6** welcome tips line (Shift-key note, AM parity) + Help →
      Keyboard Shortcuts overlay (4 groups from `shortcutCatalog.ts`,
      unit-pinned; Escape closes; e2e-verified)
- [x] **D7** hardening: Lighthouse re-run with the converged skin —
      **99/100/100/100** (`docs/perf/lighthouse-d7.json`); final screenshot
      set in `docs/design/`; all gates green (424 unit @ 96.09/75.06,
      25 e2e, build, lint)

- [x] **D9** theming beyond AudioMass: **light theme** + 5 accents
      (cyan/teal/green/amber/magenta) via `<html data-theme data-accent>`
      token blocks; canvas palette moved to `--cv-*` vars with a
      version-checked cache so painters re-read on change; View menu
      toggles; persisted; AA gate 5/5 on light surfaces; unit + e2e
      (playback + reload persistence).
- [x] **D8** channel strips (G13 closed): per-channel **volume** (0..1.5)
      and **pan** (-1..1) sliders + M mute in AudioMass-style strips; engine
      graph splitter → gain → **StereoPanner** → merger with click-free
      10 ms setTargetAtTime ramps; unit + playback e2e. Also: Escape now
      closes the doctor + shortcuts dialogs (gap caught by re-verification).

- [x] **D10** interaction polish: delegated fixed-position tooltips
      (`data-tip` → styled chip with shortcut hints; escapes clipped
      ancestors; focus shows them too) + full-window drag-n-drop overlay
      with dashed accent frame. Lighthouse **99/100/100/100** holds
      (`docs/perf/lighthouse-d10.json`).

**D-series complete (D0–D10).** WaveForge wears the AudioMass design
system and exceeds it: per-channel mix strips, light theme + 5 accents,
shortcuts overlay, drop overlay, tooltips — on the stronger engine
(21 effects, LUFS, drafts+autosave, PWA, doctor, focus traps).
Remaining backlog is post-v1 roadmap (M8 multitrack, automation
package ADR 007, RNNoise).

## E-series — effect-engine advancement

- [x] **E7 NR v3 "natural voice"** (`docs/effects-nr-v3-plan.md`, grounded in
      the 2026 market analysis + estimation theory): new `fx.nr3` —
      IMCRA-lite adaptive noise tracking (speech-presence-gated λ) +
      Ephraim–Malah decision-directed a priori SNR (α=0.98) + floored
      Wiener gain with asymmetric temporal smoothing. **Narrowband
      protection** keeps the estimate out of speech/music: init
      tonality latch (>30× ±8-bin median minimum) + per-frame 4-tap
      (±6/±10-bin) local-median guard every 2nd frame. Print demoted to
      optional seed (auto mode needs no selection); `reduction` 0 = bit-
      exact bypass. Anchors: auto +6 dB SNR → ≥ +10; tone loss ≤ 1 dB;
      per-bin dB-flicker ratio ≤ 2.5; ≤4 dB frame jumps; gap floor held;
      stereo per-channel; determinism; 60 s stereo profile **2974 ms**
      (half-complex real-FFT pair). 11 kernel tests; legacy `fx.nrPrint`
      retained. E7b RNNoise "AI Voice" mode shipped below.
- [x] **E7b RNNoise "AI Voice Clarity"** (`docs/effects-nr-e7b-plan.md`,
      2026-09-25): vendored `@echogarden/rnnoise-wasm` **0.2.0**
      (BSD-3-Clause, `src/vendor/rnnoise/` + THIRD_PARTY_NOTICES row) as
      new kernel `fx.rnvoice` — the ML speech-separator lineage beside the
      statistical E7a engine, voice-first (never a default; degrades
      music). Contract: 480-sample frames @ 48 kHz mono, f32 in s16 scale,
      per-channel fresh GRU states, deterministic; non-48k round-trips the
      varispeed resampler with an exact-length law; **mix-only param**
      (0..1, step 0.01, default 1 — mix=0 bit-exact), static path for v1
      (∿ suppressed via `spec.curve=false`). **Streaming handle**
      (`createRnVoiceStream`) stitches bit-identically to one-shot through
      one state per channel (anchor-tested) — the worker migration seam.
      Worker deviation kept per plan §2 (main-thread; per-frame cost an
      order below the E7a WOLA engine). Dialog lazily loads the wasm on
      open (status line + retry; Preview/Apply disabled until ready).
      Gates: 9 unit (load/determinism/silence→zeros/≥6 dB drop/pitch via
      ACF lag + tone level + crossing convergence/chunk stitching/mix law/
      44.1k length/stereo) + 39th e2e (gate→apply→undo/redo, console-
      clean); full suite 666 unit (77 files) / 39 e2e / lint 0 / build OK.
      Commits: vendor+plan `ecd3751`, feat `f936f7a`, test `710542e`.

## M8 — multitrack (lanes, docs/multitrack-plan.md)

Analysis `docs/multitrack-analysis.md` (2026-09 market: BandLab 16-track/
15-min cap, Soundtrap ~5-track free tier, openDAW AGPL validates the
no-account lane; decision: lane-based single timeline, not clips).

- [x] **M8a** project core (`src/engine/project.ts`, `5e51993`): TrackState/
      ProjectState, deterministic mix kernel (fixed-order Float64 → single
      f32 round) + bit-exact reference, balance-law pan (center unity,
      hard side exact zero), classic mute/solo rule; 11 anchors; 6×3-min
      mix ≈ 400 ms (budget 500 uninstrumented)
- [x] **M8b** ProjectPlayback (`src/engine/projectPlayback.ts`, `d1384a8`):
      per-track source → splitter → L/R balance gains → shared merger,
      SAME kernels as mixdown (playback ≡ render parity), live τ=0.01 mix
      updates, loop regions, longest-track natural end; single-doc engine
      path untouched; 6 fake-ctx anchors
- [x] **M8c** AudioProjectEditor (`src/engine/projectEditor.ts`, `e568019`):
      trackId-tagged slice-op history + structural add/remove-track ops in
      one LIFO stack (History gains optional trackId/projectUndo/projectRedo);
      cross-track interleaved undo/redo bit-exact; 8 anchors
- [x] **M8d** lane UI (`src/app/components/TrackLanes.tsx` + `projectActions`
      bridge + `lanePeaks`/`undoPolicy`): ＋ Track opens the project (doc =
      lane 1, channels re-pointed live on doc edits); lanes mirror the doc
      view (cached envelope, cheap playhead), D8-language strips (name,
      vol/pan, M/S, guarded remove), import via file picker, click-to-
      activate, one Ctrl+Z chain across doc+project histories (timestamp
      rule, ties → doc); project transport (play/pause/stop/seek/loop)
      through ProjectPlayback; e2e add→import→solo→play→remove→undo
- [x] **M8e** persistence/io (drafts v2 `0130384`+): header v2 + per-track
      PCM block sequence (zod-validated `draftTrackSchema`); v1 drafts load
      forever; save/autosave/restore paths carry lanes (autosave re-encode
      preserves v2); mixdown export via the deterministic mix kernel +
      per-lane stem export (batch downloads, ID3 on stem 1); e2e
      save→reload→lanes-restored + mixdown/stems downloads. Record-into-
      track moves to M8f scope (recorder plumbing).
- [x] **M8f** effects on tracks (`fxTarget` routing): dialog effects (the
      full registry via EffectDialog — apply AND A/B preview) target the
      active lane ≥ 2 (kernel region processed on track channels, committed
      through the project history); lane 1 stays the doc path; NR print
      learn reads the active lane; **fresh loads close the project** (stale
      lane-1 fix) with draft-restore re-opening lanes; record with a
      project open lands the take as a NEW LANE (M4 new-doc behavior kept
      otherwise). Boundary: quick edit-menu commands (Gain/Fades/Normalize/
      Reverse/Invert/Remove Silence) route through `safeTrackEdit` — the edit
      routing sweep LANDED (lanes ≥ 2 commit through the project history).
- [x] **M8g** hardening + close: coarse lane envelope buckets
      (`laneBuckets`/`lanePeaksFromBuckets`, 256-sample) — zoom/pan reads
      ≈3 ms for 6×3-min lanes (build 184 ms per edit, cached per version);
      Lighthouse **99/100/100/100** with the lane stack shipped
      (`docs/perf/lighthouse-m8.json`); final gates: 484 unit (57 files) @
      96.23/75.47, 33 e2e, build ~1 s, lint clean.

**M8 complete (M8a–M8g).** WaveForge is a lane-based multitrack editor:
per-lane strips (gain/pan/M/S), import + record-into-project, A/B-previewed
effects per lane, deterministic mixdown (playback≡render parity) + stem
export, drafts v2 with lanes, unified undo across document and project
histories — still fully local, no account, no track cap. Deferred backlog:
clip/arrangement model (M9+), automation package (ADR 007), RNNoise mode
(E7b).

## M9 — clips/arrangement (docs/clips-plan.md; analysis docs/clips-analysis.md)

Market: region editing is the 2026 norm (BandLab regions: move/trim/split/
copy + per-region gain/fades). Decision: tracks hold sorted non-overlapping
clips referencing shared immutable assets (copy-on-write bounces for
destructive ops); every M8 lane becomes a single-clip track (compat, no
migration); sample-domain; MIDI/timestretch/overlaps rejected for v1.

- [x] **M9c** clip playback: pure pass expansion (`clipPlayback.ts`) +
      `startClips` (one source per audible clip, restart-on-loop, shared
      gain kernels + position math). 11 anchors; channels path untouched
- [x] **M9d** arrangement: M9d1 doc-model flip (channels → clips+assets,
      lanePcm fast path, setClips history, COW bounce routing) · M9d2
      interactions (select/move/trim/split S/Ctrl+D/Del, per-asset
      envelopes, drag preview → one history entry per gesture) · M9d3
      gate e2e (split→drag→undo×2→dup→play). 35 e2e total
- [x] M9e history/commands polish (interleave anchor) → M9f drafts v3 +
      export parity — SHIPPED (stamped in the M9 section below)
- [x] **M9a** clip core (`src/engine/clips.ts`): placement kernels
      (sorted insert w/ overlap refusal, split w/ offset accumulation,
      neighbour-clamped move/trim, duplicate, remove) + render kernels
      (stereo Float64 fixed-order render, region render for the bounce
      path, slow bit-exact reference). 13 anchors; render 60 s single-clip
      ≈ 75 ms, 200-clip ≈ 29 ms (budgets 120/400 uninstrumented)
- [x] M9b asset store + lane bridge → M9c clip playback → M9d arrangement
      UI → M9e history/commands → M9f persistence v3 + export parity —
      ALL SHIPPED (M9a–M9f stamped in the M9 section below)

## M8+ — post-v1 (see Build Plan §10 roadmap)

## 2026-09-25 — Automation package A1–A5 SHIPPED (A6 follow-up tracked)

- A1 kernel `d5049a8` · A2 model/history/mixdown `a7839b6`+`e2713d0`
  (bit-identity gate green) · A3 leg ramps `55a64e8`+`beb4110` ·
  A4 envelope UI `fe6cf9e`+`d463c70` · A5 drafts+37th e2e
  `ac56e65`+`f51a2e6`.
- Final: 596/596 unit (71 files), 37/37 e2e, lint 0, build 1.19 s,
  LH 99/100/100/100 (docs/perf/lighthouse-a5.json).
- A6 (effect-param automation: graph-kind ramps → kernel-kind) remains
  a separate follow-up per docs/automation-plan.md deviation note.
- LH recipe re-verified after restore: /tmp/lh-server.cjs regenerated
  (br q5, 404 non-nav, immutable /assets); ALWAYS verify br transfer
  via curl (~96.5 KiB this run) before trusting a number.

## 2026-09-25 (later) — A6 effect-param automation SHIPPED

- A6a graph-kind `5ebc9f2` (BuiltGraph.auto + scheduleFxAuto +
  renderEffectOffline curves) · A6b kernel-kind `7db91b6`+`4ec6967`
  (paramCurves → swept biquad bands, pgeq8 first).
- Gates: 614/614 unit (73 files), 37/37 e2e, lint 0, build 0.96 s.
- LESSON: per-sample cascaded biquads must fround at SECTION boundaries
  to stay bit-identical with the static whole-array path (array stores
  round; f64 locals don't). Automation package COMPLETE incl. A6;
  follow-ups: per-kernel curves (dynamics/modulation), FX envelope UI.

## 2026-09-25 (later still) — A6c dynamics curves SHIPPED

- `efbb473`+`030479f`: swept compressor / gate / true-peak limiter
  (audio-shaping params only), defs routed, 14 anchors.
- Gates: 628/628 unit (74 files), 37/37 e2e, lint 0, build 0.99 s.
- LESSONS: (1) sweepable = audio-shaping only; time constants stay
  static (anchored ignore). (2) test references must reproduce the
  kernel's intermediate f32 roundings (gate gains array) or bit anchors
  diverge. (3) physics scenarios need timescales ≫ the smoothing
  constants (a 100 ms release cannot close inside a 13 ms window).

## 2026-09-25 (latest) — A6d modulation + reverb2 curves SHIPPED — kernel set complete

- `0ddac9a`: modulationCurves.ts (5 swept kernels) + reverb2 per-sample
  mix (shared reverb2Wet extraction) + 6 def routings + 22 anchors.
- Gates: 650/650 unit (75 files), 37/37 e2e, lint 0, build 0.97 s.
- ALL kernel effects now take paramCurves. Scope rule holds: sweepable
  = audio-shaping only (rateHz/shape/stages/IR params stay static).
- Lessons: (1) physics heads need HOLD curves — a 0→1 sweep's first
  samples are interpolated, not 0. (2) extract shared wet paths
  verbatim (reverb2Wet) rather than re-running the static fn at mix 0/1
  and recombining. (3) keep new code out of files near the 400-line cap
  from the start (modulation split forced a refactor mid-phase).

## 2026-09-25 (final) — A7 FX envelope authoring SHIPPED — automation project COMPLETE

- `a5abbc2`+`5ca6655`: ∿ toggle + envelope canvas in the effect dialog;
  curves via ctx.paramCurves into preview AND apply (baked); graph
  preview schedules on the live graph; 38th e2e author→apply→undo→redo.
- Gates: 657/657 unit (76 files), 38/38 e2e, lint 0, build 0.99 s.
- COMPLETE: A1 kernel → A2 model/render → A3 playback → A4 track UI →
  A5 drafts → A6a–A6d FX curves (graph + every kernel) → A7 authoring.
- Lessons: generalize primitives BEFORE cloning them (A4 → A7 needed
  domain-parametric variants; delegation kept old anchors green);
  author curves at the DIALOG because effects are offline bounces —
  nothing new to persist.

## 2026-09-25 (verification) — post-A7 Lighthouse re-run

- 98/100/100/100 (gate ≥95/95/100/100 MET). FCP 1.6 s, LCP 1.9 s, br
  transfer 99.3 KiB (A5: 96.5 KiB → +2.8 KiB for A6 kernels + A7 UI).
- Perf dip 99→98 is FCP/TBT timing variance + the new bytes; no new
  flags (unused-js 73 KiB = pre-existing FLAC decode path).
- Artifact: docs/perf/lighthouse-a7.json. Recipe lesson re-confirmed:
  plain-curl `/` 404s by design (non-nav); verify with nav headers
  (Sec-Fetch-Dest: document) or just trust the LH run itself.

## 2026-09-25 (E7b) — RNNoise "AI Voice Clarity" SHIPPED

User-selected from the post-A7 candidate menu (rnnoise / fx_chains /
automation_polish / other). `fx.rnvoice` shipped per
`docs/effects-nr-e7b-plan.md`: vendored RNNoise 0.2.0 (BSD-3-Clause),
mix-only static kernel, lazily wasm-loaded dialog with readiness gating,
9 contract gates + 39th e2e, streaming handle as the worker seam
(main-thread deviation documented). E7b note in §11 v1 deltas un-parked
(stretch still parked). Full gates at ship: **666/666 unit (77 files),
39/39 e2e, lint 0, tsc clean, build OK**.

## 2026-09-25 (verification) — post-E7b Lighthouse re-run

Three runs of the shipped E7b build: **96 / 99 / (A7 baseline 98)** perf,
a11y/bp/seo 100/100/100 in all — gate ≥95/95/100/100 MET. The perf spread
is pure TBT throttling variance (150→190→50 ms on the SAME build); FCP
1.6 s, LCP 1.9 s, SI 1.6 s, CLS 0 identical everywhere — the main path is
untouched by E7b (vendor js + wasm are lazy chunks loaded only on dialog
open; `rnnoise-*.wasm` 125 713 B ships as its own asset). Artifact
`docs/perf/lighthouse-e7b.json`.

## 2026-09-25 (C1) — FX chain model SHIPPED

C-series opened (`docs/fxchains-analysis.md` + `docs/fxchains-plan.md`:
market = RX Module Chains / Audacity Macros / per-effect-preset web DAWs;
decision = serial rack + built-in recipes incl. **Voice rescue**
(`fx.rnvoice → fx.deesser → fx.compressor`) + shareable JSON). C1 pure
model `src/fx/chain.ts`: zod boundary (`parseChain`, cap 16, bool-coercing
bypass), registry-validated params (clamps + defaults = single source of
truth), `foldChain` with injected stage runner (bypass skips bit-exactly,
all-bypassed = identity, length-changing stages flow through),
`exportChain` stable JSON. 10 gates (parse ×5, fold ×5) RED→green;
full suite **676/676 unit (78 files), lint 0, tsc clean**. Next: C2 rack
UI + apply (one history entry), C3 presets, C4 e2e.

## 2026-09-25 (C-series) — FX Rack + presets SHIPPED (C1–C4)

User: "do as your best" → post-E7b LH verified (96/99, TBT variance; gate
met, `docs/perf/lighthouse-e7b.json`), then the chains project opened per
`docs/fxchains-analysis.md` (RX Module Chains / Audacity Macros precedent;
web DAWs stop at per-effect presets; AudioMass has neither).

- [x] **C1** chain model (`src/fx/chain.ts`, `4d3d18e`): zod boundary
      (`parseChain` — shape + cap 16 + registry-validated params, clamps/
      defaults as the single source of truth), pure `foldChain` (bypass
      skips bit-exactly, all-bypassed identity, length changes flow),
      stable `exportChain` JSON. 10 gates.
- [x] **C2** FX Rack (`d94727a`): `foldChainAsync` (graph stages offline
      per stage); `applyChain` = ONE history entry for the whole chain
      (region + SUMMED stage tails; lane target honored); whole-chain A/B
      preview via the def-less PreviewPlan; `FxRackDialog` (expand/param
      rows/reorder/bypass/remove, add from the registry); `fx.rack`
      command first in the Effects menu.
- [x] **C3** presets (`d94727a`): built-ins **Voice rescue**
      (`fx.rnvoice → fx.deesser → fx.compressor` — E7b compounds),
      Podcast polish, Master glue, Warm air (defaults-merged, validated);
      per-effect quick presets in EffectDialog; user presets in idb
      (`waveforge-presets` v1, drafts precedent) + chain JSON import/
      export. rnvoice chains auto-ensure the model.
- [x] **C4** e2e (`e90f016`): 40th (add/reorder/bypass/preview/apply once/
      undo/redo, console-clean) + 41st (Voice rescue applies from the
      preset select; undo). Gates: **683/683 unit (80 files), 41/41 e2e,
      lint 0, tsc clean, build OK, LH 98/100/100/100**
      (`docs/perf/lighthouse-c2.json`).

Non-goals held: parallel/sidechain routing, per-entry automation curves
(seam = paramCurves), preset cloud sync.

## 2026-09-25 (C5) — per-entry chain envelopes SHIPPED

The documented C-series seam closed: stage runners receive the entry
index (`foldChain`/`foldChainAsync` 5th arg); `ChainCurves` (entry idx →
param → curve) threads `EffectRunContext.paramCurves` into kernel stages
and the offline schedule into graph stages; rack rows carry ∿ toggles
(`FxCurveEditor curveKey` scoping, `${index}:${param}` namespaces,
re-numbered on move/remove, reset on preset load). 42nd e2e: tremolo
depth curve authored on a rack entry → apply → undo/redo. Flake
hardening: the rack Add select is uncontrolled (background re-renders
snapped the controlled value back to '' between select and Add — root
cause of a full-suite flake; 3 consecutive green suites after). One
pre-existing flake observed once (`effects.spec` experimental-stretch
flow) — passed every run since, watch-listed. Gates: **685/685 unit
(80 files), 42/42 e2e, lint 0, tsc clean**. Commit `f455033`.

## 2026-09-25 (X-series) — accessibility audit + permanent axe gate SHIPPED

Post-C-series hardening (`docs/quality-analysis.md` + `docs/quality-plan.md`):
axe-core 4.13.0 (MPL-2.0, dev-only) run in the real app over wcag2a+wcag2aa
found 4 critical naming failures — ALL in the new dialog work (`.fx-num`
co-inputs in the shared ParamRow; the quick-preset select; rack presets +
add selects), plus meaningless arrow-glyph names on rack row buttons. Main
page / welcome / Modal base: already clean (Modal had focus trap + restore
from day one). **X1** fixed every finding at the component level (i18n keys
rackMoveUp/rackMoveDown/rackRemove added; visible UI unchanged). **X2**
promoted the audit to the **43rd e2e (4 scenarios: main page, welcome,
compressor dialog, populated rack + envelope editor — zero violations of
any impact, suite-failing)**. Gates: **685/685 unit (80 files), 46/46 e2e,
lint 0, tsc clean, LH 98/100/100/100** (`docs/perf/lighthouse-x.json`).

## 2026-09-25 (X3) — envelope keyboard operability + Tab defect SHIPPED

X-series follow-through (`docs/quality-plan.md` X3): envelope canvases are
keyboard-operable — Tab + focus ring, arrow nudge (Shift = fine), Enter/
Space insert (neighbour / initial midpoint), Delete remove, Escape
deselect; selection ring on canvas, shared with pointer gestures; pure
helpers over the A4 kernels (5 unit gates RED→green) + **44th e2e**
(keyboard-only authoring flow). **Defect fixed en route:** the global
keyboard glue swallowed bare `Tab` (legacy "center view") — the whole app
was un-tabbable, dialogs included; binding removed (catalog unchanged —
it was never in the shortcuts table). Gates: **690/690 unit (81 files),
47/47 e2e, lint 0, tsc clean**.

## 2026-09-25 (Y-series) — gap closure SHIPPED (Y1–Y4)

Gap analysis executed end-to-end (`docs/gap-analysis.md`):
- **Y1** truth sweep: M9 scheduling boxes resolved; ADR 005 automation
  deviation resolved (A7); e2e flow #1 resolved; effects-v2 parked list
  updated (RNNoise/multitrack/clips SHIPPED); the M8f quick-edit boundary
  marked LANDED (`safeTrackEdit` routes lanes ≥ 2 — verified in code);
  **README.md** (dev/test/deploy/rebrand + browser matrix); **vercel.json**
  SPA rewrite + CSP Report-Only (enforcing flip needs a Vercel-preview
  pass).
- **Y2** `docs/acceptance-trace.md`: every PRD criterion → evidence.
  New `acceptance.test.ts` with CORRECTED undo economics — entries charge
  both edit sides (~2× region bytes), so ≥100 steps hold for average
  stereo regions ≤ ~3.3 s; graceful `minKeep` degradation pinned.
- **Y3** cross-browser: **Firefox 155: 44/45, WebKit 26.6: 43/45** — zero
  app-level engine failures (mic specs = Playwright fake-media is
  Chromium-only; WebKit offline `reload()` = known harness quirk; Firefox
  passes the SW flow). `playwright.other.config.ts` + README matrix.
  Remaining: one manual Safari check on the live deployment (user-side).
- **Y4** flake: un-reproduced (10 standalone + 2 full-suite runs clean
  after re-baselining); menu steps hardened assert-then-click; watch-list
  stays. Also fixed en route: the acceptance test's private-field access
  broke the build's tsc gate (caught by the webServer failing — gate order
  restored).
Gates at close: **692/692 unit (82 files), 47/47 e2e + 87/89 cross-browser,
lint 0, tsc clean, build OK.**

## 2026-09-25 (Z-series) — stretch promoted + platform posture SHIPPED

- [x] **Z1** Stretch/Pitch promotion: WSOLA `fx.stretch` is a first-class
      Effects-menu item; the `experimentalFx` gate machinery (signal,
      persistence, `view.experimental` command + View-menu entry, i18n
      key, MenuBar filter) removed wholesale. Rationale: E5 is the most
      heavily anchored kernel in the registry (bit-exact ×1, exact-length
      laws, pitch ±0.5 %, click grid ±2 ms, stereo bit-identity, bounded
      NaN runs, 60 s stereo profile ≈ 1.1–1.2 s) with months of e2e
      mileage. e2e rewritten to the promoted flow.
- [x] **Z2** platform posture written down (gap A2): README "Platforms" —
      desktop-first by decision; pointer events + `touch-action: none`
      give functional basic touch; phone-optimized layout out of scope
      (AudioMass-aligned). PRD + ADR 005 status lines updated.
- [x] **Z3** gates: full suite + lint + tsc + build green at close.

## 2026-09-25 (P-series) — professional analysis report SHIPPED

User ask: professional Analyze features from marketplace analysis
(`docs/analyze-analysis.md`: 2026 loudness targets — Spotify/YouTube/
Amazon/Tidal −14, Apple −16, Deezer −15, EBU −23, Netflix −27/−2 dBTP;
RX/Auphonic-style one-scan audits with jump-to-offender).

- [x] **P1** `src/engine/analysisReport.ts` — one pure scan: LUFS
      integrated/momentary/ST + **LRA** (EBU percentiles, momentary-block
      approximation documented) + **PLR**; stereo correlation (gated
      50 ms blocks) + mid/side %; integrity (clipped samples/runs + first
      run, DC per channel, sample peak); 10-octave FFT balance; noise
      floor/SNR/silence. `STREAM_TARGETS` + `verdicts()` (gain-to-target,
      TP-safe flag). 8 analytic anchors (EBU parity with the lufs.test
      anchor, LRA segments, correlation ±1/≈0, exact clip/DC, band
      concentration, mono/44.1k/determinism).
- [x] **P2** worker protocol + `runFullReport` (busy 'report') +
      **jump-to-offender** (`selectFirstClippedRun`) + AnalysisPanel
      report block (metrics row, verdict chips with ✓/✗ TP flags, balance
      bars, select button) + Analyze → Full report command.
- [x] **P3** 48th e2e: generated clipped wav → full report → LUFS format +
      verdict chips + runs detected + select-first-run → toast, console-
      clean. Caught en route: short clip runs smear under decode/resample —
      fixture uses long flat runs; CLIP_EPS 1e−4.

Gates: **700/700 unit (83 files), 48/48 e2e, lint 0, tsc clean, build OK.**

## 2026-09-25 (P4) — report export SHIPPED

The report is deliverable (the engineers-attach-reports-to-masters loop):
`src/engine/reportExport.ts` — CSV (header, exactly 4 fields per row =
locale-safe dot decimals, every section + per-platform gain/tp_safe
verdict rows, Inf → -Inf/+Inf, deterministic) and a readable clipboard
text summary. ReportBlock: Export CSV (blob download `analysis-report.csv`)
+ Copy report (clipboard + confirmation toast, graceful failure). 4 unit
gates + **49th e2e** (download content assertions via the real download
file + clipboard readback with granted permissions). Gates: **704/704
unit (84 files), 49/49 e2e, lint 0, tsc clean, build OK.** `94efdf2`.

## 2026-09-25 (R-series) — studio recording SHIPPED

`docs/recording-analysis.md` (market audit: BandLab/Soundtrap/punch
workflows) → `docs/recording-plan.md` → executed:

- [x] **R1** arm/roll split: RecorderEngine `open/beginCapture/disarm`
      (+engine-side capture gate); armed state = mic open + live peak-hold
      meter + latching clip LED BEFORE rolling; input monitoring toggle
      (feedback-safe default OFF, wired-headphones warning on first arm).
- [x] **R2** count-in + metronome: pure `metronome.ts` clickSchedule
      (40–240 clamped, seamless negative grid), 4·3·2·1 on-screen beats,
      accent/beat oscillator clicks (1320/880 Hz) on the shared context;
      settings persisted (bars 0–4, click volume, manual/detected BPM).
      `M` toggles the metronome (BandLab parity).
- [x] **R3** takes: pure `takes.ts` reducer (append/keep/discardLast) +
      takes strip in Record settings + discard-last.
- [x] **R4** punch in/out: pure `punch.ts` punchPlan (playFrom clamp,
      count-in lead-in, empty-selection guard); selection + monitoring →
      count-in → 1.5 s pre-roll playback → capture between the edges →
      ONE undoable `makeOverwritePaste` edit (non-destructive). `P`
      shortcut; auto-arms; monitoring enforcement toast.
- [x] **R5** e2e: #50 studio flow (arm → meter → monitor → roll → take →
      takes list → metronome persistence), #51 punch (undo restores,
      redo re-applies). Escape now also closes record settings + cancels
      count-in. Legacy one-click record tests migrated to arm→roll.

Gates: **714/714 unit (85 files), 51/51 e2e, lint 0, tsc clean, build OK.**

## 2026-09-25 (R-follow-up) — Effects menu organized SHIPPED

The 30-item Effects wall is now 9 labelled sections (professional DAW
convention): Dynamics / Noise reduction / EQ / Reverb & delay / Modulation
/ Distortion / Time-pitch / Amplitude / Special, with FX Rack pinned at
the top. Machinery: `MenuItemDef` gains `{header, items}` groups + pure
`foldMenuItems`; MenuBar renders `role=group` sections (axe-clean, AT-
labelled headers) with grouped item indent. Unit: menu consistency +2
(g11 no-duplicate/complete grouping, g12 fold shape). E2e #52: headers
visible, Dynamics group labelled, deep scrollable item fires. Gates:
**716/716 unit (85 files), 52/52 e2e, lint 0, tsc clean, build OK.**

## 2026-09-25 (R6) — punch in projects + configurable pre-roll SHIPPED

Closed the flagged follow-up: with a project open, punch now (a) plays
the pre-roll through the PROJECT transport (hear the mix, not engine.doc),
(b) splices the ACTIVE LANE through activeTrackTarget ->
makeOverwritePaste -> commitTrackChannels (one project-history entry —
undo/redo verified in e2e), (c) stops any running transport first.
Punch pre-roll became a persisted studio setting (0.5/1/1.5/2/3 s,
clamped 0.5–3, selector in Record settings). New e2e #53 (project punch:
lane activation -> select-all -> punch -> undo restores -> redo
re-applies -> pre-roll persists across reload, console-clean).
Lighthouse re-check: desktop **100/100/100/100**; mobile 87 perf = FCP
under emulated slow-4G (TBT 70 ms, CLS 0, lean 376 K main chunk) —
main-chunk splitting noted as a future optimization, not a regression.
Gates: **716/716 unit (85 files), 53/53 e2e, lint 0, tsc clean, build OK.**

## 2026-09-25 (perf audit) — mobile Lighthouse resolved: server artifact

The mobile 87 reported with R6 was an artifact of the local LH test
server serving UNCOMPRESSED bytes (Lighthouse itself flagged "use text
compression, ~281 KiB"). Re-run with production-grade gzip (as Vercel
serves by default): **mobile 97/100/100/100** (FCP 1.72 s, LCP 1.90 s,
TBT 141 ms) alongside desktop 100/100/100/100. No code change needed —
the app meets the ≥95/95/100/100 gate in both form factors on real
deploy targets. Main-chunk splitting stays optional polish.

## 2026-09-25 (fix) — Effects dropdown text clipping SHIPPED

Root cause (inspect-first): the dropdown is abspos inside the narrow
`.menu` wrapper with a hand-computed `min-width: 232px` (sized for the
pre-grouping labels), and `.menu-label` carried
`nowrap + overflow:hidden + text-overflow:ellipsis` — long names
("Noise Reduction v3 (natural voice)…", "AI Voice Clarity (RNNoise)…")
were ellipsized; below ~550px the uncapped box also ran off-screen.
Fix (container level, no truncation): `.menu-dropdown` is now
content-aware — `width: max-content; min-width: 232px;
max-width: calc(100vw - 16px)` — labels dropped nowrap/hidden/ellipsis
(wrap fully only when the viewport cap binds), and MenuDropdown gained a
~10-line right-edge clamp (shift left just enough, never past the left
margin; vertical space stays max-height + internal scroll). No
positioning dependency added; design/hierarchy/hover/focus untouched.
e2e #54: all 5 longest labels asserted readable at
1920/1440/1280/1024/768/600/480/375 (scrollWidth≤clientWidth per label
AND per dropdown, box inside viewport, one-line at ≥768, no menu-induced
page h-scroll). Gates: **716/716 unit, 54/54 e2e (axe clean), lint 0,
tsc clean, build OK.**

## 2026-09-25 (fix) — Effects labels: trailing ellipsis removed SHIPPED

User read-out: the menu was not clipping at all — every `fx.*` label
carried a literal trailing `…` (the "opens a dialog" desktop convention),
which read exactly like truncation ("Compressor…"). Removed the suffix
from all 26 Effects-menu labels (i18n en.ts only — File menu and progress
messages untouched). Visual proof via screenshot: clean single-line names
("Compressor", "Noise Reduction v3 (natural voice)"). Gates: 716/716
unit, 54/54 e2e, lint 0, tsc clean, build OK.

## 2026-09-25 (redesign) — Transport bar zones SHIPPED

Marketplace-informed reorganization of the crowded single transport row
into seven labeled zone panels (Audition/BandLab pattern): TRANSPORT /
POSITION / EDIT TOOLS / SELECTION / BEAT GRID left, RECORD / MASTER
right-anchored via the spacer. Mechanics: `Zone` wrapper (`section`
role=group + aria-label + micro-caption), legacy inner group chrome
(borders/gradients/46px height) flattens inside the zone frame; selection
"Selection:" title dropped (zone caption covers it), clear button compact
(✕, aria unchanged); captions hidden <1024px; records cluster finally
lives in its own right-side panel. Axe caught two REAL contrast issues
en route (9–9.5px labels on decoration-only --fg-2): tz-cap/sel-label/
sel-clear/strip-lab now --fg-1 (AA). e2e #55: zones labeled + ordered,
RECORD right-anchored, clock visible, per-size (1920→375) reachability +
no-clip at 1920 + record controls visible everywhere. Gates: **716/716
unit, 56/56 e2e (axe zero violations), lint 0, tsc clean, build OK.**

## 2026-09-25 (redesign r2) — Position-first order + separated Stop/Pause

User-directed layout: (1) TIME DISPLAY leads the bar, (2) TRANSPORT =
seek-start / play / loop / record / seek-end, (3) STOP + PAUSE in their
own separated zone. New actions: `transport.pause()` (project + doc
routed) and dedicated seek-start/seek-end buttons — seek/nudge now route
PROJECT playback too (pre-existing gap: keyboard End/Home only worked in
doc mode). Pause disables while stopped, enables during playback; play
button never double-fires during playback (pause owns that state).
testids: transport-play/transport-pause/transport-stop/transport-seek-
start/transport-seek-end. e2e #55 updated: zone ORDER asserted
(Position < Transport < Stop/Pause < Edit tools), pause state machine
exercised live. Gates: **716/716 unit, 56/56 e2e, lint 0, tsc clean,
build OK.**

## 2026-09-25 (redesign r3) — blended bar, standalone play, ±5 s seeks

User-directed refinements: (1) zones BLEND — hairline separators replace
the boxy cards (lighter, professional); (2) PLAY is a standalone
prominent zone — big lit accent button that toggles play/pause with
icon + aria-pressed state (labeled plain "Pause" while playing to avoid
ambiguity with the dedicated pause); (3) seek buttons now step the
cursor ±5 s (double-triangle glyphs, Back 5 s / Forward 5 s, clamped)
instead of jump-to-ends; seek-start/seek-end testids preserved on the
step buttons, jump-to-end remains via the End key / SelectionBar. e2e
#55 rewritten: order (Position < Play < Transport < Stop/Pause), play
aria-pressed state machine, ±5 s clock assertions (duration-aware),
RECORD right-anchored. One flaky full-suite run traced to load timing
(multitrack "add lanes"); passes consistently across re-runs. Gates:
**716/716 unit, 56/56 e2e, lint 0, tsc clean, build OK.**

## 2026-09-25 (gates) — Lighthouse after transport redesign r3

Standing LH gate re-run on the final blended-transport build (gzip
server): **desktop 100/100/100/100**, **mobile perf 98** (FCP 1.72 s,
TBT 75 ms, CLS 0) — up from 97 pre-redesign; the zone markup added no
measurable weight. UI-quality gates complete: 716/716 unit, 56/56 e2e,
axe zero violations, lint 0, tsc clean, build OK, LH ≥95/95/100/100.

## 2026-09-25 (feature) — professional export format chooser SHIPPED

New `src/io/exportFormats.ts`: code-level catalog (single source) — three
format cards (WAV/MP3/FLAC) with Lossless/Lossy badges + use-case lines,
labeled quality presets with per-preset hints (16/24/32f = CD/master/
DAW-native; 128–320 = voice→transparent; FLAC 0–8 = fastest→smallest)
and professional defaults (24-bit master, 320 kbps, level 5). Export
dialog rebuilt: accessible radiogroup cards (role=radio, keyboard +
AT), quality select driven by the catalog with live hint, estimate
bolded + sample-rate row; card CSS (grid, badges, selected glow,
single-column <640px). Encoder service unchanged (workers/cancel/
progress/FSA/ID3 all intact). Unit g1–g3 (catalog invariants); e2e #57
(cards, defaults, hints, estimate reacts 320>128, labeled FLAC levels);
legacy #26/#48 specs migrated off the removed #export-format dropdown.
Gates: **719/719 unit (86 files), 57/57 e2e, lint 0, tsc clean,
build OK.**
