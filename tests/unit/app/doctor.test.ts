import { describe, expect, test } from 'vitest';
import {
  runDoctorChecks,
  wasmProbe,
  type DoctorCheck,
  type DoctorRow,
} from '../../../src/app/doctor';

describe('M7 §6.3 #7: doctor self-diagnostics', () => {
  test('runner returns rows in order with ok/detail/ms; never throws', async () => {
    const checks: DoctorCheck[] = [
      { id: 'good', label: 'Good', run: () => ({ ok: true, detail: 'fine' }) },
      { id: 'bad', label: 'Bad', run: () => ({ ok: false, detail: 'missing' }) },
      { id: 'throws', label: 'Throws', run: () => { throw new Error('kaput'); } },
      { id: 'async', label: 'Async', run: async () => ({ ok: true, detail: 'awaited' }) },
    ];
    const rows = await runDoctorChecks(checks);
    expect(rows.map((r) => r.id)).toEqual(['good', 'bad', 'throws', 'async']);
    expect(rows[0]).toMatchObject({ ok: true, detail: 'fine' });
    expect(rows[1]).toMatchObject({ ok: false, detail: 'missing' });
    expect(rows[2]).toMatchObject({ ok: false, detail: expect.stringContaining('kaput') });
    expect(rows[3]).toMatchObject({ ok: true, detail: 'awaited' });
    for (const r of rows as DoctorRow[]) expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  test('wasm probe instantiates a minimal module in this runtime', async () => {
    const r = await wasmProbe();
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('wasm');
  });

  test('each check id is unique and labelled', async () => {
    const { defaultDoctorChecks } = await import('../../../src/app/doctor');
    const checks = defaultDoctorChecks();
    const ids = checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of checks) expect(c.label.length).toBeGreaterThan(0);
    // every default check completes and classifies (no unhandled throw)
    const rows = await runDoctorChecks(checks);
    expect(rows).toHaveLength(checks.length);
  });
});
