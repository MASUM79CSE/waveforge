/**
 * PF-03 Audio Repair operations (AM-09) — lazy chunk. The command entry
 * and dialog dynamically import this module so the kernels stay out of
 * the startup bundle (WF-007). Doc-mode only — the reference refuses
 * repair in multitrack, and so does the command (parity-true). The
 * repair range is the selection, or the whole document when nothing is
 * selected (reference auto-region). Kernels run on an owned copy of the
 * region; the write goes through the standard `performEdit` gateway so
 * every repair is one undoable entry with the reference's labels.
 */
import {
  deClickChannel,
  humNotchChannels,
  repairSpliceChannel,
  resolveHumFreq,
  type HumMode,
  type RepairSens,
} from '../fx/repair';
import { makeRangeWrite, sliceRegion, type EditOutcome } from '../engine/editOps';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { closeRepairPrompt, toastInfo } from './actions';
import { currentChannels, targetRange } from './editActions';
import { getDoc, performEdit } from './runtime';
import { repairPromptOpen } from './state';
import { Modal } from './components/Modal';

export type RepairKind = 'click' | 'hum' | 'edit';
export type { HumMode, RepairSens };

export interface RepairRequest {
  kind: RepairKind;
  sens: RepairSens;
  mains: HumMode;
}

/** Apply one Audio Repair pass to the selection (whole doc if none). */
export function applyAudioRepair(req: RepairRequest): void {
  const doc = getDoc();
  const range = targetRange();
  if (!doc || !range) return;
  if (range.len * doc.sampleRate < 256) {
    toastInfo(t().repairTooShort);
    return;
  }
  const channels = currentChannels();
  const before = sliceRegion(channels, range.start, range.len); // pristine copy
  const after = before.map((ch) => ch.slice()); // the kernels mutate this
  let label: string;
  let summary: string;
  if (req.kind === 'hum') {
    const freq = Math.round(resolveHumFreq(after[0]!, doc.sampleRate, 0, range.len, req.mains) * 10) / 10;
    humNotchChannels(after, doc.sampleRate, freq);
    label = `${t().opHumNotch} ${freq} Hz`;
    summary = `${t().repairNotched} ${freq.toFixed(1)} Hz ${t().repairHumNoun}`;
  } else {
    const process = req.kind === 'click' ? deClickChannel : repairSpliceChannel;
    const total = after.reduce((acc, ch) => acc + process(ch, doc.sampleRate, req.sens), 0);
    const noun = total === 1
      ? req.kind === 'click'
        ? t().repairClickOne
        : t().repairSpliceOne
      : req.kind === 'click'
        ? t().repairClickMany
        : t().repairSpliceMany;
    label = req.kind === 'click' ? t().opDeClick : t().opEditRepair;
    const verb = req.kind === 'click' ? t().repairRemoved : t().repairSmoothed;
    summary = total ? `${label}: ${verb} ${total} ${noun}` : `${label}: ${t().repairNothing}`;
  }
  const outcome: EditOutcome = makeRangeWrite(channels, range.start, before, after);
  performEdit(outcome, label);
  toastInfo(summary);
}


/** PF-03 Audio Repair dialog: mode radio (click/hum/edit) + per-mode
 * options, reference defaults on every open (click / medium / auto). */
export function AudioRepairDialog() {
  const open = repairPromptOpen.value;
  const [kind, setKind] = useState<RepairKind>('click');
  const [sens, setSens] = useState<RepairSens>('med');
  const [mains, setMains] = useState<HumMode>('auto');
  useEffect(() => {
    if (open) {
      setKind('click');
      setSens('med');
      setMains('auto');
    }
  }, [open]);
  if (!open) return null;
  const radio = (name: string, value: string, checked: boolean, label: string, set: (v: string) => void) => (
    <span class="export-card" key={`${name}-${value}`}>
      <input
        type="radio"
        id={`${name}-${value}`}
        name={name}
        value={value}
        checked={checked}
        onChange={() => set(value)}
      />
      <label for={`${name}-${value}`}>{label}</label>
    </span>
  );
  return (
    <Modal title={t().fxRepair} onClose={closeRepairPrompt}>
      <div class="url-form">
        <span class="url-hint">{t().repairMode}</span>
        <div class="export-cards" role="radiogroup" aria-label={t().repairMode}>
          {radio('repair-kind', 'click', kind === 'click', t().repairClick, (v) => setKind(v as RepairKind))}
          {radio('repair-kind', 'hum', kind === 'hum', t().repairHum, (v) => setKind(v as RepairKind))}
          {radio('repair-kind', 'edit', kind === 'edit', t().repairEdit, (v) => setKind(v as RepairKind))}
        </div>
        {kind !== 'hum' ? (
          <>
            <span class="url-hint">{t().repairSens}</span>
            <div class="export-cards" role="radiogroup" aria-label={t().repairSens}>
              {radio('repair-sens', 'low', sens === 'low', t().repairLow, (v) => setSens(v as RepairSens))}
              {radio('repair-sens', 'med', sens === 'med', t().repairMed, (v) => setSens(v as RepairSens))}
              {radio('repair-sens', 'high', sens === 'high', t().repairHigh, (v) => setSens(v as RepairSens))}
            </div>
          </>
        ) : (
          <>
            <span class="url-hint">{t().repairMains}</span>
            <div class="export-cards" role="radiogroup" aria-label={t().repairMains}>
              {radio('repair-mains', '50', mains === '50', t().repair50, (v) => setMains(v as HumMode))}
              {radio('repair-mains', '60', mains === '60', t().repair60, (v) => setMains(v as HumMode))}
              {radio('repair-mains', 'auto', mains === 'auto', t().repairAuto, (v) => setMains(v as HumMode))}
            </div>
          </>
        )}
        <div class="url-actions">
          <button class="btn-secondary" onClick={closeRepairPrompt}>
            Cancel
          </button>
          <button
            class="btn-primary"
            onClick={() => {
              const request = { kind, sens, mains }; // snapshot before closing
              closeRepairPrompt();
              applyAudioRepair(request);
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Command entry (lazy): project mode refuses (reference parity). */
export function repairFromCommand(projectOpen: boolean): void {
  if (projectOpen) {
    toastInfo(t().repairMulti);
    return;
  }
  repairPromptOpen.value = true;
}
