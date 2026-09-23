import { describe, expect, test } from 'vitest';
import { buildMip, sliceTile } from '../../src/engine/peaksCompute';

describe('buildMip', () => {
  test('computes exact min/max per bucket', () => {
    const data = new Float32Array([0.5, -1, 0.25, 0.875, 0, -0.25]);
    const mip = buildMip(data, 2);
    expect(Array.from(mip.mins)).toEqual([-1, 0.25, -0.25]);
    expect(Array.from(mip.maxs)).toEqual([0.5, 0.875, 0]);
  });

  test('handles a partial final bucket', () => {
    const data = new Float32Array([1, -1, 1, -1, 0.75]);
    const mip = buildMip(data, 4);
    expect(mip.mins.length).toBe(2);
    expect(mip.maxs[1]).toBe(0.75);
    expect(mip.mins[1]).toBe(0.75);
  });

  test('single-sample level equals the data itself', () => {
    const data = new Float32Array([0.5, -0.5]);
    const mip = buildMip(data, 1);
    expect(Array.from(mip.mins)).toEqual([0.5, -0.5]);
  });

  test('empty data yields empty mip', () => {
    const mip = buildMip(new Float32Array(0), 16);
    expect(mip.mins.length).toBe(0);
  });
});

describe('sliceTile', () => {
  const data = new Float32Array([0.5, -1, 0.25, 0.875, 0, -0.25]);
  const mip = buildMip(data, 2);

  test('slices a full tile', () => {
    const tile = sliceTile(mip, 0, 2);
    expect(tile).not.toBeNull();
    expect(tile?.count).toBe(2);
    expect(Array.from(tile?.mins ?? [])).toEqual([-1, 0.25]);
  });

  test('slices a partial tile at the end', () => {
    const tile = sliceTile(mip, 1, 2);
    expect(tile?.count).toBe(1);
    expect(Array.from(tile?.mins ?? [])).toEqual([-0.25]);
  });

  test('returns null beyond the data', () => {
    expect(sliceTile(mip, 5, 2)).toBeNull();
  });
});
