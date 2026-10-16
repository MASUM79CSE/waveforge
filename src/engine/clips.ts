/**
 * Clip/arrangement core (M9a
). Pure, deterministic:
 * tracks hold sorted, non-overlapping clips that reference shared immutable
 * assets (copy-on-write at the app layer). Sample-domain positions match
 * the rest of the engine. Renders accumulate in fixed clip order with
 * Float64 and one final f32 round — the same discipline as the M8 mix
 * kernel, bit-anchored against a slow reference.
 */

export interface AudioAsset {
  id: string;
  sampleRate: number;
  channels: Float32Array[];
}

export interface AudioClip {
  id: string;
  assetId: string;
  /** Track-timeline position (samples). */
  start: number;
  /** Where in the asset this clip begins (samples). */
  offset: number;
  /** Clip length (samples). */
  duration: number;
  /** PF-02: quadratic fade-in length (samples; 0 = none). */
  fadeIn?: number;
  /** PF-02: quadratic fade-out length (samples; 0 = none). */
  fadeOut?: number;
  /**
   * PF-02: id of the EARLIER clip this clip crossfades with (equal-power
   * cos/sin across the two clips' overlap). Stored on the later clip so
   * clip-array undo (executeClipEdit) captures it; a dangling id (partner
   * deleted) renders as if absent.
   */
  xfadeWith?: string;
}

export interface ClipTrack {
  clips: AudioClip[]; // sorted by start, non-overlapping
}

export function clipEnd(clip: AudioClip): number {
  return clip.start + clip.duration;
}

function overlaps(a: AudioClip, b: AudioClip): boolean {
  return a.start < clipEnd(b) && b.start < clipEnd(a);
}

/** Insert sorted; throws on overlap with any existing clip or negative start. */
export function insertClip(track: ClipTrack, clip: AudioClip): ClipTrack {
  if (clip.start < 0) throw new Error('insertClip: negative start');
  if (clip.duration <= 0) throw new Error('insertClip: non-positive duration');
  const clips = track.clips;
  let index = clips.length;
  for (let i = 0; i < clips.length; ++i) {
    if (clips[i]!.start > clip.start) {
      index = i;
      break;
    }
  }
  const prev = clips[index - 1];
  const next = clips[index];
  if ((prev && overlaps(prev, clip)) || (next && overlaps(next, clip))) {
    throw new Error(`insertClip: clip at ${clip.start} overlaps an existing clip`);
  }
  const out = clips.slice();
  out.splice(index, 0, clip);
  return { clips: out };
}

/** The clip covering `sample` (start inclusive, end exclusive), if any. */
export function findClipAt(track: ClipTrack, sample: number): AudioClip | undefined {
  return track.clips.find((c) => sample >= c.start && sample < clipEnd(c));
}

/** Remove by id; identity (no change) when the id is unknown. */
export function removeClip(track: ClipTrack, clipId: string): ClipTrack {
  const clips = track.clips.filter((c) => c.id !== clipId);
  if (clips.length === track.clips.length) return track;
  return { clips };
}

export interface SplitResult {
  track: ClipTrack;
  left: AudioClip;
  right: AudioClip;
}

/** Split the clip at `at` (strictly inside). Offset accumulates on the right half. */
export function splitClip(track: ClipTrack, clipId: string, at: number): SplitResult {
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`splitClip: unknown clip ${clipId}`);
  if (at <= clip.start || at >= clipEnd(clip)) {
    throw new Error(`splitClip: ${at} is not inside [${clip.start}, ${clipEnd(clip)})`);
  }
  const left: AudioClip = { ...clip, duration: at - clip.start };
  const right: AudioClip = {
    id: `${clipId}r${at}`,
    assetId: clip.assetId,
    start: at,
    offset: clip.offset + (at - clip.start),
    duration: clipEnd(clip) - at,
  };
  const clips = track.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c]));
  return { track: { clips }, left, right };
}

export interface MoveResult {
  track: ClipTrack;
  clip: AudioClip;
}

/**
 * Move by `delta` samples, clamped into the free gap between the
 * neighbours (and at 0) — overlapping is impossible by construction.
 */
export function moveClip(track: ClipTrack, clipId: string, delta: number): MoveResult {
  const index = track.clips.findIndex((c) => c.id === clipId);
  if (index < 0) throw new Error(`moveClip: unknown clip ${clipId}`);
  const clip = track.clips[index]!;
  const prev = track.clips[index - 1];
  const next = track.clips[index + 1];
  const min = prev ? clipEnd(prev) : 0;
  const max = next ? next.start - clip.duration : Number.POSITIVE_INFINITY;
  let start = clip.start + delta;
  if (start < min) start = min;
  if (start > max) start = max;
  const moved: AudioClip = { ...clip, start };
  const clips = track.clips.map((c) => (c.id === clipId ? moved : c));
  return { track: { clips }, clip: moved };
}

export interface TrimResult {
  track: ClipTrack;
  clip: AudioClip;
}

/**
 * Trim an edge to `at`. Start-trim shifts the asset offset; both edges
 * clamp against neighbours, the clip's own extent, and the asset length.
 */
