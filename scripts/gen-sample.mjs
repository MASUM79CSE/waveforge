#!/usr/bin/env node
/**
 * Generates public/samples/demo.wav — a deterministic 9.6 s stereo piece
 * (4-chord loop at 110 BPM with pads, bass, drums and a pentatonic lead).
 * Pure Node, no dependencies. Run: node scripts/gen-sample.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BPM = 110;
const BEAT = 60 / BPM; // 0.5454… s
const BAR = BEAT * 4;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'demo.wav');

// A minor: Am → F → C → G
const CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 392.0],
];
const LEAD = [440.0, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Additive pad voice with a slow attack and detune shimmer. */
function padSample(freq, t, barT) {
  const attack = clamp(barT / 0.4, 0, 1);
  const release = clamp((BAR - barT) / 0.6, 0, 1);
  const env = attack * release * 0.16;
  let v = 0;
  v += Math.sin(2 * Math.PI * freq * t) * 0.6;
  v += Math.sin(2 * Math.PI * freq * 1.003 * t) * 0.25;
  v += Math.sin(2 * Math.PI * freq * 2 * t) * 0.1;
  v += Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.05;
  return v * env;
}

/** Plucked bass: sine with exponential decay per beat. */
function bassSample(freq, t, beatT) {
  const env = Math.exp(-beatT * 6) * 0.4;
  const thump = Math.sin(2 * Math.PI * freq * t);
  const sub = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.3;
  return (thump + sub) * env;
}

/** Kick: 120→45 Hz sweep, 120 ms. Snare: band-ish noise burst. Hat: short hiss. */
function kick(barT) {
  if (barT > 0.12) return 0;
  const p = barT / 0.12;
  const freq = 45 + 75 * Math.exp(-p * 6);
  return Math.sin(2 * Math.PI * freq * barT) * Math.exp(-p * 4) * 0.75;
}

let noiseState = 22222;
function noise() {
  // xorshift — deterministic
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 4294967295) * 2 - 1;
}

function snare(barT) {
  if (barT > 0.09) return 0;
  return noise() * Math.exp((-barT / 0.09) * 5) * 0.28;
}

function hat(eighthT) {
  if (eighthT > 0.03) return 0;
  return noise() * Math.exp((-eighthT / 0.03) * 6) * 0.12;
}

const TOTAL = BAR * 4 + BEAT; // one bar tail
const N = Math.floor(TOTAL * SR);
const left = new Float64Array(N);
const right = new Float64Array(N);

for (let i = 0; i < N; ++i) {
  const t = i / SR;
  const barIdx = Math.min(3, Math.floor(t / BAR));
  const barT = t - barIdx * BAR;
  const chord = CHORDS[barIdx];

  let l = 0;
  let r = 0;

  // pads — slight stereo spread per voice
  for (let v = 0; v < chord.length; ++v) {
    const s = padSample(chord[v], t, barT);
    l += s * (v === 0 ? 1 : v === 1 ? 0.82 : 0.68);
    r += s * (v === 0 ? 0.68 : v === 1 ? 0.85 : 1);
  }

  // bass on every beat
  const beatIdx = Math.floor(barT / BEAT);
  const beatT = barT - beatIdx * BEAT;
  const bassFreq = chord[0] / 2;
  const bass = bassSample(bassFreq, t, beatT);
  l += bass;
  r += bass;

  // drums: kick on 1 & 3, snare on 2 & 4, hats on 8ths
  const drums = kick(barT) + (beatIdx % 2 === 1 ? snare(barT - BEAT) : 0) + hat(beatT % (BEAT / 2));
  l += drums;
  r += drums;

  // lead: one note per beat, last bar rest
  if (barIdx < 3) {
    const note = LEAD[(barIdx * 4 + beatIdx) % LEAD.length];
    const env = Math.exp(-beatT * 3) * 0.22;
    const vibrato = 1 + Math.sin(2 * Math.PI * 5.5 * t) * 0.004;
    const leadL = Math.sin(2 * Math.PI * note * vibrato * t) * env;
    const leadR = Math.sin(2 * Math.PI * note * vibrato * (t + 0.0004)) * env;
    l += leadL;
    r += leadR;
  }

  left[i] = l;
  right[i] = r;
}

// normalize to 0.85 peak and fade edges 50 ms
let peak = 0;
for (let i = 0; i < N; ++i) {
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const gain = 0.85 / peak;
const fadeN = Math.floor(0.05 * SR);
for (let i = 0; i < N; ++i) {
  let g = gain;
  if (i < fadeN) g *= i / fadeN;
  if (i > N - fadeN) g *= (N - i) / fadeN;
  left[i] *= g;
  right[i] *= g;
}

// ---- 16-bit stereo WAV ----
const dataBytes = N * 4; // 2 ch × 2 bytes
const buffer = new ArrayBuffer(44 + dataBytes);
const view = new DataView(buffer);
const ascii = (offset, s) => {
  for (let i = 0; i < s.length; ++i) view.setUint8(offset + i, s.charCodeAt(i));
};
ascii(0, 'RIFF');
view.setUint32(4, 36 + dataBytes, true);
ascii(8, 'WAVE');
ascii(12, 'fmt ');
view.setUint32(16, 16, true);
view.setUint16(20, 1, true); // PCM
view.setUint16(22, 2, true); // stereo
view.setUint32(24, SR, true);
view.setUint32(28, SR * 4, true);
view.setUint16(32, 4, true);
view.setUint16(34, 16, true);
ascii(36, 'data');
view.setUint32(40, dataBytes, true);

let p = 44;
for (let i = 0; i < N; ++i) {
  for (const ch of [left, right]) {
    const s = clamp(ch[i], -1, 1);
    view.setInt16(p, Math.round(s * 32767), true);
    p += 2;
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, new Uint8Array(buffer));
console.log(`wrote ${OUT} (${(dataBytes / 1024 / 1024).toFixed(2)} MB audio, ${TOTAL.toFixed(2)} s)`);
