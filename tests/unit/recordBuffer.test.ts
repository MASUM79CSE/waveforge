import { describe, expect, test } from 'vitest';
import { RecordBuffer } from '../../src/engine/recordBuffer';

function chunk(values: number[]): Float32Array {
  return new Float32Array(values);
}

describe('RecordBuffer', () => {
  test('accumulates chunks per channel and reports sample count', () => {
    const buf = new RecordBuffer(2);
    buf.push([chunk([1, 2, 3]), chunk([10, 20, 30])]);
    buf.push([chunk([4, 5]), chunk([40, 50])]);
    expect(buf.length).toBe(5);
    const snap = buf.snapshot();
    expect(snap).toHaveLength(2);
    expect(Array.from(snap[0] ?? [])).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(snap[1] ?? [])).toEqual([10, 20, 30, 40, 50]);
  });

  test('mono input works', () => {
    const buf = new RecordBuffer(1);
    buf.push([chunk([0.5])]);
    const snap = buf.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]?.length).toBe(1);
  });

  test('trims to the final recorded length (worklet over-allocates)', () => {
    const buf = new RecordBuffer(1);
    buf.push([chunk([1, 2, 3, 4])]);
    expect(buf.trim(2)).toBe(true);
    expect(buf.length).toBe(2);
    expect(Array.from(buf.snapshot()[0] ?? [])).toEqual([1, 2]);
  });

  test('trim past the recorded length is rejected (no padding with junk)', () => {
    const buf = new RecordBuffer(1);
    buf.push([chunk([1, 2, 3])]);
    expect(buf.trim(10)).toBe(false);
    expect(buf.length).toBe(3);
  });

  test('reset clears everything for the next take', () => {
    const buf = new RecordBuffer(2);
    buf.push([chunk([1]), chunk([2])]);
    buf.reset();
    expect(buf.length).toBe(0);
    expect(buf.snapshot()).toHaveLength(2);
    expect(buf.snapshot()[0]?.length).toBe(0);
  });

  test('pushing mismatched channel counts throws (contract violation)', () => {
    const buf = new RecordBuffer(2);
    expect(() => buf.push([chunk([1])])).toThrow();
  });

  test('grow beyond initial capacity across many chunks', () => {
    const buf = new RecordBuffer(1);
    for (let i = 0; i < 100; ++i) buf.push([chunk([i, i + 0.5])]);
    expect(buf.length).toBe(200);
    const data = buf.snapshot()[0] ?? [];
    expect(data[198]).toBeCloseTo(99, 5);
    expect(data[199]).toBeCloseTo(99.5, 5);
  });
});
