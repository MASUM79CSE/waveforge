/**
 * Project bridge (M8d) — runtime-side wiring between the AudioProjectEditor
 * / ProjectPlayback engines and the UI signals. Owns: project lifetime
 * (doc becomes track 1), track import, mix updates, project transport and
 * the undo/redo timestamps that order the doc/project history stacks.
 * Engine layer stays signal-free; this is the only bridge (golden rule 1).
 */
import { AudioProjectEditor, newProject } from '../engine/projectEditor';
import {
  createProjectTrack,
  createTrack,
  laneAsset,
  mixTracks,
  projectDuration,
  sweepAssets,
  trackChannels,
  type ProjectState,
  type TrackState,
} from '../engine/project';
import { bounceLaneRegion } from '../engine/clipAssets';
import type { AudioClip } from '../engine/clips';
import { ProjectPlayback, type ClipPlaybackTrack, type GraphContext } from '../engine/projectPlayback';
import { decodeBlob, getSharedContext } from '../io/decode';
import { resample } from '../fx/resample';
import { resolveFxTarget } from './fxTarget';
import { getErrorMessage, makeError } from '../core/errors';
import { toastInfo } from './toast';
import { t, tError } from '../i18n';
import * as S from './state';
import { pickUndoTarget, type UndoTarget } from './undoPolicy';

export interface TrackSnapshot {
  id: string;
  name: string;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  channelCount: number;
  length: number;
  /** A4: per-param automation curves (read-only view for the UI). */
  automation?: Record<string, import('../engine/automation').AutomationCurve>;
}

let proj: AudioProjectEditor | null = null;
let playback: ProjectPlayback | null = null;
let lastDocOpAt = 0;
let lastProjectOpAt = 0;
let rafId = 0;
/** Cursor position where the current play started (stop returns here). */
let playFrom = 0;

function snapshotOf(project: ProjectState, t: TrackState): TrackSnapshot {
  const asset = t.clips[0] ? project.assets[t.clips[0]!.assetId] : undefined;
  let length = 0;
  for (const c of t.clips) if (c.start + c.duration > length) length = c.start + c.duration;
  return {
    id: t.id,
    name: t.name,
    gain: t.gain,
    pan: t.pan,
    mute: t.mute,
    solo: t.solo,
    channelCount: asset?.channels.length ?? 1,
    length,
    automation: t.automation,
  };
}

function sync(): void {
  if (!proj) return;
  const project = proj.project;
  S.projectTracks.value = project.tracks.map((t) => snapshotOf(project, t));
  S.activeTrackId.value = proj.project.activeTrackId;
  S.projectVersion.value += 1;
}

function requireEditor(): AudioProjectEditor {
  if (!proj) throw new Error('project not started');
  return proj;
}

function playbackCtx(): GraphContext {
  return getSharedContext() as unknown as GraphContext;
}

/** Close the project (fresh loads supersede it; lanes re-open on ＋). */
export function closeProject(): void {
  if (!proj) return;
  if (playback?.playing) {
    playback.stop();
    stopTick();
    S.playing.value = false;
  }
  proj = null;
  playback = null;
  S.projectOpen.value = false;
  S.projectTracks.value = [];
  S.activeTrackId.value = null;
  S.projectVersion.value += 1;
}

/** Open (or return) the project, adopting the current document as track 1. */
export function ensureProject(): ProjectState | null {
  const doc = S.docInfo.value;
  if (!doc) return null;
  if (proj) return proj.project;
  const channels = runtimeDocChannels();
  if (!channels) return null;
  const fresh = newProject(doc.sampleRate, []);
  createProjectTrack(fresh, channels, { name: doc.name });
  proj = new AudioProjectEditor(fresh);
  playback = new ProjectPlayback(playbackCtx(), doc.sampleRate);
  S.projectOpen.value = true;
  sync();
  return proj.project;
}

/** Live document channel arrays (for track-1 adoption / resync). */
function runtimeDocChannels(): Float32Array[] | null {
  const doc = getDocChannels();
  return doc;
}

