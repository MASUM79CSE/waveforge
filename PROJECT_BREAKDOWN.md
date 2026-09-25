# WaveForge — Project Breakdown & Build History

> **Status:** Production · v1.0 · 2026-09-25
> **Derived from:** full agent build history — 192 conventional commits,
> `ddbe284` (scaffold) → `c0a1baa` (launch hygiene)
> **Related:** [ARCHITECTURE.md](ARCHITECTURE.md) · [DESIGN.md](DESIGN.md) · [MEMORY.md](MEMORY.md) · [DATABASE.md](DATABASE.md) · [docs/task_list.md](docs/task_list.md)

## 1. Headline metrics

| Metric | Value |
|---|---|
| Commits | **192** (conventional-commit discipline throughout) |
| Source | **23,119 LOC** across 6 modules (`app` 12.6k, `engine` 5.1k, `fx` 4.6k, `io` 0.65k, `workers` 0.28k, `worklets` 0.06k) |
| Tests | **13,980 LOC** — **720 unit** (86 files) + **59 e2e** (Chromium, fake media, incl. axe) |
| Governance docs | 56 in-repo docs · **10 ADRs** (000–009) · analysis + plan + stamp per feature series |
| Performance | Lighthouse **99/100/100/100** desktop, **99** mobile perf; main JS ≈ 119.5 KB gz |
| Product | Pure-client PWA audio editor: multitrack, clips, 30+ effects + automation + rack, studio recording, mastering suite, pro export |

## 2. Build timeline (phase by phase)

### Foundation — scaffold → M0 core (5 commits)
Toolchain + CI gates + Vercel config (`ddbe284`); governance docs seeded
with **ADR 000–004** (`a910b06`); core utilities specced **RED-first**
then implemented (errors/result/logger/bus/format/zoom/schemas); M0 app
shell (menubar, transport, status, dialogs, toasts, error boundary).
**Exit gates:** typecheck, lint, coverage **94 %**, build 13 KB gz.

### M1 — engine & renderer (4)
Pure engine layer, peaks worker, audio engine, canvas renderer; loading
pipeline + transport + view + keyboard + URL import; custom-renderer ADR
001 closed. Defect log started (`9e09317` stereo router fix).

### M2 — editing core (4)
Edit kernel, **byte-budgeted history** (EDL, ADR 002), `AudioEditor`,
channel routing; editing UX (undo/redo, clipboard, menus, prompts).

### M3 — effects foundation (4)
Effect registry, DSP kernels, graph builders (ADR 005); dialog with
**A/B preview**, offline apply, effects menus.

### M4 — record & export core (3)
WAV writer, worklet recorder, worker encoders; export dialog, record
button + meter; Playwright e2e suite founded (RED-first units).

### M5 — analysis & metadata (4)
**BS.1770-4 LUFS**, tempo detection, spectrum mapping, ID3v2.4; analysis
worker + panel, song info, beat grid + snap (ADR 007).

### M6 — persistence & PWA (4)
Storage layer (`DraftRepository`, **WFD1**, autosave, settings), drafts
manager, crash-recovery banner, update flow, PWA precache (ADR 008).

### M7 — hardening & release (9)
Error-log ring, doctor self-diagnostics, modal focus trap, zero-console
gate, a11y contrast fix, canvas extraction, **noise-print persistence**
(save/reload/reopen e2e), undo byte-budget literalism fix. LH stamped.

### E-series — effects v2, accuracy-gated (≈ 22)
Analytic-anchored kernels (RED→green each): E1 mastering (true-peak
limiter, LUFS normalize, soft-knee compressor) · E2 RBJ biquad engine +
8-band parametric EQ · E3 modulation (chorus/flanger/phaser/tremolo/
vibrato, Catmull frac-delay, absolute-time LFOs) · E4 FFT convolver +
seeded IR **Studio Reverb** (RT60 ±5 %) · E6 LR4 de-esser + STFT
noise-print NR (WOLA reconstruction) · E5 **WSOLA** stretch/pitch ·
**E7** NR v3 (IMCRA-lite + DD a priori SNR) · **E7b RNNoise "AI Voice
Clarity"** (vendored wasm). ADR 009 + `docs/effects-v2-plan.md` §8.

### UX shortcuts (2)
Standard `Ctrl+Z/Y/X/C/V/A` table alongside legacy shift-letters, single
source `shortcuts.ts`, platform-aware menu hints.

### D-series — reference design parity (≈ 14)
D0 live-reference analysis → D1 tokens → D2 icon toolbar → D3 selection
readout (+ `Q` clear) → D4 canvas skin + amplitude axis/channel rail →
D5 zoom/vertical-zoom/beat row → D6 shortcuts overlay + welcome tips →
D8 volume/pan strips → D9 light theme + accent system → D10 tooltips +
dnd overlay. Screenshot evidence per step (`docs/design/`).

### M8 — multitrack (9)
Pure lane-mix kernels → project transport (mixdown-parity) → track-
tagged history → lane UI + strips → drafts **WFD2** → mixdown/stem
export → effects/record target active lane.

