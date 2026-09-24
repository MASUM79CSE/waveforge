/**
 * Parametric EQ dialog (E2): 8 band rows over a live analytic response
 * curve — the curve is computed from the exact RBJ coefficients the apply
 * path uses, so what you see is what the audio does. Preview/apply reuse
 * the generic kernel plumbing (flat params bridged via bandsToParams).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { defaultParams, getEffect } from '../../fx/registry';
import {
  eqBandsFromParams,
  bandsToParams,
  eqCurveDb,
  EQ_TYPES,
  type EqBand,
} from '../../fx/paramEq';
import { applyEffect, effectLabel, preparePreview } from '../fxActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { closeEffectDialog } from '../actions';
import { effectDialogId, previewActive } from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';

const PGEQ8_ID = 'fx.pgeq8';
const CURVE_POINTS = 128;
const F_MIN = 20;
const F_MAX = 20000;
const DB_RANGE = 20; // drawn range ±20 dB around 0

function typeLabel(kind: EqBand['type']): string {
  const catalog = t();
  switch (kind) {
    case 'peaking': return catalog.eqPeaking;
    case 'lowshelf': return catalog.eqLowShelf;
    case 'highshelf': return catalog.eqHighShelf;
    case 'notch': return catalog.eqNotch;
    case 'hpf': return catalog.eqHpf;
    case 'lpf': return catalog.eqLpf;
  }
}

function needsGain(kind: EqBand['type']): boolean {
  return kind === 'peaking' || kind === 'lowshelf' || kind === 'highshelf';
}

/** Log-frequency response curve, drawn from the analytic coefficients. */
function ResponseCurve({ bands }: { bands: EqBand[] }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 560;
    const h = canvas.clientHeight || 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    g.fillStyle = '#0a0e13';
    g.fillRect(0, 0, w, h);

    // grid: decades + 6 dB lines
    g.strokeStyle = '#1a222c';
    g.fillStyle = '#5c6773';
    g.font = '9px ui-monospace, monospace';
    const xAt = (f: number): number =>
      (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = xAt(f);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      if (f === 100 || f === 1000 || f === 10000) g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 3, h - 3);
    }
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = h / 2 - (db / DB_RANGE) * (h / 2);
      g.strokeStyle = db === 0 ? '#2a3a46' : '#161e27';
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }

    // the analytic curve — same coefficients the apply path uses
    const freqs: number[] = [];
    for (let k = 0; k < CURVE_POINTS; ++k) {
      freqs.push(F_MIN * Math.pow(F_MAX / F_MIN, k / (CURVE_POINTS - 1)));
    }
    const curve = eqCurveDb(bands, freqs, 44100);
    g.strokeStyle = '#3ddad0';
    g.lineWidth = 1.8;
    g.beginPath();
    for (let k = 0; k < CURVE_POINTS; ++k) {
      const x = (k / (CURVE_POINTS - 1)) * w;
      const db = Math.max(-DB_RANGE, Math.min(DB_RANGE, curve[k] ?? 0));
      const y = h / 2 - (db / DB_RANGE) * (h / 2);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.lineWidth = 1;
  }, [bands]);

  return <canvas ref={canvasRef} class="eq-curve" aria-label={t().eqCurve} />;
}


