/**
 * Project bridge (M8d) — runtime-side wiring between the AudioProjectEditor
 * / ProjectPlayback engines and the UI signals. Owns: project lifetime
 * (doc becomes track 1), track import, mix updates, project transport and
 * the undo/redo timestamps that order the doc/project history stacks.
 * Engine layer stays signal-free; this is the only bridge (golden rule 1).
 */
import { AudioProjectEditor, newProject } from '../engine/projectEditor';
import { createTrack, projectDuration, type ProjectState, type TrackState } from '../engine/project';
import { ProjectPlayback, type GraphContext, type PlaybackTrack } from '../engine/projectPlayback';
import { decodeBlob, getSharedContext } from '../io/decode';
import { getErrorMessage } from '../core/errors';
import { toastInfo } from './actions';
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
}

let proj: AudioProjectEditor | null = null;
let playback: ProjectPlayback | null = null;
let lastDocOpAt = 0;
let lastProjectOpAt = 0;
let rafId = 0;
/** Cursor position where the current play started (stop returns here). */
let playFrom = 0;

function snapshotOf(t: TrackState): TrackSnapshot {
  return {
    id: t.id,
    name: t.name,
    gain: t.gain,
    pan: t.pan,
    mute: t.mute,
    solo: t.solo,
    channelCount: t.channels.length,
    length: t.channels[0]?.length ?? 0,
  };
}

function sync(): void {
  if (!proj) return;
  S.projectTracks.value = proj.project.tracks.map(snapshotOf);
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

/** Open (or return) the project, adopting the current document as track 1. */
export function ensureProject(): ProjectState | null {
  const doc = S.docInfo.value;
  if (!doc) return null;
  if (proj) return proj.project;
  const channels = runtimeDocChannels();
  if (!channels) return null;
  const track = createTrack(channels, { name: doc.name });
  proj = new AudioProjectEditor(newProject(doc.sampleRate, [track], track.id));
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

/** Re-point track 1 at the live document channels (after load/edit). */
export function resyncDocTrack(): void {
  const channels = getDocChannels();
  if (!proj || !channels) return;
  const first = proj.project.tracks[0];
  if (!first) return;
  first.channels = channels;
  sync();
}

/** Import an audio file as a NEW lane (decode → own copies → add). */
export async function importToTrack(file: File): Promise<void> {
  try {
    const buffer = await decodeBlob(file);
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ++ch) {
      channels.push(buffer.getChannelData(ch).slice());
    }
    const ed = requireEditor();
    const track = createTrack(channels, { name: file.name.replace(/\.[^.]+$/, '') });
    ed.addTrack(track);
    lastProjectOpAt = Date.now();
    sync();
    toastInfo(`${t().trackImported}: ${track.name}`);
  } catch (error: unknown) {
    toastInfo(tError('WF-E201'));
    throw new Error(getErrorMessage(error));
  }
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

export function setActiveTrack(trackId: string): void {
  if (!proj) return;
  proj.project.activeTrackId = trackId;
  S.activeTrackId.value = trackId;
}

function playbackViews(): PlaybackTrack[] {
  return requireEditor().project.tracks;
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
  playback.start(playbackViews(), { from: playFrom, loop: region });
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
