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
| WF-006 | Preact version discrepancy | P2 | OPEN | — | README says 11; declared+installed 10.29.8 |
| WF-007 | Coverage + CI gates + static badges | P2 | OPEN | — | CI runs coverage but no thresholds; badges static |
| WF-008 | Reproducible install / CI parity | P2 | OPEN | — | `npm ci` works (measured); README/vercel reconciliation pending |
| WF-009 | Decode limits + failure handling | P1 | VERIFIED | `c51c983` | PARTIALLY PRESENT at audit: file cap/typed errors/spinner-clear existed; added decoded budget (512 MiB), 60 s watchdog (WF-E104), importToTrack + IR-path guards; 8 unit RED→GREEN + 2 permanent e2e; 758/758 + 61/61; see E-008 |
| WF-010 | Export format/extension/MIME consistency | P1/P2 | VERIFIED | (this commit) | catalog = authority (mime/container/limitations + quality gate WF-E105); octet-stream eliminated; dup maps derived; signatures already e2e-proven; 763/763 + 61/61; see E-009 |
| WF-011 | External origins vs CSP vs privacy claims | P1/P2 | VERIFIED | `92f9735` | inventory complete (self-only); URL import REMOVED (D-A8); avatar/img-src docs corrected; egress helper + permanent e2e (same-origin, zero bodies); 759/759 + 63/63; see E-010 |
| WF-012 | Production smoke + deployment traceability | P1 | VERIFIED | (this commit) | npm run test:smoke → 3/3 against live prod; traceability: deterministic bundle hash proves prod serves `22b6aba` (index-ajTvOWzM.js match); CSP mode recorded (report-only today, tighten after merge); separate config/dir — standard suite still 64; see E-012 |
| WF-013 | RNNoise provenance | P2 | OPEN | — | vendored `src/vendor/rnnoise/`, README credits wrong package |
| WF-014 | Codec/licence hygiene (lamejs LGPL, dup libFLAC) | P2 | OPEN | — | two libflac wasm copies in precache glob |
| WF-015 | Dep/repo hygiene (fake-indexeddb, @types/node, .claude) | P3 | OPEN | — | all three confirmed present; `.claude` content benign |
| WF-016 | Performance claims re-measurement | P2 | OPEN | — | baseline measured; docs update pending |
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

Not started (strictly sequential; Phase 1 = WF-001 only, then WF-002, WF-003).
