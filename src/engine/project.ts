/**
 * Multitrack project core (M8a — Build Plan docs/multitrack-plan.md).
 * Pure, deterministic kernels: lane-based tracks on one shared timeline,
 * mixed by fixed-order Float64 accumulation (Audacity-class model — see
 * docs/multitrack-analysis.md §3). No engine/UI imports by design.
 */

/** Per-track mixer state + audio. Mono tracks hold exactly one channel. */
export interface TrackState {
  id: string;
  name: string;
  /** Linear gain 0..1.5 (matches the D8 volume strip). */
  gain: number;
  /** Balance law: −1..1. Center = unity passthrough; hard pan zeroes the far side. */
  pan: number;
  mute: boolean;
  solo: boolean;
  channels: Float32Array[];
}

export interface ProjectState {
  sampleRate: number;
  /** Lane order, top → bottom. */
  tracks: TrackState[];
  activeTrackId: string | null;
}

let trackSeq = 0;

function makeId(): string {
  trackSeq += 1;
  return `t${trackSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Wrap channel arrays as a track (mono stays mono; defaults sane). */
export function createTrack(
  channels: Float32Array[],
  opts: Partial<Omit<TrackState, 'channels'>> = {},
): TrackState {
  if (channels.length < 1 || channels.length > 2) {
    throw new Error(`createTrack: 1 or 2 channels required, got ${channels.length}`);
  }
  return {
    id: opts.id ?? makeId(),
    name: opts.name ?? `Track ${trackSeq + 1}`,
    gain: clampGain(opts.gain ?? 1),
    pan: clampPan(opts.pan ?? 0),
    mute: opts.mute ?? false,
    solo: opts.solo ?? false,
    channels,
  };
}

function clampGain(g: number): number {
  return Math.min(1.5, Math.max(0, g));
}

function clampPan(p: number): number {
  return Math.min(1, Math.max(-1, p));
}

/**
 * Effective linear gain under the classic mixer rule: muted → 0; if any
 * track soloed, non-soloed tracks → 0; otherwise the strip gain.
 */
export function trackEffectiveGain(track: TrackState, anySolo: boolean): number {
  if (track.mute) return 0;
  if (anySolo && !track.solo) return 0;
  return track.gain;
}

/** Balance-law channel gains: center = (1, 1); hard side = exact zero. */
export function panGains(pan: number): [number, number] {
  const p = clampPan(pan);
  return [p >= 0 ? 1 - p : 1, p <= 0 ? 1 + p : 1];
}

/** Project length in seconds (longest track; 0 when empty). */
export function projectDuration(project: ProjectState): number {
  let maxLen = 0;
  for (const t of project.tracks) {
    for (const ch of t.channels) if (ch.length > maxLen) maxLen = ch.length;
  }
  return maxLen / project.sampleRate;
}

/**
 * Mix all tracks to stereo. Fixed track-order Float64 accumulation, single
 * final round to Float32 — bit-comparable with `mixdownReference`. An empty
 * project mixes to zero channels.
 */
export function mixTracks(project: ProjectState): Float32Array[] {
  const { tracks } = project;
  if (tracks.length === 0) return [];

  let maxLen = 0;
  for (const t of tracks) {
    for (const ch of t.channels) if (ch.length > maxLen) maxLen = ch.length;
  }

  const anySolo = tracks.some((t) => t.solo);
  const accL = new Float64Array(maxLen);
  const accR = new Float64Array(maxLen);

  for (const t of tracks) {
    const geff = trackEffectiveGain(t, anySolo);
    if (geff === 0) continue; // contributes exactly nothing
    const [gl, gr] = panGains(t.pan);
    const l = t.channels[0]!;
    const r = t.channels[1] ?? t.channels[0]!;
    const wl = gl * geff;
    const wr = gr * geff;
    for (let i = 0; i < l.length; ++i) accL[i] = accL[i]! + l[i]! * wl;
    for (let i = 0; i < r.length; ++i) accR[i] = accR[i]! + r[i]! * wr;
  }

  const outL = new Float32Array(maxLen);
  const outR = new Float32Array(maxLen);
  for (let i = 0; i < maxLen; ++i) {
    outL[i] = accL[i]!;
    outR[i] = accR[i]!;
  }
  return [outL, outR];
}

/**
 * Slow bit-exact reference mix (per-track Float64 full sums in the same
 * fixed order). Test anchor for `mixTracks` — do not optimize this one.
 */
export function mixdownReference(project: ProjectState): Float32Array[] {
  const { tracks } = project;
  if (tracks.length === 0) return [];

  let maxLen = 0;
  for (const t of tracks) {
    for (const ch of t.channels) if (ch.length > maxLen) maxLen = ch.length;
  }

  const anySolo = tracks.some((t) => t.solo);
  const outL = new Float64Array(maxLen);
  const outR = new Float64Array(maxLen);

  for (const t of tracks) {
    const geff = trackEffectiveGain(t, anySolo);
    const [gl, gr] = panGains(t.pan);
    const l = t.channels[0]!;
    const r = t.channels[1] ?? t.channels[0]!;
    for (let i = 0; i < l.length; ++i) outL[i] = outL[i]! + l[i]! * (gl * geff);
    for (let i = 0; i < r.length; ++i) outR[i] = outR[i]! + r[i]! * (gr * geff);
  }

  const resL = new Float32Array(maxLen);
  const resR = new Float32Array(maxLen);
  for (let i = 0; i < maxLen; ++i) {
    resL[i] = outL[i]!;
    resR[i] = outR[i]!;
  }
  return [resL, resR];
}
