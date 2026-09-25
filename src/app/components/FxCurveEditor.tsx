/**
 * A7 — envelope editor canvas for one effect param. x spans the region (0..fxRegionLen samples), y the param's
 * spec domain. Gestures reuse the generalized A4 primitives: click adds /
 * grabs a point, drag moves it, right-click deletes (clearing = curve off).
 * The dashed baseline is the static slider value the curve replaces.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { ParamSpec } from '../../fx/types';
import { currentTheme } from '../../engine/waveDraw';
import {
  beginEnvelopeGesture,
  dragEnvelopeTo,
  curveYIn,
  envelopeNeighborAt,
  fxEnvelopeParam,
  fxRegionLen,
  fxCurvesDraft,
  insertEnvelopeInitial,
  insertEnvelopeNeighbor,
  nudgeEnvelopePoint,
  removeEnvelopePointAt,
  setFxCurvePoints,
  removeFxCurve,
  type EnvelopeGesture,
  type OverlayGeom,
  type ValueDomain,
} from '../fxEnvelope';
import { removePoint } from '../../engine/automation';
import { t } from '../../i18n';

const POINT = 5;

export function FxCurveEditor({
  spec,
  staticValue,
  curveKey,
}: {
  spec: ParamSpec;
  staticValue: number;
  /** C5: draft key override (rack entries namespace `${index}:${key}`);
   * defaults to spec.key (single-effect dialogs). */
  curveKey?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<EnvelopeGesture | null>(null);
  const domain: ValueDomain = { min: spec.min, max: spec.max };
  const key = curveKey ?? spec.key;
  // X3: keyboard selection (ref: the draw closure reads it without
  // re-subscribing; drawRef triggers the redraw on selection changes)
  const selectedRef = useRef<number | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const setSelection = (index: number | null): void => {
    selectedRef.current = index;
    drawRef.current?.();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');

    const geomNow = (): OverlayGeom => ({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      spp: fxRegionLen.value / canvas.clientWidth,
      viewStart: 0,
      sampleRate: 1, // x is already in samples: at = x · spp
    });

    const draw = (): void => {
      if (!ctx2d) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const px = Math.round(w * dpr);
      const py = Math.round(h * dpr);
      if (canvas.width !== px || canvas.height !== py) {
        canvas.width = px;
        canvas.height = py;
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      const theme = currentTheme();
      ctx2d.fillStyle = theme.laneBg;
      ctx2d.fillRect(0, 0, w, h);
      const geom = geomNow();
      const points = fxCurvesDraft.value[key] ?? [];
      const yOf = (v: number): number => curveYIn(v, domain, geom);
      if (points.length === 0) {
        // dashed static baseline — where a first point would act
        ctx2d.save();
        ctx2d.strokeStyle = theme.automationLine;
        ctx2d.globalAlpha = 0.35;
        ctx2d.setLineDash([4, 4]);
        ctx2d.beginPath();
        ctx2d.moveTo(0, Math.round(yOf(staticValue)) + 0.5);
        ctx2d.lineTo(w, Math.round(yOf(staticValue)) + 0.5);
        ctx2d.stroke();
        ctx2d.restore();
        return;
      }
      ctx2d.save();
      ctx2d.strokeStyle = theme.automationLine;
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      const xOf = (at: number): number => at / geom.spp;
      ctx2d.moveTo(0, yOf(points[0]!.value));
      for (const p of points) ctx2d.lineTo(xOf(p.at), yOf(p.value));
      ctx2d.lineTo(w, yOf(points[points.length - 1]!.value));
      ctx2d.stroke();
      ctx2d.fillStyle = theme.automationPoint;
      for (const p of points) {
        ctx2d.fillRect(Math.round(xOf(p.at)) - POINT / 2, Math.round(yOf(p.value)) - POINT / 2, POINT, POINT);
      }
      const sel = selectedRef.current;
      if (sel !== null && sel < points.length) {
        const p = points[sel]!;
        ctx2d.strokeStyle = theme.automationPoint;
        ctx2d.lineWidth = 1.5;
        ctx2d.strokeRect(
          Math.round(xOf(p.at)) - POINT / 2 - 3,
          Math.round(yOf(p.value)) - POINT / 2 - 3,
          POINT + 6,
          POINT + 6,
        );
      }
      ctx2d.restore();
    };

    const pointer = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const g = beginEnvelopeGesture(fxCurvesDraft.value[key] ?? [], pointer(e), domain, geomNow());
      gesture.current = g;
      setFxCurvePoints(key, g.points);
      selectedRef.current = g.index;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent): void => {
      const g = gesture.current;
      if (!g) return;
      dragEnvelopeTo(g, pointer(e), domain, geomNow(), fxRegionLen.value);
      setFxCurvePoints(key, g.points);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent): void => {
      if (!gesture.current) return;
      gesture.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
      const after = removeEnvelopePointAt(fxCurvesDraft.value[key] ?? [], pointer(e), domain, geomNow());
      setFxCurvePoints(key, after);
      setSelection(null);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      const pts = fxCurvesDraft.value[key] ?? [];
      const region = fxRegionLen.value;
      const consume = (): void => {
        e.preventDefault();
        e.stopPropagation(); // the global manager must not see these
      };
      if (pts.length === 0) {
        if (e.key === 'Enter' || e.key === ' ') {
          setFxCurvePoints(key, insertEnvelopeInitial(region, staticValue));
          setSelection(0);
          consume();
        }
        return;
      }
      const stepAt = e.shiftKey ? 1 : Math.max(1, Math.round(region * 0.01));
      const stepVal = (domain.max - domain.min) * (e.shiftKey ? 0.004 : 0.02);
      const sel = selectedRef.current;
      if (e.key.startsWith('Arrow')) {
        consume();
        if (sel === null) {
          setSelection(e.key === 'ArrowLeft' ? pts.length - 1 : 0);
          return;
        }
        const idx = Math.min(sel, pts.length - 1);
        const dAt = e.key === 'ArrowRight' ? stepAt : e.key === 'ArrowLeft' ? -stepAt : 0;
        const dVal = e.key === 'ArrowUp' ? stepVal : e.key === 'ArrowDown' ? -stepVal : 0;
        setFxCurvePoints(key, nudgeEnvelopePoint(pts, idx, domain, region, dAt, dVal));
        selectedRef.current = idx;
        drawRef.current?.();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        consume();
        if (sel === null) {
          setFxCurvePoints(key, insertEnvelopeInitial(region, staticValue));
          setSelection(0);
        } else {
          const idx = Math.min(sel, pts.length - 1);
          const at = envelopeNeighborAt(pts, idx, region);
          const next = insertEnvelopeNeighbor(pts, idx, domain, region);
          setFxCurvePoints(key, next);
          selectedRef.current = Math.max(0, next.findIndex((p) => p.at === at));
          drawRef.current?.();
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
        consume();
        const idx = Math.min(sel, pts.length - 1);
        const next = removePoint([...pts], idx);
        setFxCurvePoints(key, next);
        setSelection(next.length === 0 ? null : Math.min(idx, next.length - 1));
        return;
      }
      // Escape deselects FIRST (with a selection); with none it bubbles so
      // the global Escape chain still closes the dialog
      if (e.key === 'Escape' && sel !== null) {
        consume();
        setSelection(null);
      }
    };
    const onFocus = (): void => {
      const pts = fxCurvesDraft.value[key] ?? [];
      if (pts.length === 0 || selectedRef.current !== null) return;
      // select the point nearest the region midpoint
      const mid = fxRegionLen.value / 2;
      let best = 0;
      for (let i = 1; i < pts.length; ++i) {
        if (Math.abs(pts[i]!.at - mid) < Math.abs(pts[best]!.at - mid)) best = i;
      }
      setSelection(best);
    };

    draw();
    const unsub = fxCurvesDraft.subscribe(draw);
    const onResize = (): void => draw();
    window.addEventListener('resize', onResize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('focus', onFocus);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('focus', onFocus);
    };
  }, [key, spec.min, spec.max, staticValue]);

  const armed = fxEnvelopeParam.value === key;
  const count = (fxCurvesDraft.value[key] ?? []).length;
  return (
    <div class="fx-envelope" data-testid={`fx-envelope-${key}`}>
      <div class="fx-envelope-head">
        <span class="fx-envelope-title">
          {t().fxEnvelope}: {spec.key}
        </span>
        <span class="fx-envelope-hint">{t().fxEnvelopeHint}</span>
        <button class="chbtn danger" aria-label={t().fxEnvelopeClear} onClick={() => removeFxCurve(key)}>
          ×
        </button>
      </div>
      <canvas
        ref={canvasRef}
        class="fx-envelope-canvas"
        tabIndex={0}
        role="application"
        aria-label={`${t().fxEnvelope} ${spec.key}`}
        aria-describedby={`fx-env-keys-${key}`}
      />
      <span class="visually-hidden" id={`fx-env-keys-${key}`}>
        {t().fxEnvelopeKeys}
      </span>
      <span class="visually-hidden" data-testid={`fx-env-count-${key}`}>
        {armed ? count : 0}
      </span>
    </div>
  );
}

/** Re-exported for the row toggle (keeps one import surface). */
export { fxEnvelopeParam as fxEnvelopeParamSignal };
