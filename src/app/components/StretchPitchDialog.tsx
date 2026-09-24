/**
 * Stretch / Pitch dialog (E5, experimental): stretch % (50–200) and pitch
 * semitones (−12…+12) with LINKED semantics — moving one zeroes the other
 * unless "Independent" is checked (effects v2 §E5). Apply = WSOLA stretch
 * × resample composition in the kernel def; ×1.00 + 0 st is bit-exact.
 */
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { defaultParams, getEffect } from '../../fx/registry';
import type { Params, ParamSpec } from '../../fx/types';
import { applyEffect, effectLabel, preparePreview } from '../fxActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { closeEffectDialog } from '../actions';
import { effectDialogId, previewActive } from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';
import { ParamRow } from './EffectDialog';

const STRETCH_ID = 'fx.stretch';

export function StretchPitchDialog(): JSX.Element | null {
  const id = effectDialogId.value;
  const def = id === STRETCH_ID ? getEffect(STRETCH_ID) : undefined;
  const [params, setParams] = useState<Params>({});

  useEffect(() => {
    if (def) setParams(defaultParams(def));
    return () => stopPreview();
  }, [id]);

  if (!def) return null;

  const restartPreview = (next: Params): void => {
    if (!previewActive.value) return;
    stopPreview();
    const plan = preparePreview(def.id, next);
    if (plan) startPreview(plan);
  };

  /** Linked: moving one control zeroes the other unless independent. */
  const setLinked = (key: string, value: number | boolean): void => {
    const next = { ...params, [key]: value };
    if (next.independent !== true) {
      if (key === 'stretchPct' && Number(value) !== 100) next.semitones = 0;
      if (key === 'semitones' && Number(value) !== 0) next.stretchPct = 100;
    }
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
        {def.specs.map((spec: ParamSpec) => (
          <ParamRow
            key={spec.key}
            spec={spec}
            value={params[spec.key]}
            onChange={spec.key === 'independent' ? (k, v) => setLinked(k, v) : setLinked}
          />
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
