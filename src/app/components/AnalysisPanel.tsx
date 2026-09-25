/**
 * Analysis panel (M5): live spectrum bars from the master-tap AnalyserNode
 * (2048 FFT, log-spaced bands) plus LUFS / BPM readouts. Pure draw loop —
 * no timers when the panel is closed or the audio context is suspended.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { SPECTRUM_BANDS, bandBinEdges, bandLevel } from '../../engine/spectrum';
import { t } from '../../i18n';
import {
  detectBpm,
  isAnalysisBusy,
  isBeatsShown,
  measureLoudness,
  runFullReport,
  selectFirstClippedRun,
  toggleBeatsShown,
} from '../analysisActions';
import { verdicts } from '../../engine/analysisReport';
import { reportToCsv, reportToText } from '../../engine/reportExport';
import { toastInfo, toastError } from '../actions';
import * as S from '../state';
import { engine } from '../runtime';

const BAR_H = 56;

function lufsText(n: number | null): string {
  if (n === null) return '—';
  return n <= Number.NEGATIVE_INFINITY ? '−∞' : n.toFixed(1);
}

function SpectrumCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0a0e13';
      g.fillRect(0, 0, w, h);

      const analyser = engine.getAnalyser();
      const bands = SPECTRUM_BANDS;
      const bw = w / bands;
      if (!analyser) {
        g.fillStyle = '#1d3336';
        g.fillRect(0, h - 2, w, 2);
        return;
      }
      const bins = analyser.frequencyBinCount;
      const data = new Uint8Array(bins);
      analyser.getByteFrequencyData(data);
      const edges = bandBinEdges(bands, bins, analyser.context.sampleRate);
      let from = 0;
      for (let b = 0; b < bands; ++b) {
        const to = edges[b] ?? bins;
        const level = bandLevel(data, from, to) / 255;
        from = to;
        const bh = Math.max(1, level * (h - 4));
        g.fillStyle = '#3ddad0';
        g.fillRect(b * bw + 0.5, h - bh - 1, Math.max(1, bw - 1.5), bh);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} class="analysis-spectrum" style={{ height: `${BAR_H}px` }} />;
}

function db(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n <= Number.NEGATIVE_INFINITY ? '−∞' : n >= Number.POSITIVE_INFINITY ? '+∞' : n.toFixed(1);
}

/** P2: the professional report — verdict table + audits (docs/analyze-plan.md). */
function ReportBlock(): JSX.Element | null {
  const report = S.analysisReport.value;
  if (!report) return null;
  const rows = verdicts(report);
  const st = report.stereo;
  const integrity = report.integrity;

  const exportCsv = (): void => {
    const blob = new Blob([reportToCsv(report, rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyReport = (): void => {
    navigator.clipboard
      .writeText(reportToText(report, rows))
      .then(() => toastInfo(t().reportCopied))
      .catch(() => toastError(t().reportCopyFailed));
  };

  return (
    <div class="report-block" data-testid="analysis-report">
      <div class="report-actions">
        <button type="button" class="btn-secondary analysis-btn" data-testid="report-export" onClick={exportCsv}>
          {t().reportExportCsv}
        </button>
        <button type="button" class="btn-secondary analysis-btn" data-testid="report-copy" onClick={copyReport}>
          {t().reportCopy}
        </button>
      </div>
      <div class="report-row">
        <span class="report-key">{t().reportLoudness}</span>
        <span class="report-val">
          {t().analysisIntegrated} {db(report.lufs.integrated)} LUFS · {t().reportLra}{' '}
          {db(report.lufs.lra)} LU · {t().reportPlr} {db(report.lufs.plr)} dB ·{' '}
          {t().reportTruePeak} {db(report.truePeakDb)} dBTP
        </span>
      </div>
      <div class="report-row" data-testid="report-verdicts">
        <span class="report-key">{t().reportTargets}</span>
        <span class="report-val report-table">
          {rows.map((v) => (
            <span class="report-chip" key={v.id}>
              <b>{v.label}</b> {v.gainDb >= 0 ? '+' : ''}
              {v.gainDb.toFixed(1)} dB · TP {v.tpSafe ? '✓' : '✗'}
            </span>
          ))}
        </span>
      </div>
      {st && (
        <div class="report-row">
          <span class="report-key">{t().reportStereo}</span>
          <span class="report-val">
            {t().reportCorrelation} {st.correlationMean.toFixed(2)} (min {st.correlationMin.toFixed(2)}) ·{' '}
            {t().reportSide} {st.sidePct.toFixed(1)} %
          </span>
        </div>
      )}
      {!st && (
        <div class="report-row">
          <span class="report-key">{t().reportStereo}</span>
          <span class="report-val">{t().reportMono}</span>
        </div>
      )}
      <div class="report-row">
        <span class="report-key">{t().reportIntegrity}</span>
        <span class="report-val">
          {t().reportClipping} {integrity.clippedSamples === 0 ? '—' : `${integrity.clippedSamples} (${integrity.clippedRuns} runs)`} ·{' '}
          {t().reportDc} {integrity.dc.map((d) => (d * 100).toFixed(3)).join(' / ')} % ·{' '}
          {t().reportSamplePeak} {db(integrity.samplePeakDb)} dBFS
          {integrity.firstRun && (
            <button type="button" class="btn-secondary analysis-btn" onClick={() => selectFirstClippedRun()}>
              {t().reportSelectClip}
            </button>
          )}
        </span>
      </div>
      <div class="report-row">
        <span class="report-key">{t().reportBalance}</span>
        <span class="report-val report-bars">
          {report.balance.map((pct, i) => (
            <span class="report-bar" key={i} title={`${pct.toFixed(1)} %`}>
              <span style={{ height: `${Math.min(100, Math.max(2, pct))}%` }} />
            </span>
          ))}
        </span>
      </div>
      <div class="report-row">
        <span class="report-key">{t().reportNoise}</span>
        <span class="report-val">
          {t().reportFloor} {db(report.noise.floorDb)} dBFS · {t().reportSnr}{' '}
          {db(report.noise.snrDb)} dB · {t().reportSilence} {report.noise.silencePct.toFixed(1)} %
        </span>
      </div>
    </div>
  );
}

/**
 * Panel strip. Rendered while `analysisPanelOpen` — App mounts it fresh on
 * toggle, so the one-shot effect above re-subscribes per open.
 */
export function AnalysisPanel(): JSX.Element | null {
  if (!S.analysisPanelOpen.value) return null;
  const lufs = S.lufsResult.value;
  const bpm = S.bpmResult.value;
  const busy = isAnalysisBusy();

  return (
    <section class="analysis-panel" aria-label={t().menuAnalyze}>
      <SpectrumCanvas />
      <div class="analysis-readouts">
        <span class="analysis-group">
          <span class="analysis-key">{t().analysisIntegrated}</span>
          <span class="analysis-val">{lufsText(lufs?.integrated ?? null)}</span>
          <span class="analysis-key">{t().analysisMomentary}</span>
          <span class="analysis-val">{lufsText(lufs?.momentaryMax ?? null)}</span>
          <span class="analysis-key">{t().analysisShortterm}</span>
          <span class="analysis-val">{lufsText(lufs?.shortTermMax ?? null)}</span>
          <button
            type="button"
            class="btn-secondary analysis-btn"
            disabled={busy !== null}
            onClick={() => measureLoudness()}
          >
            {busy === 'lufs' ? t().analyzingLufs : t().analysisMeasure}
          </button>
        </span>
        <span class="analysis-group">
          <span class="analysis-key">{t().analysisBpmLabel}</span>
          <span class="analysis-val">{bpm ? String(bpm.bpm) : '—'}</span>
          <span class="analysis-key">{t().analysisBeatsLabel}</span>
          <span class="analysis-val">{bpm ? String(bpm.beatCount) : '—'}</span>
          <button
            type="button"
            class="btn-secondary analysis-btn"
            disabled={busy !== null}
            onClick={() => detectBpm()}
          >
            {busy === 'bpm' ? t().analyzingBpm : t().analysisDetect}
          </button>
          <label class="analysis-check">
            <input type="checkbox" checked={isBeatsShown()} onChange={() => toggleBeatsShown()} />
            {t().analyzeBeats}
          </label>
          <button
            type="button"
            class="btn-secondary analysis-btn"
            data-testid="report-run"
            disabled={busy !== null}
            onClick={() => runFullReport()}
          >
            {busy === 'report' ? t().analysisAnalyzing : t().analysisReport}
          </button>
        </span>
      </div>
      <ReportBlock />
    </section>
  );
}
