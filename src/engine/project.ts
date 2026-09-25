/**
 * Multitrack project core (M8a; M9d1 clip flip — project model).
 * Pure, deterministic kernels: lanes hold SORTED NON-OVERLAPPING CLIPS
 * referencing shared immutable assets (one shared timeline, mixed by
 * fixed-order Float64 accumulation — Audacity-class model).
 * No engine/UI imports by design. `createTrack` wraps plain channels as a
 * single-clip lane over a fresh asset (zero-copy — the M9b bridge).
 */
import { renderClipTrack, type AudioAsset, type AudioClip } from './clips';
import { mulTable, panWeights, type AutomationCurve } from './automation';

export type { AudioAsset, AudioClip };
export type { ClipTrack } from './clips';

/** Per-track mixer state + clip arrangement. Audio lives in project.assets. */
export interface TrackState {
  id: string;
  name: string;
  /** Linear gain 0..1.5 (matches the D8 volume strip). */
  gain: number;
  /** Balance law: −1..1. Center = unity passthrough; hard pan zeroes the far side. */
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Sorted non-overlapping clips (sample domain; see clips.ts kernels). */
  clips: AudioClip[];
  /** A2: automation curves per param key ('volume', 'pan'); empty/missing
   * = no automation for that param. */
  automation?: Record<string, AutomationCurve>;
}

export interface ProjectState {
  sampleRate: number;
  /** Lane order, top → bottom. */
  tracks: TrackState[];
  activeTrackId: string | null;
  /** Shared immutable takes, keyed by id; referenced by clip lists. */
  assets: Record<string, AudioAsset>;
}

let trackSeq = 0;

