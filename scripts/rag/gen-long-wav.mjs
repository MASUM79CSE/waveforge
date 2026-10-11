#!/usr/bin/env node
// P0.9 fixture generator — streaming WAV writer (never holds the whole
// file in RAM). Usage:
//   node scripts/rag/gen-long-wav.mjs <minutes> <sampleRate> <channels> <outPath>
// Deterministic content: 220 Hz + 440 Hz sines with a slow amplitude
// envelope, written in 1-second chunks.

import { createWriteStream } from 'node:fs';
import { writeFileSync } from 'node:fs';

const [, , minArg, rateArg, chArg, out] = process.argv;
const minutes = Number(minArg ?? 10);
const rate = Number(rateArg ?? 44100);
const channels = Number(chArg ?? 1);
const seconds = Math.round(minutes * 60);

if (!out || !(rate > 0) || !(channels >= 1)) {
  console.error('usage: gen-long-wav.mjs <minutes> <rate> <channels> <out.wav>');
  process.exit(2);
}

const bytesPerFrame = channels * 2;
const dataBytes = seconds * rate * bytesPerFrame;
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataBytes, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * bytesPerFrame, 28);
header.writeUInt16LE(bytesPerFrame, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(dataBytes, 40);

const ws = createWriteStream(out);
ws.write(header);

const TWO_PI = Math.PI * 2;
for (let s = 0; s < seconds; s++) {
  const buf = Buffer.allocUnsafe(rate * bytesPerFrame);
  for (let i = 0; i < rate; i++) {
    const t = s + i / rate;
    const env = 0.55 + 0.4 * Math.sin(TWO_PI * 0.25 * t); // slow swell
    const v = env * 0.5 * (Math.sin(TWO_PI * 220 * t) + 0.5 * Math.sin(TWO_PI * 440 * t));
    const clamped = Math.max(-1, Math.min(1, v));
    const pcm = Math.round(clamped * 32767);
    for (let c = 0; c < channels; c++) buf.writeInt16LE(pcm, (i * channels + c) * 2);
  }
  if (!ws.write(buf)) {
    // backpressure: wait for drain to keep memory flat
    (async () => {
      await new Promise((r) => ws.once('drain', r));
    })();
  }
}
ws.end();
await new Promise((r) => ws.on('close', r));
writeFileSync(`${out}.meta`, JSON.stringify({ minutes, rate, channels }));
console.log(`wrote ${out}: ${minutes}min ${rate}Hz ${channels}ch`);
