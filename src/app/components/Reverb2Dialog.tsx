/**
 * Studio Reverb dialog (E4): registry-driven param rows plus the IR
 * import affordance — load a WAV/FLAC impulse response, decode via the
 * existing pipeline (decodeAudioData), cap at 15 s, resample to the
 * document rate, and route it to both preview and apply through the
 * EffectRunContext side-channel (effects v2 §E4 / ADR 009). The A/B
 * preview plays the same pure-kernel wet the Apply path commits, so
 * preview and apply can never diverge.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { defaultParams, getEffect } from '../../fx/registry';
import { clampIrChannels, IR_MAX_SECONDS } from '../../fx/reverbIr';
import { resample } from '../../fx/resample';
import type { EffectRunContext, Params, ParamSpec } from '../../fx/types';
import { applyEffect, effectLabel, preparePreview } from '../fxActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { closeEffectDialog } from '../actions';
import { effectDialogId, previewActive } from '../state';
import { getDoc } from '../runtime';
import { decodeArrayBuffer } from '../../io/decode';
import { t } from '../../i18n';
import { Modal } from './Modal';
import { ParamRow } from './EffectDialog';

const REVERB2_ID = 'fx.reverb2';

export function Reverb2Dialog(): JSX.Element | null {
  const id = effectDialogId.value;
  const def = id === REVERB2_ID ? getEffect(REVERB2_ID) : undefined;
  const [params, setParams] = useState<Params>({});
  const [irStatus, setIrStatus] = useState('');
  const ctxRef = useRef<EffectRunContext | undefined>(undefined);

  useEffect(() => {
    if (def) setParams(defaultParams(def));
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

  const onImportFile = async (file: File): Promise<void> => {
    try {
      const decoded = await decodeArrayBuffer(await file.arrayBuffer());
      const doc = getDoc();
      const sr = doc?.sampleRate ?? decoded.sampleRate;
      let channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; ++c) {
        channels.push(decoded.getChannelData(c).slice());
      }
      if (decoded.sampleRate !== sr) {
        channels = resample(channels, decoded.sampleRate / sr);
      }
      channels = clampIrChannels(channels, sr, IR_MAX_SECONDS);
      ctxRef.current = { irChannels: channels, irSampleRate: sr };
      const secs = (channels[0]?.length ?? 0) / sr;
      const next = { ...params, useImported: true };
      setParams(next);
      setIrStatus(`${file.name} — ${secs.toFixed(2)} s`);
      restartPreview(next);
    } catch {
      setIrStatus(t().reverb2IrFailed);
    }
  };

  return (
    <Modal title={effectLabel(def)} onClose={closeEffectDialog}>
      <div class="fx-dialog">
        {def.specs.map((spec: ParamSpec) => (
          <ParamRow key={spec.key} spec={spec} value={params[spec.key]} onChange={setParam} />
        ))}
        <div class="fx-ir-row">
          <label class="btn-secondary">
            {t().reverb2ImportIr}
            <input
              class="fx-ir-file"
              type="file"
              accept=".wav,.flac,audio/*"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) void onImportFile(file);
              }}
            />
          </label>
          <span class="fx-ir-status">{irStatus}</span>
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
