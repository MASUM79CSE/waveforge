/**
 * Clip-block lane canvas (M9d2 — docs/clips-plan.md): per-clip envelopes
 * from ASSET buckets (shared by every clip referencing the asset), block
 * tint/border/name/edge-handles, selection outline, and the pointer
 * gestures: click select, body-drag move, edge-drag trim (snap to beats
 * when the D5 toggle is on). Gestures preview live via `dragPreview` and
 * commit ONE history entry per gesture through the clips.ts kernels.
 */
import { useEffect, useRef } from 'preact/hooks';
import {
  accent,
  beats as beatsSignal,
  cursorPos,
  docInfo,
  projectVersion,
  theme,
  viewSpp,
  viewStart,
} from '../state';
import {
  activeClip,
  arrangeMoveClip,
  arrangeTrimClip,
  dragModeAt,
  dragPreview,
  selectClip,
  snapForDrag,
  type DragMode,
} from '../clipActions';
import { assetPcm, clipArrangement, projectEditor, syncProject } from '../projectActions';
import { automationMode, automationPreview, drawAutomationOverlay } from '../automationUi';
import { automationCurveNow, wireAutomationLane } from './automationLane';
import { laneBuckets, lanePeaksFromBuckets, type LaneBuckets } from '../../engine/lanePeaks';

/** Bucket envelope cache per ASSET (clips share their asset's envelope). */
const bucketCache = new Map<string, { version: number; buckets: LaneBuckets }>();

function bucketsForAsset(assetId: string, version: number): LaneBuckets | null {
  const hit = bucketCache.get(assetId);
  if (hit && hit.version === version) return hit.buckets;
  const channels = assetPcm(assetId);
  if (!channels) return null;
  const buckets = laneBuckets(channels);
  bucketCache.set(assetId, { version, buckets });
  return buckets;
}

import { currentTheme } from '../../engine/waveDraw';
import { paletteVersionNow } from '../theme';

/** Edge hit-zone width in CSS pixels (trim handles). */
const EDGE_PX = 6;

interface GestureState {
  trackId: string;
  clipId: string;
  mode: DragMode;
  grabOffsetSamples: number;
  originStart: number;
}

