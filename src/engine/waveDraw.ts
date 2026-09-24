/**
 * Canvas2D painting of ruler, waveform lanes, selection and playhead —
 * extracted from WaveRenderer (M7 refactor). All view math is delegated to
 * the pure viewState module; peaks come from the PeakClient as cached tiles
 * with progressive refinement. Pure drawing: every callback the painters
 * need arrives via WaveDrawCtx, and mutable state (pendingRaw) stays owned
 * by the renderer and is passed by reference.
 */
import { fmtRuler } from '../core/format';
import { clamp, niceTickFor, pickPeakLevel } from '../core/zoom';
import type { AudioDocument } from './AudioDocument';
import type { PeakClient } from './peakClient';
import { tilesForRange } from './protocol';
import { paletteVersionNow } from '../app/theme';
import * as V from './viewState';

export const RULER_H = 28;
/** D4: left channel rail + bottom amplitude axis (AudioMass layout). */
export const RAIL_W = 26;
export const AXIS_H = 22;

interface Theme {
  bg: string;
  laneBg: string;
  wave: string;
  center: string;
  rulerBg: string;
  rulerText: string;
  rulerLine: string;
  playhead: string;
  selection: string;
  selectionBorder: string;
  pending: string;
  beatLine: string;
  clipBg: string;
  clipBorder: string;
  clipEdge: string;
  clipSelected: string;
}

const THEME_FALLBACK: Theme = {
  bg: '#07080a',
  laneBg: '#050608',
  wave: '#9dff6a',
  center: '#1d3336',
  rulerBg: '#000000',
  rulerText: '#d9d955',
  rulerLine: '#365457',
  playhead: '#ff8c35',
  selection: 'rgba(90, 242, 255, 0.14)',
  selectionBorder: 'rgba(90, 242, 255, 0.55)',
  pending: '#101318',
  beatLine: 'rgba(90, 200, 250, 0.25)',
  clipBg: 'rgba(255, 255, 255, 0.045)',
  clipBorder: 'rgba(255, 255, 255, 0.28)',
  clipEdge: 'rgba(90, 242, 255, 0.5)',
  clipSelected: 'rgba(90, 242, 255, 0.9)',
};

// D9: the palette lives in tokens.css (--cv-*) so themes apply everywhere;
// cached here and re-read only when the applied theme version changes.
const CV_KEYS: Array<[keyof Theme, string]> = [
  ['bg', '--cv-bg'],
  ['laneBg', '--cv-lane'],
  ['wave', '--cv-wave'],
  ['center', '--cv-center'],
  ['rulerBg', '--cv-ruler-bg'],
  ['rulerText', '--cv-ruler-text'],
  ['rulerLine', '--cv-ruler-line'],
  ['playhead', '--cv-playhead'],
  ['selection', '--cv-selection'],
  ['selectionBorder', '--cv-selection-border'],
  ['pending', '--cv-pending'],
  ['beatLine', '--cv-beat'],
  ['clipBg', '--cv-clip-bg'],
  ['clipBorder', '--cv-clip-border'],
  ['clipEdge', '--cv-clip-edge'],
  ['clipSelected', '--cv-clip-selected'],
];

let cachedTheme = THEME_FALLBACK;
let cachedAtVersion = -1;

/** Lane painters (M8) share the doc palette cache. */
export function currentTheme(): Theme {
  const version = paletteVersionNow();
  if (version === cachedAtVersion) return cachedTheme;
  cachedAtVersion = version;
  if (typeof getComputedStyle !== 'function') return (cachedTheme = THEME_FALLBACK);
  const style = getComputedStyle(document.documentElement);
  const read = (name: string): string | null => {
    const v = style.getPropertyValue(name).trim();
    return v.length > 0 ? v : null;
  };
  const next: Theme = { ...THEME_FALLBACK };
  for (const [key, cssName] of CV_KEYS) {
    const value = read(cssName);
    if (value) next[key] = value;
  }
  cachedTheme = next;
  return next;
}

