# WaveForge Effects v2 — Upgrade Plan (E1–E6)

**Status:** proposed · targets post-M6 workstream · supersedes nothing (adds to plan §10; un-parks §11 items E5 as specified)
**Baseline audited:** `src/fx/` = 711 lines, 10 registered effects, two kinds — `kernel` (pure TS, unit-tested) and `graph` (WebAudio preview + OfflineAudioContext apply, `offlineRender.ts`), seeded-PRNG determinism (`curves.ts`), registry-validated params (`registry.ts`), one generic dialog (`EffectDialog`).

---

## 0. Goals & non-goals

**Goals**
1. Accuracy-grade DSP: every effect gets an **analytic anchor test with a numeric tolerance** — "accurate output" is a gate, not a claim (§8).
2. Pro tools that reuse what M5/M6 already shipped (LUFS kernels, settings, quota) instead of new infrastructure.
3. Keep the architecture: pure kernels first, worker only when a profiling gate demands it; browser-only code excluded from unit coverage per ADR 005 convention.

**Non-goals (still parked)**
- RNNoise wasm (E6 is the in-house fallback, now noise-print based).
- Formant-preserving pitch shift, multitrack, MIDI. Cloud anything.

**Architecture extension (one small change)**
`KernelEffectDef` gains optional `tail?: (params) => number` — fxActions slices `len + tail·sr` frames and appends post-region context so wet tails (reverb, delay, stretch) work for pure kernels exactly as `tailSeconds` works for graph effects today. No other plumbing changes: new effects stay registry entries + i18n + optional menu rows.

---

## E1 — Precision mastering (LUFS normalize, true-peak limiter, soft-knee compressor)

*Priority 1 — smallest diff, largest accuracy payoff, directly reuses M5.*

### E1a. LUFS-target normalize (`normalizeLufs`, kernel)
- Measure integrated loudness with the shipped BS.1770-4 kernels (`engine/lufs.ts`), apply flat gain `ΔL = L_target − L_integrated`, clamp ΔL to ±24 dB.
- Params: target −24…−9 LUFS (default **−14**, streaming), toggle "limit to −1 dBTP" (routes through E1b after gain).
- **Accuracy gate:** apply at target −16 on the demo, re-measure with the same kernels → `|measured − target| ≤ 0.3 LU` in a unit test and in an e2e toast readout.

### E1b. True-peak limiter (`tplimiter`, kernel)
- Detection on a 4× oversampled signal: zero-stuff ×4 → 65-tap Kaiser-windowed polyphase FIR (β = 8.5, cutoff at the old Nyquist). *Correction during E1: 33 taps cannot deliver both a π/4 cutoff and ≥ 80 dB stopband (Kaiser N ≈ (A−8)/(2.285·Δω) ⇒ 46+ taps for 90 dB); 65 taps measured: passband flat to 18 kHz, −80 dB @ 30 kHz, −94 dB @ 32 kHz.*
- Gain reduction: lookahead 5 ms, release 60 ms (program-adaptive: fast unload when GR < 1 dB for > 20 ms), dual-stage (static ceil + soft clipper at ceil +0.3 dB only as a guard).
- **Accuracy gates:**
  - sweep set {997 Hz, 3k, 7k, 9.5k, 12.5k, 15.5 kHz} @ −0.5 dBFS into ceiling −1.0 → oversampled peak ≤ −1.0 + 0.1 dB, and **no sample of the output exceeds +0.05 dB over ceiling** after 4× estimation;
  - GR trajectory monotone during release (no pumping step > 0.5 dB/frame);
  - bypass (ceiling 0, input −6) nulls to input within 1e-7.

### E1c. Soft-knee compressor upgrade (existing `compressor` def, pure rework)
- Detection: 10 ms RMS (existing meter math), soft knee W 0–24 dB (default 6), ratio 1–20, attack 0.5–100 ms, release 10–1000 ms.
- Static curve, exact piecewise (x = level dB, T = threshold, R = ratio, W = knee) — *corrected during E1 from the standard continuous output equations; the original linear branch had a wrong offset and sign:*
  - `x ≤ T − W/2` → GR 0
  - `T − W/2 < x < T + W/2` → `GR = (1 − 1/R) · (x − T + W/2)² / (2W)`
  - `x ≥ T + W/2` → `GR = (1 − 1/R) · (x − T)`
