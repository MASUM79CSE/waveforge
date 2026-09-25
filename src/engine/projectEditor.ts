/**
 * AudioProjectEditor — multitrack editing shell (M8c; M9d1 clip flip —
 * project model). Owns the ProjectState (lanes hold clip lists over
 * shared assets) and ONE project history: clip-arrangement edits ride as
 * {kind: 'setClips'} snapshots with the assets needed by either side
 * retained in the entry (bounce bytes charge here); structural ops
 * (add/remove track) ride as dedicated op payloads. LIFO undo/redo keeps
 * structural + arrangement entries consistent by construction. Pure data —
 * buffers for transport/UI are built by the app layer.
 */
import type { AudioAsset, AudioClip } from './clips';
import type { AutomationPoint } from './automation';
import { History, type HistoryEntry, type HistoryOptions } from './history';
import { createTrack, trackChannels, type ProjectState, type TrackState } from './project';

export function newProject(
  sampleRate: number,
  tracks: TrackState[] = [],
  activeTrackId: string | null = tracks[0]?.id ?? null,
): ProjectState {
  return { sampleRate, tracks, activeTrackId, assets: {} };
}

/** Create a track from channels (convenience wrapper over createTrack). */
export function addTrackChannels(
  channels: Float32Array[],
  name?: string,
): TrackState {
  return createTrack(channels, { name });
}

export class AudioProjectEditor {
  private state: ProjectState;
  private readonly history: History;

  constructor(state: ProjectState, historyOptions: HistoryOptions = { maxBytes: 250_000_000, minKeep: 100 }) {
    this.state = state;
    this.history = new History(historyOptions);
  }

  get project(): ProjectState {
    return this.state;
  }

  /** Live channel arrays of a track — rendered from its clips (null if unknown). */
  trackChannels(trackId: string): Float32Array[] | null {
    return trackChannels(this.state, trackId);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  retainedBytes(): number {
    return this.history.retainedBytes();
  }

  /** Adopt a fresh project (new editing session — history cleared). */
  adopt(state: ProjectState): void {
    this.state = state;
    this.history.clear();
  }

  /**
   * Apply a clip-arrangement edit to one lane. Undoable. `newAssets` are
   * registered into the project (bounce results); the entry retains every
   * asset needed by either side so undo can resurrect swept ones, and
   * charges their PCM bytes against the history budget.
   */
  executeClipEdit(
    trackId: string,
    label: string,
    before: AudioClip[],
    after: AudioClip[],
    newAssets: AudioAsset[],
  ): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) throw new Error(`executeClipEdit: unknown track ${trackId}`);
    for (const a of newAssets) this.state.assets[a.id] = a;
    track.clips = after;
    this.history.push({
      label,
      bytes: entryAssetBytes(before, after, this.state.assets, newAssets),
      undoOps: [],
      redoOps: [],
      projectUndo: { kind: 'setClips', trackId, clips: before },
      projectRedo: { kind: 'setClips', trackId, clips: after },
      clipAssets: entryAssets(before, after, this.state.assets),
    });
  }

  /** Set/remove one automation curve (A2). Undoable, 0-byte entry. */
  executeAutomationEdit(
    trackId: string,
    paramKey: string,
    before: AutomationPoint[],
    after: AutomationPoint[],
    label: string,
  ): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) throw new Error(`executeAutomationEdit: unknown track ${trackId}`);
    const apply = (points: AutomationPoint[]): void => {
      if (points.length === 0) {
        if (track.automation) delete track.automation[paramKey];
      } else {
        (track.automation ??= {})[paramKey] = points;
      }
    };
    apply(after);
    this.history.push({
      label,
      bytes: 0,
      undoOps: [],
      redoOps: [],
      projectUndo: { kind: 'setAutomation', trackId, paramKey, points: before },
      projectRedo: { kind: 'setAutomation', trackId, paramKey, points: after },
    });
  }

  /** Add a lane (undoable — the track data rides the entries). */
  addTrack(track: TrackState): void {
    this.state.tracks.push(track);
    const bytes = byteOf(track, this.state.assets);
    this.history.push({
      label: 'add track',
      bytes,
      undoOps: [],
      redoOps: [],
      projectUndo: { kind: 'removeTrackById', trackId: track.id },
      projectRedo: { kind: 'addTrackAt', index: this.state.tracks.length - 1, track },
    });
  }

  /** Remove a lane (undoable; data retained inside the entry). */
  removeTrack(trackId: string): void {
    const index = this.state.tracks.findIndex((t) => t.id === trackId);
    if (index < 0) return;
    const [track] = this.state.tracks.splice(index, 1);
    if (this.state.activeTrackId === trackId) this.state.activeTrackId = null;
    this.history.push({
      label: 'remove track',
      bytes: byteOf(track!, this.state.assets),
      undoOps: [],
      redoOps: [],
      projectUndo: { kind: 'addTrackAt', index, track: track! },
      projectRedo: { kind: 'removeTrackById', trackId },
    });
  }

  undo(): { label: string } | null {
    const entry = this.history.undo();
    if (!entry) return null;
    this.applyProjectSide(entry, 'undo');
    return { label: entry.label };
  }

  redo(): { label: string } | null {
    const entry = this.history.redo();
    if (!entry) return null;
    this.applyProjectSide(entry, 'redo');
    return { label: entry.label };
  }

  private applyProjectSide(entry: HistoryEntry, dir: 'undo' | 'redo'): void {
    const projectOp = dir === 'undo' ? entry.projectUndo : entry.projectRedo;
    if (!projectOp) return;
    if (projectOp.kind === 'removeTrackById') {
      const i = this.state.tracks.findIndex((t) => t.id === projectOp.trackId);
      if (i >= 0) this.state.tracks.splice(i, 1);
      return;
    }
    if (projectOp.kind === 'setAutomation') {
      const lane = this.state.tracks.find((t) => t.id === projectOp.trackId);
      if (!lane) throw new Error(`history: track ${projectOp.trackId} missing during ${dir}`);
      if (projectOp.points.length === 0) {
        if (lane.automation) delete lane.automation[projectOp.paramKey];
      } else {
        (lane.automation ??= {})[projectOp.paramKey] = projectOp.points;
      }
      return;
    }
    if (projectOp.kind === 'setClips') {
      // resurrect assets the entry retained but a sweep dropped
      for (const a of entry.clipAssets ?? []) {
        if (!this.state.assets[a.id]) this.state.assets[a.id] = a;
      }
      const track = this.state.tracks.find((t) => t.id === projectOp.trackId);
      if (!track) throw new Error(`history: track ${projectOp.trackId} missing during ${dir}`);
      track.clips = projectOp.clips;
      return;
    }
    const idx = Math.min(projectOp.index, this.state.tracks.length);
    this.state.tracks.splice(idx, 0, projectOp.track);
  }
}

