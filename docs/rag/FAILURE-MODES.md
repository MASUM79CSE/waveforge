# Smart RAG v2 — Failure-Mode Matrix (P6.2)

Every failure below maps to a TYPED error (never a raw throw to the UI)
and a user-visible behavior, backed by a named passing test. CI runs
all of these on every push (deterministic fakes; no ML).

| # | Failure | Typed error / signal | User-visible behavior | Test (passing) |
| --- | --- | --- | --- | --- |
| 1 | ASR model not installed | `MODEL_NOT_INSTALLED` | Consent dialog offered; never a fetch | `tests/rag/asr/*` (asr.init seam); e2e `ragTranscribe` consent flow |
| 2 | ASR cache entry corrupt / hash mismatch | typed cache-miss failure | Re-download offered; no playback of bad bytes | `tests/rag/asr/asrCache` hash checks |
| 3 | Download aborted mid-flight | typed abort | Partial bytes never stored as installed | `tests/rag/downloader.test.ts` abort tests |
| 4 | Transcription cancelled | `ABORTED` | State resets; re-run is clean | `tests/rag/transcripts/controller` (cancel = cancel + re-run) |
| 5 | Transcription worker failure | `TRANSCRIBE_FAILED` | Toast + state reset; app usable | `tests/rag/transcripts/controller` error tests |
| 6 | No audio document open | `NO_AUDIO` | Panel CTA explains requirement | `tests/rag/transcripts/controller` |
| 7 | Quota exceeded writing index | `RagQuotaError` | Typed rejection surfaced; nothing partially written | `tests/rag/retrieval/indexStore` quota tests |
| 8 | Corrupt index rows in IDB | silently dropped on load | Search skips bad rows; index still usable | `tests/rag/retrieval/indexStore` corrupt-row tests |
| 9 | Index job cancelled mid-embed | `ABORTED` (`IndexError`) | Zero rows persisted (putDoc is the only writer) | `tests/rag/retrieval/indexJob` mid-run abort test |
| 10 | Embedding worker init failure | `MODEL_NOT_INSTALLED` / `NOT_INITIALIZED` | Ask falls back to extractive; search stays lexical | `tests/rag/retrieval/embed` tests |
| 11 | Ask with no retrieval evidence | `insufficient` (status) | "Not in this transcript." — never an invention | `tests/rag/ask/askEval` out-of-corpus 100% refusal |
| 12 | LLM not installed / init fails | fallback | Extractive answer for the same evidence | `tests/rag/ask/llmProvider` fallback tests |
| 13 | LLM hallucinates / refuses | grounding downgrade | Fallback to extractive; ungrounded text never shown | `tests/rag/ask/llmProvider` + `grounding` tests |
| 14 | Hostile transcript (injection) | structural immunity | Only verified transcript substrings ever surface | `tests/rag/ask/redteam` (15 tests) |
| 15 | Unsafe smart-edit plan (too big / out of bounds) | `unsafe` rejection | "That edit is not safe on this document." | `tests/rag/edits/normalize` + `safety` tests |
| 16 | Smart edit apply fails at the doc layer | `failed` rejection | Toast; doc untouched; undo stack clean | `tests/rag/edits/planToOutcome` null-guard tests |
| 17 | Transcript store corrupt / version skew | find returns null | Panel shows "run transcription" (no stale data) | `tests/rag/transcripts/store` round-trip/skew tests |
| 18 | IDB unavailable (private mode) | openIndexDB typed failure | RAG features degrade; editor fully usable | `tests/rag/retrieval/indexStore` + `tests/rag/transcripts` open tests |

Notes:
- The `ragState` signal machine (`idle → downloading → transcribing →
  ready`) resets to `idle` on every failure path (runtime wiring tests).
- Smart edits NEVER auto-apply; every failure above leaves the document
  and the undo stack untouched until an explicit user action succeeds.
- Semantic panel search (D9/P6.12) can return "no matches" for queries
  whose MiniLM cosine falls below the calibrated floor (0.15) — e.g.
  heavy paraphrase, or languages the encoder represents weakly. This is
  by design (honest empty beats noise), the literal text is still
  findable, and the floor is a frozen constant reproducible via
  `scripts/rag/quality-embed.mjs` if recalibration is ever needed.
- See `RELEASE-REPORT.md` § invariants for the privacy/egress ledger.
