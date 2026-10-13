/**
 * WF-009 — decode limits and failure recovery. Before this audit the
 * decode pipeline had NO decoded-memory guard (a 512 MB compressed file
 * can decode to gigabytes of PCM) and NO timeout (a hung decodeAudioData
 * left the loading spinner forever). These tests pin the guard contract:
 * overflow-safe estimate, budget rejection (typed WF-E103), watchdog
 * rejection (typed WF-E104) with no dangling timer on success.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DECODED_BUDGET_BYTES,
  DECODE_TIMEOUT_MS,
  assertDecodedBudget,
  estimateDecodedBytes,
  withDecodeTimeout,
} from '../../../src/io/decode';
import { WaveForgeError } from '../../../src/core/errors';

function fakeBuffer(frames: number, channels: number): { length: number; numberOfChannels: number; sampleRate: number } {
  return { length: frames, numberOfChannels: channels, sampleRate: 44100 };
}

describe('decode limits (WF-009)', () => {
  it('estimateDecodedBytes = frames × channels × 4 (overflow-safe numbers)', () => {
    expect(estimateDecodedBytes(fakeBuffer(1000, 1))).toBe(4000);
    expect(estimateDecodedBytes(fakeBuffer(1000, 2))).toBe(8000);
    expect(estimateDecodedBytes(fakeBuffer(48_000 * 3600, 2))).toBe(48_000 * 3600 * 2 * 4); // 1 h stereo 48 kHz
  });

  it('budget constant is the documented 512 MiB and the timeout 60 s', () => {
    expect(DECODED_BUDGET_BYTES).toBe(512 * 1024 * 1024);
    expect(DECODE_TIMEOUT_MS).toBe(60_000);
  });

  it('assertDecodedBudget: under budget passes; at budget passes', () => {
    const maxFrames = DECODED_BUDGET_BYTES / (2 * 4); // stereo exactly at budget
    expect(() => assertDecodedBudget(fakeBuffer(maxFrames - 1, 2))).not.toThrow();
    expect(() => assertDecodedBudget(fakeBuffer(maxFrames, 2))).not.toThrow();
  });

  it('assertDecodedBudget: budget+1 byte rejects with typed WF-E103', () => {
    const maxFrames = DECODED_BUDGET_BYTES / (2 * 4);
    try {
      assertDecodedBudget(fakeBuffer(maxFrames + 1, 2));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WaveForgeError);
      expect((error as WaveForgeError).code).toBe('WF-E103');
    }
  });

  it('1 h stereo 48 kHz (1.38 GB decoded) rejects — the prompt scenario', () => {
    try {
      assertDecodedBudget(fakeBuffer(48_000 * 3600, 2));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as WaveForgeError).code).toBe('WF-E103');
    }
  });

  it('withDecodeTimeout: a hung decode rejects WF-E104 after the watchdog (no spinner forever)', async () => {
    vi.useFakeTimers();
    const pending = withDecodeTimeout(new Promise<never>(() => {}));
    const assertion = expect(pending).rejects.toSatisfy((error: unknown) => {
      return error instanceof WaveForgeError && (error as WaveForgeError).code === 'WF-E104';
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    vi.useRealTimers();
  });

  it('withDecodeTimeout: success leaves NO pending timer', async () => {
    vi.useFakeTimers();
    const settled = withDecodeTimeout(Promise.resolve('ok'));
    await settled;
    expect(vi.getTimerCount()).toBe(0); // watchdog cleared, not leaked
    vi.useRealTimers();
  });

  it('withDecodeTimeout: rejects early if the source rejects (error path intact)', async () => {
    const pending = withDecodeTimeout(Promise.reject(new Error('EncodingError')));
    await expect(pending).rejects.toThrow('EncodingError');
  });
});
