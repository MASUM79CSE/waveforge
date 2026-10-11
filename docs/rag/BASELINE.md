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

_Pending — filled by P0.9._
