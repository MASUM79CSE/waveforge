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
