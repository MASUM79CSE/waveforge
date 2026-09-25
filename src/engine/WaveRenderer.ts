/**
 * WaveRenderer — canvas lifecycle, zoom/pan state and pointer interaction
 * (ADR 001). Painting lives in waveDraw.ts; all view math is delegated to
 * the pure viewState module.
 */
import { clamp, zoomFactor } from '../core/zoom';
import type { AudioDocument } from './AudioDocument';
import type { PeakClient } from './peakClient';
import * as V from './viewState';
import { RAIL_W, RULER_H, drawFrame } from './waveDraw';

const CLICK_EPSILON = 0.005; // seconds — below this a drag counts as a click
const CLICK_PIXELS = 3;

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
  private axis = true;
  private vzoom = 1;
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

  /** D4: toggle the left rail + bottom amplitude axis (reference layout). */
  setAxisVisible(visible: boolean): void {
    this.axis = visible;
    this.requestDraw();
  }

  /** D5: vertical zoom — wave amplitude scale (0.5..3). */
  setVZoom(scale: number): void {
    this.vzoom = scale;
    this.requestDraw();
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
    const rail = this.axis ? RAIL_W : 0;
    return {
      cssW: Math.max(0, this.cssW - rail),
      duration: this.doc.duration,
      sampleRate: this.doc.sampleRate,
    };
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
    const doc = this.doc;
    const env = this.env();
    const g = this.g;
    if (!g || !this.canvas || !env || !doc) return;
    drawFrame({
      g,
      cssW: this.cssW,
      cssH: this.cssH,
      dpr: this.dpr,
      view: this.view,
      env,
      doc,
      peaks: this.peaks,
      cursor: this.cursor,
      selection: this.selection,
      beats: this.beats,
      pendingRaw: this.pendingRaw,
      axis: this.axis,
      vzoom: this.vzoom,
      requestDraw: () => this.requestDraw(),
    });
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
    const x = this.localX(e) - (this.axis ? RAIL_W : 0);
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

    const x = this.localX(e) - (this.axis ? RAIL_W : 0);
    if (drag.mode === 'scrub') {
      this.onSeek?.(Math.max(0, V.timeAtX(this.view, env, x)));
      return;
    }
    const t = clamp(V.timeAtX(this.view, env, x), 0, doc.duration);
    if (Math.abs(x - drag.startX) > CLICK_PIXELS) {
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
    const x = this.localX(e) - (this.axis ? RAIL_W : 0);
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
      const rail = this.axis ? RAIL_W : 0;
      this.zoom(zoomFactor(dy || dx), (this.localX(e) - rail) / Math.max(1, this.cssW - rail));
      return;
    }
    const seconds = ((dx || dy) * this.view.spp) / env.sampleRate;
    this.setStart(this.view.start + seconds * 1.2);
  }
}
