/**
 * Clip/arrangement core (M9a — docs/clips-plan.md). Pure, deterministic:
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

function assetOf(assets: Map<string, AudioAsset>, id: string): AudioAsset {
  const asset = assets.get(id);
  if (!asset) throw new Error(`render: unknown asset ${id}`);
  return asset;
}

function emptyStereo(length: number): Float32Array[] {
  return [new Float32Array(length), new Float32Array(length)];
}

/**
 * Render the arrangement to stereo (mono assets feed both channels).
 * Fixed clip order, Float64 accumulation, single f32 round.
 */
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
    for (let i = 0; i < avail; ++i) {
      const v = main[clip.offset + i]!;
      accL[clip.start + i] = accL[clip.start + i]! + v;
      accR[clip.start + i] = accR[clip.start + i]! + second[clip.offset + i]!;
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
    for (let i = 0; i < avail; ++i) {
      outL[clip.start + i] = outL[clip.start + i]! + main[clip.offset + i]! * 1;
      outR[clip.start + i] = outR[clip.start + i]! + second[clip.offset + i]! * 1;
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
    for (let t = i0; t < i1; ++t) {
      const src = clip.offset + (t - clip.start);
      if (src < 0 || src >= main.length) continue;
      const dst = t - from;
      outL[dst] = main[src]!;
      outR[dst] = second[src]!;
    }
  }
  return [outL, outR];
}
