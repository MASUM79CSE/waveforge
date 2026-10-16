# Audit Baseline (Phase 0)

Recorded: 2026-10-13 (Asia/Dhaka) · Auditor: Arena Agent · Branch `audit/remediation`

## Environment

| Item | Value (measured) |
| --- | --- |
| Workspace | `/home/user/waveforge` (sandboxed Linux) |
| OS | Debian 13 (trixie) container, 2 GB RAM |
| Node / npm | v20.20.2 / 10.8.2 |
| Audit base | `origin/main` = `22b6aba17449df91aa358f32b864f78218dac35a` ("perf(brand): localize the developer avatar; ship og:image — LH BP 96 → 100") |
| Branch | `audit/remediation` (created from `origin/main`; = `main`, so `git diff --stat main...HEAD` is empty at Phase 0) |
| Working tree at branch creation | clean (3 mode-only changes under `scripts/rag/` stashed on `feat/smart-rag` as `pre-audit: …` — preserved, not discarded) |
| Context (NOT in audit scope) | `feat/smart-rag` tip `9d2425c` is 133 commits / +15,549 lines ahead of `main`; production runs `main`. This audit validates `main` = what production ships. |
| Package manager | npm + `package-lock.json` committed; README documents `npm install --legacy-peer-deps` (L170) |

## Capability check (protocol 5.0)

Can: read/edit repo, branch/commit/push (PAT inline), run npm/npx/playwright/node/python, production build + preview, Lighthouse desktop+mobile, headless-Chromium capture of live sites (console/requests/SW), `curl` for headers, `fetch_page` for remote content.
Cannot: real-device/real-microphone checks, visual/manual-only verification, PR creation (no `gh` auth). Anything outside the "can" list is marked `NOT RUN`.

## Environment repairs performed (no repo changes)

1. `npm ci` re-resolved Playwright; `chromium_headless_shell-1243` was missing → `npx playwright install chromium` (downloaded 114.3 MiB).
2. Env reset had wiped system NSS/ATK/CUPS/Avahi libs → downloaded Debian trixie `.deb`s and extracted to `~/pw-libs/root`. **Any chromium launch in this sandbox needs:** `export LD_LIBRARY_PATH=$HOME/pw-libs/root/usr/lib/x86_64-linux-gnu`. Verified: `chrome-headless-shell --version` = "Google Chrome for Testing 153.0.8010.12", full `chrome --version` OK, `ldd` → 0 missing.
3. Transient webServer failure mode observed: an aborted Playwright run can leave port 5179/4179 briefly held → next run fails all tests with "port already used". Retry after the socket clears. Baseline numbers below are from clean runs.

## Baseline gate results (all run at `22b6aba`, real output)

| Gate | Command | Result |
| --- | --- | --- |
| Clean install | `npm ci` | PASS, exit 0, 12.7 s (lockfile install works; `--legacy-peer-deps` NOT required for `npm ci` — WF-008 evidence) |
| Typecheck | `npm run typecheck` | PASS (0 errors) |
| Lint | `npm run lint` | PASS (0 findings) |
| Unit | `npm run test` | **720/720 passed, 86 files** (matches README "720/720" claim) |
| Build | `npm run build` | PASS (tsc + vite; `dist/` emitted) |
| Encoders | `npm run validate:encoders` | PASS — MP3 128/192/256/320 frame-sync ✓; "FLAC is validated in-browser by tests/e2e/export.spec.ts" |
| E2E | `npm run e2e` | **59 passed / 0 failed (2.0 m)** — chromium-fake-media (58) + chromium-preview offline (1); matches README "59/59" |
| Lighthouse (localhost preview, 1 run each) | `npx lighthouse …` | Desktop **100/100/100/91**, Mobile **99/100/100/91** (perf/a11y/BP/SEO) — SEO 91 ≠ README's implied 100; measured, not claimed |
| Entry bundle | `gzip -c dist/assets/index-*.js | wc -c` | **120,084 B gz** (README claims ~119.5 KB ≈ 119,500 — close; exact value recorded) |
| Diff vs main | `git diff --stat main...HEAD` | empty (branch == main at Phase 0) |

### CI inventory (`.github/workflows/ci.yml` — read in full)

