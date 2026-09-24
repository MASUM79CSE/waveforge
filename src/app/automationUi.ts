/**
 * Automation envelope UI state + pure overlay math (A4 — docs/automation-plan.md).
 *
 * `A` toggles the mode; in mode each lane canvas draws its selected param's
 * breakpoint curve over the clips and CLAIMS the pointer (clip gestures are
 * suspended until the mode is off). Gestures commit ONE history entry via
 * executeAutomationEdit; live drag feedback mutates the curve through the
 * pure kernels (insertPoint / movePoint / removePoint) and bumps a preview
 * signal for redraw.
 */
import { signal } from '@preact/signals';
import {
  insertPoint,
  movePoint,
  removePoint,
  type AutomationPoint,
} from '../engine/automation';

export type AutomationParam = 'volume' | 'pan';

export const automationMode = signal(false);
export const automationParam = signal<Record<string, AutomationParam>>({});
/** Live drag preview: points currently drawn for (trackId, param). */
export const automationPreview = signal<{
  trackId: string;
  param: AutomationParam;
  points: AutomationPoint[];
} | null>(null);

/** Toggle envelope mode (command `automation.toggle`). */
export function toggleAutomationMode(): void {
  automationMode.value = !automationMode.value;
  automationPreview.value = null;
}

export function automationParamFor(trackId: string): AutomationParam {
  return automationParam.value[trackId] ?? 'volume';
}

export function setAutomationParamFor(trackId: string, param: AutomationParam): void {
  automationParam.value = { ...automationParam.value, [trackId]: param };
  automationPreview.value = null;
}

/** Static domain of each automatable param (matches the strip sliders). */
export const AUTOMATION_DOMAINS: Record<AutomationParam, { min: number; max: number }> = {
  volume: { min: 0, max: 1.5 },
  pan: { min: -1, max: 1 },
};

/** Everything the overlay painter and hit tests need, in CSS pixels. */
export interface OverlayGeom {
  width: number;
  height: number;
  /** View scale: samples per pixel. */
  spp: number;
  /** View start in seconds. */
  viewStart: number;
  sampleRate: number;
}

/** Timeline sample → CSS x (same convention as xAtTimePx). */
export function xAtSample(at: number, geom: OverlayGeom): number {
  return (at / geom.sampleRate - geom.viewStart) * (geom.sampleRate / geom.spp);
}

/** CSS x → timeline sample (may be negative / beyond the lane). */
export function sampleAtX(x: number, geom: OverlayGeom): number {
  return Math.round((geom.viewStart + (x * geom.spp) / geom.sampleRate) * geom.sampleRate);
}

/** Param value → CSS y (piecewise domain mapping; clamped to the lane). */
export function curveY(value: number, param: AutomationParam, geom: OverlayGeom): number {
  const { min, max } = AUTOMATION_DOMAINS[param];
  const v = Math.min(Math.max(value, min), max);
  return geom.height * (1 - (v - min) / (max - min));
}

/** Pointer y → param value, clamped into the param domain. */
export function automationValueAt(y: number, param: AutomationParam, geom: OverlayGeom): number {
  const { min, max } = AUTOMATION_DOMAINS[param];
  const frac = 1 - y / geom.height;
  return Math.min(Math.max(min + frac * (max - min), min), max);
}

/** Hit radius in CSS px (x) / tolerance band (y). */
const HIT_X = 6;
const HIT_Y = 10;

/**
 * Index of the curve point under the pointer, or null. Points win over
 * empty canvas within HIT_X/HIT_Y of their knot square.
 */
export function automationHitAt(
  points: readonly AutomationPoint[],
  pointer: { x: number; y: number },
  param: AutomationParam,
  geom: OverlayGeom,
): number | null {
  for (let i = 0; i < points.length; ++i) {
    const dx = Math.abs(xAtSample(points[i]!.at, geom) - pointer.x);
    const dy = Math.abs(curveY(points[i]!.value, param, geom) - pointer.y);
    if (dx <= HIT_X && dy <= HIT_Y) return i;
  }
  return null;
}

