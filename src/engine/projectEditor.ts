/**
 * AudioProjectEditor — multitrack editing shell (M8c, docs/multitrack-plan.md).
 * Owns the ProjectState (tracks carry their channel arrays) and ONE project
 * history: slice-op entries are tagged with their trackId, structural ops
 * (add/remove track) ride as dedicated op payloads. LIFO undo/redo keeps
 * structural + edit entries consistent by construction. Pure data — buffers
 * for transport/UI are built by the app layer.
 */
import { applyOps, type EditOutcome } from './editOps';
import { History, type HistoryEntry, type HistoryOptions } from './history';
import { createTrack, type ProjectState, type TrackState } from './project';

export function newProject(
  sampleRate: number,
  tracks: TrackState[] = [],
  activeTrackId: string | null = tracks[0]?.id ?? null,
): ProjectState {
  return { sampleRate, tracks, activeTrackId };
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

  /** Live channel arrays of a track (null if the id is unknown). */
  trackChannels(trackId: string): Float32Array[] | null {
    return this.state.tracks.find((t) => t.id === trackId)?.channels ?? null;
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

  /** Apply a region outcome to one track. Undoable. */
  executeTrackEdit(trackId: string, outcome: EditOutcome, label: string): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) throw new Error(`executeTrackEdit: unknown track ${trackId}`);
    track.channels = outcome.channels;
    this.history.push({
      label,
      bytes: outcome.bytes,
      undoOps: outcome.undoOps,
      redoOps: outcome.redoOps,
      trackId,
    });
  }

  /** Add a lane (undoable — the track data rides the entries). */
  addTrack(track: TrackState): void {
    this.state.tracks.push(track);
    const bytes = byteOf(track);
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
      bytes: byteOf(track!),
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
    if (projectOp) {
      if (projectOp.kind === 'removeTrackById') {
        const i = this.state.tracks.findIndex((t) => t.id === projectOp.trackId);
        if (i >= 0) this.state.tracks.splice(i, 1);
        return;
      }
      const idx = Math.min(projectOp.index, this.state.tracks.length);
      this.state.tracks.splice(idx, 0, projectOp.track);
      return;
    }
    if (entry.trackId) {
      const track = this.state.tracks.find((t) => t.id === entry.trackId);
      if (!track) throw new Error(`history: track ${entry.trackId} missing during ${dir}`);
      track.channels = applyOps(track.channels, dir === 'undo' ? entry.undoOps : entry.redoOps);
    }
  }
}

function byteOf(track: TrackState): number {
  return track.channels.reduce((acc, ch) => acc + ch.length * 4, 0);
}