- Job `verify` (push→main, PRs): `npm ci` → typecheck → lint → **`test:coverage`** → build.
- Job `e2e`: `npm ci` → `playwright install --with-deps chromium` → build → **`npm run e2e`** (uploads playwright-report on failure).
- **NOT in CI:** Lighthouse, bundle-size gate, production smoke, coverage thresholds (config has no thresholds). README L106 claims "Lighthouse CI gates" — **not true of `ci.yml`** (WF-005/WF-007 evidence). The audit prompt's doc-evidence ("CI runs only typecheck, lint, unit") is itself stale — CI also runs coverage + build + e2e.

## Confirmed source paths (leads [C]/[L] resolved)

| Lead | Real path at `22b6aba` |
| --- | --- |
| export service | `src/io/exportService.ts` (148 lines) |
| WAV encoder (main-thread) | `src/io/wavEncoder.ts` (134 lines), called only from `exportService.ts:49` |
| MP3 worker | `src/workers/mp3Export.worker.ts` |
| FLAC worker | `public/workers/flac-export.worker.js` (classic worker, importScripts) — comment: "Global `Flac` comes from `/vendor/libflac.min.wasm.js`" |
| FLAC wasm | `public/vendor/libflac.min.wasm.{js,wasm}` AND `public/workers/libflac.min.wasm.wasm` (both under PWA precache glob `**/*.{js,wasm}` — duplicate shipped bytes; usage check = Phase 3) |
| RNNoise | **vendored** `src/vendor/rnnoise/{rnnoise.js,rnnoise.wasm,rnnoise.d.ts}` — the npm package `@echogarden/rnnoise-wasm` named in README/notices is NOT a dependency |
| decode | `src/io/decode.ts` (38 lines) — whole-file `decodeAudioData` on a shared `AudioContext`, zero limits |
| format catalog | `src/io/exportFormats.ts` (85 lines, pure data: WAV pcm16/24/float32, MP3 128-320, FLAC levels 0/3/5/8) |
| filename | `src/io/exportName.ts`; tags: `src/io/id3.ts` |
| export caller | `src/app/exportActions.ts` (file-picker flow; download gated on `signal.cancelled` at L103) |
| egress guard | `tests/e2e/helpers/egress.*` — **does NOT exist on `main`** (added later on `feat/smart-rag`) → Phase 3 must create it |
| configs | `playwright.config.ts` (Chromium, 2 projects + offline preview flow), `playwright.other.config.ts` = **Y3 cross-browser verification config (Firefox/WebKit), not part of the default run** |
| PWA | `vite-plugin-pwa`, `registerType: 'prompt'`, precache `**/*.{js,css,html,svg,png,woff2,wasm,wav}` |
| CSP | `vercel.json` → `Content-Security-Policy-Report-Only`, no report-uri/report-to, no object-src/base-uri/frame-ancestors/form-action; nosniff + XFO SAMEORIGIN + Referrer-Policy present |
| deps oddities | `fake-indexeddb` in `dependencies` (src references are comments only → test-only); `@types/node ^26.6.2` vs `engines.node >=20`; `.claude/settings.json` tracked (content = a prettier-format PostToolUse hook — **no secrets/local paths found**); no `.npmrc`, no `.nvmrc` |

## P0.5 initial classification (source-reading only; runtime proof pending)

