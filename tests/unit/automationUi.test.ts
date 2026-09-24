import { describe, expect, test } from 'vitest';
import { resolveShortcut, type ShortcutEvent } from '../../src/app/shortcuts';
import {
  automationHitAt,
  automationParamFor,
  automationValueAt,
  curveY,
  setAutomationParamFor,
  toggleAutomationMode,
  automationMode,
  type OverlayGeom,
} from '../../src/app/automationUi';

const ev = (key: string, opts: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key,
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
  ...opts,
});

describe('A4 — `A` toggles automation mode (single-source shortcuts)', () => {
  test('plain A resolves to automation.toggle; shift+A stays selectAll', () => {
    expect(resolveShortcut(ev('a'))).toBe('automation.toggle');
    expect(resolveShortcut(ev('A'))).toBe('automation.toggle');
    expect(resolveShortcut(ev('a', { shift: true }))).toBe('edit.selectAll');
    expect(resolveShortcut(ev('a', { ctrl: true }))).toBe('edit.selectAll');
    expect(resolveShortcut(ev('a', { alt: true }))).toBeNull();
  });
});

describe('A4 — overlay geometry (pure mapping + hit testing)', () => {
  const geom: OverlayGeom = { width: 1000, height: 60, spp: 441, viewStart: 0, sampleRate: 44100 };
  // spp 441 @44.1 kHz → 100 px per second; 1000 px = 10 s timeline

  test('volume: 0..1.5 maps bottom→top; default 1.0 sits at h/3 from top', () => {
    expect(curveY(0, 'volume', geom)).toBeCloseTo(60, 9); // 0 → bottom
    expect(curveY(1.5, 'volume', geom)).toBeCloseTo(0, 9); // max → top
    expect(curveY(1, 'volume', geom)).toBeCloseTo(20, 9); // default 1.0
  });

  test('pan: −1..1 maps bottom→top around the midline', () => {
    expect(curveY(-1, 'pan', geom)).toBeCloseTo(60, 9);
    expect(curveY(0, 'pan', geom)).toBeCloseTo(30, 9);
    expect(curveY(1, 'pan', geom)).toBeCloseTo(0, 9);
  });

  test('value at pointer y inverts the mapping with clamping to the param domain', () => {
    expect(automationValueAt(60, 'volume', geom)).toBeCloseTo(0, 9);
    expect(automationValueAt(0, 'volume', geom)).toBeCloseTo(1.5, 9);
    expect(automationValueAt(-50, 'volume', geom)).toBe(1.5); // clamp above top
    expect(automationValueAt(999, 'pan', geom)).toBe(-1); // clamp below bottom
  });

  test('hit test: point within radius wins; empty area returns null', () => {
    const pts = [
      { at: 44100, value: 1 }, // x=100
      { at: 441000, value: 0.5 }, // x=1000
    ];
    expect(automationHitAt(pts, { x: 102, y: curveY(1, 'volume', geom) }, 'volume', geom)).toBe(0);
    expect(automationHitAt(pts, { x: 994, y: curveY(0.5, 'volume', geom) }, 'volume', geom)).toBe(1);
    expect(automationHitAt(pts, { x: 500, y: 30 }, 'volume', geom)).toBeNull();
  });

  test('insertion x outside the lane never matches a point', () => {
    const pts = [{ at: 44100, value: 1 }];
    expect(automationHitAt(pts, { x: -40, y: 20 }, 'volume', geom)).toBeNull();
  });
});

describe('A4 — mode + per-lane param state', () => {
  test('toggleAutomationMode flips the signal', () => {
    const before = automationMode.value;
    toggleAutomationMode();
    expect(automationMode.value).toBe(!before);
    toggleAutomationMode();
    expect(automationMode.value).toBe(before);
  });

  test('per-lane param defaults to volume and is settable per lane', () => {
    expect(automationParamFor('t1')).toBe('volume');
    setAutomationParamFor('t1', 'pan');
    expect(automationParamFor('t1')).toBe('pan');
    expect(automationParamFor('t2')).toBe('volume'); // other lanes unaffected
    setAutomationParamFor('t1', 'volume');
  });
});