- **Accuracy gate:** step the input −60…0 dB in 1 dB; measured steady-state GR matches the formula **±0.1 dB** at every step (both channels independently). Bypass null 1e-9.

---

## E2 — 8-band parametric EQ (`pgeq8`, kernel + analytic curve)

- 8 independent biquad bands; per band: type `HPF | low-shelf | peaking | notch | high-shelf | LPF`, freq 20 Hz–20 kHz (log), gain ±18 dB (peaking/shelves), Q 0.1–16.
- Coefficients: **RBJ cookbook** (Audio EQ Cookbook §1–§5) evaluated in float64, DF2T recurrence, per-channel state. RBJ from-spec is correct for general EQ — the M5 K-weighting dead-end was BS.1770-specific constants, not the cookbook; note recorded so nobody re-fears it.
- HPF/LPF get slope choice 12/24 dB/oct (1 or 2 cascaded sections, matched Q via Butterworth Qs 0.7071 / [0.5412, 1.3066]).
- **Curve in the dialog is analytic**: magnitude `|H(e^{jω})|` computed from the cascaded coefficients at 128 log points — exactly what the audio will do, no guessing.
- **Accuracy gates:**
  - peaking band @ 1 kHz, +12 dB, Q 1 → probe sines at 500 Hz/1k/2k give [≤ 0.4, 12 ± 0.25, ≤ 0.4] dB;
  - shelf @ 200 Hz +6 dB → gain at 40 Hz within 6 ± 0.25 dB, at 2 kHz ≤ 0.4 dB;
  - notch @ 1 kHz Q 8 → 1 kHz tone attenuated ≥ 40 dB;
  - cascade stability: 8 worst-case bands → impulse response energy bounded (decays, no NaN/Inf over 10 s pink noise);
  - bypass (all bands 0 dB / types off) nulls bit-exact.

## E3 — Modulation set (chorus, flanger, phaser, tremolo, vibrato) — pure kernels

Shared infrastructure: one fractional delay line with **Catmull-Rom 4-tap interpolation** (coefficients `[(−½)p0+(3/2)p1−(3/2)p2+(½)p3]` row), state across block boundaries, deterministic phase (LFO computed from absolute sample index).

| Effect | Core spec (defaults in parens) |
|---|---|
| **chorus** | 3 voices, base delay 5–30 ms (20), depth 0–10 ms (4), rate 0.05–5 Hz (0.8), voices' LFO phases 0/120°/240°, stereo voices 1–2 swapped → width; mix 0–100 % (50) |
| **flanger** | delay 0.1–5 ms (2), depth 0–5 ms (1), rate 0.05–2 Hz (0.25), feedback 0–95 % (40), mix (50) |
| **phaser** | 4/6/8 all-pass stages (6, RBJ APF `b=[1−α,−2cosω₀,1+α]`, `a=[1+α,−2cosω₀,1−α]`), sweep 0.05–2 Hz (0.4), centre 200–2000 Hz (600) per-stage octave spread, feedback 0–80 % (30) |
| **tremolo** | rate 0.1–20 Hz (4), depth 0–100 % (60), shape sine/triangle; `y = x·(1 − d/2·(1 − lfo))` |
| **vibrato** | rate 0.1–14 Hz (5), depth 0–30 ms (4) — delay-line modulation only, 100 % wet |

**Accuracy gates (all kernels):**
- fractional-delay error: 1 kHz sine through a static 10.37-sample delay → phase-measured delay 10.37 ± 0.02 samples;
- LFO continuity: process in 997-frame chunks vs one-shot → outputs identical (state carries, proves no per-block phase reset);
- tremolo: 1 kHz tone at 4 Hz depth 60 % → spectrum contains exactly f₀ and f₀±4 Hz sidebands within ±0.3 dB of Bessel prediction;
- feedback loops bounded: impulse into flanger @ 95 % → response decays, no NaN over 30 s;
- bypass nulls 1e-9 (depth 0/mix 0).

## E4 — Reverb v2: synthesized IR set + IR import + pure partitioned convolver

