import { describe, expect, test } from 'vitest';
import {
  ensureVisible,
  fitView,
  setStart,
  timeAtX,
  viewDuration,
  xAtTime,
  zoomAt,
  type ViewEnv,
  type ViewState,
} from '../../src/engine/viewState';
import { MAX_SPP } from '../../src/core/zoom';

/** 100 s at 100 Hz = 10 000 samples; 1000 px wide. spp=10 fits exactly. */
const ENV: ViewEnv = { cssW: 1000, duration: 100, sampleRate: 100 };
const FITTED: ViewState = { spp: 10, start: 0 };

describe('fitView', () => {
  test('zooms to fit the whole file exactly', () => {
    expect(fitView(ENV)).toEqual(FITTED);
  });

  test('is safe with a zero-width viewport', () => {
    const view = fitView({ ...ENV, cssW: 0 });
    expect(view.start).toBe(0);
  });
});

describe('zoomAt', () => {
  test('keeps the center time fixed at ratio 0.5', () => {
    const zoomed = zoomAt(FITTED, ENV, 2, 0.5);
    expect(zoomed.spp).toBe(5);
    const centerBefore = timeAtX(FITTED, ENV, 500);
    const centerAfter = timeAtX(zoomed, ENV, 500);
    expect(centerAfter).toBeCloseTo(centerBefore, 6);
  });

  test('zooming at the left edge keeps the left edge anchored', () => {
    const zoomed = zoomAt(FITTED, ENV, 2, 0);
    expect(zoomed.spp).toBe(5);
    expect(zoomed.start).toBe(0);
  });

  test('clamps zoom-out to MAX_SPP and pins start to 0', () => {
    const zoomed = zoomAt(FITTED, ENV, 1e-9, 0.5);
    expect(zoomed.spp).toBe(MAX_SPP);
    expect(zoomed.start).toBe(0);
  });

  test('panning right clamps at the end of the file', () => {
    const zoomed = zoomAt(FITTED, ENV, 0.5, 0.5); // spp 20 → view 200 s > file
    expect(zoomed.spp).toBe(20);
    expect(zoomed.start).toBe(0);
  });
});

describe('setStart', () => {
  test('clamps to the scrollable range', () => {
    expect(setStart({ spp: 10, start: 0 }, ENV, -5).start).toBe(0);
    expect(setStart({ spp: 10, start: 0 }, ENV, 50).start).toBe(0); // view == file → max start 0
    const tight = setStart({ spp: 2, start: 0 }, ENV, 500);
    expect(tight.start).toBe(80); // view = 20 s → max start 80
  });

  test('allows the full range when zoomed in', () => {
    expect(setStart({ spp: 2, start: 0 }, ENV, 80).start).toBe(80);
  });
});

describe('coordinate mapping', () => {
  test('timeAtX / xAtTime round-trip', () => {
    const t = 37.5;
    expect(timeAtX(FITTED, ENV, xAtTime(FITTED, ENV, t))).toBeCloseTo(t, 6);
  });

  test('viewDuration = cssW * spp / sampleRate', () => {
    expect(viewDuration(FITTED, ENV)).toBe(100);
  });
});

describe('ensureVisible', () => {
  test('keeps the view when the time is visible', () => {
    const next = ensureVisible({ spp: 2, start: 10 }, ENV, 20);
    expect(next.start).toBe(10);
  });

  test('jumps back when the cursor is before the view', () => {
    const next = ensureVisible({ spp: 2, start: 50 }, ENV, 10);
    expect(next.start).toBeLessThan(10); // leads by 10% of the 20 s view
    expect(next.start).toBeGreaterThanOrEqual(0);
  });

  test('jumps forward when the cursor is beyond the view end', () => {
    const next = ensureVisible({ spp: 2, start: 0 }, ENV, 70);
    expect(next.start).toBeGreaterThan(40);
  });
});