/** Assets needed by either side of a clip entry (deduped by id). */
function entryAssets(
  before: AudioClip[],
  after: AudioClip[],
  assets: Record<string, AudioAsset>,
): AudioAsset[] {
  const ids = new Set<string>();
  for (const c of before) ids.add(c.assetId);
  for (const c of after) ids.add(c.assetId);
  const out: AudioAsset[] = [];
  for (const id of ids) {
    const a = assets[id];
    if (a) out.push(a);
  }
  return out;
}

/** History charge: PCM bytes of assets newly introduced by this entry. */
function entryAssetBytes(
  before: AudioClip[],
  after: AudioClip[],
  assets: Record<string, AudioAsset>,
  newAssets: AudioAsset[],
): number {
  const beforeIds = new Set(before.map((c) => c.assetId));
  const afterIds = new Set(after.map((c) => c.assetId));
  let bytes = 0;
  const charged = new Set<string>();
  for (const a of newAssets) {
    if (beforeIds.has(a.id) || charged.has(a.id)) continue;
    charged.add(a.id);
    bytes += pcmBytes(a);
  }
  // entries replacing clips may still introduce assets added earlier outside
  // an entry (e.g. the factory asset on registration) — charge those too
  for (const id of afterIds) {
    if (beforeIds.has(id) || charged.has(id)) continue;
    const a = assets[id];
    if (a) {
      charged.add(id);
      bytes += pcmBytes(a);
    }
  }
  return bytes;
}

function pcmBytes(a: AudioAsset): number {
  return a.channels.reduce((acc, ch) => acc + ch.length * 4, 0);
}

function byteOf(track: TrackState, assets: Record<string, AudioAsset>): number {
  const seen = new Set<string>();
  let bytes = 0;
  for (const c of track.clips) {
    if (seen.has(c.assetId)) continue;
    seen.add(c.assetId);
    const a = assets[c.assetId];
    if (a) bytes += pcmBytes(a);
  }
  return bytes;
}