/** Clip-block lane (M9d2): per-clip envelopes + select/move/trim gestures. */
export function LaneCanvas({ trackId }: { trackId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<GestureState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    interface EnvCache {
      key: string;
      entries: Array<{ clipId: string; xs: number; xe: number; x0: number; min: Float32Array; max: Float32Array }>;
    }
    let cache: EnvCache | null = null;
    const ctx2d = canvas.getContext('2d');

    const draw = (cursorOnly: boolean): void => {
      if (!ctx2d) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const spp = viewSpp.value;
      const start = viewStart.value; // seconds (viewState convention)
      const sr = docInfo.value?.sampleRate ?? 44100;
      const themeVer = paletteVersionNow();

      const preview = dragPreview.value;
      const clips =
        preview && preview.trackId === trackId ? preview.clips : (clipArrangement(trackId) ?? []);
      const selected = activeClip.value;

      // per-clip envelopes rebuilt on any non-cursor change
      const cacheKey = `${sr}|${spp}|${start}|${w}|${projectVersion.value}|${themeVer}|${clips.map((c) => `${c.id}:${c.start}:${c.offset}:${c.duration}:${c.assetId}`).join(',')}|${selected?.clipId ?? ''}|${preview ? 'p' : 'c'}`;
      let env: EnvCache['entries'];
      if (cache?.key === cacheKey && !cursorOnly) {
        env = cache.entries;
      } else {
        env = [];
        if (!cursorOnly) {
          for (const c of clips) {
            const buckets = bucketsForAsset(c.assetId, themeVer * 1e9 + projectVersion.value);
            if (!buckets) continue;
            const x0 = xAtTimePx(c.start / sr, start, sr, spp);
            const x1 = xAtTimePx((c.start + c.duration) / sr, start, sr, spp);
            const xs = Math.max(0, Math.ceil(x0));
            const xe = Math.min(w, Math.floor(x1));
            if (xe - xs < 1) continue;
            const fromSample = c.offset + Math.round((xs - x0) * spp);
            const peaks = lanePeaksFromBuckets(buckets, Math.max(1, Math.round(spp)), fromSample, xe - xs);
            env.push({
              clipId: c.id,
              xs,
              xe,
              x0,
              min: peaks?.min ?? new Float32Array(xe - xs),
              max: peaks?.max ?? new Float32Array(xe - xs),
            });
          }
        }
        cache = { key: cacheKey, entries: env };
      }

      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      const px = Math.round(w * dpr);
      const py = Math.round(h * dpr);
      if (canvas.width !== px || canvas.height !== py) {
        canvas.width = px;
        canvas.height = py;
      }
      const theme = currentTheme();
      if (!cursorOnly) {
        ctx2d.fillStyle = theme.laneBg;
        ctx2d.fillRect(0, 0, w, h);
        ctx2d.strokeStyle = theme.center;
        ctx2d.beginPath();
        ctx2d.moveTo(0, h / 2);
        ctx2d.lineTo(w, h / 2);
        ctx2d.stroke();

        for (const c of clips) {
          const x0 = xAtTimePx(c.start / sr, start, sr, spp);
          const x1 = xAtTimePx((c.start + c.duration) / sr, start, sr, spp);
          if (x1 < 0 || x0 > w) continue;
          const isSel = selected?.trackId === trackId && selected.clipId === c.id;
          const bx0 = Math.max(0, x0);
          const bx1 = Math.min(w, x1);
          // block tint + border
          ctx2d.fillStyle = theme.clipBg;
          ctx2d.fillRect(bx0, 0, bx1 - bx0, h);
          // envelope
          const entry = env.find((e) => e.clipId === c.id);
          if (entry) {
            ctx2d.fillStyle = theme.wave;
            for (let x = entry.xs; x < entry.xe; ++x) {
              const lo = entry.min[x - entry.xs]!;
              const hi = entry.max[x - entry.xs]!;
              if (lo === 0 && hi === 0) continue;
              const y1 = ((1 - hi) * h) / 2;
              const y2 = ((1 - lo) * h) / 2;
              ctx2d.fillRect(x, y1, 1, Math.max(1, y2 - y1));
            }
          }
          // border (selected → accent) + edge handles
          ctx2d.strokeStyle = isSel ? theme.clipSelected : theme.clipBorder;
          ctx2d.lineWidth = 1;
          ctx2d.strokeRect(bx0 + 0.5, 0.5, bx1 - bx0 - 1, h - 1);
          ctx2d.fillStyle = isSel ? theme.clipSelected : theme.clipEdge;
          ctx2d.fillRect(bx0, 0, Math.min(EDGE_PX, bx1 - bx0), h);
          ctx2d.fillRect(Math.max(bx0, bx1 - EDGE_PX), 0, Math.min(EDGE_PX, bx1 - bx0), h);
          // name label
          const assetName = c.assetId.replace(/^asset_/, '');
          ctx2d.fillStyle = isSel ? theme.clipSelected : theme.clipBorder;
          ctx2d.font = '10px system-ui, sans-serif';
          if (bx1 - bx0 > 24) ctx2d.fillText(assetName.slice(0, 24), bx0 + EDGE_PX + 2, 11);
        }
      }
      // A4: envelope overlay claims the lane while automation mode is on
      if (automationMode.value && !cursorOnly) {
        const curve = automationCurveNow(trackId);
        drawAutomationOverlay(ctx2d, curve.points, curve.param, { width: w, height: h, spp, viewStart: start, sampleRate: sr }, theme, curve.baseline);
      }
      // playhead (shared timeline; x from the viewState convention)
      const x = xAtTimePx(cursorPos.value, start, sr, spp);
      ctx2d.strokeStyle = theme.playhead;
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, h);
      ctx2d.stroke();
    };

    const sampleAt = (clientX: number): { sample: number; spp: number; sr: number } => {
      const rect = canvas.getBoundingClientRect();
      const spp = viewSpp.value;
      const sr = docInfo.value?.sampleRate ?? 44100;
      const sample = Math.round((viewStart.value + ((clientX - rect.left) * spp) / sr) * sr);
      return { sample, spp, sr };
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0 || automationMode.value) return; // A4: envelope owns the pointer
      const { sample, spp } = sampleAt(e.clientX);
      const clips = clipArrangement(trackId) ?? [];
      const hit = dragModeAt(clips, sample, spp, EDGE_PX);
      if (!hit) {
        selectClip(null); // click on empty lane/gap deselects
        return;
      }
      selectClip({ trackId, clipId: hit.clip.id });
      gesture.current = {
        trackId,
        clipId: hit.clip.id,
        mode: hit.kind,
        grabOffsetSamples: hit.kind === 'move' ? sample - hit.clip.start : 0,
        originStart: hit.clip.start,
      };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (automationMode.value) return; // A4: envelope owns the pointer
      const g = gesture.current;
      const { sample, spp, sr } = sampleAt(e.clientX);
      if (!g) {
        // hover cursor hint (mode → automationLane paints crosshair)
        const hit = dragModeAt(clipArrangement(trackId) ?? [], sample, spp, EDGE_PX);
        canvas.style.cursor = hit ? (hit.kind === 'move' ? 'grab' : 'ew-resize') : 'default';
        return;
      }
      const beats = beatsSignal.value;
      if (g.mode === 'move') {
        const target = snapForDrag(sample - g.grabOffsetSamples, sr, beats);
        const clips = clipArrangement(trackId) ?? [];
        const clip = clips.find((c) => c.id === g.clipId);
        if (!clip) return;
        const delta = target - clip.start;
        const moved = clips.map((c) => {
          if (c.id !== g.clipId) return c;
          const prev = clips[clips.indexOf(c) - 1];
          const next = clips[clips.indexOf(c) + 1];
          const min = prev ? prev.start + prev.duration : 0;
          const max = next ? next.start - c.duration : Number.POSITIVE_INFINITY;
          return { ...c, start: Math.min(Math.max(c.start + delta, min), max) };
        });
        dragPreview.value = { trackId, clips: moved };
      } else {
        const at = snapForDrag(sample, sr, beats);
        const clips = clipArrangement(trackId) ?? [];
        const clip = clips.find((c) => c.id === g.clipId);
        if (!clip) return;
        const assetLen = assetPcm(clip.assetId)?.[0]?.length ?? 0;
        const next = clips[clips.indexOf(clip) + 1];
        const prev = clips[clips.indexOf(clip) - 1];
        let trimmed = clip;
        if (g.mode === 'trim-start') {
          const min = prev ? prev.start + prev.duration : 0;
          const st = Math.min(Math.max(at, min), clip.start + clip.duration - 1);
          trimmed = { ...clip, start: st, offset: clip.offset + (st - clip.start), duration: clip.start + clip.duration - st };
        } else {
          const max = Math.min(next ? next.start : Number.POSITIVE_INFINITY, clip.offset + assetLen);
          const en = Math.max(Math.min(at, max), clip.start + 1);
          trimmed = { ...clip, duration: en - clip.start };
        }
        dragPreview.value = { trackId, clips: clips.map((c) => (c.id === g.clipId ? trimmed : c)) };
      }
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (automationMode.value) return; // A4: envelope owns the pointer
      const g = gesture.current;
      gesture.current = null;
      canvas.style.cursor = 'default';
      if (!g) return;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      const preview = dragPreview.value;
      dragPreview.value = null;
      if (!preview || preview.trackId !== trackId) return;
      const ed = projectEditor();
      if (!ed) return;
      const after = preview.clips.find((c) => c.id === g.clipId);
      if (!after) return;
      if (g.mode === 'move') {
        arrangeMoveClip(ed, trackId, g.clipId, after.start);
      } else if (g.mode === 'trim-start') {
        arrangeTrimClip(ed, trackId, g.clipId, 'start', after.start);
      } else {
        arrangeTrimClip(ed, trackId, g.clipId, 'end', after.start + after.duration);
      }
      syncProject();
    };

    const full = (): void => draw(false);
    const cursor = (): void => draw(true);
    full();
    const subs = [
      viewSpp.subscribe(full),
      viewStart.subscribe(full),
      cursorPos.subscribe(cursor),
      projectVersion.subscribe(full),
      theme.subscribe(full),
      accent.subscribe(full),
      activeClip.subscribe(full),
      dragPreview.subscribe(full),
      automationMode.subscribe(full),
      automationPreview.subscribe(full),
    ];
    const onResize = (): void => full();
    window.addEventListener('resize', onResize);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    const detachAutomation = wireAutomationLane(trackId, canvas, {
      geomNow: (): import('../automationUi').OverlayGeom => ({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        spp: viewSpp.value,
        viewStart: viewStart.value,
        sampleRate: docInfo.value?.sampleRate ?? 44100,
      }),
    });
    return () => {
      for (const un of subs) un();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      detachAutomation();
    };
  }, [trackId]);

  return <canvas ref={canvasRef} class="lane-canvas" />;
}

/** Live clip count for a lane (e2e + aria assertability). */
export function useClipCount(trackId: string): number {
  void projectVersion.value; // subscribe: re-render on any project change
  return clipArrangement(trackId)?.length ?? 0;
}

/** Pixel x for time t given the viewState convention (start seconds, spp). */
function xAtTimePx(t: number, startSec: number, sr: number, spp: number): number {
  if (spp <= 0) return -1;
  return ((t - startSec) * sr) / spp;
}
