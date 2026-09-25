import { describe, expect, test } from 'vitest';
import { analyzeReport, verdicts } from '../../src/engine/analysisReport';
import { reportToCsv, reportToText } from '../../src/engine/reportExport';

/**
 * P4 — report export (docs/analyze-plan.md addendum): the professional
 * report is deliverable — CSV (machine-readable, dot decimals, header row)
 * and a plain-text summary (clipboard). Pure builders; deterministic.
 */

const SR = 48000;
function sine(dbFs: number, sec: number): Float32Array {
  const n = Math.round(SR * sec);
  const amp = Math.pow(10, dbFs / 20);
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) out[i] = amp * Math.sin((2 * Math.PI * 997 * i) / SR);
  return out;
}

describe('P4 — reportToCsv', () => {
  test('g1: header row, dotted decimals, every section present, deterministic', () => {
    const report = analyzeReport([sine(-23, 5), sine(-23, 5)], SR);
    const csv = reportToCsv(report, verdicts(report));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('section,metric,value,unit');
    const text = csv.toLowerCase();
    for (const key of ['loudness,integrated', 'loudness,lra', 'loudness,plr', 'loudness,true_peak',
      'stereo,correlation_mean', 'integrity,clipped_samples', 'integrity,dc_ch1',
      'noise,floor_db', 'noise,silence_pct']) {
      expect(text).toContain(key);
    }
    // locale-safe: every row is exactly 4 comma-separated fields (values
    // use dot decimals, never "1,5")
    for (const line of lines) {
      if (line.length > 0) expect(line.split(',').length).toBe(4);
    }
    // deterministic
    expect(reportToCsv(report, verdicts(report))).toBe(csv);
  });

  test('g2: a verdict row per platform — gain in dB and tp_safe yes/no', () => {
    const report = analyzeReport([sine(-23, 5), sine(-23, 5)], SR);
    const csv = reportToCsv(report, verdicts(report));
    expect(csv).toContain('verdict,spotify');
    expect(csv).toContain('verdict,netflix');
    expect(csv).toContain('tp_safe,yes');
    const gainRows = csv.split('\n').filter((l) => l.startsWith('verdict,') && l.endsWith('dB'));
    expect(gainRows.length).toBe(9);
  });

  test('g3: infinite values serialize as -Inf (never bare NaN/undefined)', () => {
    const report = analyzeReport([new Float32Array(SR)], SR); // digital silence
    const csv = reportToCsv(report, verdicts(report));
    expect(csv).not.toMatch(/NaN|undefined/);
    expect(csv).toContain('-Inf');
  });
});

describe('P4 — reportToText (clipboard summary)', () => {
  test('g4: single-line-per-section readable summary with targets', () => {
    const report = analyzeReport([sine(-23, 5), sine(-23, 5)], SR);
    const text = reportToText(report, verdicts(report));
    expect(text).toContain('WaveForge analysis report');
    expect(text).toContain('LUFS');
    expect(text).toContain('Spotify');
    expect(text).toContain('EBU R128');
    expect(text.split('\n').length).toBeGreaterThanOrEqual(5);
  });
});
