import { describe, expect, test } from 'vitest';
import { DEFAULT_MAX_FILE_BYTES } from '../../src/core/constants';
import { audioFileSchema, fileMetaSchema } from '../../src/core/schemas';

describe('fileMetaSchema', () => {
  test('accepts a normal audio file descriptor', () => {
    const parsed = fileMetaSchema.safeParse({
      name: 'take-01.wav',
      size: 1024,
      type: 'audio/wav',
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects empty names and non-positive sizes', () => {
    expect(fileMetaSchema.safeParse({ name: '', size: 10 }).success).toBe(false);
    expect(fileMetaSchema.safeParse({ name: 'a.wav', size: 0 }).success).toBe(false);
  });

  test('rejects files beyond the configured memory guard', () => {
    expect(
      fileMetaSchema.safeParse({ name: 'huge.wav', size: DEFAULT_MAX_FILE_BYTES + 1 }).success,
    ).toBe(false);
  });
});

describe('audioFileSchema', () => {
  test('accepts files with a loadable audio extension', () => {
    const file = new File(['x'], 'demo.wav', { type: '' });
    expect(audioFileSchema.safeParse(file).success).toBe(true);
  });

  test('accepts any audio/* mime even with unknown extension', () => {
    const file = new File(['x'], 'demo.weird', { type: 'audio/mpeg' });
    expect(audioFileSchema.safeParse(file).success).toBe(true);
  });

  test('rejects non-audio files', () => {
    const file = new File(['x'], 'payload.exe', { type: 'application/x-msdownload' });
    expect(audioFileSchema.safeParse(file).success).toBe(false);
  });
});