let docChannelsGetter: (() => Float32Array[] | null) | null = null;
/** runtime injects its getDoc() access (avoids an app↔runtime import cycle). */
export function bindDocChannels(getter: () => Float32Array[] | null): void {
  docChannelsGetter = getter;
}
function getDocChannels(): Float32Array[] | null {
  return docChannelsGetter?.() ?? null;
}

/** Channels of a track for lane drawing (by reference; null if unknown). */
export function getTrackChannels(trackId: string): Float32Array[] | null {
  return proj?.trackChannels(trackId) ?? null;
}

/** Re-point track 1 at the live document channels (after load/edit).
 * M9d1: the lane's backing asset is re-pointed BY REFERENCE and the lane's
 * arrangement resets to one full clip over it (M8 mirror semantics). */
export function resyncDocTrack(): void {
  const channels = getDocChannels();
  if (!proj || !channels) return;
  const first = proj.project.tracks[0];
  if (!first) return;
  const assetId = first.clips[0]?.assetId ?? `asset_${first.id}`;
  proj.project.assets[assetId] = {
    id: assetId,
    sampleRate: proj.project.sampleRate,
    channels,
  };
  first.clips = [
    { id: `clip_${first.id}`, assetId, start: 0, offset: 0, duration: channels[0]?.length ?? 0 },
  ];
  sync();
}

/** Import an audio file as a NEW lane (decode → own copies → add). */
export async function importToTrack(file: File): Promise<void> {
  try {
    const buffer = await decodeBlob(file);
    let channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ++ch) {
      channels.push(buffer.getChannelData(ch).slice());
    }
    // off-rate files are resampled to the project rate at the boundary
    const projectRate = S.docInfo.value?.sampleRate ?? buffer.sampleRate;
    channels = conformToProjectRate(channels, buffer.sampleRate, projectRate);
    const ed = requireEditor();
    const track = createTrack(channels, {
      name: file.name.replace(/\.[^.]+$/, ''),
      sampleRate: ed.project.sampleRate,
    });
    ed.project.assets[`asset_${track.id}`] = laneAsset(track.id, channels, ed.project.sampleRate);
    ed.addTrack(track);
    lastProjectOpAt = Date.now();
    sync();
    toastInfo(`${t().trackImported}: ${track.name}`);
  } catch (error: unknown) {
    toastInfo(tError('WF-E201'));
    throw new Error(getErrorMessage(error));
  }
}

/** Add a fully-formed track (import/record path — undoable). */
/** The live project editor (null when no project) — arrangement ops use it. */
export function projectEditor(): AudioProjectEditor | null {
  return proj;
}

/** Stamp + bump after a direct arrangement edit (clip actions). */
export function syncProject(): void {
  lastProjectOpAt = Date.now();
  sync();
}

/** Live clip arrangement of a lane (null when unknown). */
export function clipArrangement(trackId: string): AudioClip[] | null {
  return proj?.project.tracks.find((t) => t.id === trackId)?.clips ?? null;
}

/** Backing PCM of a clip asset (zero-copy; null when unknown). */
export function assetPcm(assetId: string): Float32Array[] | null {
  return proj?.project.assets[assetId]?.channels ?? null;
}

/** Register a lane's backing asset (zero-copy) — call before addProjectTrack. */
export function registerLaneAsset(trackId: string, channels: Float32Array[]): void {
  const project = requireEditor().project;
  project.assets[`asset_${trackId}`] = laneAsset(trackId, channels, project.sampleRate);
}

export function addProjectTrack(track: TrackState): void {
  requireEditor().addTrack(track);
  lastProjectOpAt = Date.now();
  sync();
}

export function removeTrack(trackId: string): void {
  requireEditor().removeTrack(trackId);
  lastProjectOpAt = Date.now();
  sync();
}

