import { describe, expect, test } from 'vitest';
import { clampSeek, positionAt } from '../../src/engine/transportMath';

describe('positionAt (no loop)', () => {
  test('advances linearly with elapsed context time', () => {
    expect(positionAt(10, 100, 105, null, 1000)).toBe(15);
  });

  test('clamps at the end of the document', () => {
    expect(positionAt(999, 100, 200, null, 1000)).toBe(1000);
  });
});

describe('positionAt (loop region)', () => {
  const loop = { start: 0, end: 10 };

  test('wraps back to the loop start after passing the end', () => {
    expect(positionAt(8, 100, 104, loop, 1000)).toBeCloseTo(2, 6);
  });

  test('handles many wraps without drift', () => {
    expect(positionAt(0, 100, 205, loop, 1000)).toBeCloseTo(5, 6);
  });

  test('stays inside the region when starting mid-loop', () => {
    const mid = { start: 4, end: 8 };
    expect(positionAt(6, 100, 104, mid, 1000)).toBeCloseTo(6, 6); // 10 wraps to 4 + (6 % 4)
    expect(positionAt(6, 100, 106, mid, 1000)).toBeCloseTo(4, 6); // 12 wraps to 4 + (8 % 4)
  });

  test('exact landing on the loop end has not wrapped yet', () => {
    expect(positionAt(5, 100, 105, loop, 1000)).toBeCloseTo(10, 6);
  });
});

describe('clampSeek', () => {
  test('clamps into [0, duration]', () => {
    expect(clampSeek(-1, 100)).toBe(0);
    expect(clampSeek(50, 100)).toBe(50);
    expect(clampSeek(101, 100)).toBe(100);
  });
});
