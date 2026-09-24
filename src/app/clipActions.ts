/**
 * Clip arrangement actions (M9d2 — docs/clips-plan.md).
 * Pure helpers (hit test, drag-mode classification, beat snap) +
 * editor-explicit arrange cores that ride the project history (ONE entry
 * per gesture) + the signal-facing commands the canvas and keyboard call.
 * Overlap is impossible by construction: every mutation goes through the
 * clips.ts kernels (clamp/refuse), never raw array edits.
 */
import { snapEdgeToBeat } from '../engine/bpm';
import {
  duplicateClip,
  findClipAt,
  moveClip,
  removeClip,
  splitClip,
  trimClip,
  type AudioClip,
  type ClipTrack,
} from '../engine/clips';
import { sweepAssets, type ProjectState, type TrackState } from '../engine/project';
import type { AudioProjectEditor } from '../engine/projectEditor';

// ---- pure helpers (unit-anchored; no state) ----

/** Topmost clip containing the sample (end exclusive); null in gaps. */
export function hitTestClip(clips: readonly AudioClip[], sample: number): AudioClip | null {
  for (let i = clips.length - 1; i >= 0; --i) {
    const c = clips[i]!;
    if (sample >= c.start && sample < c.start + c.duration) return c;
  }
  return null;
}

export type DragMode = 'move' | 'trim-start' | 'trim-end';

export interface DragHit {
  kind: DragMode;
  clip: AudioClip;
}

/** Classify a pointer-down: edge zones (± edgePx) trim, the body moves. */
export function dragModeAt(
  clips: readonly AudioClip[],
  sample: number,
  spp: number,
  edgePx: number,
): DragHit | null {
  const clip = hitTestClip(clips, sample);
  if (!clip) return null;
  const edgeSamples = Math.max(1, Math.round(edgePx * spp));
  if (sample - clip.start <= edgeSamples) return { kind: 'trim-start', clip };
  if (clip.start + clip.duration - sample <= edgeSamples) return { kind: 'trim-end', clip };
  return { kind: 'move', clip };
}

/** Snap a timeline sample to the nearest beat (exact lock; passthrough off). */
export function snapClipPosition(
  sample: number,
  sampleRate: number,
  beats: readonly number[],
  snapOn: boolean,
): number {
  if (!snapOn || beats.length === 0) return sample;
  const snapped = snapEdgeToBeat([...beats], sample / sampleRate, Number.POSITIVE_INFINITY);
  return Math.round(snapped * sampleRate);
}

// ---- arrange cores (editor-explicit; one history entry per call) ----

function clipEdit(
  ed: AudioProjectEditor,
  trackId: string,
  label: string,
  before: AudioClip[],
  after: ClipTrack,
): void {
  ed.executeClipEdit(trackId, label, before, after.clips, []);
  sweepAssets(ed.project);
}

/** Drag the clip body to an absolute start: kernel-clamped into the free gap. */
export function arrangeMoveClip(
  ed: AudioProjectEditor,
  trackId: string,
  clipId: string,
  targetStart: number,
): boolean {
  try {
    const track = ed.project.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return false;
    const before = track.clips;
    const delta = Math.round(targetStart) - clip.start;
    clipEdit(ed, trackId, 'move clip', before, moveClip({ clips: before }, clipId, delta).track);
    return true;
  } catch {
    return false;
  }
}

/** Drag a clip edge (kernel bounds: neighbours + asset length). */
export function arrangeTrimClip(
  ed: AudioProjectEditor,
  trackId: string,
  clipId: string,
  edge: 'start' | 'end',
  at: number,
): boolean {
  try {
    const track = ed.project.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return false;
    const assetLen = ed.project.assets[clip.assetId]?.channels[0]?.length ?? 0;
    const before = track.clips;
    clipEdit(
      ed,
      trackId,
      'trim clip',
      before,
      trimClip({ clips: before }, clipId, edge, Math.round(at), assetLen).track,
    );
    return true;
  } catch {
    return false;
  }
}

/** Split at a timeline sample (edges are a no-op). */
export function arrangeSplitClip(
  ed: AudioProjectEditor,
  trackId: string,
  clipId: string,
  at: number,
): boolean {
  try {
    const track = ed.project.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const before = track.clips;
    clipEdit(ed, trackId, 'split clip', before, splitClip({ clips: before }, clipId, Math.round(at)).track);
    return true;
  } catch {
    return false;
  }
}

