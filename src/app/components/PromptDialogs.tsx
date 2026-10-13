import { closeGainPrompt, closeNormalizePrompt } from '../actions';
import { applyGainDb, applyNormalize } from '../editActions';
import { gainPromptOpen, markerPrompt, normalizePromptOpen } from '../state';
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
