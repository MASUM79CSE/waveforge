/**
 * Offline rendering for graph-kind effects (ADR 005): rebuild the same
 * graph used for preview inside an OfflineAudioContext — faster than
 * realtime, click-free, and it keeps the wet tail (region grows).
 * Browser-only (OfflineAudioContext) — excluded from unit coverage.
 */
import { buildGraph } from './graphs';
import { scheduleFxAuto, type FxCurves } from './fxCurves';
import type { EffectDef, Params } from './types';

export async function renderEffectOffline(
  buffer: AudioBuffer,
  channels: number,
  start: number,
  len: number,
  def: Extract<EffectDef, { kind: 'graph' }>,
  params: Params,
  curves: FxCurves = {},
): Promise<Float32Array[]> {
  const sampleRate = buffer.sampleRate;
  const tailFrames = Math.ceil(((def.tailSeconds?.(params) ?? 0) * sampleRate) / 1);
  const frames = Math.max(2, len + tailFrames);
  const offline = new OfflineAudioContext(channels, frames, sampleRate);

  const source = offline.createBufferSource();
  source.buffer = buffer;
  const graph = buildGraph(offline, def.graphId, params, { channels });
  // A6a: region-relative param curves → ramps on the exposed AudioParams.
  // No curves → zero calls → the render is exactly today's.
  scheduleFxAuto(graph.auto ?? {}, curves, sampleRate, frames);
  source.connect(graph.input);
  graph.output.connect(offline.destination);
  source.start(0, start / sampleRate, len / sampleRate);

  const rendered = await offline.startRendering();
  const out: Float32Array[] = [];
  for (let ch = 0; ch < channels; ++ch) {
    out.push(rendered.getChannelData(ch).slice(0, frames));
  }
  return out;
}
