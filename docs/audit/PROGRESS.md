# Audit Progress Ledger

Statuses: OPEN · IN PROGRESS · NOT REPRODUCED · ALREADY FIXED · VERIFIED · PARTIALLY VERIFIED · BLOCKED · FAILED
Parity: VERIFIED EQUIVALENT · VERIFIED INTENTIONAL DIFFERENCE · MISSING · UNVERIFIED
Rule: a row only leaves OPEN/UNVERIFIED with evidence in `EVIDENCE_LOG.md` + commit SHA.

## Phase 0 (reconnaissance — no fixes)

| Task | Status | Evidence |
| --- | --- | --- |
| P0.1 environment + branch | DONE | BASELINE.md § Environment; branch `audit/remediation` @ `22b6aba` |
| P0.2 discovery | DONE | BASELINE.md § Confirmed source paths + CI inventory; `playwright.other.config.ts` = Firefox/WebKit cross-browser config (Y3), not in default run |
| P0.3 baseline gates | DONE | BASELINE.md § Baseline gate results (npm ci, typecheck, lint, 720/720, build, encoders, 59/59 e2e, LH desktop 100/100/100/91 + mobile 99/100/100/91, entry 120,084 B gz) |
| P0.4 audit files | DONE | this directory, committed on `audit/remediation` |
| P0.5 initial classification | DONE | BASELINE.md § P0.5 table (WF-001..016 classified with file:line) |
| P0.6 production facts | DONE | BASELINE.md § Production live facts (headers, 1 origin, 0 console errors, SW=1); deployment↔commit tie NOT RUN (no Vercel API) |
| P0.7 AudioMass baseline | DONE (docs-level) | AUDIOMASS_PARITY.md seeded from audiomass.co menu inventory (fetched 2026-10-13); all AM rows UNVERIFIED pending behavioral tests |

## Findings register (initial status of every row: OPEN)

