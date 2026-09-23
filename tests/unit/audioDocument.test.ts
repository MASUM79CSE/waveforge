import { describe, expect, test } from 'vitest';
import { AudioDocument, type AudioBufferLike } from '../../src/engine/AudioDocument';

function fakeBuffer(): AudioBufferLike & { data: Float32Array[] } {
  const data = [new Float32Array([0, 0.5]), new Float32Array([0, -0.5])];
  return {
    data,
    numberOfChannels: 2,
    length: 48000,
    sampleRate: 48000,
    duration: 1,
    getChannelData: (ch: number) => data[ch] ?? new Float32Array(0),
  };
}

describe('AudioDocument', () => {
  test('exposes buffer properties', () => {
    const buffer = fakeBuffer();
    const doc = new AudioDocument(buffer, { name: 'a.wav', sizeBytes: 10, source: 'file' });

    expect(doc.channels).toBe(2);
    expect(doc.sampleRate).toBe(48000);
    expect(doc.duration).toBe(1);
    expect(doc.length).toBe(48000);
  });

  test('channelData delegates to the buffer', () => {
    const buffer = fakeBuffer();
    const doc = new AudioDocument(buffer, { name: 'a.wav', sizeBytes: 10, source: 'url' });
    expect(doc.channelData(1)).toBe(buffer.data[1]);
  });

  test('meta round-trips', () => {
    const doc = new AudioDocument(fakeBuffer(), {
      name: 'take.wav',
      sizeBytes: 99,
      source: 'sample',
    });
    expect(doc.meta.name).toBe('take.wav');
    expect(doc.meta.source).toBe('sample');
  });
});