/** Everything a painter needs, bundled once per frame. */
export interface WaveDrawCtx {
  g: CanvasRenderingContext2D;
  cssW: number;
  cssH: number;
  dpr: number;
  view: V.ViewState;
  env: V.ViewEnv | null;
  doc: AudioDocument | null;
  peaks: PeakClient | null;
  cursor: number;
  selection: { start: number; end: number } | null;
  beats: number[];
  /** renderer-owned cache of raw sample slices (mutated by drawRawLane) */
  pendingRaw: Map<number, Float32Array>;
  /** D4: draw the left channel rail + bottom amplitude axis */
  axis: boolean;
  /** D5: vertical zoom amplitude scale (0.5..3) */
  vzoom: number;
  /** schedule a redraw (rAF-coalesced in the renderer) */
  requestDraw: () => void;
}

/** Ctx narrowed by drawFrame after the no-document early return. */
type FullCtx = Omit<WaveDrawCtx, 'doc' | 'env'> & { doc: AudioDocument; env: V.ViewEnv };

/** Paint one full frame: background, ruler, rail, lanes, beats, selection, playhead, axis. */
export function drawFrame(ctx: WaveDrawCtx): void {
  const theme = currentTheme(); // refreshes the cache when the theme changed
  void theme;
  const { g, cssW: W, cssH: H } = ctx;
  const rail = ctx.axis ? RAIL_W : 0;
  const axisH = ctx.axis ? AXIS_H : 0;
  g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
  g.fillStyle = currentTheme().bg;
  g.fillRect(0, 0, W, H);
  if (!ctx.doc || !ctx.env) {
    // no document: ruler chrome only
    g.fillStyle = currentTheme().rulerBg;
    g.fillRect(0, 0, W, RULER_H);
    g.fillStyle = currentTheme().rulerLine;
    g.fillRect(0, RULER_H - 1, W, 1);
    return;
  }
  const full = { ...ctx, env: ctx.env } as FullCtx; // narrowed by the early return above
  drawRuler(full);

  if (full.peaks && full.cssW > rail) {
    drawLanes(full, H - RULER_H - axisH);
  }
  drawBeats(full, H);
  drawSelection(full, H);
  drawPlayhead(full, H);
  if (ctx.axis) {
    drawRail(full);
    drawAmplitudeAxis(full);
  }
}

function drawBeats(ctx: FullCtx, H: number): void {
  const { g, cssW: W } = ctx;
  if (ctx.beats.length === 0) return;
  const rail = ctx.axis ? RAIL_W : 0;
  const axisH = ctx.axis ? AXIS_H : 0;
  g.fillStyle = currentTheme().beatLine;
  for (const t of ctx.beats) {
    const x = Math.round(V.xAtTime(ctx.view, ctx.env, t)) + 0.5 + rail;
    if (x < rail || x > W) continue;
    g.fillRect(x, RULER_H, 1, H - RULER_H - axisH);
  }
}

function drawRuler(ctx: FullCtx): void {
  const { g, cssW: W } = ctx;
  const rail = ctx.axis ? RAIL_W : 0;
  g.fillStyle = currentTheme().rulerBg;
  g.fillRect(0, 0, W, RULER_H);
  g.fillStyle = currentTheme().rulerLine;
  g.fillRect(0, RULER_H - 1, W, 1);

  const tick = niceTickFor(ctx.view.spp, ctx.doc.sampleRate);
  g.fillStyle = currentTheme().rulerText;
  g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  g.textBaseline = 'middle';

  const dur = V.viewDuration(ctx.view, ctx.env);
  for (let t = Math.ceil(ctx.view.start / tick) * tick; t < ctx.view.start + dur; t += tick) {
    const x = Math.round(V.xAtTime(ctx.view, ctx.env, t)) + 0.5 + rail;
    if (x < rail - 60 || x > W + 60) continue;
    g.fillRect(x, RULER_H - 8, 1, 8);
    g.fillText(fmtRuler(t, tick), x + 4, (RULER_H - 8) / 2 + 1);
  }
}