/** Live mix change (gain/pan/mute/solo) — NOT undoable (mixer semantics). */
export function updateTrackMix(
  trackId: string,
  patch: Partial<Pick<TrackState, 'gain' | 'pan' | 'mute' | 'solo'>>,
): void {
  const ed = requireEditor();
  const track = ed.project.tracks.find((t) => t.id === trackId);
  if (!track) return;
  Object.assign(track, patch);
  sync();
  playback?.updateMix(playbackViews());
}

/**
 * Conform decoded channels to the project rate (M8f+): playback stamps the
 * project rate on lane buffers and the mixdown assumes it, so off-rate
 * material MUST be resampled at the boundary. Same-rate passes through
 * by reference (zero cost).
 */
export function conformToProjectRate(
  channels: Float32Array[],
  fromRate: number,
  toRate: number,
): Float32Array[] {
  if (fromRate === toRate) return channels;
  // resample() factor is varispeed (out = len / factor): 48k -> 44.1k needs
  // factor 48000/44100 so the result is SHORTER (fewer samples, same time).
  return resample(channels, fromRate / toRate);
}

/** Lanes for draft persistence (v2): meta + live channel references. */
export interface ProjectTrackExport {
  meta: {
    id: string;
    name: string;
    gain: number;
    pan: number;
    mute: boolean;
    solo: boolean;
    channels: 1 | 2;
    length: number;
    /** A5: per-param envelope curves (optional; drafts v2/v3 keep them). */
    automation?: Record<string, import('../engine/automation').AutomationCurve>;
  };
  channels: Float32Array[];
}

export function exportProjectTracks(): ProjectTrackExport[] | null {
  if (!proj || proj.project.tracks.length === 0) return null;
  return proj.project.tracks.map((t) => {
    const channels = trackChannels(proj!.project, t.id) ?? [];
    return {
      meta: {
        id: t.id,
        name: t.name,
        gain: t.gain,
        pan: t.pan,
        mute: t.mute,
        solo: t.solo,
        channels: proj!.project.assets[t.clips[0]?.assetId ?? '']?.channels.length === 1 ? 1 : 2,
        length: channels[0]?.length ?? 0,
        ...(t.automation ? { automation: t.automation } : {}),
      },
      channels,
    };
  });
}

/**
 * Restore lanes from a draft (M8e): fresh project state, no history —
 * track 1 re-points at the just-installed document, later tracks take
 * decoded copies.
 */
export function restoreProjectTracks(
  payload: Array<{ meta: ProjectTrackExport['meta']; channels: Float32Array[] }>,
): void {
  ensureProject();
  if (!proj) return;
  const sampleRate = proj.project.sampleRate;
  const docChannels = getDocChannels();
  const fresh = newProject(sampleRate, []);
  for (const [i, p] of payload.entries()) {
    const channels = i === 0 && docChannels ? docChannels : p.channels.map((c) => c.slice());
    const track = createTrack(channels, {
      id: p.meta.id,
      name: p.meta.name,
      gain: p.meta.gain,
      pan: p.meta.pan,
      mute: p.meta.mute,
      solo: p.meta.solo,
      sampleRate,
      automation: p.meta.automation,
    });
    fresh.assets[`asset_${track.id}`] = laneAsset(track.id, channels, sampleRate);
    fresh.tracks.push(track);
  }
  fresh.activeTrackId = fresh.tracks[0]?.id ?? null;
  proj.adopt(fresh);
  sync();
}

/** Clip-arrangement export for drafts v3 (M9f): tracks with clip lists +
 * deduped asset payloads (PCM blocks in first-reference order). */
export interface ClipProjectExport {
  tracks: Array<{
    meta: ProjectTrackExport['meta'] & {
      clips?: Array<{ id: string; assetId: string; start: number; offset: number; duration: number }>;
      automation?: Record<string, import('../engine/automation').AutomationCurve>;
    };
    clips?: Array<{ id: string; assetId: string; start: number; offset: number; duration: number }>;
    channels: Float32Array[];
  }>;
  assets: Array<{
    meta: { id: string; sampleRate: number; channels: 1 | 2; length: number };
    channels: Float32Array[];
  }>;
}

