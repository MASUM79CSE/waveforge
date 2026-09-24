import { useEffect, useRef } from 'preact/hooks';
import { amplitudeAxis, docInfo, loadingActive, loadingLabel, loadingProgress, vzoom } from '../state';
import { openFileObject, loadSample, pickAudioFile } from '../actions';
import { renderer } from '../runtime';
import { ZoomBar } from './ViewBars';
import { t } from '../../i18n';
import { BrandMark } from './MenuBar';

/** Hosts the waveform canvas, empty state, loading overlay and drag&drop. */
export function CanvasPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doc = docInfo.value;
  const loading = loadingActive.value;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderer.attach(canvas);
    return () => renderer.detach();
  }, []);

  useEffect(() => {
    const update = (): void => renderer.setAxisVisible(amplitudeAxis.value);
    update();
    return amplitudeAxis.subscribe(update);
  }, []);

  useEffect(() => {
    const update = (): void => renderer.setVZoom(vzoom.value);
    update();
    return vzoom.subscribe(update);
  }, []);

  return (
    <div
      class="canvas-region"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0];
        if (file) void openFileObject(file);
      }}
    >
      <canvas ref={canvasRef} class="wave-canvas" />
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
  );
}