function drawLanes(ctx: FullCtx, lanesH: number): void {
  const { g, cssW: W, doc, peaks } = ctx;
  const rail = ctx.axis ? RAIL_W : 0;
  const laneW = W - rail;
  if (!peaks || laneW <= 0) return;

  const laneCount = doc.channels;
  const laneH = lanesH / laneCount;
  const level = pickPeakLevel(ctx.view.spp);
  const tileReqs: ReturnType<typeof tilesForRange> = [];
  let missing = false;

  for (let ch = 0; ch < laneCount; ++ch) {
    const y0 = RULER_H + ch * laneH;
    const mid = y0 + laneH / 2;
    const amp = (laneH / 2) * 0.92 * ctx.vzoom;

    g.fillStyle = currentTheme().laneBg;
    g.fillRect(rail, y0, laneW, laneH);
    g.fillStyle = currentTheme().center;
    g.fillRect(rail, Math.round(mid), laneW, 1);

    if (ctx.view.spp < 1) {
      missing = drawRawLane(ctx, ch, y0, laneH, mid, amp) || missing;
      continue;
    }

    g.fillStyle = currentTheme().wave;
    for (let x = 0; x < laneW; ++x) {
      const sample = ctx.view.start * doc.sampleRate + x * ctx.view.spp;
      const value = peaks.bucketValue(ch, level, Math.floor(sample / level));
      if (!value) {
        missing = true;
        tileReqs.push(...tilesForRange(ch, level, Math.max(0, sample), Math.max(0, sample) + ctx.view.spp));
        g.fillStyle = currentTheme().pending;
        g.fillRect(rail + x, y0, 1, laneH);
        g.fillStyle = currentTheme().wave;
        continue;
      }
      const yMin = clamp(mid - value.max * amp, y0 + 1, y0 + laneH - 1);
      const yMax = clamp(mid - value.min * amp, y0 + 1, y0 + laneH - 1);
      g.fillRect(rail + x, yMin, 1, Math.max(1, yMax - yMin));
    }
  }

  if (missing && tileReqs.length > 0) {
    const unique = dedupeReqs(tileReqs);
    void peaks.requestTiles(unique).then(() => ctx.requestDraw());
  }
}

