# PHASE 1 REPORT — Smart RAG Platform

**Branch:** `feat/smart-rag` · **Tag:** `rag-phase-1-done` · **Date:** 2026-10-12

Phase 1 delivers the platform every later RAG phase builds on: capability
detection, typed worker RPC, versioned model storage, a resumable verified
downloader, consent-first UI, cross-origin isolation, and — the phase's
headline proof — a **structural network-egress guarantee** enforced by e2e.

## Delivered

| Task | What shipped | Commit |
| --- | --- | --- |
| P1.1 | Capability detection (WebGPU / WASM SIMD+threads / storage / profile: unsupported·low·standard·high), pure + injectable | `70c9b33` |
| P1.2 | Typed worker RPC (protocol, client, server; cancelable, transferables) | `d0027ac` |
| P1.3 | Model manifest + IndexedDB storage (version-scoped, typed errors) | `f5dfc1e` |
| P1.4 | Resumable verified downloader: Range resume, sha256 verify→commit, abort-keeps-partial, pool concurrency 2, `NETWORK·INTEGRITY·QUOTA·ABORTED` | `6f308c7` |
| P1.5 | Consent + manage dialogs, transcript-ready state signals, lazy RAG chunk, en + bn (partial) strings, axe-clean, keyboard-operable | `a66b8ec` |
| P1.6 | COOP `same-origin` + COEP `credentialless` (vite preview + vercel.json), CSP Report-Only connect-src allow-list, robots.txt | `754e585` |
| P1.7 | Egress guard helper + journey proof (load → edit → export = **zero** outbound requests, zero request bodies) + guard self-test | `0c37c53` → `1ec8bc1` |
| P1.8 | Transcript panel shell: `rag.togglePanel` (Ctrl+Shift+F) + `rag.manageModels` commands, flag-gated View-menu group, Escape chain | `c3cde09` |
| P1.9 | Entry-bundle diet: RAG string table moved into the lazy chunk; preact lazy/Suspense replaced by armed `import()` (**D6**) | `7d3e263` |
| P1.10 | Full gate (below) + tag | `91372f0` |

## Gate evidence (all commands really run this session)

```
npx vitest run            → Test Files 92 passed (92) · Tests 794 passed (794)
npx tsc --noEmit          → clean
npx eslint <touched files> → clean
npx playwright test --project=chromium-fake-media
                          → 64 passed (2.5m)   [59 prior + 3 ragPanel + 2 egress]
npx playwright test --project=chromium-preview
                          → 1 passed (offline SW precache proof)
node scripts/check-bundle-size.mjs
                          → entry 121,228 gz · baseline 120,554 · delta +674
                            (tolerance +2,048 → PASS; was +3,734 before D6)
lighthouse --preset=desktop → performance=100 accessibility=100
                              best-practices=100 seo=100
lighthouse (mobile)         → performance=98 accessibility=100
                              best-practices=100 seo=100
```

Lazy-chunk audit: `dist/assets` contains `runtime-*.js` and
`RagDialogs-*.js`; the entry bundle contains no model-host strings and no
RAG UI copy (grep-verified post-build).

## Invariants honoured

- **Egress:** the only permitted new traffic is allow-listed model hosts
  (`huggingface.co`, `cdn-lfs.huggingface.co`, `models.example`) after
  explicit consent; the journey proof shows the product makes zero
  outbound requests otherwise. `QUOTA` propagates as a typed error; no
  byte-budget pre-flight (deliberate — recorded in DECISIONS).
- **Flag OFF ⇒ identical app:** no RAG menu group, dead shortcut, no DOM
  additions (e2e-asserted); COOP/COEP/CSP are flag-independent headers.
- **Bundle:** +674 B gz ≤ 2 KB budget; models never in SW precache.
- **CI:** no real ML models anywhere in the gate; mock host drives the
  consent e2e.
- **Credit contract, footprint directive, docs layout, `…`-free labels,
  shortcuts, conventional commits:** unchanged and re-verified by the
  standing suites (welcome/about, e2e forbidden-guard, menu drift tests).

## Decisions this phase (docs/rag/DECISIONS.md)

- **D4** COOP/COEP `credentialless` shipped after the P1.6 experiment
  (crossOriginIsolated=true, SW fine, 0 page errors).
- **D5** CSP Report-Only with a narrow connect-src allow-list.
- **D6** Entry-bundle diet: lazy RAG strings + armed import(); measured
  +3,734 → +674 B gz.
- Byte-budget pre-flight omitted by design (P1.4 contract).

## Carried forward to Phase 2

- `window.__wfRagTest` seam (flag ON only) — P2 transcription e2e reuses it.
- bn catalog is partial (RAG keys now live in the lazy chunk's table);
  full bn remains P6.4.
- CSP stays Report-Only until real model downloads prove the allow-list.
- **PAT reminder:** the GitHub PAT used for pushes should be revoked now
  that Phase 1 is pushed (standing instruction).

**STOP — awaiting `PROCEED TO PHASE 2`.**