function makeId(): string {
  trackSeq += 1;
  return `t${trackSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateTrackOptions {
  id?: string;
  name?: string;
  gain?: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
  /** Asset sample rate (defaults to the project rate at registration). */
  sampleRate?: number;
  /** Override the auto asset/clip ids (draft loading reuses stored ids). */
  assetId?: string;
  clipId?: string;
  /** Pre-built clip arrangement (draft loading); default = one full clip. */
  clips?: AudioClip[];
  /** Alternate PCM for the backing asset (draft loading; default = channels). */
  assetChannels?: Float32Array[];
  /** A5: per-param envelope curves (draft loading; default = none). */
  automation?: Record<string, AutomationCurve>;
}

/** Wrap channel arrays as a single-clip lane (mono stays mono; defaults sane). */
export function createTrack(
  channels: Float32Array[],
  opts: CreateTrackOptions = {},
): TrackState {
  // M9f: draft loading builds clip lanes without their own PCM (channels
  // may be empty when an explicit clip arrangement is provided)
  if (channels.length > 2 || (channels.length < 1 && !opts.clips)) {
    throw new Error(`createTrack: 1 or 2 channels required, got ${channels.length}`);
  }
  const id = opts.id ?? makeId();
  const assetId = opts.assetId ?? `asset_${id}`;
  const clipId = opts.clipId ?? `clip_${id}`;
  const clips = opts.clips ?? [
    {
      id: clipId,
      assetId,
      start: 0,
      offset: 0,
      duration: channels[0]?.length ?? 0,
    },
  ];
  return {
    id,
    name: opts.name ?? `Track ${trackSeq + 1}`,
    gain: clampGain(opts.gain ?? 1),
    pan: clampPan(opts.pan ?? 0),
    mute: opts.mute ?? false,
    solo: opts.solo ?? false,
    clips,
    ...(opts.automation && Object.keys(opts.automation).length > 0 ? { automation: opts.automation } : {}),
  };
}

/** Convenience: the backing asset a factory lane would register. */
export function laneAsset(
  trackId: string,
  channels: Float32Array[],
  sampleRate: number,
  assetId?: string,
): AudioAsset {
  return { id: assetId ?? `asset_${trackId}`, sampleRate, channels };
}

/**
 * Create a lane from channels AND register its zero-copy backing asset in
 * the project (the canonical app-layer entry point — import/record/etc).
 */
export function createProjectTrack(
  project: ProjectState,
  channels: Float32Array[],
  opts: CreateTrackOptions = {},
): TrackState {
  const track = createTrack(channels, { sampleRate: project.sampleRate, ...opts });
  const asset = laneAsset(track.id, channels, project.sampleRate, opts.assetId);
  project.assets[asset.id] = opts.assetChannels
    ? { ...asset, channels: opts.assetChannels }
    : asset;
  project.tracks.push(track);
  if (!project.activeTrackId) project.activeTrackId = track.id;
  return track;
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
export function trackEffectiveGain(
  track: Pick<TrackState, 'gain' | 'mute' | 'solo'>,
  anySolo: boolean,
): number {
  if (track.mute) return 0;
  if (anySolo && !track.solo) return 0;
  return track.gain;
}

/** Balance-law channel gains: center = (1, 1); hard side = exact zero. */
export function panGains(pan: number): [number, number] {
  const p = clampPan(pan);
  return [p >= 0 ? 1 - p : 1, p <= 0 ? 1 + p : 1];
}

/** Asset table as a Map view for the pure render kernels. */
export function assetsMap(project: ProjectState): Map<string, AudioAsset> {
  return new Map(Object.entries(project.assets));
}

/** Live channel arrays of a track — rendered from its clip arrangement.
 * Mono lanes stay mono (M8 parity: effects keep the channel count; the
 * mixer/playback paths do the mono→stereo spread themselves). */
export function trackChannels(
  project: ProjectState,
  trackId: string,
): Float32Array[] | null {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const fast = lanePcm(project, track);
  if (fast) return fast;
  const rendered = renderClipTrack({ clips: track.clips }, assetsMap(project));
  // arranged lane: preserve mono-ness when every clip's asset is mono
  const allMono = track.clips.every((c) => (project.assets[c.assetId]?.channels.length ?? 2) === 1);
  return allMono ? [rendered[0]!] : rendered;
}

/**
 * Zero-copy fast path (M9d1 perf): a single full clip at start 0 offset 0
 * renders bit-identically to its asset PCM (the render is a copy), so the
 * asset channels can be returned BY REFERENCE. Treat the result as
 * immutable. Returns null whenever the lane is arranged (render needed).
 */
function lanePcm(project: ProjectState, track: TrackState): Float32Array[] | null {
  if (track.clips.length !== 1) return null;
  const c = track.clips[0]!;
  const asset = project.assets[c.assetId];
  if (!asset) return null;
  const len = asset.channels[0]?.length ?? 0;
  if (c.start !== 0 || c.offset !== 0 || c.duration !== len) return null;
  return asset.channels;
}

/** Project length in seconds (longest clip-timeline end; 0 when empty). */
export function projectDuration(project: ProjectState): number {
  let maxEnd = 0;
  for (const t of project.tracks) {
    for (const c of t.clips) if (c.start + c.duration > maxEnd) maxEnd = c.start + c.duration;
  }
  return maxEnd / project.sampleRate;
}

/** Per-track rendered channels (for mixers that iterate lanes). */
function renderedTracks(project: ProjectState): Array<{ t: TrackState; ch: Float32Array[] }> {
  const out: Array<{ t: TrackState; ch: Float32Array[] }> = [];
  for (const t of project.tracks) {
    const ch = trackChannels(project, t.id);
    if (ch && ch.length > 0) out.push({ t, ch });
  }
  return out;
}

/**
 * Mix all tracks to stereo. Fixed track-order Float64 accumulation, single
 * final round to Float32 — bit-comparable with `mixdownReference`. An empty
 * project mixes to zero channels.
 */
export function mixTracks(project: ProjectState): Float32Array[] {
  const rendered = renderedTracks(project);
  if (rendered.length === 0) return [];

  let maxLen = 0;
  for (const { ch } of rendered) {
    for (const c of ch) if (c.length > maxLen) maxLen = c.length;
  }

  const anySolo = project.tracks.some((t) => t.solo);
  const accL = new Float64Array(maxLen);
  const accR = new Float64Array(maxLen);

  for (const { t, ch } of rendered) {
    const geff = trackEffectiveGain(t, anySolo);
    if (geff === 0) continue; // contributes exactly nothing
    const [gl, gr] = panGains(t.pan);
    const l = ch[0]!;
    const r = ch[1] ?? ch[0]!;
    const volCurve = t.automation?.volume;
    const panCurve = t.automation?.pan;
    const vol = volCurve && volCurve.length > 0 ? mulTable(volCurve, l.length) : null;
    const panW = panCurve && panCurve.length > 0 ? panWeights(panCurve, l.length) : null;
    const wl = gl * geff;
    const wr = gr * geff;
    if (!vol && !panW) {
      // existing scalar path — byte-for-byte unchanged (bit-identity guard)
      for (let i = 0; i < l.length; ++i) accL[i] = accL[i]! + l[i]! * wl;
      for (let i = 0; i < r.length; ++i) accR[i] = accR[i]! + r[i]! * wr;
      continue;
    }
    // automated path: same Float64 accumulation, per-sample weights
    for (let i = 0; i < l.length; ++i) {
      const m = vol ? vol[i]! : 1;
      const wli = panW ? wl * m * panW.gl[i]! : wl * m;
      accL[i] = accL[i]! + l[i]! * wli;
    }
    for (let i = 0; i < r.length; ++i) {
      const m = vol ? vol[i]! : 1;
      const wri = panW ? wr * m * panW.gr[i]! : wr * m;
      accR[i] = accR[i]! + r[i]! * wri;
    }
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
  const rendered = renderedTracks(project);
  if (rendered.length === 0) return [];

  let maxLen = 0;
  for (const { ch } of rendered) {
    for (const c of ch) if (c.length > maxLen) maxLen = c.length;
  }

  const anySolo = project.tracks.some((t) => t.solo);
  const outL = new Float64Array(maxLen);
  const outR = new Float64Array(maxLen);

  for (const { t, ch } of rendered) {
    const geff = trackEffectiveGain(t, anySolo);
    const [gl, gr] = panGains(t.pan);
    const l = ch[0]!;
    const r = ch[1] ?? ch[0]!;
    const volCurve = t.automation?.volume;
    const panCurve = t.automation?.pan;
    const vol = volCurve && volCurve.length > 0 ? mulTable(volCurve, l.length) : null;
    const panW = panCurve && panCurve.length > 0 ? panWeights(panCurve, l.length) : null;
    if (!vol && !panW) {
      for (let i = 0; i < l.length; ++i) outL[i] = outL[i]! + l[i]! * (gl * geff);
      for (let i = 0; i < r.length; ++i) outR[i] = outR[i]! + r[i]! * (gr * geff);
      continue;
    }
    for (let i = 0; i < l.length; ++i) {
      const m = vol ? vol[i]! : 1;
      const wl = panW ? gl * geff * m * panW.gl[i]! : gl * geff * m;
      outL[i] = outL[i]! + l[i]! * wl;
    }
    for (let i = 0; i < r.length; ++i) {
      const m = vol ? vol[i]! : 1;
      const wr = panW ? gr * geff * m * panW.gr[i]! : gr * geff * m;
      outR[i] = outR[i]! + r[i]! * wr;
    }
  }

  const resL = new Float32Array(maxLen);
  const resR = new Float32Array(maxLen);
  for (let i = 0; i < maxLen; ++i) {
    resL[i] = outL[i]!;
    resR[i] = outR[i]!;
  }
  return [resL, resR];
}

/** Drop assets no clip references anymore (COW GC — app layer calls after bounces). */
export function sweepAssets(project: ProjectState): void {
  const live = new Set<string>();
  for (const t of project.tracks) for (const c of t.clips) live.add(c.assetId);
  for (const id of Object.keys(project.assets)) {
    if (!live.has(id)) delete project.assets[id];
  }
}
