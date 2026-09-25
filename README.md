# WaveForge

A free, private, installable web audio editor: trim, clean, effect, record,
arrange, and export audio **entirely in your browser**. No uploads, no
accounts, no tracking — your audio never leaves the machine.

WaveForge began as a light-edition homage to
[AudioMass](https://audiomass.co) (its visual language and interaction
model) and has grown beyond it: multitrack lanes, a clip/arrangement
timeline, an FX rack with per-entry automation envelopes, three noise
reduction engines (including an RNNoise "AI Voice Clarity" mode), and a
full analysis suite.

## Features

- **Load**: WAV / MP3 / FLAC / OGG / Opus / AAC/M4A / WebM — file picker,
  drag & drop, URL, or the built-in sample
- **Edit**: cut / copy / paste / trim / silence / normalize / reverse /
  invert / remove-silence, zero-cross snapping, seamless loop, ≥ 100-step
  undo with copy-on-write bounces
- **Multitrack + clips**: lanes with per-channel strips (gain / pan /
  mute / solo), clip move / trim / split / duplicate, per-clip envelopes
- **Effects** (A/B preview + per-param automation envelopes): compressor,
  limiter, PG-EQ, graphic EQ 10/20, delay, reverb ×2, chorus, flanger,
  phaser, tremolo, vibrato, distortion, gate, de-esser, noise reduction
  (adaptive Wiener + spectral print), **AI Voice Clarity (RNNoise)**,
  time-stretch / pitch-shift (WSOLA)
- **FX Rack**: serial chains with reorder / bypass, built-in recipes
  (Voice rescue, Podcast polish, Master glue, Warm air), user presets,
  chain JSON import/export
- **Record (studio flow)**: arm → live peak-hold/clip meter → roll; count-in
  with metronome click (BPM-aware or detected tempo), input monitoring
  (feedback-safe default OFF), session takes list, punch in/out with
  pre-roll (document or active-lane, one undoable edit), `R` / `M` / `P`
  shortcuts
- **Analyze**: live spectrum/frequency meters, LUFS, true peak, BPM +
  beat-grid snap
- **Export (professional chooser)**: format cards (WAV lossless / MP3
  lossy / FLAC lossless) with labeled quality presets and per-preset
  guidance, live size estimate; WAV 16/24/32f, MP3 128–320, FLAC 0–8;
  selection-only; ID3v2 on MP3; per-lane stems; project mixdown; worker
  encoding with progress + cancel; native save picker when available
- **Persistence**: IndexedDB drafts + autosave ring (crash recovery),
  everything offline-capable (PWA)
- **Interface**: grouped menus (Effects in 9 tool sections), zone-based
  transport (position clock, standalone play/pause, ±5 s seeks), LUFS
  mastering report with per-platform targets + CSV/text export

## Development

```bash
npm install --legacy-peer-deps   # peer-dep pinning is intentional
npm run dev                      # dev server
npm run test                     # unit suite (vitest)
npm run test:e2e                 # Playwright suite (builds + serves first)
npm run lint && npx tsc --noEmit # gates
npm run build                    # production build → dist/
```

Requirements: Node 20+. The unit suite enforces coverage thresholds
(80/80/75/80); the e2e suite includes a permanent axe-core accessibility
gate (zero WCAG A/AA violations) and runs the production build through the
real service worker for the offline flow.

### Browser support (verified by the Y3 cross-browser pass)

| Engine | Result | Notes |
| --- | --- | --- |
| Chromium | 47/47 e2e | primary target (Playwright fake media) |
| Firefox 155 | 44/45 | the mic-recording spec is harness-limited (Playwright's fake media is Chromium-only); offline flow PASSES |
| WebKit 26.6 | 43/45 | same mic limit + Playwright-WebKit `reload()` internal error in the offline spec (known harness quirk; verify offline on real Safari after deploy) |

Cross-browser check: `npx playwright test --config=playwright.other.config.ts`.

## Platforms

**Desktop-first by decision.** The editor targets desktop pointer + keyboard
interaction (canvas selection/drag drawing, shortcuts, multi-panel layout);
tablets with a pointer work, and canvases use pointer events with
`touch-action: none` so basic touch drawing/dragging functions — but a
phone-optimized layout is out of scope by design (matches AudioMass's own
desktop-first posture; phone DAW workloads are dominated by native apps).
Browser support matrix below.

## Deploy (Vercel)

The repo ships `vercel.json` (static build, immutable asset caching, SPA
rewrite, security headers incl. CSP in Report-Only mode). Deploy with
`vercel --prod` or connect the repo in the Vercel dashboard — there is no
backend; the app is pure static + service worker.

## Rebranding

WaveForge is a close clone of AudioMass's look and feel by design and is
meant to be rebranded. Brand strings live in `src/brand.ts`; the attribution
required by upstream licenses is kept in `THIRD_PARTY_NOTICES.md` (keep it
intact when rebranding — it covers AudioMass-derived design, libflac,
LAME, RNNoise, and other vendored work).

## Architecture & docs

- `docs/tech_doc.md` — system architecture (engine, workers, storage)
- `docs/prd.md` — product scope + acceptance criteria
- `docs/task_list.md` — the full build ledger (every milestone stamped)
- `docs/adr/` — architecture decision records
- `docs/gap-analysis.md` — current known gaps and deferred decisions

## License & attribution

See `THIRD_PARTY_NOTICES.md`. AudioMass's design influence, the FLAC and
MP3 encoders, and RNNoise are the property of their respective authors;
this repository keeps their notices and attribution strings.
