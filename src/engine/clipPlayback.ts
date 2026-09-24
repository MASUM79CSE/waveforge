/**
 * Clip playback scheduling math (M9c — docs/clips-plan.md).
 * Pure: expands one playback pass over a clip timeline into per-clip
 * start(when, offset, dur) args. ProjectPlayback consumes the result;
 * ProjectPlayback (class) owns the graph, this file owns the math.
 */
import type { AudioAsset, AudioClip } from './clips';
import { trackEffectiveGain } from './project';

/** Clip-world track view (clips reference shared immutable assets). */
export interface ClipPlaybackTrack {
  clips: readonly AudioClip[];
  assets: ReadonlyMap<string, AudioAsset>;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** A3: per-param automation curves ('volume', 'pan'); empty/missing =
   * static mixer value owns the legs. */
  automation?: Record<string, import('./automation').AutomationCurve>;
}

/** One scheduled source: clip span buffer, started at `ctx.currentTime + when`. */
export interface ScheduledClip {
  trackIndex: number;
  asset: AudioAsset;
  /** Seconds from the pass start (≥ 0) — add ctx.currentTime when starting. */
  when: number;
  /** Seconds into the copied span where audible audio begins. */
  offset: number;
  /** Seconds to play. */
  dur: number;
  /** First asset sample copied into the source buffer (samples). */
  spanStart: number;
  /** Span length copied into the source buffer (samples). */
  spanLen: number;
}

/**
 * Pure per-clip schedule math (M9c): expand one playback pass into per-clip
 * start(when, offset, dur) args. Window math runs in the integer sample
 * domain, so every arg is sample-exact. Inaudible tracks (mute / solo
 * shadow) contribute nothing — one source per AUDIBLE clip.
 */
export function expandClipPass(
  tracks: readonly ClipPlaybackTrack[],
  sampleRate: number,
  passStart: number,
  winStart: number,
  winEnd: number,
): ScheduledClip[] {
  const anySolo = tracks.some((t) => t.solo);
  const winS = Math.round(winStart * sampleRate);
  const winE = Math.round(winEnd * sampleRate);
  const passS = Math.round(passStart * sampleRate);
  const list: ScheduledClip[] = [];
  for (let ti = 0; ti < tracks.length; ++ti) {
    const t = tracks[ti]!;
    if (trackEffectiveGain(t, anySolo) === 0) continue;
    for (const clip of t.clips) {
      const asset = t.assets.get(clip.assetId);
      if (!asset) throw new Error(`expandClipPass: unknown asset ${clip.assetId}`);
      const cS = clip.start;
      const cE = clip.start + clip.duration;
      // audible span starts at the clip, the window, and the pass — whichever
      // is latest (a pass entering mid-window cannot replay earlier material)
      const vS = Math.max(cS, winS, passS);
      const vE = Math.min(cE, winE);
      if (vE - vS <= 0) continue;
      list.push({
        trackIndex: ti,
        asset,
        when: Math.max(0, vS - passS) / sampleRate,
        offset: (clip.offset + (vS - cS)) / sampleRate,
        dur: (vE - vS) / sampleRate,
        spanStart: clip.offset,
        spanLen: clip.duration,
      });
    }
  }
  return list;
}
