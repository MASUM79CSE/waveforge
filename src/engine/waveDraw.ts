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
import * as V from './viewState';

export const RULER_H = 28;

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
}

const THEME: Theme = {
  bg: '#0a0e13',
  laneBg: '#10161e',
  wave: '#3ddad0',
  center: '#1d3336',
  rulerBg: '#0c1117',
  rulerText: '#8b96a5',
  rulerLine: '#232b36',
  playhead: '#ffb454',
  selection: 'rgba(61, 218, 208, 0.14)',
  selectionBorder: 'rgba(61, 218, 208, 0.55)',
  pending: '#151d27',
  beatLine: 'rgba(90, 200, 250, 0.25)',
};

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
  /** schedule a redraw (rAF-coalesced in the renderer) */
  requestDraw: () => void;
}

/** Ctx narrowed by drawFrame after the no-document early return. */
type FullCtx = Omit<WaveDrawCtx, 'doc' | 'env'> & { doc: AudioDocument; env: V.ViewEnv };

/** Paint one full frame: background, ruler, lanes, beats, selection, playhead. */
export function drawFrame(ctx: WaveDrawCtx): void {
  const { g, cssW: W, cssH: H } = ctx;
  g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
  g.fillStyle = THEME.bg;
  g.fillRect(0, 0, W, H);
  if (!ctx.doc || !ctx.env) {
    // no document: ruler chrome only
    g.fillStyle = THEME.rulerBg;
    g.fillRect(0, 0, W, RULER_H);
    g.fillStyle = THEME.rulerLine;
    g.fillRect(0, RULER_H - 1, W, 1);
    return;
  }
  const full = ctx as FullCtx; // narrowed by the early return above
  drawRuler(full);

  if (full.peaks && full.cssW > 0) {
    drawLanes(full, H - RULER_H);
  }
  drawBeats(full, H);
  drawSelection(full, H);
  drawPlayhead(full, H);
}

function drawBeats(ctx: FullCtx, H: number): void {
  const { g, cssW: W } = ctx;
  if (ctx.beats.length === 0) return;
  g.fillStyle = THEME.beatLine ?? 'rgba(90, 200, 250, 0.25)';
  for (const t of ctx.beats) {
    const x = Math.round(V.xAtTime(ctx.view, ctx.env, t)) + 0.5;
    if (x < 0 || x > W) continue;
    g.fillRect(x, RULER_H, 1, H - RULER_H);
  }
}

function drawRuler(ctx: FullCtx): void {
  const { g, cssW: W } = ctx;
  g.fillStyle = THEME.rulerBg;
  g.fillRect(0, 0, W, RULER_H);
  g.fillStyle = THEME.rulerLine;
  g.fillRect(0, RULER_H - 1, W, 1);

  const tick = niceTickFor(ctx.view.spp, ctx.doc.sampleRate);
  g.fillStyle = THEME.rulerText;
  g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  g.textBaseline = 'middle';

  const dur = V.viewDuration(ctx.view, ctx.env);
  for (let t = Math.ceil(ctx.view.start / tick) * tick; t < ctx.view.start + dur; t += tick) {
    const x = Math.round(V.xAtTime(ctx.view, ctx.env, t)) + 0.5;
    if (x < -60 || x > W + 60) continue;
    g.fillRect(x, RULER_H - 8, 1, 8);
    g.fillText(fmtRuler(t, tick), x + 4, (RULER_H - 8) / 2 + 1);
  }
}

function drawLanes(ctx: FullCtx, lanesH: number): void {
  const { g, cssW: W, doc, peaks } = ctx;
  if (!peaks) return;

  const laneCount = doc.channels;
  const laneH = lanesH / laneCount;
  const level = pickPeakLevel(ctx.view.spp);
  const tileReqs: ReturnType<typeof tilesForRange> = [];
  let missing = false;

  for (let ch = 0; ch < laneCount; ++ch) {
    const y0 = RULER_H + ch * laneH;
    const mid = y0 + laneH / 2;
    const amp = (laneH / 2) * 0.92;

    g.fillStyle = THEME.laneBg;
    g.fillRect(0, y0, W, laneH);
    g.fillStyle = THEME.center;
    g.fillRect(0, Math.round(mid), W, 1);

    if (ctx.view.spp < 1) {
      missing = drawRawLane(ctx, ch, y0, laneH, mid, amp) || missing;
      continue;
    }

    g.fillStyle = THEME.wave;
    for (let x = 0; x < W; ++x) {
      const sample = ctx.view.start * doc.sampleRate + x * ctx.view.spp;
      const value = peaks.bucketValue(ch, level, Math.floor(sample / level));
      if (!value) {
        missing = true;
        tileReqs.push(...tilesForRange(ch, level, Math.max(0, sample), Math.max(0, sample) + ctx.view.spp));
        g.fillStyle = THEME.pending;
        g.fillRect(x, y0, 1, laneH);
        g.fillStyle = THEME.wave;
        continue;
      }
      const yMin = clamp(mid - value.max * amp, y0 + 1, y0 + laneH - 1);
      const yMax = clamp(mid - value.min * amp, y0 + 1, y0 + laneH - 1);
      g.fillRect(x, yMin, 1, Math.max(1, yMax - yMin));
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

  const sr = doc.sampleRate;
  const rawStart = Math.floor(view.start * sr);
  const count = Math.ceil(cssW * view.spp) + 2;
  void peaks.requestRaw(ch, rawStart, count).then((samples) => {
    ctx.pendingRaw.set(ch, samples);
    ctx.requestDraw();
  });

  const samples = ctx.pendingRaw.get(ch);
  if (!samples || samples.length === 0) return true;

  const offset = view.start * sr - rawStart;
  g.beginPath();
  for (let x = 0; x < cssW; ++x) {
    const idx = Math.floor(offset + x * view.spp);
    if (idx >= samples.length) break;
    const y = clamp(mid - (samples[idx] ?? 0) * amp, y0 + 1, y0 + laneH - 1);
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokeStyle = THEME.wave;
  g.lineWidth = 1;
  g.stroke();
  return false;
}

function drawSelection(ctx: FullCtx, H: number): void {
  const { g } = ctx;
  const sel = ctx.selection;
  if (!sel) return;
  const x1 = V.xAtTime(ctx.view, ctx.env, sel.start);
  const x2 = V.xAtTime(ctx.view, ctx.env, sel.end);
  g.fillStyle = THEME.selection;
  g.fillRect(x1, RULER_H, x2 - x1, H - RULER_H);
  g.fillStyle = THEME.selectionBorder;
  g.fillRect(Math.round(x1) - 1, RULER_H, 1, H - RULER_H);
  g.fillRect(Math.round(x2), RULER_H, 1, H - RULER_H);
}

function drawPlayhead(ctx: FullCtx, H: number): void {
  const { g } = ctx;
  const x = Math.round(V.xAtTime(ctx.view, ctx.env, ctx.cursor)) + 0.5;
  if (x < -2 || x > ctx.cssW + 2) return;
  g.fillStyle = THEME.playhead;
  g.fillRect(x, 3, 1, H - 3);
  g.beginPath();
  g.moveTo(x - 5, 2);
  g.lineTo(x + 5, 2);
  g.lineTo(x, 10);
  g.closePath();
  g.fill();
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
