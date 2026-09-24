/**
 * Undo/redo stack (ADR 002): entries carry only their changed slices plus
 * the ops that apply/undo them, so history memory is bounded by an explicit
 * byte budget with a guaranteed minimum number of kept steps.
 */
import type { SliceOp } from './editOps';

/** M8c: project-structural op riding beside (or instead of) slice-ops. */
export type ProjectHistoryOp =
  | { kind: 'removeTrackById'; trackId: string }
  | { kind: 'addTrackAt'; index: number; track: import('./project').TrackState };

export interface HistoryEntry {
  label: string;
  bytes: number;
  undoOps: SliceOp[];
  redoOps: SliceOp[];
  /** M8c: slice-op entries name the track they belong to. */
  trackId?: string;
  /** M8c: structural add/remove-track entries carry project ops instead. */
  projectUndo?: ProjectHistoryOp;
  projectRedo?: ProjectHistoryOp;
}

export interface HistoryOptions {
  maxBytes: number;
  minKeep: number;
}

export class History {
  private entries: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private totalBytes = 0;

  constructor(private readonly options: HistoryOptions) {}

  push(entry: HistoryEntry): void {
    this.entries.push(entry);
    this.totalBytes += entry.bytes;
    this.redoStack = [];
    this.trim();
  }

  undo(): HistoryEntry | null {
    const entry = this.entries.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.entries.push(entry);
    return entry;
  }

  canUndo(): boolean {
    return this.entries.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  retainedBytes(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.entries = [];
    this.redoStack = [];
    this.totalBytes = 0;
  }

  private trim(): void {
    while (
      this.totalBytes > this.options.maxBytes &&
      this.entries.length > this.options.minKeep
    ) {
      const oldest = this.entries.shift();
      if (!oldest) break;
      this.totalBytes -= oldest.bytes;
    }
  }
}
