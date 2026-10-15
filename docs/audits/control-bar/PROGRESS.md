# Control Bar v2 — Task Ledger

Statuses: OPEN · IN PROGRESS · NOT REPRODUCED · ALREADY FIXED · VERIFIED · PARTIALLY VERIFIED · BLOCKED · FAILED · NOT RUN
Rule: a task only closes with evidence in EVIDENCE_LOG.md + commit SHA. Resume = first task not closed.

| ID | Task | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| CB-0.1 | Capability check + env + branch + persistent files | VERIFIED | E-CB-001 | branch `ui/control-bar-v2` @ `3691995`; commit `460903b` |
| CB-0.2 | Repository map | VERIFIED | E-CB-001 | audit doc §1 |
| CB-0.3 | Control inventory (backbone) | VERIFIED | E-CB-001/003 | audit doc §2 — 62 rows, boxes measured |
| CB-0.4 | Baseline measurements (gate + visuals + perf) | VERIFIED | E-CB-002/003/004/006/007/008 | gates 826/826 · e2e 84+3 retry-green · LH re-run · jitter 0 px + arm-shift measured |
| CB-0.5 | Hypothesis triage H-01..H-12 + new findings | VERIFIED | E-CB-005 | 7 CONFIRMED · 4 PARTIAL · 1 REFUTED · 1 NOT RUN; F-01..F-10 |
| CB-0.6 | Deliverable 1: audit document | VERIFIED | E-CB-005 | `docs/audits/audio-editor-control-bar-audit.md` |

| CB-1.1 | Benchmark study (master prompt §3 sources) | VERIFIED | E-CB-009 | 6 official OPEN · BandLab NOT RUN (secondary labelled) · AudioMass ref-only |
| CB-1.2 | v2 design decisions | VERIFIED | E-CB-009 | plan §2 — 10 decisions, each finding+benchmark traced |
| CB-1.3 | Engine-capability matrix | VERIFIED | E-CB-010 | plan §1 — 16 rows file:line; output-meter note corrected; 3 MISSING→tickets |
| CB-1.4 | Deliverable 2: implementation plan | VERIFIED | E-CB-009/010 | `docs/audits/audio-editor-control-bar-implementation-plan.md` |

| CB-1.5 | (unplanned) F-11 hotfix: stale-input race in prompt dialogs | VERIFIED | E-CB-011 | 2 files, +44 B gz; gates green post-fix |

| CB-2.1 | Feature flag + v2 shell (zones, tokens, grid integration) | VERIFIED | E-CB-012 | all 3 flag paths probed; default OFF; flag-OFF DOM identical |
| CB-2.2 | Switchable clock (time/samples/bars-when-known) + RED→green formatters + persistence tests | VERIFIED | E-CB-012/015 | `clock.test.ts` 9/9; persistence; CB-D10 hiding verified |
| CB-2.3 | Transport zone as APG toolbar (registry-routed, roving) | VERIFIED | E-CB-012 | 1 tab stop, arrows, Space no-double-fire, pressed from signals |
| CB-2.4 | Overflow skeleton (⋮) with registry residents | VERIFIED | E-CB-012 | follow/monitor/clip-reset; monitor check-state added to registry |
| CB-2.5 | Flag-OFF parity (full v1 suite green through the refactor) | VERIFIED | E-CB-014 | plain e2e 97 passed at final tree |
| CB-2.6 | Screenshots 6 widths × 2 themes × v1/v2 + h-scroll probes (theme-key corrected + re-captured) | VERIFIED | E-CB-014/015 | 24 PNGs; page h-scroll FALSE at 1280/390/320 flag-ON |

Phases: 0 PASSED · 1 PASSED · **2 gates+PCA complete (report in plan §9)** · 3..6 pending (stop rule: PCA + explicit `PROCEED TO PHASE N+1`).
