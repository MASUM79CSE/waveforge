/**
 * A7 — envelope editor canvas for one effect param (docs/automation-plan.md
 * A7 addendum). x spans the region (0..fxRegionLen samples), y the param's
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
  fxEnvelopeParam,
  fxRegionLen,
  fxCurvesDraft,
  removeEnvelopePointAt,
  setFxCurvePoints,
  removeFxCurve,
  type EnvelopeGesture,
  type OverlayGeom,
  type ValueDomain,
} from '../fxEnvelope';
import { t } from '../../i18n';

const POINT = 5;

export function FxCurveEditor({ spec, staticValue }: { spec: ParamSpec; staticValue: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<EnvelopeGesture | null>(null);
  const domain: ValueDomain = { min: spec.min, max: spec.max };

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
      const points = fxCurvesDraft.value[spec.key] ?? [];
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
      ctx2d.restore();
    };

    const pointer = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const g = beginEnvelopeGesture(fxCurvesDraft.value[spec.key] ?? [], pointer(e), domain, geomNow());
      gesture.current = g;
      setFxCurvePoints(spec.key, g.points);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent): void => {
      const g = gesture.current;
      if (!g) return;
      dragEnvelopeTo(g, pointer(e), domain, geomNow(), fxRegionLen.value);
      setFxCurvePoints(spec.key, g.points);
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
      const after = removeEnvelopePointAt(fxCurvesDraft.value[spec.key] ?? [], pointer(e), domain, geomNow());
      setFxCurvePoints(spec.key, after);
    };

    draw();
    const unsub = fxCurvesDraft.subscribe(draw);
    const onResize = (): void => draw();
    window.addEventListener('resize', onResize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [spec.key, spec.min, spec.max, staticValue]);

  const armed = fxEnvelopeParam.value === spec.key;
  const count = (fxCurvesDraft.value[spec.key] ?? []).length;
  return (
    <div class="fx-envelope" data-testid={`fx-envelope-${spec.key}`}>
      <div class="fx-envelope-head">
        <span class="fx-envelope-title">
          {t().fxEnvelope}: {spec.key}
        </span>
        <span class="fx-envelope-hint">{t().fxEnvelopeHint}</span>
        <button class="chbtn danger" aria-label={t().fxEnvelopeClear} onClick={() => removeFxCurve(spec.key)}>
          ×
        </button>
      </div>
      <canvas ref={canvasRef} class="fx-envelope-canvas" aria-label={`${t().fxEnvelope} ${spec.key}`} />
      <span class="visually-hidden" data-testid={`fx-env-count-${spec.key}`}>
        {armed ? count : 0}
      </span>
    </div>
  );
}

/** Re-exported for the row toggle (keeps one import surface). */
export { fxEnvelopeParam as fxEnvelopeParamSignal };
