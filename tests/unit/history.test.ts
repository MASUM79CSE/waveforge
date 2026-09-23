import { describe, expect, test } from 'vitest';
import { History, type HistoryEntry } from '../../src/engine/history';

function entry(label: string, bytes: number): HistoryEntry {
  return {
    label,
    bytes,
    undoOps: [{ kind: 'remove', at: 0, len: 1 }],
    redoOps: [{ kind: 'insert', at: 0, data: [new Float32Array(1)] }],
  };
}

describe('History', () => {
  test('push enables undo; undo enables redo; new push clears redo', () => {
    const h = new History({ maxBytes: 1000, minKeep: 2 });
    expect(h.canUndo()).toBe(false);

    h.push(entry('a', 10));
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);

    const undone = h.undo();
    expect(undone?.label).toBe('a');
    expect(h.canRedo()).toBe(true);

    h.push(entry('b', 10));
    expect(h.canRedo()).toBe(false); // redo tail cleared by the new push
  });

  test('undo/redo walk the stack in order', () => {
    const h = new History({ maxBytes: 1000, minKeep: 2 });
    h.push(entry('a', 1));
    h.push(entry('b', 1));

    expect(h.undo()?.label).toBe('b');
    expect(h.undo()?.label).toBe('a');
    expect(h.undo()).toBeNull();

    expect(h.redo()?.label).toBe('a');
    expect(h.redo()?.label).toBe('b');
    expect(h.redo()).toBeNull();
  });

  test('drops oldest entries beyond the byte budget but keeps minKeep', () => {
    const h = new History({ maxBytes: 100, minKeep: 2 });
    h.push(entry('e1', 40));
    h.push(entry('e2', 40));
    h.push(entry('e3', 40)); // 120 > 100, but minKeep 2 → keep e2, e3

    expect(h.undo()?.label).toBe('e3');
    expect(h.undo()?.label).toBe('e2');
    expect(h.undo()).toBeNull(); // e1 was trimmed
  });

  test('undo past a trimmed entry is not possible (no holes)', () => {
    const h = new History({ maxBytes: 50, minKeep: 1 });
    h.push(entry('e1', 30));
    h.push(entry('e2', 30));
    h.push(entry('e3', 30));

    const labels: string[] = [];
    for (;;) {
      const e = h.undo();
      if (!e) break;
      labels.push(e.label);
    }
    expect(labels).toEqual(['e3']); // budget 50 keeps only the newest
  });

  test('clear empties both directions', () => {
    const h = new History({ maxBytes: 1000, minKeep: 1 });
    h.push(entry('a', 1));
    h.undo();
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  test('tracks total retained bytes', () => {
    const h = new History({ maxBytes: 1000, minKeep: 2 });
    h.push(entry('a', 32));
    h.push(entry('b', 16));
    expect(h.retainedBytes()).toBe(48);
  });
});
