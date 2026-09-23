#!/usr/bin/env node
/**
 * Encoder validation gate (M4, ADR 006 §5 — revised): MP3 encodes in Node
 * at every advertised bitrate and asserts frame sync + size bounds.
 * FLAC uses the vendored emscripten build which only runs in a real
 * browser worker (importScripts + wasm) — it is validated end-to-end by
 * the Playwright export suite (tests/e2e/export.spec.ts), which encodes a
 * tone through the actual worker and asserts the `fLaC` container.
 */
const SR = 44100;
const FRAMES = SR; // 1 second

function tone(channel) {
  const data = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; ++i) {
    data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR + channel * 0.7);
  }
  return data;
}

function toInt16(data) {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; ++i) {
    const x = data[i];
    const v = Math.round(x < 0 ? x * 32768 : x * 32767);
    out[i] = Math.max(-32768, Math.min(32767, v));
  }
  return out;
}

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function validateMp3() {
  const lame = await import('@breezystack/lamejs');
  const Mp3Encoder = lame.Mp3Encoder;
  const left = toInt16(tone(0));
  const right = toInt16(tone(1));
  for (const kbps of [128, 192, 256, 320]) {
    try {
      const encoder = new Mp3Encoder(2, SR, kbps);
      const chunks = [];
      for (let pos = 0; pos < left.length; pos += 1152) {
        const encoded = encoder.encodeBuffer(
          left.subarray(pos, pos + 1152),
          right.subarray(pos, pos + 1152),
        );
        if (encoded.length > 0) chunks.push(encoded);
      }
      const tail = encoder.flush();
      if (tail.length > 0) chunks.push(tail);
      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      const syncOk = merged[0] === 0xff && (merged[1] & 0xe0) === 0xe0;
      const minBytes = ((kbps * 1000) / 8) * 0.5;
      const maxBytes = ((kbps * 1000) / 8) * 1.5;
      check(
        `MP3 ${kbps} kbps`,
        syncOk && total > minBytes && total < maxBytes,
        `${total} bytes, frame sync ${syncOk}`,
      );
    } catch (error) {
      check(`MP3 ${kbps} kbps`, false, String(error));
    }
  }
}

console.log('validate-encoders (node):');
await validateMp3();
console.log('  ℹ FLAC is validated in-browser by tests/e2e/export.spec.ts (worker + wasm)');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('node encoder checks passed');
