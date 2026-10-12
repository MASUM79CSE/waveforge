# Phase 4 Report — Ask (Smart RAG v2)

**Branch:** `feat/smart-rag` · **Tag:** `rag-phase-4-done` · **Date:** 2026-10-12

## Scope delivered

Question answering over the CURRENT transcript, fully on-device. The
default path is deterministic and extractive (zero ML): intent router →
history-aware rewrite → hybrid retrieval (P3.5) → sufficiency gate →
sentence scoring → answer quoted with seekable citations. An opt-in
local LLM (text-generation via the SAME transformers.js dependency — no
new dependency, D10) is wired behind consent + the P1.4 downloader;
its output passes the SAME grounding gate as the extractive path or
falls back to extractive. Prompt-injection red-team suite pins the
guarantee: surfaced text is always composed of verified transcript
substrings.

## Tasks

| Task | What | Status | Evidence |
| --- | --- | --- | --- |
| P4.1 | Deterministic intent router | DONE | 9 tests (en/bn golden tables, priority order, defaults) |
| P4.2 | History-aware query rewrite | DONE | 10 tests (deixis en/bn, bare follow-ups, cap, no-invention) |
| P4.3 | Evidence sufficiency + calibration | DONE | 8 tests (logistic anchors, monotonicity, threshold flip) |
| P4.6 | Grounding contract (pulled early) | DONE | 10 tests (exact substrings, adversarial citations, downgrade) |
| P4.4 | Provider interface + extractive default | DONE | 14 tests (golden answers, substring property, bn, budget) |
| P4.5 | Local LLM provider (opt-in) | DONE | 13 tests (grounded passthrough, refusal, hallucination→extractive) + D10 |
| P4.7 | Prompt-injection defenses | DONE | 15 red-team tests + delimiter defanging in sanitizeForPrompt |
| P4.8 | Ask UI | DONE | e2e ragAsk 3/3 (grounded+seek, hostile inertness, LLM badge) + axe 0 + en/bn |
| P4.9 | Phase 4 evals | DONE | hit@3/answer ≥ 5/6, refusal 100%, injection 0 ungrounded, deterministic |
| P4.10 | Phase 4 gate | DONE | see Gate below |

## Gate (real output, this tree)

- Unit/integration: `vitest run` → **Test Files 118 passed (118), Tests 1047 passed (1047)** (P3 end: 964).
- `tests/rag`: 327 passing (ask: intent 9, rewrite 10, sufficiency 8, grounding 10, extractive 14, llmProvider 13, redteam 15, askEval 4).
- tsc `--noEmit`: **0 errors**. eslint (touched dirs): **0 problems**.
- Bundle gate: entry **122,351 B gz** vs baseline 120,554 / limit 122,602 → **+1,797 ≤ +2,048 ✓** (P3 end: 122,347 — Ask added +4 B gz to the entry; all ask kernels/providers/UI are lazy).
- e2e: **72 passed** (`chromium-fake-media`; 69 prior + 3 ragAsk).

## Grounding guarantee (the contract)

An answer reaches the UI only when (a) every citation id exists in the
retrieved evidence, (b) every quote is an exact NFKC substring of its
cited chunk with times inside the chunk span, and (c) the answer text is
either exactly the verified quotes joined (extractive) or its longest
sentence traces to a cited chunk (LLM). Anything else → 'insufficient'
("Not in this transcript."). The gate lives in `enforceGrounding()` and
applies to ALL providers; the LLM path additionally falls back to the
extractive provider on refusal or hallucination.

## Injection red-team summary

Direct instructions, fake system roles, fake tool calls, script/markdown
smuggle, control/bidi pressure, delimiter-escape (evidence containing
`EVIDENCE>>>` — now defanged to look-alikes), and prompt flooding all
keep the invariant: the ask pipeline may only surface verified transcript
substrings presented AS quotes with citations. The LLM prompt wraps
evidence in DATA blocks with caps (5 blocks × 1200 chars) and demands the
literal refusal NOT IN TRANSCRIPT when evidence is missing. UI renders
answers as text nodes (e2e asserts no script/iframe/img in answer areas).

## Decisions recorded (new in Phase 4)

- **D10** — the opt-in local LLM reuses `@huggingface/transformers`
  `text-generation` (same storage contract, same vendored ORT, q4)
  instead of adding @mlc-ai/web-llm: zero new dependencies, one offline
  contract; CI runs the deterministic fake LLM client; real-model
  quality checks stay opt-in scripts (P6).

## Known notes

- P4.3's calibration slope was corrected 120 → 250 post-commit so
  top-of-range RRF scores answer (fix commit `b12bcc5`).
- Extractive budget fix: run-on chunks (transcript segments carry no
  sentence marks) are truncated at a word boundary — still exact
  substrings, grounding holds.
- The LLM model registry entry ships via the seam (e2e) today; the real
  registry entry (measured bytes + SHA-256) lands with P6 per the
  manifest's phase plan.
- Panel search deliberately uses lexical mode (D9, unchanged); Ask uses
  hybrid retrieval behind the sufficiency gate.

## Next

Phase 5 — Smart edits (EditPlan zod, deterministic planners, applyPlan
via performEdit = ONE undo). Awaiting `PROCEED TO PHASE 5`.
