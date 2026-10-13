# Audit Evidence Log

One entry per verification. Fields: ID · date/time (Asia/Dhaka, UTC+6) · Git SHA · environment · command · result · evidence · criteria · reviewer · limitations.

## E-001 — Phase 0 baseline gate
- **ID/task:** P0.3 · **Date:** 2026-10-13 ~11:00+06 · **SHA:** `22b6aba17449df91aa358f32b864f78218dac35a`
- **Environment:** Debian 13 sandbox, Node v20.20.2, npm 10.8.2, Chromium 153.0.8010.12 (Playwright build 1243), 2 GB RAM
- **Commands + results:**
  - `npm ci` → exit 0, 12.7 s
  - `npm run typecheck` → exit 0, no errors
  - `npm run lint` → exit 0, no findings
  - `npm run test` → `Test Files 86 passed (86)` / `Tests 720 passed (720)`
  - `npm run build` → exit 0 (tsc + vite build)
  - `npm run validate:encoders` → "MP3 128 kbps — 16718 bytes, frame sync true" (128/192/256/320 ✓) + "FLAC is validated in-browser by tests/e2e/export.spec.ts" + "node encoder checks passed"
  - `npm run e2e` → `59 passed (2.0m)`
  - Lighthouse (localhost:4179 preview): desktop `performance 100 accessibility 100 best-practices 100 seo 91`; mobile `performance 99 … seo 91`
  - `gzip -c dist/assets/index-*.js | wc -c` → `120084`
- **Evidence:** captured in session transcript; summarized in `BASELINE.md` § Baseline gate results
- **Criteria:** baseline is real and reproducible ✓ · no fixes made in Phase 0 ✓
- **Reviewer:** agent (self) · **Limitations:** Lighthouse run against localhost preview (not the production URL); 1 run per form factor (WF-016 formal measurement = 3 runs in Phase 4)

## E-002 — Production deployment facts (P0.6)
- **Date:** 2026-10-13 · **Target:** https://waveforge-chi.vercel.app/ · **SHA:** n/a (live deployment)
- **Commands:** `curl -sI` (headers); headless-Chromium capture script (console listeners, request log, `navigator.serviceWorker.getRegistrations()`)
- **Results:**
  - Headers: `content-security-policy-report-only: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' data: blob:; font-src 'self'`; `x-content-type-options: nosniff`; `x-frame-options: SAMEORIGIN`; `referrer-policy: strict-origin-when-cross-origin`; HTTP/2 200
  - Live load: origins = `https://waveforge-chi.vercel.app` only (5 requests); console errors 0; CSP console violations 0; service workers registered 1
- **Evidence:** transcript capture; BASELINE.md § Production live facts
- **Limitations:** deployment↔commit tie NOT RUN (no Vercel API token); single load pass (no interaction pass — later phases)

## E-003 — AudioMass reference inventory (P0.7)
- **Date:** 2026-10-13 · **Source:** https://audiomass.co/ (landing page menu inventory, fetched)
- **Result:** documented feature surface: Export/Download, Load from Computer/URL/Sample, New Recording, Save/Open Local Drafts; Edit (Undo/Redo/Select All/Deselect/Channel Flip/**Seamless Loop**/Zero-Cross); Effects (**Gain, Fade In, Fade Out**, Noise Reduction (Voice), Paragraphic EQ, Compressor, Normalize, Graphic EQ ×2, Hard Limiter, **Delay**, Distortion, Reverb, **Audio Repair**, Speed Up/Slow Down (pitch), Speed/Playback Rate, Reverse, Invert, Remove Silence); View (analyser/spectrum/multitrack/tempo tools/ID3); Multitrack (mute/solo/volume/pan, rec trigger); beat markers + snap + BPM/time signature; zoom/pan keys.
- **Criteria:** parity matrix seeded with all 16 rows UNVERIFIED ✓
- **Limitations:** behavior-level verification (markers `M`/`[`/`]`, fade handles, crossfade, repair tools) deferred to Phase 5 where original + WaveForge are exercised with fixtures; static-menu inventory is context, not parity proof.

## E-004 — P0.5 classification reads
- **Date:** 2026-10-13 · **SHA:** `22b6aba` · **Method:** direct source reads (file:line in BASELINE.md § P0.5)
- **Key runtime facts measured:** installed Preact = `10.29.8` (`require('preact/package.json')`); no `twimg|cdn` in `src/` (avatar localized by `22b6aba`); no URL-import code; `fake-indexeddb` referenced only in src comments; FLAC worker imports `/vendor/libflac.min.wasm.js`; cancel watcher `setTimeout` chain at `exportService.ts:139-147` has no teardown.
- **Reviewer:** agent (self) · **Limitations:** static classification — every row still requires the per-task cycle (repro/test/fix) before any status change.

