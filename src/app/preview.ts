/**
 * A/B preview controller (ADR 005 §3): dry and wet paths run in parallel
 * from the target region; the A/B toggle crossfades their gains over 30 ms
 * — click-free, no transport restart. Graph effects route live through the
 * same builder used for apply; kernel effects precompute the wet buffer.
 * Browser-only glue — kept thin, decisions live in fx/registry + fxActions.
 */
import { buildGraph } from '../fx/graphs';
import type { EffectDef, Params } from '../fx/types';
import { getSharedContext } from '../io/decode';
import { previewActive } from './state';

const AB_FADE_S = 0.03;

interface PreviewNodes {
  sources: AudioBufferSourceNode[];
  dry: GainNode;
  wet: GainNode;
}

let nodes: PreviewNodes | null = null;
let wetIsUp = false;

export interface PreviewPlan {
  buffer: AudioBuffer;
  startSec: number;
  durSec: number;
  def: EffectDef;
  params: Params;
  /** Kernel effects: the precomputed wet region buffer. */
  wetBuffer?: AudioBuffer;
}

export function startPreview(plan: PreviewPlan): void {
  stopPreview();
  wetIsUp = false;
  const ctx = getSharedContext();

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1; // preview always opens on A (dry)
  wet.gain.value = 0;
  dry.connect(ctx.destination);
  wet.connect(ctx.destination);

  const sources: AudioBufferSourceNode[] = [];
  const drySrc = ctx.createBufferSource();
  drySrc.buffer = plan.buffer;
  drySrc.connect(dry);
  drySrc.start(0, plan.startSec, plan.durSec);
  sources.push(drySrc);

  if (plan.def.kind === 'graph') {
    const src = ctx.createBufferSource();
    src.buffer = plan.buffer;
    const graph = buildGraph(ctx, plan.def.graphId, plan.params, {
      channels: plan.buffer.numberOfChannels,
    });
    src.connect(graph.input);
    graph.output.connect(wet);
    // wet tail rings out past the source end (delay repeats / reverb decay)
    src.start(0, plan.startSec, plan.durSec);
    sources.push(src);
  } else if (plan.wetBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = plan.wetBuffer;
    src.connect(wet);
    src.start(0);
    sources.push(src);
  }

  const cleanup = (): void => stopPreview();
  for (const source of sources) source.onended = cleanup;

  nodes = { sources, dry, wet };
  previewActive.value = true;
}

export function stopPreview(): void {
  const current = nodes;
  nodes = null;
  previewActive.value = false;
  if (!current) return;
  for (const source of current.sources) {
    try {
      source.onended = null;
      source.stop();
    } catch {
      // already stopped — nothing to do
    }
    source.disconnect();
  }
  current.dry.disconnect();
  current.wet.disconnect();
}

/** Flip A (dry) / B (wet); returns true when wet is now up. */
export function togglePreviewAB(): boolean {
  wetIsUp = !wetIsUp;
  if (nodes) {
    const now = getSharedContext().currentTime;
    nodes.dry.gain.cancelScheduledValues(now);
    nodes.wet.gain.cancelScheduledValues(now);
    nodes.dry.gain.setValueAtTime(nodes.dry.gain.value, now);
    nodes.wet.gain.setValueAtTime(nodes.wet.gain.value, now);
    nodes.dry.gain.linearRampToValueAtTime(wetIsUp ? 0 : 1, now + AB_FADE_S);
    nodes.wet.gain.linearRampToValueAtTime(wetIsUp ? 1 : 0, now + AB_FADE_S);
  }
  return wetIsUp;
}