| ID | Class | Evidence (file:line @ `22b6aba`) |
| --- | --- | --- |
| WF-001 | PRESENT (static) | `exportService.ts:139-147` — cancel watcher is a self-rescheduling `setTimeout(watch,120)` chain with **no handle and no stop flag**; `cleanup()` (L99) never stops it → one immortal 120 ms poll per export, forever, even after success; posts `cmd:'cancel'` to terminated workers on stale signals. Settle-once is mostly protected (handlers nulled in `cleanup()`), double-`cancel` posts duplicate messages. Needs failing tests + fix. |
| WF-002 | PRESENT (copies; no detachment) | `runMp3Worker`/`runFlacWorker` `postMessage` **without transfer lists** (L77-84, L90-97) → full-size structured-clone copies of both channels; canonical document is NOT detached (safe but wasteful). Ownership undocumented. `done` → `new Blob([data])` **without MIME** (L129). Runtime measurement pending. |
| WF-003 | PRESENT (static) | Header comment + code: "WAV encodes inline" — `exportService.ts:45-51` calls `encodeWav()` synchronously on the main thread (`wavEncoder.ts`). |
| WF-009 | PRESENT (static) | `decode.ts` — no size/duration/memory guard, no timeout; failure path exists (typed error) but caller-side limits unknown (Phase 2). |
| WF-010 | PRESENT (partial) | MP3/FLAC blobs hardcode `application/octet-stream` (`exportService.ts:129`); FLAC `bits` derived from the *level* string (`'24'` unreachable → always 16-bit; catalog doesn't advertise 24-bit FLAC, ARCHITECTURE claims need checking); catalog lacks MIME/container/signature data. |
| WF-004 | PRESENT (live-confirmed) | Production response header (curl, 2026-10-13): `content-security-policy-report-only: …`, no report endpoint, no hardening directives. |
| WF-012 | PRESENT | No production smoke suite; no deployment↔commit traceability evidence; `playwright.other.config.ts` = cross-browser config (explained). |
| WF-011 | PRESENT (docs vs code) | README L239 still says avatar "loads from an external CDN", but `22b6aba` localized it and no `twimg/cdn` URL remains in `src/` (grep). ARCHITECTURE L188 claims `img-src` includes the avatar CDN — false vs `vercel.json` (`img-src 'self' data: blob:`). "URL import" — CORRECTED during Phase 2 (WF-009): a URL-import path DOES exist (`openFromUrl` in `src/app/actions.ts`, SSRF-guarded per `src/core/schemas.ts` loopback/private-host block, WF-E201/E202 typed failures). The Phase-0 grep missed it (searched only components/io, not actions). ARCHITECTURE's URL-import claim is TRUE; the CSP `connect-src 'self'` vs cross-origin URL-fetch tension belongs to WF-011. |
| WF-013 | PRESENT (docs wrong) | README L103 + THIRD_PARTY_NOTICES L10 credit `@echogarden/rnnoise-wasm`; reality = vendored `src/vendor/rnnoise/`. Version/licence to pin in Phase 3. |
| WF-014 | PRESENT (dup) | `libflacjs` npm dep AND vendored libFLAC (worker loads `/vendor/libflac.min.wasm.js`; a second `libflac.min.wasm.wasm` sits in `public/workers/`). Whether libflacjs is used at runtime at all = Phase 3 check. |
| WF-015 | PRESENT (hygiene) | See deps oddities above; installed Preact is 10.29.8 (`require('preact/package.json')`). |
| WF-016 | PRESENT (claims unmeasured/stale) | Measured 2026-10-13: entry 120,084 B gz; LH desktop 100/100/100/91, mobile 99/100/100/91 vs README badge "99/100/100/100". |
| WF-006 | PRESENT (docs wrong) | README L13 badge + L97 table "Preact 11" vs `package.json` `^10.29.8`, lockfile + installed 10.29.8. |
| WF-005 | PRESENT (multiple) | Avatar claim, "Lighthouse CI gates" claim, URL-import claim (see above); full sweep in Phase 4. |
| WF-007 | PRESENT (partial) | Coverage runs in CI but thresholds/exclusions unmeasured; static shields.io badges (README L13-17); no bundle gate on main. |
| WF-008 | PARTIALLY RESOLVED | `npm ci` works (measured). README documents `--legacy-peer-deps` for `npm install`; Vercel install command unset. Reconciliation = Phase 4. |
| WF-001..016 statuses in ledger | all OPEN at Phase-0 close except as re-classified per-task in later phases | — |

## Production live facts (P0.6, 2026-10-13, headless Chromium 153)

- `curl -sI https://waveforge-chi.vercel.app/`: HTTP/2 200; CSP **Report-Only** (value matches `vercel.json`); nosniff; XFO SAMEORIGIN; Referrer-Policy strict-origin-when-cross-origin; no enforcing CSP; no report-to.
- Page load (network capture): origins requested = **only `https://waveforge-chi.vercel.app` (5 requests)** — zero third-party origins on cold load; console errors **0**; CSP console violations **0**; service workers registered **1** (PWA live).
- Deployment↔commit tie: NOT RUN (no Vercel API access) — Phase 3/WF-012 must document a traceability method.
