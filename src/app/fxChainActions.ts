/**
 * C2 — FX chain apply + preview: the chain fold on
 * top of the SAME apply plumbing as single effects — ONE history entry for
 * the whole chain (bounce precedent, standing refcount rule), region +
 * summed stage tails in, folded wet out. Kernel stages run their pure
 * process; graph stages render offline per stage. v1: no per-entry
 * automation curves (A7 envelopes stay single-effect; documented seam).
 */
import '../fx/defs'; // composition root — without it the registry stays empty
import { foldChainAsync } from '../fx/chain';
import type { Chain, ChainEntry } from '../fx/chain';
import { getEffect } from '../fx/registry';
import { renderEffectOffline } from '../fx/offlineRender';
import { ensureRnVoice } from '../fx/nrVoice';
import { makeOverwritePaste } from '../engine/editOps';
import { logger } from '../core/logger-instance';
import { t } from '../i18n';
import { toastInfo } from './actions';
import { regionWithTail } from './fxActions';
import { currentChannels, targetRange } from './editActions';
import { activeTrackTarget, commitTrackChannels, ensureProject } from './projectActions';
import { bufferFactory, getDoc, performEdit } from './runtime';
import type { PreviewPlan } from './preview';
import type { Params } from '../fx/types';
import type { AutomationCurve } from '../engine/automation';

/** C5: per-entry param curves — entry index → param key → curve. */
export type ChainCurves = Record<number, Record<string, AutomationCurve>>;

/** Rack label without the trailing ellipsis (history + toast). */
export function rackLabel(): string {
  return t().fxRack.replace(/…$/, '');
}

/** Summed tail seconds over the stages that will run (bypass skipped). */
export function chainTailSeconds(chain: Chain): number {
  let sum = 0;
  for (const entry of chain) {
    if (entry.bypass) continue;
    const def = getEffect(entry.effectId);
    if (!def) continue;
    if (def.kind === 'kernel') sum += def.tail?.(entry.params, undefined) ?? 0;
    else sum += def.tailSeconds?.(entry.params) ?? 0;
  }
  return sum;
}

/** One stage: kernel process or offline graph render over the given array. */
async function runStage(
  effectId: string,
  channels: Float32Array[],
  sampleRate: number,
  params: Params,
  entryIndex: number,
  curves?: ChainCurves,
): Promise<Float32Array[]> {
  const def = getEffect(effectId)!; // chain entries are registry-validated
  const entryCurves = curves?.[entryIndex];
  if (def.kind === 'kernel') {
    return def.process(channels, sampleRate, params, entryCurves ? { paramCurves: entryCurves } : undefined);
  }
  const buffer = bufferFactory(channels, sampleRate) as unknown as AudioBuffer;
  return renderEffectOffline(buffer, channels.length, 0, channels.length, def, params, entryCurves ?? {});
}

/**
 * Fold the chain over region [start, start+len) + the SUMMED stage tails
 * (v1: mid-chain tails flow through the fold; the doc grows once, by the
 * total). Chains containing fx.rnvoice lazily load the model first.
 */
export async function renderChain(
  channels: Float32Array[],
  sampleRate: number,
  start: number,
  len: number,
  chain: Chain,
  curves?: ChainCurves,
): Promise<Float32Array[]> {
  if (chain.some((e) => !e.bypass && e.effectId === 'fx.rnvoice')) {
    await ensureRnVoice();
  }
  const total = len + Math.round(chainTailSeconds(chain) * sampleRate);
  const input = regionWithTail(channels, start, total);
  return foldChainAsync(input, sampleRate, chain, (id, chans, sr, params, index) =>
    runStage(id, chans, sr, params, index, curves),
  );
}

/** Apply the whole chain to the target region as ONE undoable edit. */
export async function applyChain(chain: Chain, curves?: ChainCurves): Promise<void> {
  const doc = getDoc();
  if (!doc || chain.length === 0) {
    toastInfo(t().fxNoDoc);
    return;
  }
  const range = targetRange();
  if (!range) return;
  const label = rackLabel();
  const target = activeTrackTarget();
  const channels = target?.channels ?? currentChannels();
  try {
    const wet = await renderChain(channels, doc.sampleRate, range.start, range.len, chain, curves);
    if (!target && getDoc() !== doc) {
      toastInfo(t().editFailed); // document changed while rendering
      return;
    }
    const source = target ? target.channels : currentChannels();
    const outcome = makeOverwritePaste(source, range.start, range.len, wet);
    if (target) {
      if (commitTrackChannels(target.trackId, outcome.channels, label)) {
        toastInfo(`${t().fxApplied}: ${label}`);
      } else {
        toastInfo(t().editFailed);
      }
    } else if (performEdit(outcome, label)) {
      toastInfo(`${t().fxApplied}: ${label}`);
    }
  } catch (error: unknown) {
    logger.error('fx chain apply failed', { detail: String(error) });
    toastInfo(t().editFailed);
  }
}

/** Whole-chain A/B preview plan: offline fold → wet buffer (def-less). */
export async function prepareChainPreview(chain: Chain, curves?: ChainCurves): Promise<PreviewPlan | null> {
  const doc = getDoc();
  const range = targetRange();
  if (!doc || !range || chain.length === 0) {
    toastInfo(t().fxNoDoc);
    return null;
  }
  const target = activeTrackTarget();
  const dryChannels = target?.channels ?? currentChannels();
  ensureProject(); // guards the preview-vs-project race
  const before = doc;
  let wet: Float32Array[];
  try {
    wet = await renderChain(dryChannels, doc.sampleRate, range.start, range.len, chain, curves);
  } catch (error: unknown) {
    logger.error('fx chain preview failed', { detail: String(error) });
    toastInfo(t().editFailed);
    return null;
  }
  if (getDoc() !== before) return null; // document changed mid-render
  return {
    buffer: target
      ? (bufferFactory(dryChannels, doc.sampleRate) as unknown as AudioBuffer)
      : (doc.buffer as AudioBuffer),
    startSec: range.start / doc.sampleRate,
    durSec: range.len / doc.sampleRate,
    wetBuffer: bufferFactory(wet, doc.sampleRate) as unknown as AudioBuffer,
  };
}

export type { ChainEntry };
