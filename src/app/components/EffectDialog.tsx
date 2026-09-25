import { useEffect, useState } from 'preact/hooks';
import { defaultParams, getEffect } from '../../fx/registry';
import type { Params, ParamSpec } from '../../fx/types';
import { ensureRnVoice, rnvoiceStatus } from '../../fx/nrVoice';
import { presetsForEffect } from '../../fx/presets';
import { applyEffect, effectLabel, preparePreview } from '../fxActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { closeEffectDialog } from '../actions';
import { effectDialogId, previewActive, sessionNoisePrint } from '../state';
import { targetRange } from '../editActions';
import {
  fxEnvelopeParam,
  fxCurvesOrUndefined,
  resetFxCurves,
  setFxCurveRegion,
  toggleFxCurveParam,
} from '../fxEnvelope';
import { FxCurveEditor } from './FxCurveEditor';
import { Modal } from './Modal';
import { t } from '../../i18n';

/** Registry-driven effect dialog: params + A/B preview + apply (ADR 005). */
export function EffectDialog() {
  const id = effectDialogId.value;
  const def = id ? getEffect(id) : undefined;
  const [params, setParams] = useState<Params>({});
  // E7b: fx.rnvoice lazily loads its vendored wasm; Preview/Apply stay
  // disabled (with a status line) until the model reports ready.
  const isRnvoice = def?.id === 'fx.rnvoice';
  const rnReady = !isRnvoice || rnvoiceStatus.value === 'ready';

  useEffect(() => {
    if (def) setParams(defaultParams(def));
    // A7: fresh envelope draft per dialog open; x domain = target region
    resetFxCurves();
    setFxCurveRegion(targetRange()?.len ?? 1);
    if (def?.id === 'fx.rnvoice') void ensureRnVoice().catch(() => undefined);
  }, [id]);

  if (!def) return null;

  // Learned noise print rides along as an optional seed (E7: used by
  // fx.nr3; other effects ignore it). A7: authored param curves ride
  // paramCurves into BOTH preview and apply.
  const runCtx = { noisePrint: sessionNoisePrint.value ?? undefined, paramCurves: fxCurvesOrUndefined() };

  const restartPreview = (next: Params): void => {
    if (!previewActive.value || !rnReady) return;
    stopPreview();
    const plan = preparePreview(def.id, next, runCtx);
    if (plan) startPreview(plan);
  };

  const setParam = (key: string, value: number | boolean): void => {
    const next = { ...params, [key]: value };
    setParams(next);
    restartPreview(next);
  };

  const onPreviewToggle = (): void => {
    if (previewActive.value) {
      stopPreview();
      return;
    }
    if (!rnReady) return;
    const plan = preparePreview(def.id, params, runCtx);
    if (plan) startPreview(plan);
  };

  const onApply = (): void => {
    stopPreview();
    closeEffectDialog();
    void applyEffect(def.id, params, runCtx);
  };

  const quickPresets = presetsForEffect(def.id);
  const catalogX = t() as unknown as Record<string, string>;

  return (
    <Modal title={effectLabel(def)} onClose={closeEffectDialog}>
      <div class="fx-dialog">
        {quickPresets.length > 0 && (
          <div class="fx-preset-row">
            <span class="fx-label">{t().fxPreset}</span>
            <select
              aria-label={t().fxPreset}
              value=""
              onChange={(e) => {
                const quick = quickPresets.find((p) => p.id === (e.target as HTMLSelectElement).value);
                if (!quick) return;
                const next = { ...params, ...quick.params };
                setParams(next);
                restartPreview(next);
              }}
            >
              <option value="">{catalogX.fxPreset ?? 'Preset'}</option>
              {quickPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {catalogX[p.nameKey] ?? p.id}
                </option>
              ))}
            </select>
          </div>
        )}
        {def.specs.map((spec) => (
          <div key={spec.key}>
            <ParamRow
              spec={spec}
              value={params[spec.key]}
              onChange={setParam}
              curveToggle={
                spec.kind === 'number' && spec.curve !== false
                  ? {
                      armed: fxEnvelopeParam.value === spec.key,
                      onToggle: (): void => toggleFxCurveParam(spec.key),
                    }
                  : undefined
              }
            />
            {fxEnvelopeParam.value === spec.key && (
              <FxCurveEditor spec={spec} staticValue={typeof params[spec.key] === 'number' ? (params[spec.key] as number) : (spec.default as number)} />
            )}
          </div>
        ))}
        {isRnvoice && rnvoiceStatus.value !== 'ready' && (
          <p class="fx-status" data-testid="rnvoice-status" role="status">
            {rnvoiceStatus.value === 'error' ? t().rnvoiceError : t().rnvoiceLoading}
            {rnvoiceStatus.value === 'error' && (
              <button
                class="btn-secondary fx-status-retry"
                onClick={(): void => void ensureRnVoice().catch(() => undefined)}
              >
                {t().rnvoiceRetry}
              </button>
            )}
          </p>
        )}
        <div class="fx-actions">
          <button class="btn-secondary" disabled={!rnReady} onClick={onPreviewToggle}>
            {previewActive.value ? t().fxPreviewStop : t().fxPreviewAB}
          </button>
          {previewActive.value && (
            <button class="btn-secondary" onClick={() => void togglePreviewAB()}>
              A / B
            </button>
          )}
          <span class="fx-spacer" />
          <button class="btn-secondary" onClick={closeEffectDialog}>
            Cancel
          </button>
          <button class="btn-primary" disabled={!rnReady} onClick={onApply}>
            {t().fxApply}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ParamRow({
  spec,
  value,
  onChange,
  curveToggle,
}: {
  spec: ParamSpec;
  value: number | boolean | undefined;
  onChange: (key: string, value: number | boolean) => void;
  /** A7: ∿ envelope toggle (numeric rows only). */
  curveToggle?: { armed: boolean; onToggle: () => void };
}) {
  const catalog = t() as unknown as Record<string, string>;
  const label = catalog[spec.labelKey] ?? spec.key;

  if (spec.kind === 'bool') {
    return (
      <div class="fx-row">
        <label class="fx-label" for={`fx-${spec.key}`}>
          {label}
        </label>
        <input
          id={`fx-${spec.key}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(spec.key, (e.target as HTMLInputElement).checked)}
        />
      </div>
    );
  }

  const num = typeof value === 'number' ? value : (spec.default as number);
  return (
    <div class="fx-row">
      <label class="fx-label" for={`fx-${spec.key}`}>
        {label}
      </label>
      {curveToggle && (
        <button
          class={`chbtn fx-curve-toggle ${curveToggle.armed ? 'soloed' : ''}`}
          aria-pressed={curveToggle.armed}
          aria-label={`${label} ${t().fxEnvelope}`}
          title={t().fxEnvelope}
          onClick={curveToggle.onToggle}
        >
          ∿
        </button>
      )}
      <input
        class="fx-slider"
        id={`fx-${spec.key}`}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={num}
        onInput={(e) => onChange(spec.key, Number((e.target as HTMLInputElement).value))}
      />
      <input
        class="fx-num"
        type="number"
        aria-label={label}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={num}
        onChange={(e) => onChange(spec.key, Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
