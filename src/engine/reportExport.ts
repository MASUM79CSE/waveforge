/**
 * P4 — report export: the professional
 * report is deliverable. CSV is machine-readable (header row, dot decimals,
 * exactly 4 fields per row — locale-safe); the text form is a readable
 * summary for clipboard/email. Pure builders over AnalysisReport + its
 * verdicts; deterministic.
 */
import type { AnalysisReport, Verdict } from './analysisReport';

function fmt(n: number): string {
  if (Number.isNaN(n)) return '-Inf';
  if (n === Number.NEGATIVE_INFINITY) return '-Inf';
  if (n === Number.POSITIVE_INFINITY) return '+Inf';
  return n.toFixed(2);
}

type Row = [string, string, string, string];

function rowsOf(report: AnalysisReport, verdicts: readonly Verdict[]): Row[] {
  const rows: Row[] = [];
  const L = report.lufs;
  rows.push(['loudness', 'integrated', fmt(L.integrated), 'LUFS']);
  rows.push(['loudness', 'momentary_max', fmt(L.momentaryMax), 'LUFS']);
  rows.push(['loudness', 'shortterm_max', fmt(L.shortTermMax), 'LUFS']);
  rows.push(['loudness', 'lra', fmt(L.lra), 'LU']);
  rows.push(['loudness', 'plr', fmt(L.plr), 'dB']);
  rows.push(['loudness', 'true_peak', fmt(report.truePeakDb), 'dBTP']);
  if (report.stereo) {
    rows.push(['stereo', 'correlation_mean', fmt(report.stereo.correlationMean), '']);
    rows.push(['stereo', 'correlation_min', fmt(report.stereo.correlationMin), '']);
    rows.push(['stereo', 'side_pct', fmt(report.stereo.sidePct), '%']);
  }
  rows.push(['integrity', 'clipped_samples', String(report.integrity.clippedSamples), '']);
  rows.push(['integrity', 'clipped_runs', String(report.integrity.clippedRuns), '']);
  report.integrity.dc.forEach((d, i) => {
    rows.push(['integrity', `dc_ch${i + 1}`, fmt(d), '']);
  });
  rows.push(['integrity', 'sample_peak', fmt(report.integrity.samplePeakDb), 'dBFS']);
  const OCT = ['31.25_hz', '62.5_hz', '125_hz', '250_hz', '500_hz', '1k_hz', '2k_hz', '4k_hz', '8k_hz', '16k_hz'];
  report.balance.forEach((pct, i) => {
    rows.push(['balance', OCT[i] ?? `band_${i}`, fmt(pct), '%']);
  });
  rows.push(['noise', 'floor_db', fmt(report.noise.floorDb), 'dBFS']);
  rows.push(['noise', 'snr_db', fmt(report.noise.snrDb), 'dB']);
  rows.push(['noise', 'silence_pct', fmt(report.noise.silencePct), '%']);
  for (const v of verdicts) {
    rows.push(['verdict', `${v.label.toLowerCase().replace(/\s+/g, '_')} gain`, fmt(v.gainDb), 'dB']);
    rows.push(['verdict', `${v.label.toLowerCase().replace(/\s+/g, '_')} tp_safe`, v.tpSafe ? 'yes' : 'no', '']);
  }
  return rows;
}

/** Machine-readable CSV: header + exactly 4 fields per row, dot decimals. */
export function reportToCsv(report: AnalysisReport, verdicts: readonly Verdict[]): string {
  const rows = rowsOf(report, verdicts);
  return ['section,metric,value,unit', ...rows.map((r) => r.join(','))].join('\n');
}

/** Readable clipboard/email summary — one line per section. */
export function reportToText(report: AnalysisReport, verdicts: readonly Verdict[]): string {
  const L = report.lufs;
  const lines: string[] = [];
  lines.push('WaveForge analysis report');
  lines.push(
    `Loudness: ${L.integrated.toFixed(1)} LUFS integrated · LRA ${L.lra.toFixed(1)} LU · ` +
      `PLR ${L.plr.toFixed(1)} dB · TP ${fmt(report.truePeakDb)} dBTP`,
  );
  if (report.stereo) {
    lines.push(
      `Stereo: correlation ${report.stereo.correlationMean.toFixed(2)} (min ${report.stereo.correlationMin.toFixed(2)}), ` +
        `side ${report.stereo.sidePct.toFixed(1)} %`,
    );
  } else {
    lines.push('Stereo: mono file');
  }
  lines.push(
    `Integrity: clipping ${report.integrity.clippedSamples} samples (${report.integrity.clippedRuns} runs), ` +
      `DC ${(report.integrity.dc[0]! * 100).toFixed(3)} %, sample peak ${fmt(report.integrity.samplePeakDb)} dBFS`,
  );
  lines.push(
    `Noise: floor ${fmt(report.noise.floorDb)} dBFS · SNR ${fmt(report.noise.snrDb)} dB · ` +
      `silence ${report.noise.silencePct.toFixed(1)} %`,
  );
  lines.push(
    `Targets: ${verdicts.map((v) => `${v.label} ${v.gainDb >= 0 ? '+' : ''}${v.gainDb.toFixed(1)} dB (TP ${v.tpSafe ? '✓' : '✗'})`).join(' · ')}`,
  );
  return lines.join('\n');
}
