# Task List

> Living breakdown per ECC `development-workflow.md` (planner output). One
> checkbox = one reviewed+tested unit.

## M0 — Skeleton, governance & branding

- [x] Research & reuse gate → `adr/000` (toolchain pinned, TS 5.9 vs 7 decision)
- [x] Scaffold: Vite + TS strict + Preact; ESLint/Prettier; CI workflow; vercel.json
- [x] Project hooks (`.claude/settings.json` + PostToolUse format hook)
- [x] Docs set: prd / architecture / tech_doc / task_list + ADR 000–004
- [x] TDD RED→GREEN: `core/format`, `core/zoom`
- [x] TDD RED→GREEN: `core/result`, `core/errors`, `core/logger`, `core/bus`, `core/schemas`
- [x] i18n catalog + error-message map (codes → keys → copy)
- [x] App shell: MenuBar, TransportBar (disabled), StatusBar, Toasts, Modal base,
      Welcome + About dialogs, keyboard (Escape), ErrorBoundary, empty state
- [x] Design tokens + brand.ts rebrand skin
- [x] Exit gates: typecheck ✓ lint ✓ coverage ≥ 80% core ✓ build ✓ dev-server smoke ✓
- [x] Review pass (checklist in tech_doc) — findings fixed

## M1 — Core engine: load, render, transport (next)

- [x] R&R spike: wavesurfer.js 8 / peaks.js 4 evaluated → `adr/001` closed (custom renderer)
- [x] TDD RED→GREEN: `viewState`, `transportMath`, `peaksCompute`, `protocol` (Zod),
      `AudioDocument`, `PeakClient` (fake-transport protocol tests)
- [x] `workers/peaks.worker` (mip cache, byte budget) + `WaveRenderer`
      (lanes, DPR, zoom/scroll, ruler, progressive tiles, raw path, pointer+wheel)
- [x] `AudioEngine` transport (play/pause/stop/seek/loop, drift-free clock)
- [x] Loading: file picker / drag&drop / URL (Zod + progress) / generated sample
      (`scripts/gen-sample.mjs` → `public/samples/demo.wav`)
- [x] Keyboard map (Space/arrows/Home/End/L/±/0/Tab/Q/Shift+A/Ctrl+O), follow cursor
- [x] URL dialog, loading overlay, status bar (selection/zoom/position)
- [ ] e2e flow #1 — **moved to M4** with the Playwright suite (deviation logged:
      §8.4 schedules Playwright from M4; M1 verified via live-server smoke of all
      modules + pure-math integration tests instead)

## M2+ — see Build Plan §10 (roadmap)
