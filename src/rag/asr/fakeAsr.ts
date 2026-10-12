/**
 * P2.7 — deterministic fake ASR client. E2E/CI stand-in for the
 * transformers.js worker: emits one stable segment per transcribe call
 * derived from the window's length. Never imports the real library.
 */
import type { AsrClient } from './asrClient';
import type { AsrResult } from './asrProtocol';

export function createFakeAsrClient(): AsrClient {
  let n = 0;
  let ready = false;
  return {
    init: async () => {
      ready = true;
      return { ready: true, device: 'wasm-fake' };
    },
    transcribe: async (samples: Float32Array): Promise<AsrResult> => {
      if (!ready) throw Object.assign(new Error('asr not initialized'), { code: 'NOT_INITIALIZED' });
      const dur = samples.length / 16000;
      const i = n++;
      return {
        segments: [{ start: 0, end: Math.max(0.5, dur), text: `fake segment ${i}` }],
        text: `fake segment ${i}`,
      };
    },
    dispose: async () => {
      ready = false;
      return { disposed: true };
    },
    close: () => {
      ready = false;
    },
  };
}