/** Clone right after the clip (shares the asset); false when there is no room. */
export function arrangeDuplicateClip(
  ed: AudioProjectEditor,
  trackId: string,
  clipId: string,
): boolean {
  try {
    const track = ed.project.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const before = track.clips;
    dupSeq += 1;
    const newId = `dup${dupSeq.toString(36)}_${clipId}`;
    clipEdit(ed, trackId, 'duplicate clip', before, duplicateClip({ clips: before }, clipId, newId).track);
    return true;
  } catch {
    return false;
  }
}
let dupSeq = 0;

/** Remove the clip (the asset rides the history entry until undo can't need it). */
export function arrangeDeleteClip(
  ed: AudioProjectEditor,
  trackId: string,
  clipId: string,
): boolean {
  const track = ed.project.tracks.find((t) => t.id === trackId);
  if (!track) return false;
  const before = track.clips;
  const after = removeClip({ clips: before }, clipId);
  if (after.clips.length === before.length) return false; // unknown id
  clipEdit(ed, trackId, 'delete clip', before, after);
  return true;
}

/** Convenience: find the clip under a timeline sample on one lane. */
export function clipAtSample(project: ProjectState, trackId: string, sample: number): AudioClip | null {
  const track: TrackState | undefined = project.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  return findClipAt({ clips: track.clips }, sample) ?? null;
}

// ---- selection + signal-facing commands (canvas + keyboard) ----

import { signal } from '@preact/signals';
import { activeTrackId, cursorPos, snapToBeat } from './state';
import {
  clipArrangement,
  projectEditor,
  syncProject,
} from './projectActions';

/** The selected clip (per project-lane); null when nothing is selected. */
export const activeClip = signal<{ trackId: string; clipId: string } | null>(null);

/**
 * Live drag preview (canvas redraws from this while a gesture is in
 * flight); committed through the history on pointer-up, then cleared.
 */
export const dragPreview = signal<{ trackId: string; clips: AudioClip[] } | null>(null);

export function selectClip(selection: { trackId: string; clipId: string } | null): void {
  activeClip.value = selection;
}

/** The selection, validated against the live arrangement (stale → null). */
export function selectedClip(): { trackId: string; clipId: string } | null {
  const selection = activeClip.value;
  if (!selection) return null;
  const clips = clipArrangement(selection.trackId);
  return clips?.some((c) => c.id === selection.clipId) ? selection : null;
}

function commitWrapper(ok: boolean): boolean {
  if (ok) syncProject();
  return ok;
}

/** Split the selected clip (or the clip under the cursor) at the playhead. */
export function splitSelectedAtCursor(): boolean {
  const ed = projectEditor();
  if (!ed) return false;
  const selection = selectedClip();
  const sample = Math.round(cursorPos.value * ed.project.sampleRate);
  const trackId = selection?.trackId ?? activeTrackId.value;
  let clipId = selection?.clipId ?? null;
  if (!clipId && trackId) clipId = clipAtSample(ed.project, trackId, sample)?.id ?? null;
  if (!trackId || !clipId) return false;
  return commitWrapper(arrangeSplitClip(ed, trackId, clipId, sample));
}

/** Ctrl+D: clone the selected clip right after itself. */
export function duplicateSelectedClip(): boolean {
  const ed = projectEditor();
  const selection = selectedClip();
  if (!ed || !selection) return false;
  return commitWrapper(arrangeDuplicateClip(ed, selection.trackId, selection.clipId));
}

/** Delete the selected clip; false lets the caller fall back to doc delete. */
export function deleteSelectedClip(): boolean {
  const ed = projectEditor();
  const selection = selectedClip();
  if (!ed || !selection) return false;
  const ok = arrangeDeleteClip(ed, selection.trackId, selection.clipId);
  if (ok) {
    selectClip(null);
    syncProject();
  }
  return ok;
}

/** Snap helper for gestures: beats when the D5 toggle is on, else free. */
export function snapForDrag(sample: number, sampleRate: number, beats: readonly number[]): number {
  return snapClipPosition(sample, sampleRate, beats, snapToBeat.value);
}
