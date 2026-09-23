/**
 * Effect apply + preview preparation (M3). Apply replaces the target
 * region through makeOverwritePaste, so every effect is undoable and
 * stage-then-swap safe (ADR 002/005). Kernel effects run their pure
 * process on the region; graph effects render offline first.
 */
import { makeOverwritePaste, sliceRegion } from '../engine/editOps';
import type { EffectDef, KernelEffectDef, Params } from '../fx/types';
import { getEffect, validateParams } from '../fx/registry';
import { renderEffectOffline } from '../fx/offlineRender';
import { logger } from '../core/logger-instance';
import { t } from '../i18n';
import { toastInfo } from './actions';
import { currentChannels, targetRange } from './editActions';
import { bufferFactory, getDoc, performEdit } from './runtime';
import type { PreviewPlan } from './preview';

/** Menu/dialog label for a def, without the trailing ellipsis. */
export function effectLabel(def: EffectDef): string {
  const catalog = t() as unknown as Record<string, string>;
  return (catalog[def.labelKey] ?? def.id).replace(/…$/, '');
}

/**
 * Build everything startPreview needs for the current doc + selection.
 * Kernel wet buffers are computed here (pure process on the region —
 * fast enough on the main thread for typical regions).
 */
export function preparePreview(id: string, params: Params): PreviewPlan | null {
  const doc = getDoc();
  const def = getEffect(id);
  const range = targetRange();
  if (!doc || !def || !range) {
    toastInfo(t().fxNoDoc);
    return null;
  }
  // clamp before any DSP touches them (preview runs the raw graph)
  const safeParams = validateParams(def, params);

  const startSec = range.start / doc.sampleRate;
  const durSec = range.len / doc.sampleRate;
  const base: PreviewPlan = {
    buffer: doc.buffer as AudioBuffer,
    startSec,
    durSec,
    def,
    params: safeParams,
  };

  if (def.kind === 'kernel') {
    const region = sliceRegion(currentChannels(), range.start, range.len);
    const wet = def.process(region, doc.sampleRate, safeParams);
    base.wetBuffer = bufferFactory(wet, doc.sampleRate) as unknown as AudioBuffer;
  }
  return base;
}

/** Apply an effect to the selection (or whole document). Undoable. */
export async function applyEffect(id: string, rawParams: Params): Promise<void> {
  const doc = getDoc();
  const def = getEffect(id);
  if (!doc || !def) {
    toastInfo(t().fxNoDoc);
    return;
  }
  const params = validateParams(def, rawParams);
  const range = targetRange();
  if (!range) return;

  try {
    let wet: Float32Array[];
    if (def.kind === 'kernel') {
      wet = kernelProcess(def, currentChannels(), range.start, range.len, doc.sampleRate, params);
    } else {
      const before = doc;
      wet = await renderEffectOffline(
        doc.buffer as AudioBuffer,
        doc.channels,
        range.start,
        range.len,
        def,
        params,
      );
      if (getDoc() !== before) {
        toastInfo(t().editFailed); // document changed while rendering
        return;
      }
    }
    const outcome = makeOverwritePaste(currentChannels(), range.start, range.len, wet);
    if (performEdit(outcome, effectLabel(def))) {
      toastInfo(`${t().fxApplied}: ${effectLabel(def)}`);
    }
  } catch (error: unknown) {
    logger.error('fx apply failed', { id, detail: String(error) });
    toastInfo(t().editFailed);
  }
}

function kernelProcess(
  def: KernelEffectDef,
  channels: Float32Array[],
  start: number,
  len: number,
  sampleRate: number,
  params: Params,
): Float32Array[] {
  return def.process(sliceRegion(channels, start, len), sampleRate, params);
}
