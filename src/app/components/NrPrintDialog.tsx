/**
 * Noise Reduction (print) dialog (E6a): registry-driven param rows plus
 * "Learn print from selection" — the print is learned from the selected
 * noise-only region (magnitude EMA over STFT frames, channels averaged)
 * and routed to preview/apply through the EffectRunContext side-channel
 * (effects v2 §E6). No print learned ⇒ the kernel is a bit-exact no-op.
 * The print lives in the `sessionNoisePrint` signal and is persisted in
 * draft + autosave headers, so it survives reloads (M7) until the next
 * document load clears it.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { defaultParams, getEffect } from '../../fx/registry';
import { learnNoisePrint } from '../../fx/nrPrint';
import { sliceRegion } from '../../engine/editOps';
import type { EffectRunContext, Params, ParamSpec } from '../../fx/types';
import { applyEffect, effectLabel, preparePreview } from '../fxActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { closeEffectDialog } from '../actions';
import { effectDialogId, previewActive, sessionNoisePrint } from '../state';
import { currentChannels, targetRange } from '../editActions';
import { activeTrackTarget } from '../projectActions';
import { t } from '../../i18n';
import { Modal } from './Modal';
import { ParamRow } from './EffectDialog';

const NR_ID = 'fx.nrPrint';

export function NrPrintDialog(): JSX.Element | null {
  const id = effectDialogId.value;
  const def = id === NR_ID ? getEffect(NR_ID) : undefined;
  const [params, setParams] = useState<Params>({});
  const [status, setStatus] = useState('');
  const ctxRef = useRef<EffectRunContext | undefined>(undefined);

  useEffect(() => {
    if (def) setParams(defaultParams(def));
    const restored = sessionNoisePrint.value;
    if (restored) {
      ctxRef.current = { noisePrint: restored };
      setStatus(`${t().nrPrintRestored} — ${restored.length} bins`);
    }
    return () => stopPreview();
  }, [id]);

  if (!def) return null;

  const restartPreview = (next: Params): void => {
    if (!previewActive.value) return;
    stopPreview();
    const plan = preparePreview(def.id, next, ctxRef.current);
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
    const plan = preparePreview(def.id, params, ctxRef.current);
    if (plan) startPreview(plan);
  };

  const onApply = (): void => {
    stopPreview();
    closeEffectDialog();
    void applyEffect(def.id, params, ctxRef.current);
  };

  const onLearn = (): void => {
    const range = targetRange();
    // M8f: learn from the active lane when one is targeted (doc otherwise)
    const channels = activeTrackTarget()?.channels ?? currentChannels();
    if (!range || !channels.length) {
      setStatus(t().nrPrintNone);
      return;
    }
    const region = sliceRegion(channels, range.start, range.len);
    const print = learnNoisePrint(region);
    ctxRef.current = { noisePrint: print };
    sessionNoisePrint.value = print;
    setStatus(`${t().nrPrintLearned} — ${print.length} bins`);
    restartPreview(params);
  };

  return (
    <Modal title={effectLabel(def)} onClose={closeEffectDialog}>
      <div class="fx-dialog">
        {def.specs.map((spec: ParamSpec) => (
          <ParamRow key={spec.key} spec={spec} value={params[spec.key]} onChange={setParam} />
        ))}
        <div class="fx-ir-row">
          <button class="btn-secondary" onClick={onLearn}>
            {t().nrLearn}
          </button>
          <span class="fx-ir-status">{status || t().nrPrintNone}</span>
        </div>
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
