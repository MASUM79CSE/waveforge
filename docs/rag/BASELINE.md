# WaveForge Smart RAG — Baseline (Phase 0)

Measured 2026-09-26 on branch `feat/smart-rag` (tree = `main` @ `22b6aba`,
zero feature code). Node v20.20.2. Clean install:
`npm install --legacy-peer-deps` (no `.npmrc` existed → see A6 fix).

## Gate baseline

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | OK (0 errors) |
| Lint | `npm run lint` | 0 findings |
| Unit | `npx vitest run` | **720 passed / 86 files** |
| E2E | `npx playwright test` | **59 passed (2.0m)** incl. axe zero-violations |
| Build | `npm run build` | OK (tsc + vite) |
| Main entry JS | gzip of `dist/assets/index-*.js` | **120,084 bytes** |
| Largest workers | gzip | mp3Export 77,931 B · analysis 24,527 B |
| Lighthouse (same tree, local gzip server, real runs) | desktop / mobile | **98 / 100 / 100 / 100** · perf **99** |

Pre-existing failures: none.

## Audit verification (P0.4)

| ID | Verdict | Evidence |
|---|---|---|
| A1 | **CONFIRMED** | `vercel.json` ships `Content-Security-Policy-Report-Only` with `connect-src 'self' data: blob:` (not enforced). URL import fetches arbitrary origins (`src/io/decode.ts` pipeline via `UrlDialog`) — would be blocked if enforced. Allow-list decision deferred to P1.6. |
| A2 | **CONFIRMED (reverse drift)** | `docs/ARCHITECTURE.md` §10 still says `img-src` includes the avatar CDN; `vercel.json` `img-src` is `'self' data: blob:` since `22b6aba` (avatar localized). Doc to be aligned in P0.5. |
| A3 | **CONFIRMED** | No COOP/COEP headers in `vercel.json` → `crossOriginIsolated=false`, no SharedArrayBuffer → WASM threads unavailable (single-threaded inference) until the P1.6 experiment proves otherwise. |
| A4 | **CONFIRMED (vendored)** | README stack table lists `@echogarden/rnnoise-wasm`; `package.json` has no such dep. Actual: vendored build at `src/vendor/rnnoise/` (`rnnoise.js`, `rnnoise.wasm`, `COPYING`; `rnnoise.d.ts` states "vendored echogarden rnnoise-wasm"). Notices row needs "vendored" wording (P0.5). |
| A5 | **CONFIRMED** | `fake-indexeddb` in `dependencies` (package.json); real imports only under `tests/` (`tests/helpers/fakeIdb.ts` et al.); `src/storage/db.ts:6` mentions it in a comment only. → move to devDependencies. |
| A6 | **CONFIRMED** | No `.npmrc`; README documents `npm install --legacy-peer-deps`; `vercel.json` has no `installCommand`. → add `.npmrc` with `legacy-peer-deps=true`. |
| A7 | **CONFIRMED, partially pre-fixed** | CI gained an e2e job in `f662e19` (Playwright install → build → e2e → artifact). Remaining gap: no bundle-size check in CI (added in P0.6); Lighthouse remains a local gate (D3). |
| A8 | **CONFIRMED** | `src/io/decode.ts:25` — whole-file `ctx.decodeAudioData` on the main thread → full Float32 document in memory (1 h stereo 48 kHz ≈ 1.38 GB). History budget 250 MB (`src/engine/history.ts`). RAG must read windows from existing documents/assets, never re-decode or duplicate. Ceiling measured in P0.9. |
| A9 | **CONFIRMED** | `devDependencies.@types/node = ^26.6.2` vs `engines.node >=20`. Types-only; fix attempted in P0.5 if trivial. |

## Large-file ceiling (P0.9)

Measured with `scripts/rag/ceiling.mjs` (headless Chromium,
`--enable-precise-memory-info`), fixtures from `scripts/rag/gen-long-wav.mjs`
(streaming writer). Sandbox RAM ≈ 1–2 GB.

| Fixture | WAV size | Load time | JS heap | Long tasks >50 ms | Result |
|---|---|---|---|---|---|
| 10 min · mono · 44.1 kHz | 53 MB | 601 ms | 115 MB | 1 | OK |
| 10 min · stereo · 48 kHz | 115 MB | 3 260 ms | 216 MB | 4 | OK |
| 20 min · mono · 44.1 kHz | 106 MB | 1 282 ms | 216 MB | 2 | OK |
| 30 min · mono · 44.1 kHz | 159 MB | — | — | — | **TAB CRASH** during load |
| 60 min · mono · 44.1 kHz | 318 MB | — | — | — | **NO COMPLETION** within the 5-min in-app window; sustained memory thrash (host tooling starved) |
| 60 min · stereo · 48 kHz | 691 MB | not attempted | — | — | ≈1.38 GB decoded — ~4× beyond the measured crash boundary |

**Reading:** crash correlates with the A8 structure — whole-file decode
(`src/io/decode.ts`) momentarily holds file buffer + decoded Float32 +
immutable document copies (≈ 5× the file size) — on ~1 GB-class devices the
wall sits between 20 min mono and 30 min mono (≈ 300 MB decoded payload).

**Recommendation for Smart RAG v1:**
1. Never re-decode and never duplicate audio: read 16 kHz windows **from
   the existing document/asset** (`subarray` + window-sized copies).
2. Support-by-profile: offer full-asset transcription up to the measured
   ceiling; beyond it, process per-asset ranges with checkpointing and an
   honest UI notice (P2.7 interlock).
3. Chunked/streaming decode of long files is an engine-level upgrade
   (out of RAG scope; file under A8 follow-up).
4. CI never generates these fixtures (RAM); the harness is opt-in.
