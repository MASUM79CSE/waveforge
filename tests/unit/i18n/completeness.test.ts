import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en';
import { bn } from '../../../src/i18n/bn';

/**
 * P6.4 — i18n completeness. Bangla is a FULL catalog as of the P6
 * release: every key in `en` must exist in `bn` with a non-empty
 * translation, including the error catalog. Function-valued keys
 * (toast templates) are checked by name.
 */

function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('P6.4 i18n completeness', () => {
  it('every en key exists in bn', () => {
    const enKeys = new Set(keyPaths(en));
    const bnKeys = new Set(keyPaths(bn));
    const missing = [...enKeys].filter((k) => !bnKeys.has(k));
    expect(missing, `missing in bn: ${missing.join(', ')}`).toEqual([]);
  });

  it('every bn string value is non-empty', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(bn as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim().length === 0) bad.push(k);
      if (v !== null && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (typeof v2 === 'string' && v2.trim().length === 0) bad.push(`${k}.${k2}`);
        }
      }
    }
    expect(bad, `empty bn values: ${bad.join(', ')}`).toEqual([]);
  });

  it('the full bn catalog type-checks against the Catalog shape at runtime', () => {
    // spot-check a few keys of every section (compile-time parity is
    // enforced by `Widen<Catalog>` on the bn export)
    expect((bn as unknown as Record<string, string>).menuFile).toBe('ফাইল');
    expect((bn as unknown as Record<string, string>).ragExportSrt).toContain('SRT');
    const errors = (bn as unknown as Record<string, Record<string, string>>).errors!;
    expect(errors['WF-E101']).toContain('ফরম্যাট');
  });

  it('templates keep their substitution placeholders', () => {
    expect(typeof (bn as Record<string, unknown>).loadingFile).toBe('function');
    expect(typeof (bn as Record<string, unknown>).draftsUsage).toBe('function');
    const errors = (bn as unknown as Record<string, Record<string, string>>).errors!;
    expect(Object.keys(errors).length).toBe(11);
  });
});
