import { describe, expect, test } from 'vitest';
import { shortcutCatalog } from '../../../src/app/shortcutCatalog';

describe('M-D6: keyboard shortcut catalog (help overlay data)', () => {
  test('groups are non-empty with stable names and unique keys inside each', () => {
    expect(shortcutCatalog.length).toBeGreaterThanOrEqual(4);
    for (const group of shortcutCatalog) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.rows.length).toBeGreaterThan(0);
      const keys = group.rows.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const row of group.rows) expect(row.label.length).toBeGreaterThan(0);
    }
  });

  test('covers the AudioMass legacy layer + professional combos', () => {
    const all = shortcutCatalog.flatMap((g) => g.rows);
    const has = (key: string, label: RegExp): boolean =>
      all.some((r) => r.key === key && label.test(r.label));
    // legacy shift letters
    expect(has('Shift+Z', /undo/i)).toBe(true);
    expect(has('Shift+C', /copy/i)).toBe(true);
    expect(has('Shift+N', /insert silence/i)).toBe(true);
    // professional combos
    expect(has('Ctrl+Z', /undo/i)).toBe(true);
    expect(has('Ctrl+Y', /redo/i)).toBe(true);
    // transport + view
    expect(has('Space', /play|pause/i)).toBe(true);
    expect(has('L', /loop/i)).toBe(true);
    expect(has('Tab', /center/i)).toBe(true);
    expect(has('Q', /deselect|clear/i)).toBe(true);
  });
});