| ID | Title | Priority | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| WF-001 | Export cancellation + resource cleanup | P0 | VERIFIED | `c737d67` | RED 6 fail → GREEN 10/10; zero timers on all terminal paths; suite 730/730 + e2e 59/59; see E-005 |
| WF-002 | Buffer ownership/copies/transfer lists | P0 | VERIFIED | `6bd43b3` | ownership documented (MEMORY §5 rewritten); opt-in transfer for exclusive range slices (measured 71.8→22.1 ms); canonical data clone-protected (tests); 738/738 + 59/59; see E-006 |
| WF-003 | WAV encoding on main thread | P0 | VERIFIED | `356099c` | module worker + real progress + working cancel; byte-identity golden + independent decoders (python wave + RIFF parser); longtask 225 ms → 0; 750/750 + 59/59; see E-007 |
| WF-004 | CSP Report-Only, no reporting, missing directives | P1 | VERIFIED | (this commit) | ENFORCING CSP on prod (vercel.json) + CSP_ENFORCE=1 for dev/preview; RED chain caught 3 real defects (blob: doctor probe; recorder worklet shipped as data: URI — recording would have broken under enforcement; zod v4 JIT probes) → same-origin public/worklets + zod jitless per realm, NO policy weakening; csp.spec zero-violation proof on prod build; 759/759 + 64/64 + LH 100/100/100/91; entry 118,171 gz; see E-011, D-A10 |
| WF-005 | Architecture/memory docs vs code | P2 | OPEN | — | avatar + URL-import + "LH CI gates" already contradict code |
| WF-006 | Preact version discrepancy | P2 | VERIFIED | (this commit) | badge/stack/diagram 'Preact 11' → 10 (declared ^10.29.8, installed 10.29.8); permanent docs↔package.json major-version guard RED→GREEN; see E-017 |
| WF-007 | Coverage + CI gates + static badges | P2 | VERIFIED | (this commit) | coverage thresholds 96/76/94/97 (measured floor; RED proven at 99s) + CI bundle-budget gate (122,132 B gz; RED proven) + README CI claims corrected (Lighthouse = measured, not gated) + live CI badge; see E-015 |
| WF-008 | Reproducible install / CI parity | P2 | VERIFIED | (this commit) | README `--legacy-peer-deps` claim disproven (plain install exit 0) → `npm ci` everywhere: README = ci.yml = vercel.json installCommand; lockfile-pinned; see E-016 |
| WF-009 | Decode limits + failure handling | P1 | VERIFIED | `c51c983` | PARTIALLY PRESENT at audit: file cap/typed errors/spinner-clear existed; added decoded budget (512 MiB), 60 s watchdog (WF-E104), importToTrack + IR-path guards; 8 unit RED→GREEN + 2 permanent e2e; 758/758 + 61/61; see E-008 |
| WF-010 | Export format/extension/MIME consistency | P1/P2 | VERIFIED | (this commit) | catalog = authority (mime/container/limitations + quality gate WF-E105); octet-stream eliminated; dup maps derived; signatures already e2e-proven; 763/763 + 61/61; see E-009 |
| WF-011 | External origins vs CSP vs privacy claims | P1/P2 | VERIFIED | `92f9735` | inventory complete (self-only); URL import REMOVED (D-A8); avatar/img-src docs corrected; egress helper + permanent e2e (same-origin, zero bodies); 759/759 + 63/63; see E-010 |
| WF-012 | Production smoke + deployment traceability | P1 | VERIFIED | (this commit) | npm run test:smoke → 3/3 against live prod; traceability: deterministic bundle hash proves prod serves `22b6aba` (index-ajTvOWzM.js match); CSP mode recorded (report-only today, tighten after merge); separate config/dir — standard suite still 64; see E-012 |
| WF-013 | Dependency provenance (rnnoise) | P2 | VERIFIED | (this commit) | phantom `@echogarden/rnnoise-wasm` credit removed from README+NOTICES; vendored build + COPYING documented; full npm dep table with licences (LGPL lamejs pinned); depsHygiene test guards notices↔package.json agreement; 763/763; see E-013 |
| WF-014 | Duplicate/vendored FLAC runtime | P2 | VERIFIED | (this commit) | `libflacjs` npm dep removed (imported nowhere); dead duplicate `public/vendor/libflac.min.wasm.wasm` removed (live path `/workers/…` proven by request capture); fake-indexeddb → devDeps; depsHygiene test RED→GREEN ×2; 763/763 + 64/64; see E-014, D-A11 |
| WF-015 | Dep/repo hygiene (fake-indexeddb, @types/node, .claude) | P3 | VERIFIED | (this commit) | fake-indexeddb → devDeps (WF-014); @types/node 26→^20.19.43 aligned to engines/CI node 20 (guard RED→GREEN, 765/765); `.claude/` untracked+gitignored (D-A12); see E-018 |
| WF-016 | Performance claims re-measurement | P2 | VERIFIED | (this commit) | fresh LH desktop 100/100/100/91 + mobile 99/100/100/91 on final build; entry 118,171 gz (−1,913 vs baseline); README/MEMORY numbers synced with method+date; see E-019 |
| PF-01 | Markers (AM-07) | P1 | OPEN | — | Phase 5 |
| PF-02 | Clip fades + crossfade (AM-06) | P1 | OPEN | — | Phase 5 |
| PF-03 | Repair tools: click/hum/edit-point (AM-09) | P1 | OPEN | — | Phase 5 |
| PF-04 | Gain/fade in/out/delay verification (AM-03/04) | P2 | OPEN | — | Phase 5 |
| PF-05 | Portable project file (AM-12) | P2 | OPEN | — | Phase 5 |
| PF-06 | Seamless-loop maker (AM-11) | P2 | OPEN | — | Phase 5 |
| PF-07 | Touch/mobile gestures (AM-02/06) | P2 | OPEN | — | Phase 5; real-device = NOT RUN expected |
| PF-08 | Dockable detached panels | P3 | OPEN | — | DEFERRED by default; implement only on `APPROVE PF-08` |
| AM-01..AM-16 | Parity matrix rows | — | UNVERIFIED | — | see AUDIOMASS_PARITY.md |

## Phases 1-6

- **Phase 1 (WF-001..003): COMPLETE — PCA PASS** (`6bd43b3`..docs; see E-005..E-007).
- **Phase 2 (WF-009, WF-010): COMPLETE — PCA PASS** (`c51c983`, `43e3c2c`; see E-008, E-009).
- **Phase 3 (WF-011, WF-004, WF-012, WF-013, WF-014): COMPLETE — tasks all VERIFIED; PCA run at `b3a2475`** (clean rebuild: unit 763/763, e2e 64/64, csp-under-enforce 1/1, prod smoke 3/3, validate:encoders, io 43/43, build, LH desktop 100/100/100/91, entry 118,171 B gz; see E-010..E-014, D-A8..D-A11).
- **Phase 4 (WF-007 → WF-008 → WF-006 → WF-015 → WF-016 → WF-005): next — awaits explicit `PROCEED TO PHASE 4`.**
- **Phase 5 (PF-01..08 + AM matrix): pending.**
- **Phase 6 (release readiness): pending.**
