import { describe, expect, test } from 'vitest';
import { AudioEditor, type BufferFactory } from '../../src/engine/AudioEditor';
import { AudioDocument } from '../../src/engine/AudioDocument';
import { makeCut, makeInsert } from '../../src/engine/editOps';
import type { AudioBufferLike } from '../../src/engine/AudioDocument';

/** Fake buffer factory: structural AudioBuffer without WebAudio. */
const factory: BufferFactory = (channels: Float32Array[], sampleRate: number): AudioBufferLike => {
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channels[ch] ?? new Float32Array(0),
  };
};

function makeDoc(values: number[], sampleRate = 8): AudioDocument {
  return new AudioDocument(factory([new Float32Array(values)], sampleRate), {
    name: 'test.wav',
    sizeBytes: values.length * 4,
    source: 'file',
  });
}

function dataOf(editor: AudioEditor): number[] {
  const doc = editor.doc;
  return Array.from(doc?.channelData(0) ?? []);
}

describe('AudioEditor (integration: ops + history)', () => {
  test('execute stages a new document without touching the previous one', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    editor.adopt(makeDoc([1, 2, 3, 4]));

    const before = editor.doc;
    const outcome = makeCut([new Float32Array([1, 2, 3, 4])], 1, 2);
    const next = editor.execute(outcome, 'Cut');

    expect(next).not.toBeNull();
    expect(editor.doc).not.toBe(before);
    expect(dataOf(editor)).toEqual([1, 4]);
    // immutable published doc: the previous buffers are untouched
    expect(Array.from(before?.channelData(0) ?? [])).toEqual([1, 2, 3, 4]);
  });

  test('undo/redo cycle restores identical samples (cut)', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    editor.adopt(makeDoc([1, 2, 3, 4, 5]));

    editor.execute(makeCut([new Float32Array([1, 2, 3, 4, 5])], 1, 2), 'Cut');
    expect(dataOf(editor)).toEqual([1, 4, 5]);

    const undone = editor.undo();
    expect(undone?.label).toBe('Cut');
    expect(dataOf(editor)).toEqual([1, 2, 3, 4, 5]);

    const redone = editor.redo();
    expect(redone?.label).toBe('Cut');
    expect(dataOf(editor)).toEqual([1, 4, 5]);
  });

  test('undo/redo cycle for insert (paste-style)', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    editor.adopt(makeDoc([1, 2, 3]));

    editor.execute(makeInsert([new Float32Array([1, 2, 3])], 1, [new Float32Array([9, 9])]), 'Paste');
    expect(dataOf(editor)).toEqual([1, 9, 9, 2, 3]);

    editor.undo();
    expect(dataOf(editor)).toEqual([1, 2, 3]);

    editor.redo();
    expect(dataOf(editor)).toEqual([1, 9, 9, 2, 3]);
  });

  test('undo/redo round-trip across sequential edits', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    const original = [0.5, -0.25, 0.75, -1, 0.125];
    editor.adopt(makeDoc(original));

    editor.execute(makeCut([new Float32Array(original)], 0, 2), 'Cut');
    editor.execute(makeInsert(editor.currentChannels(), 1, [new Float32Array([9])]), 'Paste');

    editor.undo(); // invert paste
    expect(dataOf(editor)).toEqual([0.75, -1, 0.125]);
    editor.undo(); // invert cut
    expect(dataOf(editor)).toEqual(original);

    editor.redo();
    editor.redo();
    expect(dataOf(editor)).toEqual([0.75, 9, -1, 0.125]);
  });

  test('undo with empty history returns null and keeps the document', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    editor.adopt(makeDoc([1]));
    expect(editor.undo()).toBeNull();
    expect(dataOf(editor)).toEqual([1]);
  });

  test('adopting a fresh document clears history', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    editor.adopt(makeDoc([1, 2, 3]));
    editor.execute(makeCut([new Float32Array([1, 2, 3])], 0, 1), 'Cut');
    editor.adopt(makeDoc([7]));

    expect(editor.canUndo()).toBe(false);
    expect(dataOf(editor)).toEqual([7]);
  });
});

describe('AudioEditor reset', () => {
  test('reset drops the document and clears history', () => {
    const editor = new AudioEditor(factory, { maxBytes: 1e9, minKeep: 10 });
    editor.adopt(makeDoc([1, 2, 3]));
    editor.execute(makeCut([new Float32Array([1, 2, 3])], 0, 1), 'Cut');
    expect(editor.canUndo()).toBe(true);

    editor.reset();
    expect(editor.doc).toBeNull();
    expect(editor.canUndo()).toBe(false);
    expect(editor.undo()).toBeNull();
  });
});