export function Pgeq8Dialog(): JSX.Element | null {
  const id = effectDialogId.value;
  const def = id === PGEQ8_ID ? getEffect(PGEQ8_ID) : undefined;
  const [bands, setBands] = useState<EqBand[]>([]);

  useEffect(() => {
    if (def) setBands(eqBandsFromParams(defaultParams(def)));
    return () => stopPreview();
  }, [id]);

  if (!def || bands.length === 0) return null;

  const update = (index: number, patch: Partial<EqBand>): void => {
    setBands(bands.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  };

  const restartPreview = (): void => {
    if (!previewActive.value) return;
    stopPreview();
    const plan = preparePreview(def.id, bandsToParams(bands));
    if (plan) startPreview(plan);
  };

  const onPreviewToggle = (): void => {
    if (previewActive.value) {
      stopPreview();
      return;
    }
    const plan = preparePreview(def.id, bandsToParams(bands));
    if (plan) startPreview(plan);
  };

  const onApply = (): void => {
    stopPreview();
    closeEffectDialog();
    void applyEffect(def.id, bandsToParams(bands));
  };

  return (
    <Modal title={effectLabel(def)} onClose={closeEffectDialog}>
      <div class="fx-dialog eq-dialog">
        <ResponseCurve bands={bands} />
        <div class="eq-rows">
          {bands.map((band, i) => (
            <div class="eq-row" key={i}>
              <select
                class="fx-num eq-type"
                aria-label={`Band ${i + 1} type`}
                value={EQ_TYPES.indexOf(band.type)}
                onChange={(e) => {
                  const type = EQ_TYPES[Number((e.target as HTMLSelectElement).value)] ?? 'peaking';
                  update(i, { type, gainDb: needsGain(type) ? band.gainDb : 0 });
                  setTimeout(restartPreview, 0);
                }}
              >
                {EQ_TYPES.map((kind, ti) => (
                  <option value={ti}>{typeLabel(kind)}</option>
                ))}
              </select>
              <label class="eq-cell">
                <span>{t().paramEqFreq}</span>
                <input
                  class="fx-num"
                  type="number"
                  min={20}
                  max={20000}
                  step={1}
                  value={Math.round(band.freq)}
                  disabled={!needsGain(band.type) && band.type !== 'notch'}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(v)) update(i, { freq: Math.max(20, Math.min(20000, v)) });
                    setTimeout(restartPreview, 0);
                  }}
                />
              </label>
              <label class="eq-cell">
                <span>{t().paramEqGain}</span>
                <input
                  class="fx-num"
                  type="number"
                  min={-18}
                  max={18}
                  step={0.5}
                  value={band.gainDb}
                  disabled={!needsGain(band.type)}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(v)) update(i, { gainDb: Math.max(-18, Math.min(18, v)) });
                    setTimeout(restartPreview, 0);
                  }}
                />
              </label>
              <label class="eq-cell">
                <span>{t().paramEqQ}</span>
                <input
                  class="fx-num"
                  type="number"
                  min={0.1}
                  max={16}
                  step={0.1}
                  value={band.q}
                  disabled={band.type === 'hpf' || band.type === 'lpf'}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(v)) update(i, { q: Math.max(0.1, Math.min(16, v)) });
                    setTimeout(restartPreview, 0);
                  }}
                />
              </label>
              {(band.type === 'hpf' || band.type === 'lpf') && (
                <label class="eq-cell">
                  <span>{t().eqSlope}</span>
                  <select
                    class="fx-num"
                    value={band.slope}
                    onChange={(e) => {
                      update(i, { slope: Number((e.target as HTMLSelectElement).value) === 24 ? 24 : 12 });
                      setTimeout(restartPreview, 0);
                    }}
                  >
                    <option value={12}>12 dB/oct</option>
                    <option value={24}>24 dB/oct</option>
                  </select>
                </label>
              )}
            </div>
          ))}
        </div>
        <div class="fx-actions">
          <button type="button" class="btn-secondary" onClick={onPreviewToggle}>
            {previewActive.value ? t().fxPreviewStop : t().fxPreviewAB}
          </button>
          {previewActive.value && (
            <button type="button" class="btn-secondary" onClick={() => void togglePreviewAB()}>
              A / B
            </button>
          )}
          <span class="fx-spacer" />
          <button type="button" class="btn-secondary" onClick={closeEffectDialog}>
            Cancel
          </button>
          <button type="button" class="btn-primary" onClick={onApply}>
            {t().fxApply}
          </button>
        </div>
      </div>
    </Modal>
  );
}
