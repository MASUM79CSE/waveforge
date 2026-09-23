import { describe, expect, test } from 'vitest';
import {
  clamp,
  clampSpp,
  niceTickFor,
  pickPeakLevel,
  zoomFactor,
} from '../../src/core/zoom';

describe('pickPeakLevel', () => {
  test('returns the coarsest standard level still finer than the zoom', () => {
    expect(pickPeakLevel(1)).toBe(16);
    expect(pickPeakLevel(100)).toBe(256);
    expect(pickPeakLevel(1024)).toBe(1024);
  });

  test('saturates at the largest level for extreme zoom-out', () => {
    expect(pickPeakLevel(70000)).toBe(65536);
  });
});

describe('zoomFactor', () => {
  test('is neutral for zero wheel delta', () => {
    expect(zoomFactor(0)).toBe(1);
  });

  test('clamps to the configured bounds', () => {
    expect(zoomFactor(-10000)).toBe(5);
    expect(zoomFactor(10000)).toBe(0.2);
  });

  test('grows exponentially with negative delta (zoom in)', () => {
    expect(zoomFactor(-100)).toBeGreaterThan(1);
    expect(zoomFactor(100)).toBeLessThan(1);
  });
});

describe('clampSpp', () => {
  test('clamps to the minimum samples-per-pixel', () => {
    expect(clampSpp(0.0001)).toBe(0.01);
  });

  test('clamps to the maximum samples-per-pixel', () => {
    expect(clampSpp(1e9)).toBe(262144);
  });

  test('passes through the valid range untouched', () => {
    expect(clampSpp(50)).toBe(50);
  });
});

describe('niceTickFor', () => {
  test('picks a coarse tick when zoomed out', () => {
    expect(niceTickFor(1024, 48000)).toBe(2);
  });

  test('picks a sub-second tick when zoomed in', () => {
    expect(niceTickFor(16, 44100)).toBe(0.05);
  });

  test('picks the finest tick at sample-level zoom', () => {
    expect(niceTickFor(0.05, 44100)).toBe(0.001);
  });

  test('respects a custom minimum pixel spacing', () => {
    expect(niceTickFor(1024, 48000, 200)).toBe(5);
  });
});

describe('clamp', () => {
  test('clamps within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
