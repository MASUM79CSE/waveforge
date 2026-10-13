/**
 * WAV export worker (WF-003): the pure chunked encoder off the main
 * thread with real progress, cancel between chunks, and a transferable
 * result. Messages are zod-validated at this boundary and mirror the
 * MP3/FLAC protocol, so the export service drives all three encoders
 * through one code path.
 */
import { z } from 'zod';
import { encodeWavChunked, type WavEncoding } from '../io/wavEncoder';

const requestSchema = z.discriminatedUnion('cmd', [
  z.object({
    cmd: z.literal('encode'),
    id: z.number(),
    sampleRate: z.number().int().positive(),
    encoding: z.union([z.literal('pcm16'), z.literal('pcm24'), z.literal('float32')]),
    left: z.instanceof(Float32Array),
    right: z.instanceof(Float32Array).optional(),
  }),
  z.object({ cmd: z.literal('cancel'), id: z.number() }),
]);

let cancelledId = -1;

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

  const { id, sampleRate, encoding, left, right } = msg;
  const channels = right instanceof Float32Array ? [left, right] : [left];
  const out = encodeWavChunked(channels, sampleRate, encoding satisfies WavEncoding, {
    chunkFrames: 65_536,
    shouldCancel: () => cancelledId === id,
    onProgress: (fraction) => {
      if (cancelledId === id) return; // stop advertising progress after cancel
      post({ type: 'progress', id, done: Math.round(fraction * 10_000), total: 10_000 });
    },
  });

  if (out === null) {
    cancelledId = -1;
    post({ type: 'cancelled', id });
    return;
  }
  post({ type: 'done', id, data: out }, [out]);
};