- **IR synthesis** (pure, seeded PRNG — replaces `curves.ts` noise IR):
  - envelope `g(n) = 10^(−3n/(RT60·Fs))` → exactly −60 dB at n = RT60·Fs (param RT60 0.2–12 s);
  - **plate**: white tail, early diffusion ramp, HF damping one-pole `y += k(x−y)` with k from damping %;
  - **room/hall**: 8–24 early-reflection taps (seeded, 5–80 ms, exponential density) + stochastic tail;
  - **spring**: 3 cascaded combs (dispersion chirp: delay shrinks with frequency band via all-pass chain).
- **Pure partitioned overlap-add convolver** (FFT radix-2, 2048 partitions, float64 accumulation) used for Apply; ConvolverNode stays for live preview. Wet/dry mix + predelay 0–120 ms + tail handled by the new `tail` mechanism (§0).
- **IR import**: load a WAV/FLAC IR file in the dialog → decode via existing pipeline → use for both preview (AudioBuffer) and apply (kernel); duration capped 15 s, quota-guarded.
- **Accuracy gates:**
  - convolver vs direct convolution, random 2048-tap IR × 4096-sample signal → max abs diff ≤ 1e-6;
  - RT60 measured (Schroeder backward integration) on the processed exponential decay within **±5 %** of param for 1/2/4/8 s;
  - predelay appears as exact leading silence of `predelay·sr ± 1` samples;
  - same seed → bit-identical IR (existing determinism convention).

## E5 — Time stretch & pitch shift (un-parks §11 as **experimental**)

- Algorithm: **WSOLA** for stretch 50–200 % → **resample** (`fx/resample.ts`, shipped) for pitch; pitch shift n semitones = stretch by `2^(n/12)` then resample by the inverse. One dialog "Stretch / Pitch": stretch %, semitones −12…+12 (linked: setting one zeroes the other unless "independent" is checked).
- WSOLA spec: analysis hop `Ha`, synthesis hop `Hs = Ha·ratio`, tolerance window ±`τ` = ±10 ms, normalized cross-correlation search on a 46 ms Hann analysis frame, 50 % Hann overlap-add; transient protection: skip search when local onset flux > 3× median (preserves drums).
- Gated behind `settings.experimentalFx` (default off; Settings row added; menu item hidden unless enabled).
- **Accuracy gates:**
  - duration: 10 s input stretched ×1.25 → output length within ±2 ms; ×0.8 → ±2 ms;
  - pitch: 440 Hz tone shifted +3 st → measured 440·2^(3/12) = 523.25 Hz ±0.5 % (zero-cross count);
  - transient fidelity: click train through ×1.5 → per-click envelope peak positions align to the grid ±2 ms (no smear);
  - null: ×1.00 + 0 st → bit-exact pass-through;
  - **profile:** 60 s stereo 44.1 kHz ×1.25 ≤ 3 s in a worker-equivalent pure run (`[profile]` log; if exceeded → worker route per §8.5 B1 process).

## E6 — Spectral repair (noise-print NR v2, de-esser) — pure STFT kernels

### E6a. Noise-print noise reduction (`nrPrint`, replaces the spectral-gate fallback UI path)
- STFT: 2048 window / 512 hop, Hann analysis + Hann² synthesis (WOLA), zero padding ×2 to bound circularity.
- Flow: user selects a noise-only region → "Learn noise print" stores the averaged magnitude `|N̂(k)|` (max 4096 bins, in-session + persisted to a draft-side signal, quota-light) → Apply: `|Ŝ(k)| = max(|Y(k)| − α·|N̂(k)|, β·|Y(k)|)`, over-subtraction α 1–4 (2), floor β 0.01–0.2 (0.05), temporal smoothing `|N̂|` EMA 0.3 across frames, phase = noisy phase.
- **Accuracy gates:** synthetic white noise + 1 kHz tone @ +6 dB SNR → post-NR SNR improves ≥ 10 dB; tone magnitude loss ≤ 1 dB; musical-noise bound: frame-energy variance ratio post/post ≤ 2.5; empty print → identity (bypass null).

