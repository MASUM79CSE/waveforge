# Control Bar v2 — Task Ledger

Statuses: OPEN · IN PROGRESS · NOT REPRODUCED · ALREADY FIXED · VERIFIED · PARTIALLY VERIFIED · BLOCKED · FAILED · NOT RUN
Rule: a task only closes with evidence in EVIDENCE_LOG.md + commit SHA. Resume = first task not closed.

| ID | Task | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| CB-0.1 | Capability check + env + branch + persistent files | VERIFIED | E-CB-001 | branch `ui/control-bar-v2` @ `3691995`; commit `460903b` |
| CB-0.2 | Repository map | VERIFIED | E-CB-001 | audit doc §1 |
| CB-0.3 | Control inventory (backbone) | VERIFIED | E-CB-001/003 | audit doc §2 — 62 rows, boxes measured |
| CB-0.4 | Baseline measurements (gate + visuals + perf) | IN PROGRESS | E-CB-002/003/004 | awaiting idle e2e tail |
| CB-0.5 | Hypothesis triage H-01..H-12 + new findings | VERIFIED | E-CB-005 | 7 CONFIRMED · 4 PARTIAL · 1 REFUTED · 1 NOT RUN; F-01..F-10 |
| CB-0.6 | Deliverable 1: audit document | VERIFIED | E-CB-005 | `docs/audits/audio-editor-control-bar-audit.md` |

Phases: 0 IN PROGRESS · 1..6 pending (stop rule: PCA + explicit `PROCEED TO PHASE N+1`).