/** Sample-level lane (spp < 1): polyline from raw slices. */
function drawRawLane(
  ctx: FullCtx,
  ch: number,
  y0: number,
  laneH: number,
  mid: number,
  amp: number,
): boolean {
  const { g, cssW, doc, peaks, view } = ctx;
  if (!peaks) return false;

  const ampScaled = amp * ctx.vzoom;
  const sr = doc.sampleRate;
  const rail = ctx.axis ? RAIL_W : 0;
  const laneW = cssW - rail;
  const rawStart = Math.floor(view.start * sr);
  const count = Math.ceil(laneW * view.spp) + 2;
  void peaks.requestRaw(ch, rawStart, count).then((samples) => {
    ctx.pendingRaw.set(ch, samples);
    ctx.requestDraw();
  });

  const samples = ctx.pendingRaw.get(ch);
  if (!samples || samples.length === 0) return true;

  const offset = view.start * sr - rawStart;
  g.beginPath();
  for (let x = 0; x < laneW; ++x) {
    const idx = Math.floor(offset + x * view.spp);
    if (idx >= samples.length) break;
    const y = clamp(mid - (samples[idx] ?? 0) * ampScaled, y0 + 1, y0 + laneH - 1);
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokeStyle = currentTheme().wave;
  g.lineWidth = 1;
  g.stroke();
  return false;
}

function drawSelection(ctx: FullCtx, H: number): void {
  const { g } = ctx;
  const sel = ctx.selection;
  if (!sel) return;
  const rail = ctx.axis ? RAIL_W : 0;
  const x1 = V.xAtTime(ctx.view, ctx.env, sel.start) + rail;
  const x2 = V.xAtTime(ctx.view, ctx.env, sel.end) + rail;
  const axisH = ctx.axis ? AXIS_H : 0;
  g.fillStyle = currentTheme().selection;
  g.fillRect(x1, RULER_H, x2 - x1, H - RULER_H - axisH);
  g.fillStyle = currentTheme().selectionBorder;
  g.fillRect(Math.round(x1) - 1, RULER_H, 1, H - RULER_H - axisH);
  g.fillRect(Math.round(x2), RULER_H, 1, H - RULER_H - axisH);
}

function drawPlayhead(ctx: FullCtx, H: number): void {
  const { g } = ctx;
  const rail = ctx.axis ? RAIL_W : 0;
  const axisH = ctx.axis ? AXIS_H : 0;
  const x = Math.round(V.xAtTime(ctx.view, ctx.env, ctx.cursor)) + 0.5 + rail;
  if (x < rail - 2 || x > ctx.cssW + 2) return;
  g.fillStyle = currentTheme().playhead;
  g.fillRect(x, 3, 1, H - 3 - axisH);
  g.beginPath();
  g.moveTo(x - 5, 2);
  g.lineTo(x + 5, 2);
  g.lineTo(x, 10);
  g.closePath();
  g.fill();
}

/** Left rail: black strip with per-channel labels (L/R). */
function drawRail(ctx: FullCtx): void {
  const { g, cssH: H, doc } = ctx;
  g.fillStyle = currentTheme().rulerBg;
  g.fillRect(0, 0, RAIL_W, H);
  g.fillStyle = currentTheme().rulerLine;
  g.fillRect(RAIL_W - 1, 0, 1, H);

  const axisH = AXIS_H;
  const lanesH = H - RULER_H - axisH;
  const laneH = lanesH / doc.channels;
  g.font = '10px ' + 'ui-monospace, SFMono-Regular, Menlo, monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  for (let ch = 0; ch < doc.channels; ++ch) {
    const mid = RULER_H + ch * laneH + laneH / 2;
    g.fillStyle = currentTheme().rulerText;
    g.fillText(ch === 0 ? 'L' : 'R', RAIL_W / 2, mid - 6);
    g.fillStyle = '#6a7380';
    g.fillText('ON', RAIL_W / 2, mid + 6);
  }
  g.textAlign = 'start';
}

/** Bottom amplitude axis: dBFS labels, 2 dB steps, AudioMass style. */
function drawAmplitudeAxis(ctx: FullCtx): void {
  const { g, cssW: W, cssH: H } = ctx;
  g.fillStyle = currentTheme().rulerBg;
  g.fillRect(0, H - AXIS_H, W, AXIS_H);
  g.fillStyle = currentTheme().rulerLine;
  g.fillRect(0, H - AXIS_H, W, 1);
  g.fillRect(RAIL_W - 1, H - AXIS_H, 1, AXIS_H);

  g.fillStyle = currentTheme().rulerText;
  g.font = '9px ' + 'ui-monospace, SFMono-Regular, Menlo, monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const laneW = W - RAIL_W;
  g.fillText('-Inf', RAIL_W + 10, H - AXIS_H / 2);
  for (let db = -70; db <= 0; db += 2) {
    // linear-in-dB spread across the lane viewport, clear of the -Inf label
    const frac = (db + 70) / 70;
    const x = RAIL_W + 42 + frac * (laneW - 56);
    g.fillText(String(db), x, H - AXIS_H / 2);
  }
  g.textAlign = 'start';
}

function dedupeReqs(reqs: ReturnType<typeof tilesForRange>): ReturnType<typeof tilesForRange> {
  const seen = new Set<string>();
  const out: ReturnType<typeof tilesForRange> = [];
  for (const r of reqs) {
    const key = `${r.ch}:${r.level}:${r.tile}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
