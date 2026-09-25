<div align="center">

# 🎚️ WaveForge

**A production-grade, 100% client-side audio & waveform editor — record, edit, master, and export, entirely in your browser.**

WaveForge loads multitrack sessions and single files, edits them with a
professional toolset, applies 30+ accuracy-verified effects, records via a
studio flow (count-in, monitoring, punch in/out), masters against streaming
loudness targets, and exports WAV/MP3/FLAC — with **no uploads, no accounts,
no tracking**. Your audio never leaves your machine.

[![Preact](https://img.shields.io/badge/Preact-11-673AB8?logo=preact&logoColor=white)](https://preactjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tests](https://img.shields.io/badge/tests-720%20%2B%2059%20e2e%20passing-brightgreen)](#-testing)
[![Lighthouse](https://img.shields.io/badge/Lighthouse-99%20%2F%20100%20%2F%20100%20%2F%20100-success)](#-testing)
[![License](https://img.shields.io/badge/license-MIT-informational)](LICENSE)

[Features](#-features) · [Tech Stack](#-tech-stack) · [Architecture](#-architecture) · [Quick Start](#-quick-start) · [Testing](#-testing) · [Deployment](#-deployment) · [Documentation](#-documentation)

</div>

---

> **Privacy note:** audio processing, decoding, analysis, and encoding all
> run locally via the Web Audio API, WASM, and Web Workers — the app makes
> **no network requests with your audio**. Drafts persist in your browser's
> own IndexedDB. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10.

<div align="center">
  <img src="docs/screenshots/editor-overview.png" alt="WaveForge — zone-based transport, waveform selection, meter bridge" width="850">
  <p><em>The WaveForge editor — labeled transport zones, selection readout, beat grid, and status bar.</em></p>
</div>

## Table of Contents

1. [Features](#-features)
2. [Tech Stack](#-tech-stack)
3. [Architecture](#-architecture)
4. [Project Structure](#-project-structure)
5. [Quick Start](#-quick-start)
6. [Development Workflow](#-development-workflow)
7. [Testing](#-testing)
8. [Deployment](#-deployment)
9. [Troubleshooting](#-troubleshooting)
10. [Documentation](#-documentation)
11. [License](#-license)

---

## ✨ Features

**Editing & arrangement**
- Cut / copy / paste / trim / silence / normalize / reverse / invert /
  remove-silence, with zero-cross snapping and seamless loop
- **Multitrack lanes** with per-channel gain/pan/mute/solo strips; clips you
  can move, trim, split, and duplicate on one shared timeline
- ≥ 100-step undo with copy-on-write economics — byte-budgeted under 250 MB
- Standard shortcuts (`Ctrl+Z/Y/X/C/V/A`) **and** the legacy `Shift+key` layer

**Effects & mastering**
- **30+ effects** in 9 organized sections: dynamics, parametric & graphic EQ,
  modulation, two reverbs, de-esser, distortion, gate, time-stretch /
  pitch-shift (WSOLA), varispeed
- Three noise-reduction engines, including **AI Voice Clarity (RNNoise WASM)**
- **FX Rack** — serial chains with reorder/bypass, built-in recipes (Voice
  rescue, Podcast polish, Master glue, Warm air), user presets, JSON import/export
- **Per-parameter automation envelopes** — graph and kernel effects alike,
  with A/B preview everywhere

**Recording (studio flow)**
- Arm → live peak-hold + clip meter → roll, with count-in metronome
  (BPM-aware), input monitoring (feedback-safe default OFF)
- Session takes list; **punch in/out with pre-roll** as one undoable edit
- `R` / `M` / `P` shortcuts for arm / monitor / punch

**Analysis & export**
- Live spectrum & loudness meters, BPM + beat-grid snap
- **Mastering report**: integrated LUFS, true peak, LRA, clipping integrity,
  per-platform delivery verdicts (Spotify, Apple, YouTube, Netflix, EBU…),
  CSV/clipboard export
- **Professional export chooser**: WAV (16/24/32f) / MP3 (128–320) / FLAC
  (0–8) quality cards with guidance and a live size estimate; selection-only;
  ID3v2 tags; per-lane stems; cancelable worker encoding with progress

**Platform & privacy**
- **Pure client-side PWA** — installable, fully offline, zero backend
- IndexedDB drafts + autosave ring with crash recovery; noise prints and
  automation persist across save/reload
- Light & dark themes; full keyboard operability; WCAG 2.1 AA (axe-gated)

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| UI | [Preact 11](https://preactjs.com) + `@preact/signals` (fine-grained updates, tiny runtime) |
| Language | TypeScript (strict mode) |
| Build | [Vite 8](https://vitejs.dev) + `vite-plugin-pwa` (Workbox precache) |
| Audio engine | [Web Audio API](https://developer.mozilla.org/docs/Web/API/Web_Audio_API) + AudioWorklet capture |
| DSP | Pure TypeScript kernels + FFT partitioned convolver |
| Codecs | lamejs (MP3, worker), libFLAC (WASM worker), native WAV writer |
| AI denoise | [RNNoise](https://github.com/xiph/rnnoise) via `@echogarden/rnnoise-wasm` |
| Persistence | IndexedDB (drafts/autosave/assets/presets) + `localStorage` settings |
| Testing | [Vitest](https://vitest.dev) (unit), [Playwright](https://playwright.dev) (e2e + axe-core) |
| Quality | ESLint, Prettier, Lighthouse CI gates |

Full dependency list: [`package.json`](package.json). Third-party notices:
[`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md).

## 🏗 Architecture

```
┌────────────────────────────────── Browser ──────────────────────────┐
│  Preact UI (signals) ── command registry (menus/shortcuts/toolbar)  │
│        │                                                            │
│        ▼                                                            │
│  Engine layer — AudioDocument (immutable, copy-on-write)            │
│  editOps → byte-budgeted EDL history · lanes/clips/assets           │
│        │                                                            │
│        ├── peaks.worker        (zoom mip cache)                     │
│        ├── analysis.worker     (LUFS / BPM / report)                │
│        ├── mp3Export.worker    (lamejs, cancelable)                 │
│        └── flac-export.worker  (libFLAC WASM)                       │
│                                                                     │
│  AudioContext graph: sources → gain/pan strips → analyser → out     │
│  Recorder: MediaStream → recorder.worklet → accumulator → edit      │
│                                                                     │
│  IndexedDB: drafts (WFD3) · autosave ring · deduped assets          │
└─────────────────────────────────────────────────────────────────────┘
```

Worker-first DSP: nothing audio-sized runs on the main thread. Documents are
immutable; every user action is exactly one undoable edit. Full detail —
module boundaries, data flows, threading model, and rationale — is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 📁 Project Structure

```
src/app/        UI shell — state signals, actions, command registry, menus,
                keyboard, dialogs, transport/menu components, styles
src/engine/     Pure audio core — documents, edits, history, projects/clips,
                transport, recorder/punch/takes, analysis kernels
src/fx/         Effect definitions (registry) + DSP kernels and curves
src/io/         Decode, export service + format catalog, WAV writer, ID3v2,
                draft repository (IndexedDB)
src/workers/    MP3 export, analysis, peaks workers
src/worklets/   recorder.worklet (AudioWorklet capture)
public/         Vendored runtimes (libFLAC WASM), PWA assets
tests/          Vitest unit suites + Playwright e2e (incl. axe gate)
docs/           Architecture, design, memory, database, breakdown docs
scripts/        Deterministic sample generator, encoder validation
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** and npm
- A modern **Chromium-based browser** for development and the e2e suite
- **Nothing else** — no database, no accounts, no API keys, no environment
  variables, no backend of any kind

### Installation

```bash
git clone https://github.com/MASUM79CSE/waveforge.git
cd waveforge
npm install --legacy-peer-deps   # peer-dep pinning is intentional
```

### Run it

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the welcome dialog
offers **Open file** (pick any audio file) or **Load sample** (built-in
demo tone). That's the whole setup: the app is a static PWA and stores
everything in your browser.

## 🛠 Development Workflow

```bash
npm run dev              # dev server (hot reload)
npm run test             # Vitest unit suite (720 tests)
npm run e2e              # Playwright end-to-end suite (59 tests)
npm run typecheck        # tsc --noEmit (strict)
npm run lint             # ESLint
npm run build            # production build → dist/ (PWA precache)
npm run preview          # serve the production build locally
npm run validate:encoders # encoder contract checks
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and the unit suite
with coverage on every push/PR to `main`. The full gate bar per change:
**720/720 unit · 59/59 e2e · lint 0 · tsc clean · Lighthouse ≥ 95**.

## ✅ Testing

| Suite | Command | Coverage |
|---|---|---|
| **Unit** | `npm run test` | 720 tests across 86 files — pure DSP kernels with analytic anchors (true-peak, RBJ, RT60, WOLA, SNR), edit/history byte economics, storage round-trips, catalogs, reducer state |
| **End-to-end** | `npm run e2e` | Playwright in Chromium with fake media — full user flows (load → edit → effect → export, record, drafts, shortcuts) plus a permanent **axe-core WCAG 2.1 AA zero-violations** gate |
| **Quality gates** | `lint` / `typecheck` / `build` | ESLint 0 findings, strict tsc, production build; Lighthouse **99/100/100/100** desktop, **99** mobile performance |

DSP accuracy is anchor-tested, not eyeballed: every effects kernel ships
with analytic or reference tolerances (see
[`docs/PROJECT_BREAKDOWN.md`](docs/PROJECT_BREAKDOWN.md) §4).

## 🌐 Deployment

The build output is a **fully static site** — deploy anywhere, no server
components, no environment variables.

**Vercel (default target):**

1. Push the repository to GitHub.
2. **Import the repo** in the Vercel dashboard — the Vite framework preset
   is auto-detected; `vercel.json` supplies SPA rewrites, asset caching,
   and security headers (CSP).
3. **Deploy** — done. Every push to `main` redeploys; CI gates the build.

**Not on Vercel?** Any static host works: `npm run build`, upload `dist/`.
Note the PWA (service worker + install) and microphone access both require
HTTPS, or `localhost` for local development.

## 🩹 Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| The app loads an **older version** after a new deploy | The PWA precached the previous build. An in-app update banner appears — accept it, or hard-refresh (`Ctrl+Shift+R`) to bypass the service worker. |
| **Microphone recording** does nothing | `getUserMedia` needs HTTPS (or `localhost`); grant the permission, then pick the right device in Record settings. Monitoring is **OFF by default** (feedback-safe) — that's not a bug. |
| **MP3/FLAC export** fails in a hardened browser | WASM compilation requires `wasm-unsafe-eval`; some corporate browsers block it. Allow WASM for the site, or export WAV (no WASM needed). |
| **Crash-recovery banner** appeared | Autosave found a newer snapshot than your last manual save — choose **Restore** or **Discard**. Recovery is never auto-applied. |
| Drafts don't appear on another device/browser | By design: IndexedDB is per-origin and per-browser, and drafts never leave the device. |
| Avatar shows an **"MM" monogram** instead of the photo | The developer avatar loads from an external CDN; offline or blocked it falls back to the monogram by design. |
| `Port already in use` on dev/preview | Another dev or preview server is still running — stop it, or pass a different `--port`. |

## 📚 Documentation

| Document | Covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Principles, system diagram, data flows, threading model, effects pipeline, security, extensibility |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Brand, design tokens, layout anatomy, component contracts, accessibility & responsive gates |
| [`docs/MEMORY.md`](docs/MEMORY.md) | Runtime/undo/peaks/worker/session memory models, budgets, invariants |
| [`docs/DATABASE.md`](docs/DATABASE.md) | IndexedDB schema & WFD versioning, autosave/crash recovery; deferred cloud (MongoDB Atlas) design |
| [`docs/PROJECT_BREAKDOWN.md`](docs/PROJECT_BREAKDOWN.md) | Full build history phase by phase, quality-gate evolution, release checklist |
| [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md) | Bundled third-party code and licenses |

## 📄 License

Released under the [MIT License](LICENSE). Bundled third-party software is
credited in [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md).

---

<div align="center">

Built with Preact, TypeScript, and the Web Audio API ·
Developed by **[Mir Md. Masum](mailto:mirmasum@mail.com)** ·
[Instagram](https://instagram.com/mirmd_masum) · Discord `mir_masum`

</div>
