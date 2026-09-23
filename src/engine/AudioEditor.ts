/**
 * AudioEditor — orchestration of destructive edits + history (ADR 002).
 * Stage-then-swap: every operation produces a brand-new AudioDocument;
 * the previous document is never mutated (Build Plan §6.3).
 */
import { AudioDocument, type AudioBufferLike } from './AudioDocument';
import { applyOps, type EditOutcome } from './editOps';
import { History } from './history';

export type BufferFactory = (channels: Float32Array[], sampleRate: number) => AudioBufferLike;

export interface AudioEditorOptions {
  maxBytes: number;
  minKeep: number;
}

export class AudioEditor {
  private document: AudioDocument | null = null;
  private readonly history: History;

  constructor(
    private readonly factory: BufferFactory,
    options: AudioEditorOptions,
  ) {
    this.history = new History(options);
  }

  get doc(): AudioDocument | null {
    return this.document;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  /** Adopt a freshly loaded document (clears history — new editing session). */
  adopt(doc: AudioDocument): void {
    this.document = doc;
    this.history.clear();
  }

  /** Drop the document and clear history (document closed). */
  reset(): void {
    this.document = null;
    this.history.clear();
  }

  currentChannels(): Float32Array[] {
    const doc = this.document;
    if (!doc) return [];
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < doc.channels; ++ch) channels.push(doc.channelData(ch));
    return channels;
  }

  /** Apply an edit outcome: returns the staged replacement document. */
  execute(outcome: EditOutcome, label: string): AudioDocument | null {
    const current = this.document;
    if (!current) return null;
    const buffer = this.factory(outcome.channels, current.sampleRate);
    const doc = new AudioDocument(buffer, { ...current.meta });
    this.document = doc;
    this.history.push({
      label,
      bytes: outcome.bytes,
      undoOps: outcome.undoOps,
      redoOps: outcome.redoOps,
    });
    return doc;
  }

  undo(): { doc: AudioDocument; label: string } | null {
    const entry = this.history.undo();
    if (!entry || !this.document) return null;
    return { doc: this.applyEntry(entry.undoOps), label: entry.label };
  }

  redo(): { doc: AudioDocument; label: string } | null {
    const entry = this.history.redo();
    if (!entry || !this.document) return null;
    return { doc: this.applyEntry(entry.redoOps), label: entry.label };
  }

  private applyEntry(ops: ReturnType<() => EditOutcome['undoOps']>): AudioDocument {
    const current = this.document;
    if (!current) throw new Error('applyEntry without a document');
    const channels = applyOps(this.currentChannels(), ops);
    const buffer = this.factory(channels, current.sampleRate);
    const doc = new AudioDocument(buffer, { ...current.meta });
    this.document = doc;
    return doc;
  }
}
