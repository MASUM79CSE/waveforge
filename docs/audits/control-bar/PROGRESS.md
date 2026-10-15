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

| CB-3.1 | Editable validated selection fields (start/end/length; inline error; selectRange clamp→swap→snap→signal; Clear-Q carried) | VERIFIED | E-CB-016/017 | `SelectionZone.tsx`; cb3.spec 11/11 incl. axe; snap-literal behavior proven |
| CB-3.2 | Tempo/grid/metronome cluster (BEAT/SNAP registry-routed pressed states; BPM readout; metronome+count-in) | VERIFIED | E-CB-016 | `TempoZone.tsx`; cb3.spec toggle/pressed tests; CB-D10 hiding intact |
| CB-3.3 | Record cluster with reserved slots — arm/roll zoneDeltas 0 px @1280 & 390 (F-05 MET; v1 +122) | VERIFIED | E-CB-016 | `RecordZoneV2.tsx`; jitter-v2.json; geometry ±0.5 px asserted |
| CB-3.4 | Master zone on canonical `masterVolume` signal (CB-D9: no persistence, effect→engine.setVolume) | VERIFIED | E-CB-016 | `MasterZoneV2.tsx`; reload→0.9 asserted; aria-valuetext % readout |
| CB-3.5 | (H-sweep) DOM-authoritative commit hardening (CB-D16) + adversarial suite 9/9 | VERIFIED | E-CB-017 | `cb3adv.spec.ts`; rapid fill→Enter race closed |

Phase-3 flake classification: markers-persist + peakLimits flakes PROVEN pre-existing (clean `c4144ee` worktree reproduces) → tickets T-CB-8/T-CB-9, not v2 gaps.

Phases: 0 PASSED · 1 PASSED · 2 PASSED · **3 gates+PCA complete (report in plan §10)** · 4..6 pending (stop rule: PCA + explicit `PROCEED TO PHASE N+1`).

| CB-4.1 | APG menubar keyboard model (opt-in `apg` prop, CB-D17; roles, roving titles, arrows/Home/End/Enter/Escape/Tab, focus management) | VERIFIED | E-CB-018 | cb4.spec 11/11 + cb4adv 6/6; flag-OFF guard pins v1 stability |
| CB-4.2 | StatusBar consolidation — single labelled secondary clock (F-06) | VERIFIED | E-CB-018 | title-labelled, both flags; format unification rides Phase-6 flag decision |
| CB-4.3 | Tooltip system = name + shortcut from the registry (+ fabricated-hint purge) | VERIFIED | E-CB-018 | tooltips.ts; unit 6/6 pins registry derivation; (M)/(P)/R purge verified against keyboard.ts |
| CB-4.4 | i18n bn pass — complete catalog, boot reachability, credit texts exact (CB-D18) | VERIFIED | E-CB-018 | bn completeness unit-enforced; bn render e2e; bundle +668 B gz |
| CB-4.5 | (H-sweep) H-04 closure on v2: monitor/punch aria-labels; name/pressed sweep green | VERIFIED | E-CB-018 | cb4.spec name/pressed assertions; keyboard activation end-to-end |

Phases: 0 PASSED · 1 PASSED · 2 PASSED · 3 PASSED · **4 gates+PCA complete (report in plan §11)** · 5..6 pending (stop rule: PCA + explicit `PROCEED TO PHASE N+1`).