## E-005 — WF-001 export lifecycle fix
- **ID/task:** WF-001 · **Date:** 2026-10-13 (Phase 1) · **SHA:** `c737d67` (branch `audit/remediation`)
- **Environment:** Debian 13 sandbox · Node v20.20.2 · vitest 5 · Chromium 153 (Playwright 1243, `LD_LIBRARY_PATH=~/pw-libs/...`)
- **Command:** `npx vitest run tests/unit/io/exportService.lifecycle.test.ts` (RED: **6 failed / 4 passed** — failures = 1 pending timer after success/error/startup-failure, dead `cancel` post on late signal, isolation timer leak; GREEN: **10/10**) → `npm run test` (**730/730**, 87 files; baseline 720/720/86) → `npm run e2e` (**59 passed**, 2.1 m) → `npm run build` (OK) → `npm run typecheck` + `npm run lint` (clean)
- **Original failure mode:** `driveWorker`'s cancel watcher was a self-rescheduling `setTimeout(watch,120)` chain with no handle/stop flag; `cleanup()` never stopped it, so each worker export leaked one immortal timer retaining `job` (channel Float32Arrays + Worker) forever; a late flip of the caller's signal (retained globally in `S.exportCancel`) posted `{cmd:'cancel'}` into a terminated worker. Settle-once and single-cancel-post were already correct — now pinned by tests.
- **Fix:** explicit `watchTimer` + `watchStopped`; `stopWatcher()` called from `cleanup()` (all 4 terminal paths). Diff: 14+/2−, `src/io/exportService.ts` only.
- **Acceptance criteria:** all met (criterion-by-criterion in session log): idempotent cleanup ✓, timers+listeners cleared on success/error/cancel/startup ✓, terminate ✓, late messages ignored ✓ (T6/T9), settle-once ✓ (T6/T7), meaningful errors ✓ (T2/T8), no download on cancel ✓ (T10 + caller gate `exportActions.ts:103` + e2e export.spec), A↔B isolation ✓ (T9).
- **Gap & Error Sweep (H):** criterion proof ✓; adversarial (pre-cancelled/mid/late cancel, duplicate messages, concurrent exports — all tested; empty/oversized input and offline = n/a at lifecycle level); sibling search = pattern unique to this file (grep; `exportActions:172` batch loop uses same signal correctly, breaks on cancel); full regression ✓ (730/730, 59/59, build); consistency ✓ (ARCHITECTURE "cancelable jobs" now accurate; no timing claims in docs); diff hygiene ✓ (2 files, no debug/skips).
- **Remaining gaps (owned, not open defects):** (1) a worker that hangs without emitting `onerror` leaves the promise unsettled — pre-existing, bounded by worker-loop correctness (frames-bounded); revisit if ever observed; (2) header comment "return transferables" is inaccurate — owned by WF-002; (3) WAV path ignores the cancel signal (synchronous) — owned by WF-003.
- **Reviewer:** agent (self), independent diff re-read per 5.2-G
- **Limitations:** unit tests use a FakeWorker double (real workers covered by e2e export specs + validate:encoders)

## E-006 — WF-002 buffer ownership + opt-in transfer
- **ID/task:** WF-002 · **Date:** 2026-10-13 (Phase 1) · **SHA:** `6bd43b3` (branch `audit/remediation`)
- **Environment:** Debian 13 sandbox · Node v20.20.2 (measurements with `--expose-gc`) · vitest 5 · Chromium 153 (Playwright 1243)
- **Ownership map (audited):** canonical AudioDocument channels → full-range export passes refs (boundary CLONE — required, never transferred); range export passes `sliceRegion` copies (now transferred via `transferChannels:true`); stem export may hit the `trackChannels` zero-copy fast path (asset PCM refs) → clone kept deliberately; mixdown = fresh accumulation arrays (clone kept, minimal-change discipline); `PeakClient` slices then transfers; `analysisActions.channelCopies()` slices then transfers with clone fallback (sibling idiom, verified safe); worker results transferred back `[out.buffer]`; WAV main-thread (WF-003).
- **Measurement (Node 20, --expose-gc, median of 5, 120 s stereo 44.1 kHz = 40.4 MB payload):** structuredClone boundary 46.4 ms (peak RSS +40 MB during copy) · current range path (slice+clone) 71.8 ms · NEW range path (slice+transfer) 22.1 ms (~3.2×; ~20 MB transient copy eliminated) · slice alone 20.2 ms. Browser numbers will differ; mechanism comparison recorded honestly; no product-level performance claims made.
- **Commands + results:** RED `npx vitest run tests/unit/io/exportService.buffers.test.ts` → 4 failed (missing transfer semantics) / 3 pins green (2 test-double bugs fixed during authoring: missing terminate(), f32-literal equality — test-side only) → GREEN 8/8 · full suite `npx vitest run` → **738/738** (88 files; baseline 720/720/86) · `npm run build` OK · `npm run e2e` → **59 passed (2.1 m)** (after env repairs: browser re-download + SONAME symlink recreation in ~/pw-libs — environment-only, documented in BASELINE) · tsc + eslint clean.
- **Fix:** `ExportJob.transferChannels?: boolean` (default = clone, byte-identical behavior); transfer lists built only from caller-declared exclusive buffers (mono-aware); `driveWorker` posts with/without list; `exportActions` opts in only for the sliceRegion branch; MEMORY.md §5 rewritten from false claims to measured truth.
- **Acceptance criteria:** ownership documented ✓ · no source corruption/detachment ✓ (pinned) · audio-content tests pass ✓ (byte-identical payloads; existing wavEncoder reference + e2e export specs) · memory measured ✓ · independent memory-safety review done ✓ (diff re-read; multitrack aliasing risk found and avoided).
- **Gap & Error Sweep (H):** criteria proved ✓; adversarial (mono/empty channels, pre/mid/late cancel, concurrent exports) ✓; sibling search → analysisActions verified safe (same idiom), peaks.worker/own buffers ✓; full regression ✓; consistency ✓ (MEMORY matches code; ARCHITECTURE "transferable" claims now true or owned by WF-005 sweep); diff hygiene ✓ (3 files).
- **Remaining gaps (owned):** WAV main-thread → WF-003; octet-stream result MIME → WF-010; hung-worker settle (pre-existing, documented at E-005).
- **Reviewer:** agent (self), independent diff re-read per 5.2-G
- **Limitations:** transfer detachment itself is engine behavior (HTML spec) — the unit double records the list; real end-to-end covered by e2e export specs (range + full range) in Chromium.

