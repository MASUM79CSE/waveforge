/**
 * Automation envelope UI state + pure overlay math (A4
).
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

/** Inclusive value range of an envelope's y axis (A7: any param domain). */
export interface ValueDomain {
  min: number;
  max: number;
}

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
  return curveYIn(value, AUTOMATION_DOMAINS[param], geom);
}

/** A7: value → CSS y over ANY domain (clamped to the lane). */
export function curveYIn(value: number, domain: ValueDomain, geom: OverlayGeom): number {
  const v = Math.min(Math.max(value, domain.min), domain.max);
  return geom.height * (1 - (v - domain.min) / (domain.max - domain.min));
}

/** Pointer y → param value, clamped into the param domain. */
export function automationValueAt(y: number, param: AutomationParam, geom: OverlayGeom): number {
  return valueAtIn(y, AUTOMATION_DOMAINS[param], geom);
}

/** A7: pointer y → value over ANY domain (clamped). */
export function valueAtIn(y: number, domain: ValueDomain, geom: OverlayGeom): number {
  const frac = 1 - y / geom.height;
  return Math.min(Math.max(domain.min + frac * (domain.max - domain.min), domain.min), domain.max);
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
  return hitPointIn(points, pointer, AUTOMATION_DOMAINS[param], geom);
}

/** A7: hit test over ANY domain (same radii as the A4 overlay). */
export function hitPointIn(
  points: readonly AutomationPoint[],
  pointer: { x: number; y: number },
  domain: ValueDomain,
  geom: OverlayGeom,
): number | null {
  for (let i = 0; i < points.length; ++i) {
    const dx = Math.abs(xAtSample(points[i]!.at, geom) - pointer.x);
    const dy = Math.abs(curveYIn(points[i]!.value, domain, geom) - pointer.y);
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
  const g = beginEnvelopeGesture(current, pointer, AUTOMATION_DOMAINS[param], geom);
  return { trackId, param, points: g.points, index: g.index, before: g.before };
}

/** A7: generic gesture over ANY domain (grab existing or click-insert). */
export interface EnvelopeGesture {
  points: AutomationPoint[];
  index: number;
  before: AutomationPoint[];
}

export function beginEnvelopeGesture(
  current: readonly AutomationPoint[],
  pointer: { x: number; y: number },
  domain: ValueDomain,
  geom: OverlayGeom,
): EnvelopeGesture {
  const points = current.map((p) => ({ ...p }));
  const hit = hitPointIn(points, pointer, domain, geom);
  const sample = Math.max(0, sampleAtX(pointer.x, geom));
  if (hit !== null) {
    return { points, index: hit, before: points.map((p) => ({ ...p })) };
  }
  const value = valueAtIn(pointer.y, domain, geom);
  const inserted = insertPoint(points, sample, value);
  return {
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
  dragEnvelopeTo(gesture, pointer, AUTOMATION_DOMAINS[gesture.param], geom, laneEndSample);
}

/** A7: drag update over ANY domain (movePoint clamps included). */
export function dragEnvelopeTo(
  gesture: EnvelopeGesture,
  pointer: { x: number; y: number },
  domain: ValueDomain,
  geom: OverlayGeom,
  maxAt: number,
): void {
  const at = Math.max(0, Math.min(sampleAtX(pointer.x, geom), maxAt));
  const value = valueAtIn(pointer.y, domain, geom);
  gesture.points = movePoint(gesture.points, gesture.index, at, value, domain);
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
  return removeEnvelopePointAt(current, pointer, AUTOMATION_DOMAINS[param], geom);
}

/** A7: remove the point under the pointer over ANY domain. */
export function removeEnvelopePointAt(
  current: readonly AutomationPoint[],
  pointer: { x: number; y: number },
  domain: ValueDomain,
  geom: OverlayGeom,
): AutomationPoint[] {
  const hit = hitPointIn(current, pointer, domain, geom);
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

// --- X3: keyboard operability -----------------------

/**
 * X3: arrow-key nudge of one point — the movePoint kernel provides all the
 * hard laws (at rounds to whole samples, x clamps to the free slot between
 * the neighbours, y clamps to the domain). Step sizes are decided by the
 * caller (base vs Shift-fine).
 */
export function nudgeEnvelopePoint(
  points: readonly AutomationPoint[],
  index: number,
  domain: ValueDomain,
  _regionLen: number,
  dAt: number,
  dValue: number,
): AutomationPoint[] {
  const p = points[index];
  if (!p) return [...points];
  return movePoint([...points], index, p.at + dAt, p.value + dValue, domain);
}

/**
 * X3: Enter on a selection — insert a point between it and its next
 * neighbour (or the region edge for the last point; a single point grows
 * halfway to the edge). Value = segment average clamped to the domain.
 * Returns the curve; the caller locates the insertion via
 * `envelopeNeighborAt` (the `at` this function will use).
 */
export function envelopeNeighborAt(
  points: readonly AutomationPoint[],
  index: number,
  regionLen: number,
): number {
  const p = points[index];
  if (!p) return Math.max(1, Math.round(regionLen / 2));
  const next = points[index + 1];
  const endAt = next ? next.at : regionLen;
  return Math.max(p.at + 1, Math.round((p.at + endAt) / 2));
}

export function insertEnvelopeNeighbor(
  points: readonly AutomationPoint[],
  index: number,
  domain: ValueDomain,
  regionLen: number,
): AutomationPoint[] {
  const p = points[index];
  if (!p) return [...points];
  const next = points[index + 1];
  const endValue = next ? next.value : p.value;
  const midAt = envelopeNeighborAt(points, index, regionLen);
  const value = Math.min(domain.max, Math.max(domain.min, (p.value + endValue) / 2));
  return insertPoint([...points], midAt, value);
}

/** X3: Enter on an empty editor — one point at the region midpoint. */
export function insertEnvelopeInitial(
  regionLen: number,
  staticValue: number,
): AutomationPoint[] {
  return [{ at: Math.max(1, Math.round(regionLen / 2)), value: staticValue }];
}
