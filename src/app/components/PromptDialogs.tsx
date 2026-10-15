import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { signal } from '@preact/signals';
import { Modal } from './Modal';
import { closeGainPrompt, closeNormalizePrompt, closeSeamlessLoop } from '../actions';
import { applyGainDb, applyNormalize, applySeamlessLoop } from '../editActions';
import { clipFadesOpen, gainPromptOpen, markerPrompt, normalizePromptOpen, repairPromptOpen, seamlessOpen } from '../state';
import { closeMarkerPrompt, confirmMarkerPrompt } from '../markersActions';
import { GAIN_MAX_DB, GAIN_MIN_DB, NORMALIZE_TARGET_DB } from '../../core/constants';
import { PromptDialog, TextPromptDialog } from './PromptDialog';
import { t } from '../../i18n';

export function GainDialog() {
  return (
    <PromptDialog
      open={gainPromptOpen.value}
      title={t().gainTitle}
      label={t().gainLabel}
      initialValue={0}
      min={GAIN_MIN_DB}
      max={GAIN_MAX_DB}
      step={0.5}
      onConfirm={(db) => applyGainDb(db)}
      onCancel={closeGainPrompt}
    />
  );
}

export function NormalizeDialog() {
  return (
    <PromptDialog
      open={normalizePromptOpen.value}
      title={t().normalizeTitle}
      label={t().normalizeLabel}
      initialValue={NORMALIZE_TARGET_DB}
      min={-60}
      max={0}
      step={0.1}
      onConfirm={(db) => applyNormalize(db)}
      onCancel={closeNormalizePrompt}
    />
  );
}

export function MarkerNameDialog() {
  const prompt = markerPrompt.value;
  return (
    <TextPromptDialog
      open={prompt !== null}
      title={prompt?.mode === 'rename' ? t().markerRenameTitle : t().markerAddTitle}
      label={t().markerNameLabel}
      initialValue={prompt?.initial ?? ''}
      maxLength={200}
      onConfirm={(label) => confirmMarkerPrompt(label, prompt)}
      onCancel={closeMarkerPrompt}
    />
  );
}

export function SeamlessLoopDialog() {
  const open = seamlessOpen.value;
  const [fadeMs, setFadeMs] = useState(10);
  const [repeat, setRepeat] = useState(1);
  const [trim, setTrim] = useState(false);
  const [snap, setSnap] = useState(true);
  const fadeRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  // reference defaults on every open: 10 ms crossfade, repeat 1, snap on
  useEffect(() => {
    if (open) {
      setFadeMs(10);
      setRepeat(1);
      setTrim(false);
      setSnap(true);
    }
  }, [open]);

  if (!open) return null;

  return (
    <Modal title={t().seamlessLoop} onClose={closeSeamlessLoop}>
      <div class="url-form">
        <label class="url-hint" for="sloop-fade">
          {t().sloopCrossfade}
        </label>
        <input
          id="sloop-fade"
          ref={fadeRef}
          class="url-input"
          type="number"
          min={0}
          max={500}
          step={1}
          value={fadeMs}
          onInput={(e) => setFadeMs(Number((e.target as HTMLInputElement).value))}
        />
        <label class="url-hint" for="sloop-repeat">
          {t().sloopRepeat}
        </label>
        <input
          id="sloop-repeat"
          ref={repeatRef}
          class="url-input"
          type="number"
          min={1}
          max={64}
          step={1}
          value={repeat}
          onInput={(e) => setRepeat(Number((e.target as HTMLInputElement).value))}
        />
        <div class="fx-row">
          <input
            id="sloop-trim"
            type="checkbox"
            checked={trim}
            onChange={(e) => setTrim((e.target as HTMLInputElement).checked)}
          />
          <label class="fx-label" for="sloop-trim">
            {t().sloopTrim}
          </label>
        </div>
        <div class="fx-row">
          <input
            id="sloop-snap"
            type="checkbox"
            checked={snap}
            onChange={(e) => setSnap((e.target as HTMLInputElement).checked)}
          />
          <label class="fx-label" for="sloop-snap">
            {t().sloopSnap}
          </label>
        </div>
        <div class="url-actions">
          <button class="btn-secondary" onClick={closeSeamlessLoop}>
            Cancel
          </button>
          <button
            class="btn-primary"
            onClick={() => {
              // F-11 fix: read the LIVE inputs — a render landing between a
              // keystroke/fill and this click could leave state stale, which
              // silently applied the previous values (reproduced in E2E, 2026-10-15).
              const request = {
                fadeMs: Number(fadeRef.current?.value ?? fadeMs),
                repeat: Number(repeatRef.current?.value ?? repeat),
                trim,
                snap,
              }; // live values before closing
              closeSeamlessLoop();
              applySeamlessLoop(request);
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** PF-02: the fades dialog lives in the lazy clipFadeOps chunk (WF-007). */
const fadesImpl = signal<null | ComponentType>(null);

export function ClipFadesDialog() {
  const open = clipFadesOpen.value;
  const Impl = fadesImpl.value;
  if (open && !Impl) void import('../clipFadeOps').then((m) => (fadesImpl.value = m.ClipFadesDialog));
  return open && Impl ? <Impl /> : null;
}

/** PF-03: the repair dialog + kernels live in the lazy clipFadeOps-style
 * chunk (WF-007 budget); this shim mounts it on demand. */
const repairImpl = signal<null | ComponentType>(null);

export function AudioRepairDialog() {
  const open = repairPromptOpen.value;
  const Impl = repairImpl.value;
  if (open && !Impl) void import('../repairOps').then((m) => (repairImpl.value = m.AudioRepairDialog));
  return open && Impl ? <Impl /> : null;
}
