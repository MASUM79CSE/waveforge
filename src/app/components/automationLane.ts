/**
 * Per-lane automation gesture wiring (A4 — docs/automation-plan.md).
 * Attached alongside the clip-gesture handlers; the envelope CLAIMS the
 * pointer only while `automationMode` is on (clip handlers self-check and
 * yield). One history entry per gesture: `before` is snapshotted at
 * pointer-down, live drags mutate through the pure kernels, pointer-up
 * commits via executeAutomationEdit. Right-click deletes the point under
 * the cursor (also one entry; emptying the curve = automation off).
 */
import {
  automationMode,
  automationParamFor,
  automationPreview,
  beginAutomationGesture,
  dragAutomationTo,
  removeAutomationPointAt,
  type AutomationGesture,
  type OverlayGeom,
} from '../automationUi';
import type { AutomationPoint } from '../../engine/automation';
import { clipArrangement, projectEditor, syncProject } from '../projectActions';
import { projectTracks } from '../state';
import { t } from '../../i18n';

export interface AutomationLaneHelpers {
  geomNow(): OverlayGeom;
}

/** Live curve for the lane: drag preview wins over the committed snapshot. */
export function automationCurveNow(
  trackId: string,
): { points: AutomationPoint[]; baseline: number; param: 'volume' | 'pan' } {
  const param = automationParamFor(trackId);
  const snap = projectTracks.value.find((tr) => tr.id === trackId);
  const preview = automationPreview.value;
  const points =
    preview && preview.trackId === trackId && preview.param === param
      ? preview.points
      : (snap?.automation?.[param] ?? []);
  const baseline = param === 'volume' ? (snap?.gain ?? 1) : (snap?.pan ?? 0);
  return { points, baseline, param };
}

export function wireAutomationLane(
  trackId: string,
  canvas: HTMLCanvasElement,
  helpers: AutomationLaneHelpers,
): () => void {
  let gesture: AutomationGesture | null = null;

  const laneEndSample = (): number =>
    (clipArrangement(trackId) ?? []).reduce((m, cl) => Math.max(m, cl.start + cl.duration), 0);

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !automationMode.value) return;
    const rect = canvas.getBoundingClientRect();
    const ag = beginAutomationGesture(
      trackId,
      automationParamFor(trackId),
      automationCurveNow(trackId).points,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      helpers.geomNow(),
    );
    gesture = ag;
    automationPreview.value = { trackId: ag.trackId, param: ag.param, points: ag.points };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!automationMode.value) return;
    if (!gesture) {
      canvas.style.cursor = 'crosshair';
      return;
    }
    const rect = canvas.getBoundingClientRect();
    dragAutomationTo(
      gesture,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      helpers.geomNow(),
      laneEndSample(),
    );
    automationPreview.value = { trackId: gesture.trackId, param: gesture.param, points: gesture.points };
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent): void => {
    const ag = gesture;
    gesture = null;
    if (!ag) return;
    automationPreview.value = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    const ed = projectEditor();
    if (ed) {
      ed.executeAutomationEdit(ag.trackId, ag.param, ag.before, ag.points.map((p) => ({ ...p })), t().automationEdit);
      syncProject();
    }
  };

  // right-click: delete the point under the cursor (emptying = param off)
  const onContextMenu = (e: MouseEvent): void => {
    if (!automationMode.value) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const param = automationParamFor(trackId);
    const current = automationCurveNow(trackId).points;
    const after = removeAutomationPointAt(
      current,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      param,
      helpers.geomNow(),
    );
    const ed = projectEditor();
    if (!ed) return;
    ed.executeAutomationEdit(trackId, param, current, after, t().automationEdit);
    syncProject();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}