/** Build the v3 payload from an explicit project (unit-friendly) or the live one. */
export function exportProjectClips(source?: ProjectState): ClipProjectExport | null {
  const project = source ?? proj?.project;
  if (!project || project.tracks.length === 0) return null;
  const tracks: ClipProjectExport['tracks'] = project.tracks.map((t) => {
    const channels = trackChannels(project, t.id) ?? [];
    return {
      meta: {
        id: t.id,
        name: t.name,
        gain: t.gain,
        pan: t.pan,
        mute: t.mute,
        solo: t.solo,
        channels: project.assets[t.clips[0]?.assetId ?? '']?.channels.length === 1 ? 1 : 2,
        length: channels[0]?.length ?? 0,
        clips: t.clips.map((c) => ({
          id: c.id,
          assetId: c.assetId,
          start: c.start,
          offset: c.offset,
          duration: c.duration,
        })),
        ...(t.automation ? { automation: t.automation } : {}),
      },
      clips: t.clips.map((c) => ({
        id: c.id,
        assetId: c.assetId,
        start: c.start,
        offset: c.offset,
        duration: c.duration,
      })),
      channels,
    };
  });
  // deduped assets in first-reference order
  const seen = new Map<string, Float32Array[]>();
  for (const t of project.tracks) {
    for (const c of t.clips) {
      if (seen.has(c.assetId)) continue;
      const asset = project.assets[c.assetId];
      if (asset) seen.set(c.assetId, asset.channels);
    }
  }
  const assets: ClipProjectExport['assets'] = [];
  for (const [id, channels] of seen) {
    assets.push({
      meta: {
        id,
        sampleRate: project.sampleRate,
        channels: channels.length === 1 ? 1 : 2,
        length: channels[0]?.length ?? 0,
      },
      channels,
    });
  }
  return { tracks, assets };
}

/**
 * Build a fresh ProjectState from a v3 (or v2) draft payload (M9f).
 * Lane 1 mirrors the live document (single full clip over `docChannels`);
 * lanes ≥ 2 take their stored clip arrangements; assets register as-is.
 * Missing asset references are corrupt drafts (WF-E402).
 */
/** Shape of a decoded draft record's project parts (v3 or v2). */
export type ClipProjectPayload = {
  tracks?: Array<{
    meta: ProjectTrackExport['meta'] & {
      clips?: Array<{ id: string; assetId: string; start: number; offset: number; duration: number }>;
      automation?: Record<string, import('../engine/automation').AutomationCurve>;
    };
    channels: Float32Array[];
  }>;
  assets?: Array<{
    meta: { id: string; sampleRate: number; channels: 1 | 2; length: number };
    channels: Float32Array[];
  }>;
};

export function buildClipProject(
  payload: ClipProjectPayload,
  sampleRate: number,
  docChannels: Float32Array[] | null,
): ProjectState {
  const fresh = newProject(sampleRate, []);
  const rows = payload.tracks ?? [];
  for (const a of payload.assets ?? []) {
    fresh.assets[a.meta.id] = {
      id: a.meta.id,
      sampleRate: a.meta.sampleRate,
      channels: a.channels,
    };
  }
  for (const [i, p] of rows.entries()) {
    if (i === 0 && docChannels) {
      // doc mirror: one full clip over the live document
      const track = createTrack(docChannels, { id: p.meta.id, name: p.meta.name, gain: p.meta.gain, pan: p.meta.pan, mute: p.meta.mute, solo: p.meta.solo, sampleRate, automation: p.meta.automation });
      fresh.assets[`asset_${track.id}`] = laneAsset(track.id, docChannels, sampleRate);
      fresh.tracks.push(track);
      continue;
    }
    const clips = (p.meta.clips ?? []).map((c) => ({ ...c }));
    for (const c of clips) {
      if (!fresh.assets[c.assetId]) {
        throw makeError('WF-E402', { detail: `clip ${c.id} references missing asset ${c.assetId}` });
      }
    }
    // v2-shaped lanes (no stored clips) become a single full clip over
    // their own PCM block; v3 lanes keep the stored arrangement
    const arrangement =
      clips.length > 0
        ? clips
        : [
            {
              id: `clip_${p.meta.id}`,
              assetId: `asset_${p.meta.id}`,
              start: 0,
              offset: 0,
              duration: p.channels[0]?.length ?? 0,
            },
          ];
    const track = createTrack([], {
      id: p.meta.id,
      name: p.meta.name,
      gain: p.meta.gain,
      pan: p.meta.pan,
      mute: p.meta.mute,
      solo: p.meta.solo,
      sampleRate,
      clips: arrangement,
      automation: p.meta.automation,
    });
    if (clips.length === 0) {
      fresh.assets[`asset_${track.id}`] = laneAsset(track.id, p.channels, sampleRate);
    }
    fresh.tracks.push(track);
  }
  fresh.activeTrackId = fresh.tracks[0]?.id ?? null;
  return fresh;
}

