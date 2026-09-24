/**
 * Effect apply + preview preparation (M3). Apply replaces the target
 * region through makeOverwritePaste, so every effect is undoable and
 * stage-then-swap safe (ADR 002/005). Kernel effects run their pure
 * process on the region; graph effects render offline first.
 */
// fx composition root: defs.ts self-registers the built-in effects on its
// first import — without this side-effect import the registry stays empty
// in the browser and every effect dialog silently renders null (caught by
// the E1 e2e: unit tests import defs directly and never saw it)
import '../fx/defs';
import { makeOverwritePaste, sliceRegion } from '../engine/editOps';
import type { EffectDef, EffectRunContext, KernelEffectDef, Params } from '../fx/types';
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
export function preparePreview(
  id: string,
  params: Params,
  ctx?: EffectRunContext,
): PreviewPlan | null {
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
    const wet = kernelProcess(
      def,
      currentChannels(),
      range.start,
      range.len,
      doc.sampleRate,
      safeParams,
      ctx,
    );
    base.wetBuffer = bufferFactory(wet, doc.sampleRate) as unknown as AudioBuffer;
  }
  return base;
}

/** Apply an effect to the selection (or whole document). Undoable. */
export async function applyEffect(
  id: string,
  rawParams: Params,
  ctx?: EffectRunContext,
): Promise<void> {
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
      wet = kernelProcess(
        def,
        currentChannels(),
        range.start,
        range.len,
        doc.sampleRate,
        params,
        ctx,
      );
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
  ctx?: EffectRunContext,
): Float32Array[] {
  // tail mechanism (effects v2 §0): process len + tail·sr frames — the
  // post-region context absorbs the wet tail where audio follows; zeros
  // are appended past doc end, and the overwrite paste grows the doc by
  // the padding, exactly like graph tailSeconds region growth.
  const tailLen = Math.max(0, Math.round((def.tail?.(params, ctx) ?? 0) * sampleRate));
  const total = len + tailLen;
  const region = sliceRegion(channels, start, total);
  const have = region[0]?.length ?? 0;
  const pad = total - have;
  const input =
    pad > 0
      ? region.map((ch) => {
          const out = new Float32Array(total);
          out.set(ch, 0);
          return out;
        })
      : region;
  return def.process(input, sampleRate, params, ctx);
}
