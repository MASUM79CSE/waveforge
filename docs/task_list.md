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

- [ ] R&R spike: WaveSurfer 7 / peaks.js evaluation → close `adr/001`
- [ ] `engine/AudioDocument`, decode pipeline (Zod-gated) + progress/cancel
- [ ] `workers/peaks.worker` + `PeakClient` (tile LRU) + protocol schemas
- [ ] `WaveRenderer`: lanes, DPR, zoom/scroll, ruler, progressive tiles
- [ ] Transport: play/pause/stop/seek/loop; keyboard map; follow cursor
- [ ] Sample file generator (`scripts/gen-sample.mjs`) + Load Sample action
- [ ] Integration tests: decode→install→render; e2e flow #1 (Playwright)

## M2+ — see Build Plan §10 (roadmap)