/**
 * Gesture model: on pointer-down, either grab an existing point (move) or
 * insert a new one at the cursor and grab it (BandLab-style click-to-add).
 * The gesture mutates `points` through the pure kernels; the caller commits
 * one history entry on pointer-up with the `before` snapshot taken here.
 */
export interface AutomationGesture {
  trackId: string;
  param: AutomationParam;
  points: AutomationPoint[]; // live-mutated copy
  index: number; // grabbed point
  before: AutomationPoint[]; // deep copy for the history entry
}

export function beginAutomationGesture(
  trackId: string,
  param: AutomationParam,
  current: readonly AutomationPoint[],
  pointer: { x: number; y: number },
  geom: OverlayGeom,
): AutomationGesture {
  const points = current.map((p) => ({ ...p }));
  const hit = automationHitAt(points, pointer, param, geom);
  const sample = Math.max(0, sampleAtX(pointer.x, geom));
  if (hit !== null) {
    return { trackId, param, points, index: hit, before: points.map((p) => ({ ...p })) };
  }
  const value = automationValueAt(pointer.y, param, geom);
  const inserted = insertPoint(points, sample, value);
  return {
    trackId,
    param,
    points: inserted,
    index: inserted.findIndex((p) => p.at === sample),
    before: points.map((p) => ({ ...p })),
  };
}

/** Drag update: move the grabbed point via the kernel (clamps included). */
export function dragAutomationTo(
  gesture: AutomationGesture,
  pointer: { x: number; y: number },
  geom: OverlayGeom,
  laneEndSample: number,
): void {
  const at = Math.max(0, Math.min(sampleAtX(pointer.x, geom), laneEndSample));
  const value = automationValueAt(pointer.y, gesture.param, geom);
  gesture.points = movePoint(gesture.points, gesture.index, at, value, AUTOMATION_DOMAINS[gesture.param]);
  // index stays valid: movePoint never removes or reorders past the neighbours
  gesture.index = gesture.points.findIndex((p) => p === gesture.points[gesture.index]);
  if (gesture.index < 0) gesture.index = 0;
}

/** Drop a point (right-click / alt-click); returns the updated curve. */
export function removeAutomationPointAt(
  current: readonly AutomationPoint[],
  pointer: { x: number; y: number },
  param: AutomationParam,
  geom: OverlayGeom,
): AutomationPoint[] {
  const hit = automationHitAt(current, pointer, param, geom);
  if (hit === null) return [...current];
  return removePoint([...current], hit);
}

/** Minimal palette slice (waveDraw Theme keeps the full set). */
interface OverlayPalette {
  automationLine: string;
  automationPoint: string;
}

const POINT = 5; // knot square edge, CSS px

/**
 * Draw the envelope over a lane canvas: piecewise-linear line across the
 * full lane width (endpoint-clamp semantics — before the first / after the
 * last knot the value holds), knot squares, and the static-value baseline
 * dashed when the curve is empty (where a first point would land).
 */
export function drawAutomationOverlay(
  g: CanvasRenderingContext2D,
  points: readonly AutomationPoint[],
  param: AutomationParam,
  geom: OverlayGeom,
  palette: OverlayPalette,
  baseline: number,
): void {
  // baseline (no curve yet): dashed line at the static mixer value
  if (points.length === 0) {
    const y = Math.round(curveY(baseline, param, geom)) + 0.5;
    g.save();
    g.strokeStyle = palette.automationLine;
    g.globalAlpha = 0.35;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(geom.width, y);
    g.stroke();
    g.restore();
    return;
  }
  g.save();
  g.strokeStyle = palette.automationLine;
  g.lineWidth = 1.5;
  g.beginPath();
  const first = points[0]!;
  g.moveTo(0, curveY(first.value, param, geom));
  for (const p of points) g.lineTo(xAtSample(p.at, geom), curveY(p.value, param, geom));
  const last = points[points.length - 1]!;
  g.lineTo(geom.width, curveY(last.value, param, geom));
  g.stroke();
  g.fillStyle = palette.automationPoint;
  for (const p of points) {
    g.fillRect(
      Math.round(xAtSample(p.at, geom)) - POINT / 2,
      Math.round(curveY(p.value, param, geom)) - POINT / 2,
      POINT,
      POINT,
    );
  }
  g.restore();
}
