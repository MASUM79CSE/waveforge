import { describe, expect, test } from 'vitest';
import {
  automationMode,
  curveYIn,
  fxCurvesDraft,
  fxCurvesOrUndefined,
  fxEnvelopeParam,
  fxRegionLen,
  beginEnvelopeGesture,
  dragEnvelopeTo,
  hitPointIn,
  removeEnvelopePointAt,
  removeFxCurve,
  resetFxCurves,
  setFxCurvePoints,
  setFxCurveRegion,
  toggleFxCurveParam,
  valueAtIn,
  type OverlayGeom,
  type ValueDomain,
} from '../../src/app/fxEnvelope';
import { curveY, automationValueAt } from '../../src/app/automationUi';

const SR = 44100;
const GEOM: OverlayGeom = { width: 1000, height: 100, spp: 441, viewStart: 0, sampleRate: SR };
const DOMAIN: ValueDomain = { min: -24, max: 0 }; // e.g. compressor threshold dB
const VOL: ValueDomain = { min: 0, max: 1.5 };

describe('A7 — domain-parametric envelope primitives', () => {
  test('curveYIn/valueAtIn round-trip any domain; clamps at the edges', () => {
    const y = curveYIn(-6, DOMAIN, GEOM);
    expect(y).toBeCloseTo(25, 9); // −6 is ¾ up the −24..0 range
    expect(valueAtIn(y, DOMAIN, GEOM)).toBeCloseTo(-6, 9);
    const mid = curveYIn(-12, DOMAIN, GEOM); // the actual midpoint
    expect(mid).toBeCloseTo(50, 9);
    expect(valueAtIn(mid, DOMAIN, GEOM)).toBeCloseTo(-12, 9);
    expect(curveYIn(DOMAIN.min, DOMAIN, GEOM)).toBeCloseTo(100, 9);
    expect(curveYIn(DOMAIN.max, DOMAIN, GEOM)).toBeCloseTo(0, 9);
    expect(valueAtIn(-30, DOMAIN, GEOM)).toBe(DOMAIN.max); // above the top
    expect(valueAtIn(150, DOMAIN, GEOM)).toBe(DOMAIN.min); // below the bottom
  });

  test('A4 wrappers delegate to the general forms', () => {
    expect(curveY(1, 'volume', GEOM)).toBe(curveYIn(1, VOL, GEOM));
    expect(automationValueAt(25, 'volume', GEOM)).toBe(valueAtIn(25, VOL, GEOM));
  });

  test('hit / gesture / drag / remove with a custom domain', () => {
    const pts = [
      { at: 0, value: -24 },
      { at: 10 * SR, value: 0 }, // full canvas width (x=1000)
    ];
    expect(hitPointIn(pts, { x: 4, y: curveYIn(-24, DOMAIN, GEOM) }, DOMAIN, GEOM)).toBe(0);
    expect(hitPointIn(pts, { x: 500, y: 50 }, DOMAIN, GEOM)).toBeNull();

    // click-insert grabs the new point
    const g = beginEnvelopeGesture(pts, { x: 500, y: curveYIn(-12, DOMAIN, GEOM) }, DOMAIN, GEOM);
    expect(g.points).toHaveLength(3);
    expect(g.points[1]).toEqual({ at: Math.round(GEOM.spp * 500), value: -12 });
    expect(g.before).toHaveLength(2);

    // drag up → toward max, clamped to the domain
    dragEnvelopeTo(g, { x: 600, y: -5 }, DOMAIN, GEOM, 10 * SR);
    expect(g.points[1]!.value).toBe(DOMAIN.max);
    expect(g.points[1]!.at).toBe(Math.round(GEOM.spp * 600));

    // remove by pointer
    const after = removeEnvelopePointAt(g.points, { x: 604, y: 0 }, DOMAIN, GEOM);
    expect(after).toHaveLength(2);
  });
});

describe('A7 — fxEnvelope draft state', () => {
  test('toggle creates an empty curve + selects the param; toggling off removes', () => {
    resetFxCurves();
    toggleFxCurveParam('thresholdDb');
    expect(fxCurvesDraft.value.thresholdDb).toEqual([]);
    expect(fxEnvelopeParam.value).toBe('thresholdDb');
    toggleFxCurveParam('thresholdDb');
    expect(fxCurvesDraft.value.thresholdDb).toBeUndefined();
    expect(fxEnvelopeParam.value).toBeNull();
  });

  test('setFxCurvePoints stores; switching params keeps other curves', () => {
    resetFxCurves();
    toggleFxCurveParam('thresholdDb');
    const pts = [
      { at: 0, value: -24 },
      { at: 1000, value: 0 },
    ];
    setFxCurvePoints('thresholdDb', pts);
    expect(fxCurvesDraft.value.thresholdDb).toEqual(pts);
    toggleFxCurveParam('ratio');
    setFxCurvePoints('ratio', [{ at: 0, value: 4 }]);
    expect(fxEnvelopeParam.value).toBe('ratio');
    expect(fxCurvesDraft.value.thresholdDb).toEqual(pts);
    removeFxCurve('thresholdDb');
    expect(fxCurvesDraft.value.thresholdDb).toBeUndefined();
    expect(fxEnvelopeParam.value).toBe('ratio'); // selection untouched
  });

  test('fxCurvesOrUndefined: undefined when empty, curves when not', () => {
    resetFxCurves();
    expect(fxCurvesOrUndefined()).toBeUndefined();
    setFxCurvePoints('depth', [{ at: 0, value: 0.5 }]);
    expect(fxCurvesOrUndefined()).toEqual({ depth: [{ at: 0, value: 0.5 }] });
  });

  test('region length signal set/reset; automationMode untouched by A7 state', () => {
    resetFxCurves();
    expect(fxRegionLen.value).toBe(1);
    setFxCurveRegion(5 * SR);
    expect(fxRegionLen.value).toBe(5 * SR);
    expect(automationMode.value).toBe(false);
  });
});
