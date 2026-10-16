/**
 * Graph (UX-4) — the frame2 Tier-A audio graph host, flag-ON only:
 *   Z5/Z6 track panel + vertical scale (analytic dB anchors, DOM — crisp
 *   and testable), Z7 waveform canvas (existing renderer, batched lanes +
 *   minor ruler ticks via additive options) with a separate overlay layer
 *   that owns the playhead — cursor ticks no longer repaint the waveform.
 * Interactions (click-seek, drag-select, wheel zoom) stay on the canvas
 * through the unchanged renderer pointer bindings.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { amplitudeAxis, docInfo, loadingActive, loadingLabel, loadingProgress, vzoom, cursorPos } from '../state';
import { openFileObject, loadSample, pickAudioFile } from '../actions';
import { renderer } from '../runtime';
import * as V from '../../engine/viewState';
import { RULER_H } from '../../engine/waveDraw';
import { BrandMark } from '../components/MenuBar';
import { ZoomBar } from '../components/ViewBars';
import { t } from '../../i18n';
import { dbAnchors, yForAmp } from './scale';

/** Percent position (0..100) of a dB anchor inside one lane block. */
function anchorPercent(amp: number): number {
  return (yForAmp(amp, 0, 50) / 100) * 100;
}

export function Graph() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const doc = docInfo.value;
  const loading = loadingActive.value;
  const channels = Math.max(1, doc?.channels ?? 1);

  // renderer lifecycle + frame2 draw options (restored on unmount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderer.attach(canvas);
    renderer.overlayPlayhead = true;
    renderer.batchedLanes = true;
    renderer.minorTicks = true;
    renderer.dbScale = true;
    renderer.setAxisVisible(false); // the DOM panel replaces rail + bottom axis
    return () => {
      renderer.overlayPlayhead = false;
      renderer.batchedLanes = false;
      renderer.minorTicks = false;
      renderer.dbScale = false;
      renderer.setAxisVisible(amplitudeAxis.value);
      renderer.detach();
    };
  }, []);

  useEffect(() => {
    const update = (): void => renderer.setVZoom(vzoom.value);
    update();
    return vzoom.subscribe(update);
  }, []);

  // overlay playhead: redraw on cursor/view/resize via rAF (tiny, isolated)
  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;
    let raf = 0;

    const draw = (): void => {
      raf = 0;
      const g = overlay.getContext('2d');
      const info = docInfo.value;
      if (!g || !info) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
        overlay.width = Math.max(1, Math.round(w * dpr));
        overlay.height = Math.max(1, Math.round(h * dpr));
        overlay.style.width = `${w}px`;
        overlay.style.height = `${h}px`;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const env: V.ViewEnv = { cssW: w, duration: info.duration, sampleRate: info.sampleRate };
      const x = Math.round(V.xAtTime(renderer.view, env, renderer.cursor)) + 0.5;
      if (x < 0 || x > w) return;
      const styles = getComputedStyle(document.documentElement);
      const color = styles.getPropertyValue('--cv-playhead').trim() || '#ff8c35';
      g.fillStyle = color;
      g.fillRect(x, RULER_H, 1, h - RULER_H);
      g.fillRect(x - 4, RULER_H, 9, 3); // tiny cap under the ruler
    };

    const schedule = (): void => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const unsubCursor = cursorPos.subscribe(schedule);
    const prevViewChange = renderer.onViewChange;
    renderer.onViewChange = (): void => {
      prevViewChange?.();
      schedule();
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    draw();
    return () => {
      unsubCursor();
      renderer.onViewChange = prevViewChange;
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      class="f2-graph"
      data-zone="Z4-Z7"
      data-testid="f2-graph"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const file = e.dataTransfer?.files[0];
        if (file) void openFileObject(file);
      }}
    >
      <div class="f2-graph-corner" aria-hidden="true" />
      <div class="f2-graph-panel" data-testid="f2-panel" aria-hidden="true">
        {Array.from({ length: channels }, (_, ch) => (
          <div class="f2-panel-lane" data-lane={ch} key={ch}>
            <span class="f2-panel-tag">{channels === 2 ? (ch === 0 ? 'L' : 'R') : 'MONO'}</span>
            {dbAnchors().map((a) => (
              <span
                key={a.label}
                class="f2-panel-anchor"
                style={{ top: `${anchorPercent(a.amp)}%` }}
              >
                {a.label}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div class="f2-graph-host" ref={hostRef}>
        <canvas ref={canvasRef} class="wave-canvas" />
        <canvas ref={overlayRef} class="f2-overlay" data-testid="f2-overlay" aria-hidden="true" />
        {doc && !loading && <ZoomBar />}
        {!doc && !loading && (
          <div class="empty-state">
            <BrandMark />
            <p class="empty-title">{t().dropHint}</p>
            <div class="empty-actions">
              <button class="btn-primary" onClick={() => pickAudioFile()}>
                {t().quickOpen}
              </button>
              <button class="btn-secondary" onClick={() => void loadSample()}>
                {t().quickSample}
              </button>
            </div>
          </div>
        )}
        {loading && (
          <div class="loading-overlay">
            <span class="spinner" />
            <span>{loadingLabel.value}</span>
            {loadingProgress.value !== null && (
              <span class="load-pct">{Math.round(loadingProgress.value * 100)}%</span>
            )}
          </div>
        )}
      </div>
      {dragOver && (
        <div class="drop-overlay" aria-hidden="true">
          <span class="drop-overlay-label">{t().dropHint}</span>
        </div>
      )}
    </div>
  ) as JSX.Element;
}
