# NR v3 — "Natural Voice" Noise Reduction (E7) — research → design → gates

**Date:** 2026-09-24 · **Replaces as default:** the E6a spectral-gate kernel
(kept as `nrProcess`, legacy-tested). New engine: `src/fx/nr3.ts`.

## 1. Market analysis (live research, 2026)

| Product | Class | What it does | Why users love / hate it |
|---|---|---|---|
| Krisp | real-time ML (on-device) | "differentiates human voice from background; up to ~99 % noise removal **without distorting natural voice tone**" | gold standard for voice; music/multi-talker degrades |
| Adobe Podcast Enhance | cloud ML (Sensei) | one-click, **no noise-print training**, noise+reverb+EQ for speech | effortless; "natural quality kept"; cloud-only |
| Descript Studio Sound | ML, transcript-aware | speech cleanup tied to editing | top-rated (9.3/10 in 2026 roundups) |
| NVIDIA Broadcast / RTX Voice | GPU ML separation | real-time voice isolation | poorly on music/crowds (not a repair tool) |
| iZotope RX / Audition | pro post DSP | tuned denoise workflows | **"watery/smeared" artifacts** when pushed — the classic complaint |
| Waves Clarity Vx | ML plug-in | voice clarity | voice-only focus |

**Synthesis:** leaders are ML speech-separators optimized for *voice-only
realtime*; pro editors win on *offline, artifact-free, music-safe* repair,
and their failure mode is artifacts (musical noise / smearing), not
insufficient depth. Our users edit **general audio offline, in-browser,
private** — so the right "more advanced, natural, no quality loss" move is
the **statistical estimation lineage done properly** (the RX-family
approach), not a voice-only separator that would eat music.

**Phase-2 option (documented, not built now):** RNNoise as an optional
"AI Voice" mode — `@echogarden/rnnoise-wasm` is BSD-3-Clause and vendoring
matches our libflac precedent; but it is 48 kHz mono, voice-optimized
(degrades music), and needs its own worker + anchor strategy. Parked as
E7b; this phase ships E7a below.

## 2. Theory → algorithm (E7a, deterministic, pure TS)

v2's weakness: magnitude **subtraction** with a static print → stale noise
estimate under real conditions + bin-wise independent decisions → musical
noise warble; and it needs a manual print.

NR v3 keeps the proven WOLA scaffolding (2048/512 Hann², 4096-point FFT,
noisy phase) and upgrades the decision core:

1. **Adaptive noise tracking (IMCRA-lite).** Per-bin noise PSD
   `Ŝ ← λ·Ŝ + (1−λ)·|Y|²` with speech-presence-gated λ (≈0.75 absent →
   tracks drift; ≈0.98 present → never eats sustained speech). Init:
   learned print if provided (instant convergence), else the per-bin
   minimum energy of the first 8 frames (≈93 ms, audio passes untouched
   during init) with a **tonality-aware latch**: bins standing >30× their
   ±8-bin local-median minimum (tones present from t=0) inherit the
   median instead of their own energy — **works with no selection at
   all**.
   **Narrowband protection (as-shipped):** a bin is never folded into
   the estimate while (a) it was latched tonal at init, or (b) its
   current energy exceeds 100× the 4-tap median of its ±6/±10-bin taps
   (all taps outside a tone's ±4-bin Hann mainlobe; independent draws on
   stationary noise → ~zero false protection). The map recomputes every
   2nd frame (tones are sustained; 11.6 ms latency is inaudible). This
   replaced an earlier sustained-γ EMA freeze which could never engage:
   γ>100 survives ≈1 update at λ≈0.98, so a history latch races the
   estimator and loses — instant, estimate-free narrowband detection
   does not race.
2. **Decision-directed a priori SNR** (Ephraim–Malah):
   `ξ = α·G_prev²·γ_prev + (1−α)·max(γ−1, 0)`, α=0.98 — this is the
   historical fix for musical noise (the estimator itself is smooth).
3. **Speech-presence probability** `p = ξ/(ξ+1)` (temporally smoothed) —
   a soft gate, so speech bins are never hard-zeroed.
4. **Gain:** Wiener/log-MMSE `G = ξ/(1+ξ)`, floored at
   `10^(−reduction_dB/20)`, smoothed **asymmetrically in time** (fast
   release upward / slower attack downward — onsets stay crisp) and
   ±1-bin in frequency (log-domain) — no watery texture.
5. Params: `reduction` dB (0–30, default 15; **0 = bit-exact bypass**),
   `adapt` (0–1, default 0.5 → λ mapping). Learn-print button becomes an
   *optional* convergence seed.

## 3. Gates (analytic anchors, literal tolerances)

- reduction=0 → bit-exact copies (bypass class).
- tone+noise @ +6 dB SNR, **auto mode (no print)** → post SNR ≥ +10 dB.
- 1 kHz tone magnitude loss ≤ 1 dB.
- musical-noise **per-bin dB-flicker ratio** post/pre ≤ 2.5: mean
  per-bin temporal std (dB) of a 4096-point STFT (215 Hz–11 kHz), 60
  frames. (Frame-RMS variance was the wrong metric — strong suppression
  changes loudness variance regardless of artifact quality; bin-level
  flicker is what musical noise *is*.)
- **naturalness (new):** on stationary noise, max frame-to-frame output
  energy jump ≤ 4 dB (v2 spectral subtraction fails this — warble).
- transient gap floor: noise between tone bursts stays suppressed
  (≥ +8 dB vs pre-NR), no pumping.
- stereo, independent noises: both channels ≥ +10 dB (per-channel state).
- print-seeded: SNR ≥ +8 dB within 0.5 s.
- determinism: bit-identical reruns; no `Math.random`.
- 30 s bounded / no NaN; `[profile]` 60 s stereo ≤ 5 s uninstrumented —
  **measured 2974 ms** (half-complex real-FFT pair, 4-tap narrowband map
  every 2nd frame; in-suite guard 10 s per the ADR 009 convention).
- Full suite + e2e (learn→apply→undo flow unchanged) + build + lint.
