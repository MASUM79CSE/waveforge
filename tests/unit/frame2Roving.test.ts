// UX-2.2 — APG toolbar roving core (pure logic; DOM wrapper e2e-tested).
// Contract (CLEAN_ROOM_LOG row 2): one tab stop; ArrowLeft/Right rove with
// wrap; Home/End first/last; disabled controls are skipped by arrows but the
// toolbar's initial tab can land on the first ENABLED control (disabled stay
// focusable with aria-disabled per INTERACTIONS.md §3); first entry focuses
// first enabled control, re-entry restores last focused.

import { describe, expect, test } from 'vitest';
import {
  firstEnabled,
  nextAfterArrow,
  resolveInitial,
  type ToolbarItemState,
} from '../../src/app/frame2/roving';

const items = (enabled: string, disabled = ''): ToolbarItemState[] =>
  (enabled + disabled).split('').map((id) => ({ id, disabled: disabled.includes(id) }));

describe('frame2 roving core', () => {
  test('firstEnabled skips leading disabled items', () => {
    expect(firstEnabled(items('abc', 'de'))).toBe(0);
    expect(
      firstEnabled([
        { id: 'a', disabled: true },
        { id: 'b', disabled: true },
        { id: 'c', disabled: false },
      ]),
    ).toBe(2);
  });

  test('firstEnabled returns null when everything is disabled', () => {
    expect(firstEnabled(items('', 'abc'))).toBeNull();
  });

  test('ArrowRight moves forward, wrapping at the end', () => {
    const list = items('abcd');
    expect(nextAfterArrow(list, 'c', 'ArrowRight')?.id).toBe('d');
    expect(nextAfterArrow(list, 'd', 'ArrowRight')?.id).toBe('a');
  });

  test('ArrowLeft moves backward, wrapping at the start', () => {
    const list = items('abcd');
    expect(nextAfterArrow(list, 'b', 'ArrowLeft')?.id).toBe('a');
    expect(nextAfterArrow(list, 'a', 'ArrowLeft')?.id).toBe('d');
  });

  test('arrows skip disabled items (wrap across them too)', () => {
    const list = items('ac', 'b'); // b disabled
    expect(nextAfterArrow(list, 'a', 'ArrowRight')?.id).toBe('c');
    expect(nextAfterArrow(list, 'c', 'ArrowRight')?.id).toBe('a');
    expect(nextAfterArrow(list, 'c', 'ArrowLeft')?.id).toBe('a');
    expect(nextAfterArrow(list, 'a', 'ArrowLeft')?.id).toBe('c');
  });

  test('arrows in a fully-disabled toolbar never move', () => {
    const list = items('', 'abc');
    expect(nextAfterArrow(list, 'a', 'ArrowRight')?.id).toBe('a');
    expect(nextAfterArrow(list, 'a', 'ArrowLeft')?.id).toBe('a');
  });

  test('Home/End go to first/last ENABLED item', () => {
    const list = items('bcd', 'a');
    expect(nextAfterArrow(list, 'd', 'Home')?.id).toBe('b');
    expect(nextAfterArrow(list, 'b', 'End')?.id).toBe('d');
  });

  test('resolveInitial: first visit lands on first enabled; revisit restores last focus', () => {
    const list = items('abcd');
    expect(resolveInitial(list, null)?.id).toBe('a');
    expect(resolveInitial(list, 'c')?.id).toBe('c');
  });

  test('resolveInitial falls back to first enabled when last focus was disabled/removed', () => {
    const list = items('bcd', 'a');
    expect(resolveInitial(list, 'a')?.id).toBe('b');
    expect(resolveInitial(list, 'zz')?.id).toBe('b');
  });

  test('up/down duplicate left/right per APG (no vertical-only controls by construction)', () => {
    const list = items('abcd');
    expect(nextAfterArrow(list, 'a', 'ArrowDown')?.id).toBe(nextAfterArrow(list, 'a', 'ArrowRight')?.id);
    expect(nextAfterArrow(list, 'b', 'ArrowUp')?.id).toBe(nextAfterArrow(list, 'b', 'ArrowLeft')?.id);
  });
});