/** Adopt a decoded v3/v2 payload as the live project (lanes ≥ 2 arranged). */
export function restoreProjectClips(payload: ClipProjectPayload): void {
  ensureProject();
  if (!proj) return;
  const sampleRate = proj.project.sampleRate;
  const docChannels = getDocChannels();
  proj.adopt(buildClipProject(payload, sampleRate, docChannels));
  sync();
}

/** Mixdown of the current project (parity with ProjectPlayback gains). */
export function mixdownChannels(): Float32Array[] | null {
  if (!proj) return null;
  return mixTracks(proj.project);
}

/** Per-track stems (name + channels) for stem export. */
export function stemChannels(): Array<{ name: string; channels: Float32Array[] }> | null {
  if (!proj) return null;
  return proj.project.tracks.map((t) => ({
    name: t.name.replace(/[/\\:*?"<>|]/g, '_'),
    channels: trackChannels(proj!.project, t.id) ?? [],
  }));
}

/** The project lane that mirrors the document (lane 1). */
export function docTrackId(): string | null {
  return proj?.project.tracks[0]?.id ?? null;
}

export interface TrackEditTarget {
  trackId: string;
  channels: Float32Array[];
}

/**
 * Channels an effect/edit should target right now: the active lane when
 * the project is open and a lane ≥ 2 is active, else null (doc path).
 */
export function activeTrackTarget(): TrackEditTarget | null {
  if (!proj) return null;
  const target = resolveFxTarget(proj.project.tracks, proj.project.activeTrackId, docTrackId() ?? '');
  if (typeof target !== 'string') return null;
  const channels = proj.trackChannels(target);
  if (!channels) return null;
  return { trackId: target, channels };
}

/** Commit new channel content for a lane ≥ 2 through the project history
 * (M9d1: copy-on-write bounce — renders the lane's clip timeline, stores the
 * processed audio as a NEW asset, one full clip replaces the arrangement). */
export function commitTrackChannels(
  trackId: string,
  newChannels: Float32Array[],
  label: string,
): boolean {
  try {
    const ed = requireEditor();
    let laneEnd = 0;
    for (const c of ed.project.tracks.find((t) => t.id === trackId)?.clips ?? []) {
      if (c.start + c.duration > laneEnd) laneEnd = c.start + c.duration;
    }
    if (laneEnd === 0) return false;
    const bounceId = `b${bounceSeq.toString(36)}_${Date.now().toString(36)}`;
    bounceSeq += 1;
    const bounce = bounceLaneRegion(
      ed.project,
      trackId,
      0,
      laneEnd,
      () => newChannels,
      bounceId,
    );
    if (!bounce) return false;
    ed.executeClipEdit(trackId, label, bounce.before, bounce.after, [bounce.asset]);
    sweepAssets(ed.project);
    lastProjectOpAt = Date.now();
    sync();
    return true;
  } catch {
    return false;
  }
}
let bounceSeq = 0;

export function setActiveTrack(trackId: string): void {
  if (!proj) return;
  proj.project.activeTrackId = trackId;
  S.activeTrackId.value = trackId;
}

function playbackViews(): ClipPlaybackTrack[] {
  const project = requireEditor().project;
  const assets = new Map(Object.entries(project.assets));
  return project.tracks.map((t) => ({
    clips: t.clips,
    assets,
    gain: t.gain,
    pan: t.pan,
    mute: t.mute,
    solo: t.solo,
    automation: t.automation,
  }));
}

// ---- undo/redo policy stamps ----

export function stampDocOp(): void {
  lastDocOpAt = Date.now();
}

export function projectCanUndo(): boolean {
  return proj?.canUndo() ?? false;
}

export function projectCanRedo(): boolean {
  return proj?.canRedo() ?? false;
}

/** Which stack the next undo should hit (timestamp rule, ties → doc). */
export function undoTarget(): UndoTarget {
  return pickUndoTarget(lastDocOpAt, lastProjectOpAt, docCanUndo(), projectCanUndo());
}

/** Undo one project step (returns its label; null when the stack is empty). */
export function projectUndo(): string | null {
  if (!proj) return null;
  const out = proj.undo();
  if (!out) return null;
  sync();
  return out.label;
}

/** Redo one project step. */
export function projectRedo(): string | null {
  if (!proj) return null;
  const out = proj.redo();
  if (!out) return null;
  sync();
  return out.label;
}

let docCanUndoFn: (() => boolean) | null = null;
export function bindDocHistory(canUndo: () => boolean): void {
  docCanUndoFn = canUndo;
}
function docCanUndo(): boolean {
  return docCanUndoFn?.() ?? false;
}

// ---- project transport ----

function stopTick(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

/** rAF playhead loop (parity with AudioEngine.tick). */
function rafTick(): void {
  if (!playback?.playing) return;
  const pos = playback.position();
  S.cursorPos.value = pos;
  projectCursorHook?.(pos);
  rafId = requestAnimationFrame(rafTick);
}

let projectCursorHook: ((t: number) => void) | null = null;
export function bindProjectCursor(hook: (t: number) => void): void {
  projectCursorHook = hook;
}

export function projectPlaying(): boolean {
  return playback?.playing ?? false;
}

export function projectTogglePlay(): void {
  if (!playback) return;
  if (playback.playing) {
    projectPause();
    return;
  }
  const from = S.cursorPos.value;
  const duration = projectDuration(requireEditor().project);
  playFrom = from >= duration - 0.005 ? 0 : from;
  const loop = S.looping.value;
  const sel = S.selection.value;
  const region =
    loop && sel && sel.end - sel.start > 0.01
      ? { start: sel.start, end: sel.end }
      : loop
        ? { start: 0, end: duration }
        : null;
  playback.onEnded = () => {
    stopTick();
    S.playing.value = false;
    S.cursorPos.value = duration;
    projectCursorHook?.(duration);
  };
  playback.startClips(playbackViews(), { from: playFrom, loop: region });
  S.playing.value = true;
  stopTick();
  rafId = requestAnimationFrame(rafTick);
}

function projectPause(): void {
  if (!playback) return;
  const pos = playback.position();
  playback.stop();
  stopTick();
  S.playing.value = false;
  S.cursorPos.value = pos;
  projectCursorHook?.(pos);
}

export function projectStop(): void {
  if (!playback) return;
  playback.stop();
  stopTick();
  S.playing.value = false;
  S.cursorPos.value = playFrom;
  projectCursorHook?.(playFrom);
}

/** Seek in project mode (restarts playback at the new position if playing). */
export function projectSeek(t: number): void {
  const duration = proj ? projectDuration(proj.project) : 0;
  const target = Math.max(0, Math.min(t, duration));
  const wasPlaying = playback?.playing ?? false;
  playback?.stop();
  stopTick();
  S.playing.value = false;
  S.cursorPos.value = target;
  projectCursorHook?.(target);
  if (wasPlaying) projectTogglePlay();
  else playFrom = target;
}

/** Loop toggle in project mode: (re)start with the new region if playing. */
export function applyProjectLoopIfPlaying(): void {
  if (playback?.playing) {
    projectPause();
    projectTogglePlay();
  }
}
