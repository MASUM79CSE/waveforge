import { describe, expect, test } from 'vitest';
import {
  defaultMarkerName,
  insertMarker,
  moveMarker,
  nearestMarker,
  nextMarker,
  prevMarker,
  removeMarker,
  renameMarker,
  type Marker,
} from '../../src/engine/markers';

const m = (id: string, t: number, label = id): Marker => ({ id, t, label });

describe('PF-01 marker kernel (AM-07)', () => {
  test('insert keeps sort order, rejects duplicates and bad input', () => {
    let list = insertMarker([], m('a', 100));
    list = insertMarker(list, m('b', 50));
    list = insertMarker(list, m('c', 75));
    expect(list.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(() => insertMarker(list, m('a', 1))).toThrow(/duplicate/);
    expect(() => insertMarker(list, m('d', -1))).toThrow(/bad position/);
    expect(() => insertMarker(list, { id: '', t: 1, label: '' })).toThrow(/missing id/);
  });

  test('labels are clamped to 200 chars', () => {
    const list = insertMarker([], m('a', 0, 'x'.repeat(500)));
    expect(list[0]!.label.length).toBe(200);
  });

  test('remove / rename / move', () => {
    let list = [m('a', 10), m('b', 20), m('c', 30)];
    list = removeMarker(list, 'b');
    expect(list.map((x) => x.id)).toEqual(['a', 'c']);
    expect(removeMarker(list, 'zz')).toBe(list); // no-op returns same array
    list = renameMarker(list, 'a', 'Verse');
    expect(list[0]!.label).toBe('Verse');
    list = moveMarker(list, 'a', 40);
    expect(list.map((x) => x.id)).toEqual(['c', 'a']); // re-sorted
  });

  test('prev/next navigation edges', () => {
    const list = [m('a', 100), m('b', 200), m('c', 300)];
    expect(prevMarker(list, 250)?.id).toBe('b');
    expect(prevMarker(list, 100)).toBeNull(); // strictly before
    expect(prevMarker(list, 101)?.id).toBe('a');
    expect(prevMarker([], 5)).toBeNull();
    expect(nextMarker(list, 100)?.id).toBe('b');
    expect(nextMarker(list, 300)).toBeNull();
    expect(nextMarker(list, 0)?.id).toBe('a');
  });

  test('nearest within radius', () => {
    const list = [m('a', 100), m('b', 400)];
    expect(nearestMarker(list, 120, 50)?.id).toBe('a');
    expect(nearestMarker(list, 200, 50)).toBeNull();
    expect(nearestMarker(list, 380, 30)?.id).toBe('b');
  });

  test('defaultMarkerName finds the first free Marker N', () => {
    let list = insertMarker([], m('a', 0, 'Marker 1'));
    expect(defaultMarkerName(list)).toBe('Marker 2');
    list = insertMarker(list, m('b', 10, 'Marker 2'));
    list = insertMarker(list, m('c', 20, 'chorus'));
    expect(defaultMarkerName(list)).toBe('Marker 3');
    list = removeMarker(list, 'b');
    expect(defaultMarkerName(list)).toBe('Marker 2'); // gap reused
  });
});
