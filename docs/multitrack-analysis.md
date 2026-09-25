# M8 Multitrack — analysis (2026-09-25)

Status: analysis → plan (ratification pending build start). Sequence per ECC:
analysis → report → plan → build.

## 1. Market (live research, 2026-09)

| Product | Model | Multitrack facts (2026) | Weak spot vs WaveForge |
|---|---|---|---|
| **BandLab** | free, social/cloud | Studio guide: **16 audio+MIDI tracks combined, 15-min project cap**; collaboration + mobile; "large session complexity can stress performance in browser" | account + cloud required; project/time caps; limited export depth |
| **Soundtrap** (Spotify) | subscription $7.99–13.99/mo | free tier ≈ **5 tracks**; real-time collab is the hook | paywall; cloud-only; no local files |
| **Soundation** | freemium cloud | loop-first browser DAW, project sharing/renders | loop-oriented, account-based |
| **Audiotool** | free cloud | electronic/modular focus, device-rack metaphor | account-based; niche workflow |
| **openDAW** (André Michelle) | free, AGPL OSS, Sept 2026 launch | no account, **no track limits**, mixer w/ sends + aux + **stem export** | pre-1.0, thin stock content; **AGPL — code not reusable by WaveForge** |

Takeaways:
1. Every mainstream web multitrack is **account/cloud-gated and track-capped** —
   WaveForge's local-first, no-account, memory-bound lane count is a real
   differentiator (same lane as the NR positioning: honest local tools).
2. openDAW independently validates "no-login browser DAW with stem export" as
   a 2026-relevant lane — but AGPL forbids code reuse; design stays ours.
3. None of the leaders target **the reference editor's simplicity class** (single-pane
   editor). M8 must add tracks without becoming a heavy DAW: lane stack +
   track strips, same single-timeline editing model.

## 2. Codebase facts (where "one document" is assumed)

- `AudioDocument` = one `AudioBufferLike` + `DocMeta`; `AudioEditor` holds one
  document + one `History` (ADR 002 slice-ops: remove/insert/write).
- `state.ts`: `docInfo`, `selection` (single timeline range),
  `channelMutes [L,R]` (per **channel**, not track), `channelsSwapped`.
- Engine: one `AudioBufferSourceNode` per play → splitter → per-channel
  gain+StereoPanner → merger (D8; **StereoPannerNode stays**, mono downmix
  caveat documented). Playhead = ctx-time − startRef.
- Canvas: ONE `CanvasPane` (WaveRenderer, ruler, amplitude rail).
- Effects: `currentChannels()` → region kernels; preview/apply via
  `fxActions` (`targetRange()` on the single timeline).
- Export: renders `doc.buffer` (WAV/MP3/FLAC workers); record → new doc or
  overwrite; drafts: `DraftRecord{header, channels: Float32Array[]}`,
  `channels: 1|2` in the zod schema.
- Peaks worker (ADR 003): tiles for the one buffer, version-keyed.

## 3. Architecture decision (theory)

**Chosen: lane-based single-timeline multitrack (Audacity class), not a clip/
arrangement model.**

- Each track = independent full-length stereo (or mono) buffer on a shared
  timeline. Editing = the existing SliceOp machinery applied to the **active
  track**; zero rework of edit kernels, effects, selection math.
- Mixing = pure sum with per-track gain/pan/mute/solo (deterministic float
  order, unit-testable — same discipline as the NR anchors).
- Playback = N source nodes, one per track, through a per-track
  gain→StereoPanner chain (reuses the D8 graph per track; click-free
  `setTargetAtTime` ramps). Solo = gain gating with the classic
  any-soloed→only-soloed rule.
- Export = mixdown through the same mix kernel (bit-comparable with a pure-TS
  reference), then the existing export pipeline; **stem export** = per-track
  render. Mixdown/stem parity is a testable anchor.
- Undo = History entries tagged with `trackId` (slice-ops stay per-track).
- Drafts = schema v2 with `tracks[]` (header: name/gain/pan/mute/solo; payload
  per-track channel arrays); v1 drafts load as a single track (back-compat).
- Memory: N tracks × len × 2ch × 4 B (PRD budget ~250 MB governs track count;
  no artificial cap — mirror openDAW's "no track limits" stance, enforced by
  the doctor panel showing memory).

Rejected: clip/arrangement model (deferred to M9+ — it reworks undo, export,
playback and the canvas at once; too big a bite, and the reference editor-class users
think in lanes, not clips).

## 4. Phasing (each phase RED→green, full gates, conventional commit)

- **M8a** project core (pure TS): `Track`/`ProjectState` types, pure mix
  kernel (deterministic order, gain/pan/mute/solo), lane-count helpers.
- **M8b** engine: multitrack playback graph (N sources, per-track strips,
  solo/mute gating, transport parity).
- **M8c** editor/history: trackId-tagged undo, active-track edits, project
  adopt/reset parity.
- **M8d** UI: lane stack + track strips (vol/pan/mute/solo), add/remove/
  import-to-track, active-track model, D-series visual parity.
- **M8e** persistence + io: drafts v2 (back-compat), record-into-track,
  mixdown + stem export.
- **M8f** effects on tracks (active-track target, preview, print learn),
  analysis panels per track.
- **M8g** hardening: perf gates (6-track 3-min 60 fps), e2e flows, LH,
  task_list close.
