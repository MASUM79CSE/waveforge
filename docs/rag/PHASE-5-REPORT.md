# Phase 5 Report — Smart Edits (Smart RAG v2)

**Branch:** `feat/smart-rag` · **Tag:** `rag-phase-5-done` · **Date:** 2026-10-12

## Scope delivered

Transcript-driven smart edits as deterministic PLANS: a zod-boundaried
plan schema (delete / silence / gain / insert-silence), doc-aware range
normalization with hard caps, deterministic planners (selection, ask
citations, en/bn NL cues), pure kernel mapping onto the engine's edit
ops, and a lazy bridge that commits every plan through ONE `performEdit`
call — exactly ONE undo step. Panel UI: NL box with an explicit confirm
row, preview (seek+play+timed pause, never mutates), quick selection
ops, per-answer utterance ops, and transcript-derived chapters.
Zero regressions; the doc can never be mutated by transcript text alone.

## Tasks

| Task | What | Status | Evidence |
| --- | --- | --- | --- |
| P5.1 | EditPlan schema | DONE | 9 tests (golden shapes, strict rejects, frozen limits) |
| P5.3 | Range normalization | DONE | 10 tests (clamp, collapse, caps, snap order, bad-doc) |
| P5.2 | Deterministic planners | DONE | 14 tests (golden en/bn, numeric ranges, insert, null-degradation) |
| P5.5 | Executor (planToOutcome + bridge) | DONE | 8 kernel tests (outcome shape, undo/redo round-trips); ONE-undo in e2e |
| P5.4 | Preview + audition UI | DONE | e2e ragEdits 2/2 (apply → undo → redo exact-length; hostile inert; chapters seek; axe 0) |
| P5.6 | Markers/chapters | DONE | 8 tests (gap split, sanitize, overlap guard) |
| P5.7 | Commands + NL box | DONE | rag.smartDelete/SilenceSelection (flag-gated menu group) + NL confirm row |
| P5.8 | Safety review | DONE | 8 safety tests + D11 (zod gate, caps, bounded proposals, serializable plans) |
| P5.9 | Phase 5 gate | DONE | see Gate below |

## Gate (real output, this tree)

- Unit/integration: `vitest run` → **Test Files 124 passed (124), Tests 1104 passed (1104)** (P4 end: 1047).
- `tests/rag/edits`: plan 9, normalize 10, planners 14, planToOutcome 8, chapters 8, safety 8 = 57 new tests.
- tsc `--noEmit`: **0 errors**. eslint (src+tests): **0 errors, 0 warnings**.
- Bundle gate: entry **122,593 B gz** vs baseline 120,554 / limit 122,602 → **+2,039 ≤ +2,048 ✓** (9 B headroom; see note).
- e2e: **74 passed** (`chromium-fake-media`; 72 prior + 2 ragEdits).

## Safety contract (D11)

Plans are small serializable data (no audio, no functions). Every apply
passes: zod parse → doc-aware normalize (clamp/collapse/90% delete cap/
30 s insert cap/0.25–4 gain) → pure kernel mapping → ONE `performEdit`
with a readable undo label. Nothing auto-applies: hostile transcript
text can only ever produce a BOUNDED proposal bound to the resolver
range, and only an explicit user action on a visible button executes it
(e2e-pinned: seeded hostile transcript mutates nothing).

## Gate incident (fixed in-phase)

The first bundle measurement FAILED by 20 B gz: rolldown merged the
bridge's statically-imported pure kernels into the entry chunk. Fix:
`applyPlan`/`previewPlan` dynamic-import the rag/edits kernels, leaving
the bridge with only entry-module static deps (commit `5bf43dc`).
Entry headroom is now 9 B gz — the P6 release pass should rebaseline
the bundle gate (P6 is the designated docs/release phase).

## Known notes

- Smart-edit commands live in View → Transcription (flag-gated) and
  act on the current selection; the NL box and per-answer ops live in
  the transcript panel.
- `applyPlanSafe` retained as a promise-returning alias of `applyPlan`.
- Chapters are derived (not persisted) — read-only seek list; persistence
  (project markers) remains out of scope for P5 and is not planned
  unless requested at P6.

## Next

Phase 6 — hardening/docs/release + RELEASE REPORT. Awaiting
`PROCEED TO PHASE 6`.
