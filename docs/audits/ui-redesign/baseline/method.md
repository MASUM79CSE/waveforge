# Baseline measurement method — Phase 0 (ui-redesign)

Anchor: main @ `22b6aba` (v1.0.0 production state). Every number below is reproducible with
the commands in this file on that commit.

## Gates (UX-0.2)
- typecheck: `npm run typecheck` · lint: `npm run lint`
- unit: `npm run test` (vitest run) — 86 files / 720 tests, ~169 s
- e2e: `CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome LD_LIBRARY_PATH=$HOME/pw-libs/root/usr/lib/x86_64-linux-gnu npx playwright test --workers=1` — 59 passed
- build: `npm run build` → bundle `index-ajTvOWzM.js` measured with
  `gzip -c dist/assets/index-ajTvOWzM.js | wc -c` = **120,084 B gz** (raw 388,669 B).
  (main has no check-bundle script; manual gzip is the canonical measure here.)
- Lighthouse: `npx vite preview --port 4179 --strictPort` then Lighthouse CLI desktop +
  mobile presets against it; server killed after.

## State matrix (UX-0.3)
`node docs/audits/ui-redesign/phase0-probe.mjs --base=http://localhost:5180`
(dev server `npm run dev` on strictPort 5180, chromium env vars as above).

- Fixture: the app's own **Load Sample** welcome action → `demo.wav` (UX-D2).
- States: no-audio (welcome dismissed) → reload → loaded-stopped → playing
  (transport-play) → recording (fake-media grant + record-toggle) → selection
  (drag on waveform region) → multitrack (Add-track flow). Order note: no-audio is shot on a
  first page load; `page.reload()` brings the welcome dialog back for the loaded sequence.
- Widths 1440/1280/1024/768/390/320 × themes dark/light (`waveforge.theme`), bn locale via
  `waveforge.locale` where exercised; output `docs/screenshots/ui-redesign/phase0/*.png`
  (72 files) + `baseline/probe-metrics.json`.
- Metrics collected: smallest clickable target (bounding boxes of buttons/inputs),
  tab-stop count in the frame chrome, long tasks + CLS + frame cadence during a playback
  window.

## Waveform redraw cost (UX-0.3 addendum)
`node docs/audits/ui-redesign/redraw-probe.mjs --base=http://localhost:5180`
Wraps `CanvasRenderingContext2D` draw calls + rAF and samples long-animation-frames during a
5 s playback of the sample at 1280×800 light. Result in `baseline/redraw-metrics.json`.
The identical probe re-runs after Phase 4/6 for before/after proof.

## Rules
- Screenshots only of states actually produced by the probe (verified by opening them).
- Anything not executed is recorded NOT RUN, never inferred.
- Baseline numbers are frozen; later phases compare against this file.
