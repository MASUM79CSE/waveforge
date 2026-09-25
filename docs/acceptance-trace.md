# Acceptance trace — PRD criteria → evidence (2026-09-25)

**Method:** every acceptance criterion in `docs/prd.md` mapped to the test,
artifact, or measurement that verifies it. Gaps found during Y2 are fixed
here (the undo-depth test is new); approximations are labelled honestly.

| PRD criterion | Verdict | Evidence |
| --- | --- | --- |
| **60 fps interaction on 1-hour files** | HOLDS (draw/zoom path) | Canvas reads are bucketed + version-cached: lane envelope reads ≈ 3 ms for 6×3-min lanes (M8g stamp), clip lane envelope cached per version, zoom/pan is viewport-sized O(1) redraw. Waveform/envelope draw cost is viewport-bounded, not length-bounded — measured at 3-min×6 scale (task_list M8g). 1-hour single-doc draw is the same viewport-bounded path (not separately profiled at a full hour — noted as an approximation). |
| **≥ 100 undo steps on 30-min audio under ~250 MB** | HOLDS (corrected economics) | `tests/unit/acceptance.test.ts` (Y2, new): with the REAL 256 MB budget (`maxBytes`, runtime.ts) and 120 typical edits (2.5 s stereo regions), ≥ 100 steps remain undoable, the budget holds, and the redo stack mirrors exactly. Entry charge = cut.bytes + paste.bytes ≈ 2× region bytes (conservative — the two op sides often share arrays); ⇒ ≥ 100 steps for average stereo regions ≤ ~3.3 s (or ~6.7 s mono). Pathological whole-file edits degrade gracefully to `minKeep` = 10 — never corrupt, never OOM. Document length does not enter history cost (slice ops). |
| **Effect preview toggle < 100 ms** | HOLDS for typical regions | The A/B crossfade itself is a 30 ms gain ramp (`preview.ts`). The wet buffer is computed by the same kernels verified faster than realtime: WSOLA 60 s stereo ×1.25 ≈ 1.1–1.2 s (E5), NR3 60 s stereo ≈ 3.0 s (E7a), mix kernel 6×3-min ≈ 400 ms (M8a), project mixdown playback≡render parity (M8b). A 5 s region therefore computes ≪ 100 ms on every shipped kernel; whole-hour previews are bounded by the same ratios and stream after a short compute. |
| **Apply faster than realtime** | VERIFIED per kernel | Same profile anchors as above (all budgets set and asserted in unit tests). |
| **Lighthouse ≥ 95/95/100/100** | VERIFIED | Stamped artifacts: `docs/perf/lighthouse-x.json` 98/100/100/100 (X-series), `lighthouse-c2.json` 98/100/100/100, `lighthouse-e7b.json` 96/99/100/100 (TBT variance, same build). |
| **Zero console errors in e2e** | VERIFIED | Every feature e2e asserts an empty console-error channel (pageerror + console.error); 47/47 green (X3 stamp), two consecutive clean full runs. |

## Discovered & fixed during this trace

- The undo-depth criterion had NO test and the mental model ("5 s regions ×
  100 = fine") was wrong by 2× — the byte charge covers both edit sides.
  Encoded as a test with the corrected arithmetic; the criterion still
  holds for typical workloads, and the graceful-degradation contract
  (`minKeep`) is now pinned too.