export function trimClip(
  track: ClipTrack,
  clipId: string,
  edge: 'start' | 'end',
  at: number,
  assetLength: number,
): TrimResult {
  const index = track.clips.findIndex((c) => c.id === clipId);
  if (index < 0) throw new Error(`trimClip: unknown clip ${clipId}`);
  const clip = track.clips[index]!;
  const prev = track.clips[index - 1];
  const next = track.clips[index + 1];
  let trimmed: AudioClip;
  if (edge === 'start') {
    const min = Math.max(prev ? clipEnd(prev) : 0, 0);
    const max = clipEnd(clip) - 1;
    const start = Math.min(Math.max(at, min), max);
    const delta = start - clip.start;
    trimmed = {
      ...clip,
      start,
      offset: clip.offset + delta,
      duration: clip.duration - delta,
    };
  } else {
    const min = clip.start + 1;
    const max = Math.min(next ? next.start : Number.POSITIVE_INFINITY, clip.offset + assetLength);
    const end = Math.min(Math.max(at, min), max);
    trimmed = { ...clip, duration: end - clip.start };
  }
  const clips = track.clips.map((c) => (c.id === clipId ? trimmed : c));
  return { track: { clips }, clip: trimmed };
}

export interface DuplicateResult {
  track: ClipTrack;
  clip: AudioClip;
}

/** Duplicate right after the original (same asset/offset); throws if no gap. */
export function duplicateClip(track: ClipTrack, clipId: string, newId: string): DuplicateResult {
  const index = track.clips.findIndex((c) => c.id === clipId);
  if (index < 0) throw new Error(`duplicateClip: unknown clip ${clipId}`);
  const clip = track.clips[index]!;
  const next = track.clips[index + 1];
  const start = clipEnd(clip);
  if (next && start + clip.duration > next.start) {
    throw new Error('duplicateClip: no room after the original');
  }
  const dup: AudioClip = { id: newId, assetId: clip.assetId, start, offset: clip.offset, duration: clip.duration };
  const clips = track.clips.slice();
  clips.splice(index + 1, 0, dup);
  return { track: { clips }, clip: dup };
}

/** Arrangement length in samples (0 for an empty track). */
export function timelineDuration(track: ClipTrack): number {
  let max = 0;
  for (const c of track.clips) {
    const e = clipEnd(c);
    if (e > max) max = e;
  }
  return max;
}

export function assetOf(assets: Map<string, AudioAsset>, id: string): AudioAsset {
  const asset = assets.get(id);
  if (!asset) throw new Error(`render: unknown asset ${id}`);
  return asset;
}

export function emptyStereo(length: number): Float32Array[] {
  return [new Float32Array(length), new Float32Array(length)];
}

/**
 * Render the arrangement to stereo (mono assets feed both channels).
 * Fixed clip order, Float64 accumulation, single f32 round.
 */
export const XFADE_MIN_OVERLAP_S = 0.005; // reference: overlaps <= 5 ms are not crossfades
export const FADE_MIN_S = 0.005; // reference: sub-5 ms fades snap to 0

/**
 * PF-02: per-sample gain for one clip of a track — equal-power cos/sin
 * inside an ACTIVE crossfade overlap (earlier = cos, later = sin; an
 * active xfade replaces fi/fo there, reference clipGainAt), quadratic
 * p² fades elsewhere. Pure so the fast render and the slow reference
 * share one implementation (bit anchor).
 */
export function clipGainAt(
  clip: AudioClip,
  allClips: readonly AudioClip[],
  sampleRate: number,
  localIndex: number,
): number {
  const t = clip.start + localIndex;
  // the pair marker lives on the LATER clip, but the gain gates BOTH sides
  let partner = clip.xfadeWith ? allClips.find((c) => c.id === clip.xfadeWith) : undefined;
  if (!partner) partner = allClips.find((c) => c.xfadeWith === clip.id);
  if (partner) {
    const ovStart = Math.max(clip.start, partner.start);
    const ovEnd = Math.min(clip.start + clip.duration, partner.start + partner.duration);
    if (ovEnd - ovStart > XFADE_MIN_OVERLAP_S * sampleRate && t >= ovStart && t < ovEnd) {
      const p = (t - ovStart) / (ovEnd - ovStart);
      const isEarlier =
        clip.start < partner.start || (clip.start === partner.start && clip.id < partner.id);
      return isEarlier ? Math.cos(p * Math.PI * 0.5) : Math.sin(p * Math.PI * 0.5);
    }
  }
  const len = clip.duration;
  const fi = Math.min(clip.fadeIn ?? 0, len);
  const fo = Math.min(clip.fadeOut ?? 0, len - fi);
  let gain = 1;
  if (fi > 0 && localIndex < fi) {
    gain *= (localIndex / fi) ** 2;
  }
  if (fo > 0 && localIndex > len - fo) {
    gain *= ((len - localIndex) / fo) ** 2;
  }
  return gain;
}

/** Render kernels live in `clipRender.ts`; re-exported here so the
 * arrangement API stays in one module namespace (WF import stability). */
export { renderClipTrack, renderClipTrackReference, renderRegion } from './clipRender';
