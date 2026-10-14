/**
 * Clip-track render kernels (extracted from `clips.ts` — PF-02 file-size
 * gate). Pure functions over the arrangement; gains come from `clipGainAt`.
 */
import {
  assetOf,
  clipEnd,
  clipGainAt,
  emptyStereo,
  timelineDuration,
  type AudioAsset,
  type ClipTrack,
} from './clips';

export function renderClipTrack(track: ClipTrack, assets: Map<string, AudioAsset>): Float32Array[] {
  const length = timelineDuration(track);
  if (length === 0) return emptyStereo(0);
  const accL = new Float64Array(length);
  const accR = new Float64Array(length);
  for (const clip of track.clips) {
    const asset = assetOf(assets, clip.assetId);
    const main = asset.channels[0]!;
    const second = asset.channels[1] ?? main;
    const avail = Math.min(clip.duration, main.length - clip.offset);
    const sr = asset.sampleRate;
    for (let i = 0; i < avail; ++i) {
      const g = clipGainAt(clip, track.clips, sr, i);
      const v = main[clip.offset + i]!;
      accL[clip.start + i] = accL[clip.start + i]! + v * g;
      accR[clip.start + i] = accR[clip.start + i]! + second[clip.offset + i]! * g;
    }
  }
  const outL = new Float32Array(length);
  const outR = new Float32Array(length);
  for (let i = 0; i < length; ++i) {
    outL[i] = accL[i]!;
    outR[i] = accR[i]!;
  }
  return [outL, outR];
}

/** Slow bit-exact reference for `renderClipTrack` — test anchor only. */
export function renderClipTrackReference(
  track: ClipTrack,
  assets: Map<string, AudioAsset>,
): Float32Array[] {
  const length = timelineDuration(track);
  const outL = new Float64Array(length);
  const outR = new Float64Array(length);
  for (const clip of track.clips) {
    const asset = assetOf(assets, clip.assetId);
    const main = asset.channels[0]!;
    const second = asset.channels[1] ?? main;
    const avail = Math.min(clip.duration, main.length - clip.offset);
    const sr = asset.sampleRate;
    for (let i = 0; i < avail; ++i) {
      const g = clipGainAt(clip, track.clips, sr, i) * 1;
      outL[clip.start + i] = outL[clip.start + i]! + main[clip.offset + i]! * g;
      outR[clip.start + i] = outR[clip.start + i]! + second[clip.offset + i]! * g;
    }
  }
  const resL = new Float32Array(length);
  const resR = new Float32Array(length);
  for (let i = 0; i < length; ++i) {
    resL[i] = outL[i]!;
    resR[i] = outR[i]!;
  }
  return [resL, resR];
}

/**
 * Render only the timeline region [from, from+len) — the effects bounce
 * path (M9b). Mono assets feed both channels of the region.
 */
export function renderRegion(
  track: ClipTrack,
  assets: Map<string, AudioAsset>,
  from: number,
  len: number,
): Float32Array[] {
  const outL = new Float32Array(len);
  const outR = new Float32Array(len);
  if (len <= 0) return [outL, outR];
  for (const clip of track.clips) {
    const end = clipEnd(clip);
    if (clipEnd(clip) <= from || clip.start >= from + len) continue;
    const asset = assetOf(assets, clip.assetId);
    const main = asset.channels[0]!;
    const second = asset.channels[1] ?? main;
    const i0 = Math.max(clip.start, from);
    const i1 = Math.min(end, from + len);
    const sr = asset.sampleRate;
    for (let t = i0; t < i1; ++t) {
      const src = clip.offset + (t - clip.start);
      if (src < 0 || src >= main.length) continue;
      const dst = t - from;
      const g = clipGainAt(clip, track.clips, sr, t - clip.start);
      outL[dst] = main[src]! * g;
      outR[dst] = second[src]! * g;
    }
  }
  return [outL, outR];
}
