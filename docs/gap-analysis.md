# Gap analysis — WaveForge (2026-09-25)

**Method:** evidence sweep over the PRD acceptance criteria, task_list open
items, parked/non-goal notes, code TODOs (none), storage/export paths,
Playwright matrix, and the deploy config. Each gap below is verified against
the workspace, not impressions.

## A. Real gaps (functional / verification)

1. **Browser matrix is Chromium-only.** Playwright runs two chromium
   projects; Firefox/WebKit never execute. Safari risks (AudioWorklet +
   OfflineAudioContext differences, absent `showSaveFilePicker` — the
   fallback path IS exercised by tests, Firefox is not) are unmeasured.
   *Highest unticked platform risk.*
2. **Mobile/touch posture undocumented and untested.** Viewport meta + one
   640 px media query exist, but no touch-driven e2e for canvas
   interactions (clip drag, envelope, selection). Desktop-first is a fine
   decision — it is just not WRITTEN DOWN as one, and touch is untested.
3. **PRD acceptance criteria lack a verification trace.** "≥ 100 undo steps
   on 30-min audio under ~250 MB", "preview < 100 ms", "60 fps on 1-hour
   files" have per-kernel budget evidence scattered in task_list but no
   single acceptance stamp mapping each PRD criterion → test/doc.
4. **One pre-existing e2e flake** (effects.spec experimental-stretch flow)
   failed once in ~8 full-suite runs; root cause not chased. Watch-listed
   only.

## B. Bookkeeping / doc gaps (cheap, fix now)

5. **M9e/M9f are DONE but unstamped.** Evidence: `clipHistory.test.ts`
   "M9e formal gate — interleaved clip/bounce/structural undo×redo";
   `draftActions.ts` carries assets through header v3;
   mixdown/stems render from clip-derived channels (parity by
   construction). The task_list boxes (`- [ ] M9e … M9f …`) are still open
   and no dated completion stamp exists.
6. **`docs/effects-v2-plan.md` "still parked" list is stale** — claims
   RNNoise and multitrack parked; both shipped (E7b, M8). Same class of
   stale-truth the §11 fix addressed.
7. **Stray stale open boxes** in task_list (line 33 "moved to M4", line 78
   "automation → scheduled with M5" — both long shipped as A7).
8. **No README.** The "close clone the user can rebrand" requirement has
   brand files + THIRD_PARTY_NOTICES, but a fresh cloner gets no
   build/run/deploy/attribution entry point.

## C. Roadmap gaps (documented decisions pending — not defects)

9. **Stretch/Pitch promotion** out of View → Experimental (product call).
10. **Phase-2 cloud** (PRD M12: Vercel Functions + MongoDB Atlas accounts/
    sync) — not started, by design.
11. **Plugin API** — PRD non-goal v1; never analyzed.
12. **Formant-preserving pitch, MIDI** — parked (effects-v2 §0).
13. **i18n beyond EN** — v1 scope is the EN catalog; more locales unstarted.
14. **rnvoice worker offload** — documented seam (`createRnVoiceStream`),
    main-thread by measured choice.
15. **Ops polish on `vercel.json`** — works for the single-route PWA
    (start_url `/`), but no SPA rewrite (deep links 404 if routes are ever
    added) and no CSP header. Minor hardening, worth doing pre-announce.

## Verified NOT gaps (checked)

Coverage thresholds 80/80/75/80 enforced and green · export formats WAV
16/24/32f + MP3 (worker) + FLAC (worker) per PRD · BPM/beat analysis,
metadata, URL import, recording, offline flow #6, drafts + autosave ring,
toasts `aria-live`, zero TODO/FIXME in src, lint/tsc/e2e gates green.

## Resolution progress (2026-09-25, Y-series)

- **A1 RESOLVED (Y3):** Firefox 155 + WebKit 26.6 pass the full e2e suite
  except the mic-recording specs (Playwright fake media is Chromium-only —
  harness, not app) and WebKit's offline `reload()` internal error (known
  Playwright-WebKit quirk; Firefox passes the same flow). Config:
  `playwright.other.config.ts`; matrix in README. Remaining: one manual
  Safari/offline check on the real deployment (user-side).
- **A3 RESOLVED (Y2):** `docs/acceptance-trace.md` + the undo-depth test
  (which CORRECTED the economics — entries charge both edit sides).
- **B5–B7, B8, C15 RESOLVED (Y1):** truth sweep + README + vercel rewrite/
  CSP-Report-Only.
- **C9 RESOLVED (Z1):** Stretch/Pitch promoted out of View → Experimental —
  first-class Effects item; the gate machinery (flag, toggle command, View
  entry, i18n key) removed; e2e rewritten to the promoted flow.
- **A2 RESOLVED (Z2):** desktop-first posture WRITTEN DOWN (README
  Platforms; pointer-events + touch-action make basic touch work; phone
  layout out of scope by design, AudioMass-aligned).
- **A2, A4:** A4 MITIGATED (Y4): the experimental-stretch flake (1 in ~8
  full-suite runs, 2026-09-25) did not reproduce in 10 standalone runs +
  2 full-suite runs after re-baselining; the menu steps are hardened with
  assert-then-click guards (the only plausible mechanism is the MenuBar
  hover-switch window noted since E5). Watch-list stays. A2 (touch
  posture doc) remains the one open item — a decision note, not code.

## Recommended order (if "continue")

**Y1 (doc-truth sweep)** — B5 + B6 + B7 stamps + B8 README (+ C15
rewrite/CSP headers): one commit, no behavior change. **Y2** — A3
acceptance-trace doc (map PRD criteria → existing evidence, fill the
undo-depth hole with one test if missing). **Y3** — A1 Firefox/WebKit
Playwright pass (report; fix what falls out, or document the supported-
browser matrix honestly). **Y4** — A4 flake root-cause. C9–C14 wait on
explicit product decisions.
