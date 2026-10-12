/**
 * MAINTAINER TOOL — OPT-IN REAL-MODEL CHECK. NEVER run by CI.
 *
 * Transcribes a WAV file with a real Whisper-class model and prints the
 * segments (sanity smoke for the on-device ASR stack; CI uses the fake).
 * Run from the repo root:
 *
 *   npx vite-node scripts/rag/quality-asr.mjs \
 *     --model=onnx-community/whisper-tiny.en \
 *     --wav=/path/to/audio.wav
 *
 * The first run downloads the model from huggingface.co into the local
 * HF cache; later runs are offline.
 */
const args = process.argv.slice(2);
const modelId = (args.find((a) => a.startsWith('--model=')) ?? '--model=onnx-community/whisper-tiny.en').replace('--model=', '');
const wav = (args.find((a) => a.startsWith('--wav=')) ?? '').replace('--wav=', '');

if (!wav) {
  console.error('usage: npx vite-node scripts/rag/quality-asr.mjs --wav=<file.wav> [--model=<id>]');
  process.exit(1);
}

const { pipeline } = await import('@huggingface/transformers');

async function readWavMono(path) {
  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const text = (off, n) => String.fromCharCode(...buf.subarray(off, off + n));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let off = 12;
  let sampleRate = 16_000;
  let bits = 16;
  let dataOff = -1;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = text(off, 4);
    const size = view.getUint32(off + 4, true);
    if (id === 'fmt ') {
      sampleRate = view.getUint32(off + 12, true);
      bits = view.getUint16(off + 22, true);
    } else if (id === 'data') {
      dataOff = off + 8;
      dataLen = size;
    }
    off += 8 + size + (size % 2);
  }
  if (dataOff < 0) throw new Error('no data chunk');
  const n = Math.floor(dataLen / (bits / 8));
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pcm[i] = bits === 16 ? view.getInt16(dataOff + i * 2, true) / 32_768 : view.getUint8(dataOff + i) / 255 - 0.5;
  }
  return { pcm, sampleRate };
}

async function main() {
  console.log(`[quality-asr] model: ${modelId} | wav: ${wav}`);
  const { pcm, sampleRate } = await readWavMono(wav);
  console.log(`[quality-asr] ${(pcm.length / sampleRate).toFixed(2)}s @ ${sampleRate} Hz (mono)`);
  const asr = await pipeline('automatic-speech-recognition', modelId);
  const out = await asr(pcm, { return_timestamps: true, chunk_length_s: 30 });
  console.log('\n--- transcript ---');
  console.log(out.text ?? '(empty)');
  for (const c of out.chunks ?? []) {
    console.log(`  [${Number(c.timestamp[0]).toFixed(2)}–${Number(c.timestamp[1]).toFixed(2)}] ${c.text.trim()}`);
  }
}

main().catch((err) => {
  console.error('[quality-asr] FAILED:', err.message);
  process.exit(1);
});
