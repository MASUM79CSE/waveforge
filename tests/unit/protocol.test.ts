import { describe, expect, test } from 'vitest';
import { PEAK_TILE, tilesForRange } from '../../src/engine/protocol';
import {
  initRequestSchema,
  rawResponseSchema,
  tilesRequestSchema,
  tilesResponseSchema,
} from '../../src/engine/protocol';

describe('tilesForRange', () => {
  test('single tile when the range is inside one tile', () => {
    const reqs = tilesForRange(0, 16, 0, 100);
    expect(reqs).toEqual([{ ch: 0, level: 16, tile: 0 }]);
  });

  test('crossing a tile boundary produces both tiles', () => {
    const boundary = 16 * PEAK_TILE; // first bucket of tile 1
    const reqs = tilesForRange(1, 16, boundary - 1, boundary + 1);
    expect(reqs).toEqual([
      { ch: 1, level: 16, tile: 0 },
      { ch: 1, level: 16, tile: 1 },
    ]);
  });

  test('empty range yields no requests', () => {
    expect(tilesForRange(0, 16, 500, 500)).toEqual([]);
  });

  test('last sample of the range is included', () => {
    const lastBucket = 3 * 16 * PEAK_TILE;
    const reqs = tilesForRange(0, 16, 0, lastBucket + 1);
    expect(reqs.at(-1)).toEqual({ ch: 0, level: 16, tile: 3 });
  });
});

describe('message schemas', () => {
  test('initRequestSchema accepts transferred channel buffers', () => {
    const msg = { type: 'init', channels: [new ArrayBuffer(8), new ArrayBuffer(8)] };
    expect(initRequestSchema.safeParse(msg).success).toBe(true);
    expect(initRequestSchema.safeParse({ type: 'init', channels: [] }).success).toBe(false);
  });

  test('tilesRequestSchema validates request shape', () => {
    const msg = { type: 'tiles', id: 1, reqs: [{ ch: 0, level: 16, tile: 0 }] };
    expect(tilesRequestSchema.safeParse(msg).success).toBe(true);
    expect(tilesRequestSchema.safeParse({ type: 'tiles', id: 1, reqs: [{ ch: -1, level: 0, tile: 0 }] }).success).toBe(false);
  });

  test('tilesResponseSchema validates results with Float32Arrays', () => {
    const msg = {
      type: 'tiles',
      id: 3,
      results: [
        { ch: 0, level: 16, tile: 0, mins: new Float32Array(4), maxs: new Float32Array(4), count: 4 },
      ],
    };
    expect(tilesResponseSchema.safeParse(msg).success).toBe(true);
    expect(
      tilesResponseSchema.safeParse({
        type: 'tiles',
        id: 3,
        results: [{ ch: 0, level: 16, tile: 0, mins: [1], maxs: [1], count: 1 }],
      }).success,
    ).toBe(false);
  });

  test('rawResponseSchema validates a sample slice', () => {
    expect(
      rawResponseSchema.safeParse({ type: 'raw', id: 1, samples: new Float32Array(2) }).success,
    ).toBe(true);
    expect(rawResponseSchema.safeParse({ type: 'raw', id: 1, samples: [1, 2] }).success).toBe(false);
  });
});