## E-007 — WF-003 WAV encoding moved off the main thread
- **ID/task:** WF-003 · **Date:** 2026-10-13 (Phase 1) · **SHA:** `356099c` (branch `audit/remediation`)
- **Environment:** Debian 13 sandbox · Node v20.20.2 · vitest 5 · Chromium 153 (Playwright 1243, headless shell)
- **Before (measured):** main-thread blocking in node (median of 5, 120 s stereo 44.1 kHz): pcm16 **133.7 ms**, pcm24 **137.0 ms**, float32 **1160.9 ms**; in-browser (Playwright + PerformanceObserver longtask, 120 s stereo pcm16 fixture dropped via filechooser, real export click): **{count: 1, total: 225 ms, max: 225 ms}**.
- **After (measured):** same in-browser measurement: **{count: 0, total: 0, max: 0}**. Main-thread work moved into `src/workers/wavExport.worker.ts` (65,536-frame chunks, real progress, cancel between chunks, transferable result).
- **Commands + results:** RED `npx vitest run tests/unit/io/exportService.wav.test.ts` → **6/6 failed** pre-fix (no worker, no cancel — inline encode resolved despite cancelled signal, synthesized progress) → GREEN 6/6 post-fix · NEW `tests/unit/io/wavEncoderChunked.test.ts` **6/6** (byte-identity vs golden monolithic across pcm16/pcm24/float32 × chunk sizes incl. odd-pad; monotonic progress; cancel→null; independent hand-rolled RIFF parser decodes all depths) · golden wavEncoder suite 7/7 (refactor byte-safe) · full suite `npx vitest run` → **750/750** (90 files) · `npm run build` OK · `npm run e2e` → **59 passed (2.0 m)** incl. export.spec downloading + byte-checking a real WAV through the new worker · tsc + eslint clean.
- **Independent decoder validation:** python3 `wave` module: pcm16 {ch 2, rate 22050, sampwidth 2, frames 5000} ✓, pcm24 {sampwidth 3} ✓; IEEE float32 (format tag 3, unsupported by `wave`) decoded by a manual RIFF parse {rate 22050, bits 32, dataLen 40000, first samples [0.0, -0.0, 0.1, -0.05]} ✓ — values consistent with the generated anti-correlated sine.
- **Acceptance criteria:** heavy work off main thread ✓ (tests + longtask 225→0) · output independently validated ✓ (three decoders) · formats documented accurately ✓ (pcm16/24/float32 all tested; MEMORY §5 synced) · cancel/error correct ✓ (RED test proves cancel now rejects; lifecycle suite pins settle-once) · source unchanged ✓ (buffers suite) · responsiveness measured under reproducible conditions ✓ (method + numbers above; the TEMP measurement spec was deleted after evidence capture — the method is fully described here and reproducible).
- **Gap & Error Sweep (H):** criterion proof ✓; adversarial (malformed worker request → zod error reply; pre/mid/late cancel; empty channels → valid 0-frame header; concurrent exports = per-job workers) ✓; sibling search (`encodeWav` callers) ✓ — only the service used it, now the worker does; full regression ✓; consistency ✓ (MEMORY §5 rewritten this commit); diff hygiene ✓ (temp spec removed; 3 source/doc files + 3 test files).
- **Remaining gaps (owned):** MP3/FLAC result blobs still `application/octet-stream` at the service boundary → WF-010; decode-side limits → WF-009.
- **Reviewer:** agent (self), independent diff re-read per 5.2-G
- **Limitations:** worker internals (zod loop) follow the proven MP3 worker pattern without a dedicated unit harness (same as MP3 — covered end-to-end by e2e in a real browser); node timing is a proxy class for the moved work, browser longtask numbers are the authoritative responsiveness evidence.