### M9 — clips & arrangement (12)
Placement/render kernels → asset library + **COW bounces** → per-clip
scheduling → **doc-model flip** (lanes hold clip lists over shared
assets) → interactions (move/trim/split/duplicate) → history/interleave
gate → drafts **WFD3** + save/reload e2e.

### A-series — automation (19)
A1 pure curve kernel → A2 model/history/mixdown (bit-identity) → A3
playback ramps → A4 envelope UI (`A` mode, gestures, hit anchors) → A5
draft persistence (optional fields) → A6 graph-kind + kernel-kind curves
(swept biquads, dynamics, modulation/reverb) → A7 dialog authoring +
e2e. Accuracy rule: automation renders are anchored, not approximate.

### C-series — FX Rack & presets (7)
Chain model (zod boundary, registry-validated) → serial apply with
bypass/identity laws → recipes (Voice rescue, Podcast polish, Master
glue, Warm air) + user presets → rack e2e → per-entry envelope curves.

### X / Y / Z — trust hardening (≈ 10)
X: accessible control names + **permanent axe gate** + keyboard-operable
envelopes · Y: PRD acceptance trace, undo-depth economics test,
Firefox/WebKit pass, truth sweep, Vercel SPA/CSP · Z: platform posture,
Stretch promotion out of the experimental gate, flake mitigation
(assert-then-click guards).

### P-series — mastering report (3)
Streaming verdicts, stereo/integrity/balance/noise audit, platform
targets, **CSV/clipboard export** — analysis suite closed.

### R-series — studio recording (3)
Arm/roll, count-in click (BPM-aware), monitoring (feedback-safe OFF),
takes, **punch in/out through the project stack** with configurable
pre-roll. `docs/recording-analysis.md`.

### Launch polish (final ≈ 12)
Effects menu → 9 labeled sections; label-clipping fixes; transport bar
redesigned into **labeled zones** (position-first, standalone play,
separated stop/pause); **export chooser** (format cards, presets, size
estimate); welcome hero + developer credit → corrected split (simple
line on Welcome, full card on About); File/View menu grouping; e2e
retry hardening; README v2 with real screenshots + architecture;
repo cleanup; CSP avatar allowance.

## 3. Workstream → module matrix

| Workstream | Series | Primary modules |
|---|---|---|
| Core engine | M1, M2 | `engine/` (document, edits, history) |
| Effects | M3, E, C, A6 | `fx/`, `engine/` |
| Recording | M4, R | `worklets/`, `engine/` (recorder/punch/takes) |
| Export | M4, chooser | `io/`, `workers/` |
| Analysis | M5, P | `engine/` (kernels), `workers/` |
| Persistence | M6, M8e, M9f, A5 | `io/` (DraftRepository, WFD#) |
| UI/UX | M0, D, launch polish | `app/` |
| Accessibility/QA | X, Y, M7 | `app/`, e2e suites |
| Multitrack/clips | M8, M9 | `engine/` (project), `app/` (lanes) |

## 4. Quality-gate evolution

| Phase | Gates added |
|---|---|
| M0 | typecheck, lint, coverage 94 %, build-size budget |
| M2+ | RED-first unit anchors per kernel (analytic/reference) |
| M4 | Playwright e2e founded |
| M7 | zero-console-errors session gate; LH stamp convention |
| E | per-effect accuracy anchors (TP, RBJ, RT60, WOLA, SNR) |
| A | bit-identity anchors for automation/mixdown |
| X | permanent **axe WCAG 2.1 AA zero-violations** e2e |
| Y | cross-browser pass (FF 44/45, WK 43/45), acceptance trace |
| Launch | e2e `retries: 1`; README screenshots from the real app |

Current status: **720/720 unit · 59/59 e2e · lint 0 · tsc clean ·
LH 99/100/100/100 · axe 0 · tree clean.**

## 5. Deferred / parked

| Item | Status |
|---|---|
| M12 cloud (MongoDB Atlas + Vercel serverless, sync, auth) | **Parked** — design in [DATABASE.md](DATABASE.md) §3; restarts on user request |
| Cross-browser full parity | Chromium is the supported target; FF/WebKit environment-limited (fake-media), documented in Y3 |
| CSP enforcement | Header ships Report-Only; flip to enforcing after production observation |

## 6. Release readiness checklist

- [x] Feature-complete v1 scope (PRD §11 deltas closed — C5/Z stamps)
- [x] All gates green at head `c0a1baa`
- [x] Lighthouse ≥ 95 all categories (99/100/100/100)
- [x] Accessibility: axe 0 violations, keyboard-complete
- [x] PWA offline + installable; crash-recovery verified
- [x] Docs: README v2 + ARCHITECTURE/DESIGN/MEMORY/DATABASE/BREAKDOWN + 10 ADRs
- [x] Legal: MIT + THIRD_PARTY_NOTICES + attribution (LICENSE/brand.ts)
- [x] Deploy config: `vercel.json` (build, SPA rewrites, cache + security headers, CSP)
- [ ] **User action:** `git push` → Vercel import → deploy

---

*This file is the historical index of the build. New work appends a
series section and stamps it in `docs/task_list.md` (ECC convention).*
