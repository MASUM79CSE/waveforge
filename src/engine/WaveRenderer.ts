/**
 * WaveRenderer — imperative Canvas2D painting of ruler, waveform lanes,
 * selection and playhead (ADR 001). All view math is delegated to the pure
 * viewState module; peaks come from the PeakClient as cached tiles with
 * progressive refinement.
 */
import { fmtRuler } from '../core/format';
import { clamp, niceTickFor, pickPeakLevel, zoomFactor } from '../core/zoom';
import type { AudioDocument } from './AudioDocument';
import type { PeakClient } from './peakClient';
import { tilesForRange } from './protocol';
import * as V from './viewState';

const RULER_H = 28;
const CLICK_EPSILON = 0.005; // seconds — below this a drag counts as a click
const CLICK_PIXELS = 3;

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

export class WaveRenderer {
  view: V.ViewState = { spp: 1024, start: 0 };
  cursor = 0;
  private beats: number[] = [];
  selection: { start: number; end: number } | null = null;

  onSeek: ((t: number) => void) | null = null;
  onSelectionChange: ((sel: { start: number; end: number } | null) => void) | null = null;
  onViewChange: (() => void) | null = null;

  private doc: AudioDocument | null = null;
  private peaks: PeakClient | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private resizeObs: ResizeObserver | null = null;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private frameQueued = false;
  private pendingRaw = new Map<number, Float32Array>();
  private drag: { mode: 'scrub' | 'select'; anchor: number; startX: number } | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.resizeObs = new ResizeObserver(() => this.handleResize());
    const host = canvas.parentElement ?? canvas;
    this.resizeObs.observe(host);
    this.handleResize();
    this.bindPointer();
  }

  detach(): void {
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.canvas = null;
    this.g = null;
  }

  /** Beat marker positions (seconds) drawn as faint vertical lines. */
  setBeats(beats: number[]): void {
    this.beats = beats;
    this.requestDraw();
  }

  setDocument(doc: AudioDocument | null, peaks: PeakClient | null, opts?: { keepView?: boolean }): void {
    this.doc = doc;
    this.peaks = peaks;
    this.cursor = 0;
    this.selection = null;
    this.pendingRaw.clear();
    const env = this.env();
    if (doc && env) {
      if (opts?.keepView) {
        // keep zoom/pan across edits, clamping the pan into the new length
        this.view = { spp: this.view.spp, start: Math.min(this.view.start, V.maxStart(env, this.view.spp)) };
      } else {
        this.view = V.fitView(env);
      }
    }
    this.emitView();
    this.requestDraw();
  }

  zoom(factor: number, centerRatio = 0.5): void {
    const env = this.env();
    if (!env) return;
    this.view = V.zoomAt(this.view, env, factor, centerRatio);
    this.emitView();
    this.requestDraw();
  }

  zoomReset(): void {
    const env = this.env();
    const doc = this.doc;
    if (!env || !doc) return;
    this.view = V.fitView(env);
    this.emitView();
    this.requestDraw();
  }

  setStart(t: number): void {
    const env = this.env();
    if (!env) return;
    this.view = V.setStart(this.view, env, t);
    this.emitView();
    this.requestDraw();
  }

  /** Center the view on a time position (Tab command). */
  centerOn(t: number): void {
    const env = this.env();
    if (!env) return;
    const half = V.viewDuration(this.view, env) / 2;
    this.setStart(t - half);
  }

  /** Auto-follow during playback. */
  followCursor(t: number): void {
    const env = this.env();
    if (!env) return;
    this.view = V.ensureVisible(this.view, env, t);
    this.emitView();
  }

  setSelection(sel: { start: number; end: number } | null): void {
    this.selection = sel;
    this.requestDraw();
  }

  requestDraw(): void {
    if (this.frameQueued || !this.canvas) return;
    this.frameQueued = true;
    requestAnimationFrame(() => {
      this.frameQueued = false;
      this.draw();
    });
  }

  // ---------- internals ----------

  private env(): V.ViewEnv | null {
    if (!this.doc || this.cssW <= 0) return null;
    return { cssW: this.cssW, duration: this.doc.duration, sampleRate: this.doc.sampleRate };
  }

  private emitView(): void {
    this.onViewChange?.();
  }

  private handleResize(): void {
    const host = this.canvas?.parentElement;
    if (!this.canvas || !host) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = host.clientWidth;
    this.cssH = host.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssH * this.dpr));
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.requestDraw();
  }

  private draw(): void {
    const g = this.g;
    if (!g || !this.canvas) return;
    const W = this.cssW;
    const H = this.cssH;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = THEME.bg;
    g.fillRect(0, 0, W, H);
    this.drawRuler(g, W);

    const doc = this.doc;
    if (doc && this.peaks && this.cssW > 0) {
      this.drawLanes(g, W, H - RULER_H);
    }
    this.drawBeats(g, W, H);
    this.drawSelection(g, H);
    this.drawPlayhead(g, H);
  }

  private drawBeats(g: CanvasRenderingContext2D, W: number, H: number): void {
    const doc = this.doc;
    const env = this.env();
    if (!doc || !env || this.beats.length === 0) return;
    g.fillStyle = THEME.beatLine ?? 'rgba(90, 200, 250, 0.25)';
    for (const t of this.beats) {
      const x = Math.round(V.xAtTime(this.view, env, t)) + 0.5;
      if (x < 0 || x > W) continue;
      g.fillRect(x, RULER_H, 1, H - RULER_H);
    }
  }

  private drawRuler(g: CanvasRenderingContext2D, W: number): void {
    g.fillStyle = THEME.rulerBg;
    g.fillRect(0, 0, W, RULER_H);
    g.fillStyle = THEME.rulerLine;
    g.fillRect(0, RULER_H - 1, W, 1);

    const doc = this.doc;
    const env = this.env();
    if (!doc || !env) return;

    const tick = niceTickFor(this.view.spp, doc.sampleRate);
    g.fillStyle = THEME.rulerText;
    g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.textBaseline = 'middle';

    const dur = V.viewDuration(this.view, env);
    for (let t = Math.ceil(this.view.start / tick) * tick; t < this.view.start + dur; t += tick) {
      const x = Math.round(V.xAtTime(this.view, env, t)) + 0.5;
      if (x < -60 || x > W + 60) continue;
      g.fillRect(x, RULER_H - 8, 1, 8);
      g.fillText(fmtRuler(t, tick), x + 4, (RULER_H - 8) / 2 + 1);
    }
  }

  private drawLanes(g: CanvasRenderingContext2D, W: number, lanesH: number): void {
    const doc = this.doc;
    const peaks = this.peaks;
    if (!doc || !peaks) return;

    const laneCount = doc.channels;
    const laneH = lanesH / laneCount;
    const level = pickPeakLevel(this.view.spp);
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

      if (this.view.spp < 1) {
        missing = this.drawRawLane(g, ch, y0, laneH, mid, amp) || missing;
        continue;
      }

      g.fillStyle = THEME.wave;
      for (let x = 0; x < W; ++x) {
        const sample = this.view.start * doc.sampleRate + x * this.view.spp;
        const value = peaks.bucketValue(ch, level, Math.floor(sample / level));
        if (!value) {
          missing = true;
          tileReqs.push(...tilesForRange(ch, level, Math.max(0, sample), Math.max(0, sample) + this.view.spp));
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
      void this.peaks?.requestTiles(unique).then(() => this.requestDraw());
    }
  }

  /** Sample-level lane (spp < 1): polyline from raw slices. */
  private drawRawLane(
    g: CanvasRenderingContext2D,
    ch: number,
    y0: number,
    laneH: number,
    mid: number,
    amp: number,
  ): boolean {
    const doc = this.doc;
    const peaks = this.peaks;
    if (!doc || !peaks) return false;

    const sr = doc.sampleRate;
    const rawStart = Math.floor(this.view.start * sr);
    const count = Math.ceil(this.cssW * this.view.spp) + 2;
    void peaks.requestRaw(ch, rawStart, count).then((samples) => {
      this.pendingRaw.set(ch, samples);
      this.requestDraw();
    });

    const samples = this.pendingRaw.get(ch);
    if (!samples || samples.length === 0) return true;

    const offset = this.view.start * sr - rawStart;
    g.beginPath();
    for (let x = 0; x < this.cssW; ++x) {
      const idx = Math.floor(offset + x * this.view.spp);
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

  private drawSelection(g: CanvasRenderingContext2D, H: number): void {
    const sel = this.selection;
    const env = this.env();
    if (!sel || !env) return;
    const x1 = V.xAtTime(this.view, env, sel.start);
    const x2 = V.xAtTime(this.view, env, sel.end);
    g.fillStyle = THEME.selection;
    g.fillRect(x1, RULER_H, x2 - x1, H - RULER_H);
    g.fillStyle = THEME.selectionBorder;
    g.fillRect(Math.round(x1) - 1, RULER_H, 1, H - RULER_H);
    g.fillRect(Math.round(x2), RULER_H, 1, H - RULER_H);
  }

  private drawPlayhead(g: CanvasRenderingContext2D, H: number): void {
    const env = this.env();
    if (!env) return;
    const x = Math.round(V.xAtTime(this.view, env, this.cursor)) + 0.5;
    if (x < -2 || x > this.cssW + 2) return;
    g.fillStyle = THEME.playhead;
    g.fillRect(x, 3, 1, H - 3);
    g.beginPath();
    g.moveTo(x - 5, 2);
    g.lineTo(x + 5, 2);
    g.lineTo(x, 10);
    g.closePath();
    g.fill();
  }

  // ---------- interaction ----------

  private bindPointer(): void {
    const canvas = this.canvas;
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    canvas.addEventListener(
      'wheel',
      (e) => this.onWheel(e),
      { passive: false },
    );
  }

  private localX(e: PointerEvent | WheelEvent): number {
    const rect = this.canvas?.getBoundingClientRect();
    return rect ? e.clientX - rect.left : 0;
  }

  private localY(e: PointerEvent): number {
    const rect = this.canvas?.getBoundingClientRect();
    return rect ? e.clientY - rect.top : 0;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.doc || !this.canvas) return;
    this.canvas.setPointerCapture(e.pointerId);
    const x = this.localX(e);
    const env = this.env();
    if (!env) return;

    if (this.localY(e) < RULER_H) {
      this.drag = { mode: 'scrub', anchor: 0, startX: x };
      this.onSeek?.(Math.max(0, V.timeAtX(this.view, env, x)));
      return;
    }
    const t = clamp(V.timeAtX(this.view, env, x), 0, this.doc.duration);
    this.drag = { mode: 'select', anchor: t, startX: x };
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag;
    const env = this.env();
    const doc = this.doc;
    if (!drag || !env || !doc) return;

    if (drag.mode === 'scrub') {
      this.onSeek?.(Math.max(0, V.timeAtX(this.view, env, this.localX(e))));
      return;
    }
    const t = clamp(V.timeAtX(this.view, env, this.localX(e)), 0, doc.duration);
    if (Math.abs(this.localX(e) - drag.startX) > CLICK_PIXELS) {
      this.selection = {
        start: Math.min(drag.anchor, t),
        end: Math.max(drag.anchor, t),
      };
      this.onSelectionChange?.(this.selection);
      this.requestDraw();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    const env = this.env();
    const doc = this.doc;
    this.drag = null;
    if (!drag || !env || !doc) return;

    if (drag.mode === 'scrub') return;
    const x = this.localX(e);
    const t = clamp(V.timeAtX(this.view, env, x), 0, doc.duration);
    if (Math.abs(x - drag.startX) <= CLICK_PIXELS) {
      // plain click: seek and clear any selection
      this.selection = null;
      this.onSelectionChange?.(null);
      this.onSeek?.(t);
    } else if (this.selection && this.selection.end - this.selection.start < CLICK_EPSILON) {
      this.selection = null;
      this.onSelectionChange?.(null);
    }
    this.requestDraw();
  }

  private onWheel(e: WheelEvent): void {
    const env = this.env();
    if (!env || !this.canvas) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : 1;
    const dx = (e.deltaX || 0) * scale;
    const dy = (e.deltaY || 0) * scale;

    if (e.ctrlKey || e.metaKey) {
      this.zoom(zoomFactor(dy || dx), this.localX(e) / this.cssW);
      return;
    }
    const seconds = ((dx || dy) * this.view.spp) / env.sampleRate;
    this.setStart(this.view.start + seconds * 1.2);
  }
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