### E6b. De-esser (`deesser`, split-band compressor)
- Linkwitz-Riley 2-way crossover @ 3–9 kHz (param, 4th order: two cascaded Butterworth per way, phase-compensated sum), HF-band RMS detector with threshold −60…0 dB, ratio 1–12, only HF band is compressed; bands re-summed.
- **Accuracy gates:** 6.5 kHz tone @ −10 dBFS into threshold −20, ratio 4 → HF band reduced 7.5 ± 0.5 dB; 300 Hz tone untouched ±0.1 dB; crossover sum at −3 dB point matches LR design (−3.01 ± 0.2 dB both bands).

---

## 8. Verification protocol — "accurate output" is enforced

Every new kernel (all of E1–E6) must pass, in order:

1. **RED** — anchors written first, fail on missing modules (vitest, `tests/unit/fx2/*.test.ts`).
2. **Bypass null** — identity params reproduce input: bit-exact where algebraically identity, else ≤ 1e-9 abs.
3. **Analytic anchors** — the per-package tolerances above (±0.1–0.5 dB class); each number in this doc is asserted literally in a test name, e.g. `peaking +12 dB @1k Q1 → 12 ±0.25 dB`.
4. **Determinism** — seeded PRNG only; two runs bit-identical; no `Math.random` (security grep extended to fx).
5. **Stability** — 30 s pink noise + impulse through worst-case params: output bounded (|x| ≤ 4), no NaN/Inf, denormals flushed (state += 1e-20 every 65 536 samples or FMA-scale guard).
6. **Stereo honesty** — every effect exercised in mono AND stereo; stereo-only behavior (width, decorrelation) asserted by construction.
7. **Profile log** — `[profile] <fx> 60 s stereo: …ms` printed by the slowest test per package; budgets: E1 ≤ 1.5 s, E2 ≤ 0.6 s, E3 ≤ 0.8 s, E4 ≤ 1.5 s, E5 ≤ 3 s, E6 ≤ 4 s. Breach ⇒ move that kernel to the analysis/peaks worker pattern (B1 process), not to a lower tolerance. *E1 note: budgets bind to uninstrumented runs (v8 coverage instrumentation slows hot loops ~3× — in-test smoke guards are set at 5 s; recorded uninstrumented numbers feed the B1 review).*
8. **e2e** — one flow per package applied to demo.wav from the real menu: region growth for tail effects asserted via the status bar, LUFS-normalize asserts the toast readout ±0.3 LU round-trip.
9. **Gates** — tsc, eslint, coverage ≥ 80 % on `src/fx/**` (pure by construction), build, security greps; conventional commits per package (`test(fx2)` → `feat(fx2)` split).

## 9. Sequencing & sizing

| Phase | Package | New/changed lines (est.) | New tests | Risk |
|---|---|---|---|---|
| 1 | E1 mastering | ~350 | ~18 | low (reuses M5) |
| 2 | E2 pgeq8 | ~330 + dialog curve | ~14 | low |
| 3 | E3 modulation | ~420 | ~16 | low-med (interpolation) |
| 4 | E4 reverb v2 | ~480 | ~14 | med (convolver perf) |
| 5 | E6 spectral | ~520 | ~12 | med (NR tuning) |
| 6 | E5 stretch/pitch | ~380 | ~10 | high (artifacts) → experimental |

Cross-cutting per phase: ADR 009 (effects v2 architecture: `tail` mechanism, experimental flag, IR import) written once at phase 1; i18n strings + menu rows each phase; task_list section updated and committed each phase; the whole plan is trimmable — each E* is independently shippable.

## 10. Risks

- **Convolver CPU** (E4): partitioned OLA at 2048 keeps 60 s stereo ≈ a few hundred ms; breach → worker route (already the pattern).
- **WSOLA artifacts on polyphonic material** (E5): documented limitation + experimental flag; phase-vocoder upgrade remains future work if needed.
- **Region growth bookkeeping** (`tail`): edit pipeline already grows regions for graph tails (M3); the kernel path reuses `swapDoc` accounting — covered by the e2e region-growth assertion.
- **NR over-subtraction artifacts**: floor β + temporal smoothing keep musical noise bounded by the variance-ratio gate rather than by ear.
- **RBJ-coefficient FUD from M5**: E2 uses cookbook specs designed for EQ — the M5 failure was BS.1770-specific constants; anchor tests prove the response analytically anyway.
