import { describe, expect, test } from 'vitest';
import { pickRedoTarget, pickUndoTarget } from '../../src/app/undoPolicy';

describe('M8d undo policy — doc/project stack ordering', () => {
  test('only one stack actionable → that stack; neither → null', () => {
    expect(pickUndoTarget(0, 0, true, false)).toBe('doc');
    expect(pickUndoTarget(0, 0, false, true)).toBe('project');
    expect(pickUndoTarget(0, 0, false, false)).toBeNull();
    expect(pickRedoTarget(0, 0, false, false)).toBeNull();
  });

  test('both actionable → the most recent op wins (later timestamp)', () => {
    expect(pickUndoTarget(100, 200, true, true)).toBe('project');
    expect(pickUndoTarget(300, 200, true, true)).toBe('doc');
  });

  test('exact tie → doc (single-document parity)', () => {
    expect(pickUndoTarget(100, 100, true, true)).toBe('doc');
  });

  test('redo mirrors undo with its own timestamps', () => {
    expect(pickRedoTarget(10, 20, true, true)).toBe('project');
    expect(pickRedoTarget(50, 20, true, true)).toBe('doc');
  });
});
