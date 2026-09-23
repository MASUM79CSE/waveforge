import { useEffect, useState } from 'preact/hooks';
import { defaultParams, getEffect } from '../../fx/registry';
import type { Params, ParamSpec } from '../../fx/types';
import { applyEffect, effectLabel, preparePreview } from '../fxActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { closeEffectDialog } from '../actions';
import { effectDialogId, previewActive } from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';

/** Registry-driven effect dialog: params + A/B preview + apply (ADR 005). */
export function EffectDialog() {
  const id = effectDialogId.value;
  const def = id ? getEffect(id) : undefined;
  const [params, setParams] = useState<Params>({});

  useEffect(() => {
    if (def) setParams(defaultParams(def));
  }, [id]);

  if (!def) return null;

  const restartPreview = (next: Params): void => {
    if (!previewActive.value) return;
    stopPreview();
    const plan = preparePreview(def.id, next);
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
    const plan = preparePreview(def.id, params);
    if (plan) startPreview(plan);
  };

  const onApply = (): void => {
    stopPreview();
    closeEffectDialog();
    void applyEffect(def.id, params);
  };

  return (
    <Modal title={effectLabel(def)} onClose={closeEffectDialog}>
      <div class="fx-dialog">
        {def.specs.map((spec) => (
          <ParamRow key={spec.key} spec={spec} value={params[spec.key]} onChange={setParam} />
        ))}
        <div class="fx-actions">
          <button class="btn-secondary" onClick={onPreviewToggle}>
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
          <button class="btn-primary" onClick={onApply}>
            {t().fxApply}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ParamRow({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number | boolean | undefined;
  onChange: (key: string, value: number | boolean) => void;
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
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={num}
        onChange={(e) => onChange(spec.key, Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
