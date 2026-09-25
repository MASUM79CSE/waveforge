import { describe, expect, test } from 'vitest';
import { EXPORT_FORMATS, formatInfo, qualityHint } from '../../src/io/exportFormats';

/**
 * Professional export chooser (docs/task_list.md): a code-level catalog of
 * export formats — badges, use-case lines, labeled quality presets with
 * hints, and a safe default per format. Pure.
 */

describe('export format catalog', () => {
  test('g1: three formats, unique ids, extensions, badges', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['wav', 'mp3', 'flac']);
    const exts = EXPORT_FORMATS.map((f) => f.ext);
    expect(new Set(exts).size).toBe(3);
    expect(exts).toEqual(['wav', 'mp3', 'flac']);
    for (const f of EXPORT_FORMATS) {
      expect(['Lossless', 'Lossy'], `${f.id} badge`).toContain(f.badge);
      expect(f.blurb.length, `${f.id} blurb`).toBeGreaterThan(8);
      expect(f.name.length, `${f.id} name`).toBeGreaterThan(0);
    }
    expect(formatInfo('wav').badge).toBe('Lossless');
    expect(formatInfo('mp3').badge).toBe('Lossy');
    expect(formatInfo('flac').badge).toBe('Lossless');
  });

  test('g2: every quality preset has label + hint; defaults are valid', () => {
    for (const f of EXPORT_FORMATS) {
      expect(f.qualities.length, `${f.id} presets`).toBeGreaterThanOrEqual(3);
      for (const q of f.qualities) {
        expect(q.id.length, `${f.id}:${q.id} id`).toBeGreaterThan(0);
        expect(q.label.length, `${f.id}:${q.id} label`).toBeGreaterThan(0);
        expect(q.hint.length, `${f.id}:${q.id} hint`).toBeGreaterThan(8);
      }
      expect(
        f.qualities.some((q) => q.id === f.defaultQuality),
        `${f.id} default is a listed preset`,
      ).toBe(true);
    }
    // professional defaults
    expect(formatInfo('wav').defaultQuality).toBe('pcm24');
    expect(formatInfo('mp3').defaultQuality).toBe('320');
    expect(formatInfo('flac').defaultQuality).toBe('5');
  });

  test('g3: qualityHint resolves per format; unknown falls back to default hint', () => {
    expect(qualityHint('wav', 'pcm16')).toMatch(/CD/i);
    expect(qualityHint('mp3', '320')).toMatch(/transparent|maximum/i);
    expect(qualityHint('flac', '8')).toMatch(/smallest/i);
    expect(qualityHint('mp3', 'bogus')).toBe(qualityHint('mp3', formatInfo('mp3').defaultQuality));
  });
});
