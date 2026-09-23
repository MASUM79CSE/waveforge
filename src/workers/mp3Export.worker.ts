/**
 * MP3 export worker (M4): lamejs in 1152-frame blocks with progress,
 * cancel, and a transferable result. Messages are zod-validated at this
 * boundary (security review §ADR 006). Module worker — Vite bundles it
 * separately (lazy, like the peaks worker).
 */
import { z } from 'zod';
import { Mp3Encoder } from '@breezystack/lamejs';

const requestSchema = z.discriminatedUnion('cmd', [
  z.object({
    cmd: z.literal('encode'),
    id: z.number(),
    sampleRate: z.number().int().positive(),
    kbps: z.union([z.literal(128), z.literal(192), z.literal(256), z.literal(320)]),
    left: z.instanceof(Float32Array),
    right: z.instanceof(Float32Array).optional(),
  }),
  z.object({ cmd: z.literal('cancel'), id: z.number() }),
]);

let cancelledId = -1;

function toInt16(data: Float32Array) {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; ++i) {
    const x = data[i] || 0;
    const v = Math.round(x < 0 ? x * 32768 : x * 32767);
    out[i] = Math.max(-32768, Math.min(32767, v));
  }
  return out;
}

// module worker scope: DOM lib types `self` as Window — narrow postMessage
const post = self.postMessage.bind(self) as (message: unknown, transfer?: Transferable[]) => void;

self.onmessage = (event) => {
  const parsed = requestSchema.safeParse(event.data);
  if (!parsed.success) {
    post({ type: 'error', detail: 'invalid request' });
    return;
  }
  const msg = parsed.data;
  if (msg.cmd === 'cancel') {
    cancelledId = msg.id;
    return;
  }

  const { id, sampleRate, kbps, left, right } = msg;
  const stereo = right instanceof Float32Array;
  const encoder = new Mp3Encoder(stereo ? 2 : 1, sampleRate, kbps);
  const leftPcm = toInt16(left);
  const rightPcm = stereo ? toInt16(right) : null;
  const blockSize = 1152;
  const total = leftPcm.length;
  const chunks = [];

  for (let pos = 0; pos < total; pos += blockSize) {
    if (cancelledId === id) {
      cancelledId = -1;
      post({ type: 'cancelled', id });
      return;
    }
    const l = leftPcm.subarray(pos, Math.min(pos + blockSize, total));
    const r = rightPcm ? rightPcm.subarray(pos, Math.min(pos + blockSize, total)) : undefined;
    const encoded = stereo ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
    if (pos % (blockSize * 64) === 0) {
      post({ type: 'progress', id, done: pos, total });
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  let size = 0;
  for (const chunk of chunks) size += chunk.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  post({ type: 'done', id, data: out.buffer }, [out.buffer]);
};
