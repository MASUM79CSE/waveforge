/**
 * PF-02 fade / crossfade ARRANGEMENT kernels. Lazy-loaded from the command
 * path (clipFadeOps) — NOT part of the startup bundle; the realtime path
 * only needs `clipGainAt`, which stays in `clips.ts`.
 */
import {
  clipEnd,
  FADE_MIN_S,
  XFADE_MIN_OVERLAP_S,
  type AudioClip,
  type AudioAsset,
  type ClipTrack,
} from './clips';

/**
 * PF-02: set a clip's quadratic fade-in/out lengths (samples). Clamped so
 * fi+fo <= duration; values under 5 ms snap to 0 (reference setClipFade).
 */
export function setClipFades(
  track: ClipTrack,
  clipId: string,
  fadeIn: number,
  fadeOut: number,
  sampleRate = 44100,
): ClipTrack {
  const index = track.clips.findIndex((c) => c.id === clipId);
  if (index < 0) throw new Error(`setClipFades: unknown clip ${clipId}`);
  const src = track.clips[index]!;
  const len = src.duration;
  const min = Math.max(0, Math.trunc(fadeIn));
  const fout = Math.max(0, Math.trunc(fadeOut));
  let fi = Math.min(min, len);
  let fo = Math.min(fout, len - fi);
  if (fi < FADE_MIN_S * sampleRate) fi = 0;
  if (fo < FADE_MIN_S * sampleRate) fo = 0;
  const next = track.clips.slice();
  next[index] = { ...src, fadeIn: fi, fadeOut: fo };
  return { clips: next };
}

/**
 * PF-02: crossfade the clip with its adjacent EARLIER neighbour by
 * extending the neighbour over the boundary (real simultaneous audio —
 * a butt splice cannot crossfade). The later clip carries the pair id.
 * Reference parity: overlaps under 5 ms are refused ("no overlap").
 */
export function crossfadeClips(
  track: ClipTrack,
  laterClipId: string,
  len: number,
  assets: ReadonlyMap<string, AudioAsset>,
): ClipTrack {
  const index = track.clips.findIndex((c) => c.id === laterClipId);
  if (index <= 0) throw new Error(`crossfadeClips: no earlier neighbour for ${laterClipId}`);
  const later = track.clips[index]!;
  const earlier = track.clips[index - 1]!;
  const sampleRate = assets.get(earlier.assetId)?.sampleRate ?? 44100;
  const gap = later.start - clipEnd(earlier);
  if (gap < 0 || gap > XFADE_MIN_OVERLAP_S * sampleRate) {
    throw new Error('crossfadeClips: clips are not adjacent (gap beyond 5 ms)');
  }
  const want = Math.trunc(len);
  if (want <= XFADE_MIN_OVERLAP_S * sampleRate) {
    throw new Error('crossfadeClips: requested overlap is under the 5 ms activation floor');
  }
  const need = gap + want;
  const out = track.clips.slice();
  const assetLen = assets.get(earlier.assetId)?.channels[0]?.length ?? 0;
  if (earlier.offset + earlier.duration + need <= assetLen) {
    // extend the earlier clip over the boundary (asset audio exists there)
    out[index - 1] = { ...earlier, duration: earlier.duration + need };
    out[index] = { ...later, xfadeWith: earlier.id };
    return { clips: out };
  }
  // fallback: slip the later clip earlier over the boundary (its own asset
  // headroom must exist — e.g. the right half of a split clip)
  if (later.offset >= need) {
    out[index] = {
      ...later,
      start: later.start - need,
      offset: later.offset - need,
      xfadeWith: earlier.id,
    };
    return { clips: out };
  }
  throw new Error('crossfadeClips: no headroom on either clip for the overlap');
}

/** PF-02: drop the crossfade marker; the overlap geometry is kept (reference parity). */
export function uncrossfadeClips(track: ClipTrack, laterClipId: string): ClipTrack {
  const index = track.clips.findIndex((c) => c.id === laterClipId);
  if (index < 0) throw new Error(`uncrossfadeClips: unknown clip ${laterClipId}`);
  const out = track.clips.slice();
  const rest: AudioClip = { ...out[index]! };
  delete rest.xfadeWith;
  out[index] = rest;
  return { clips: out };
}
