import { useEffect, useRef, useState } from 'preact/hooks';
import {
  accent,
  activeTrackId,
  cursorPos,
  docInfo,
  projectOpen,
  projectTracks,
  projectVersion,
  theme,
  viewSpp,
  viewStart,
} from '../state';
import {
  getTrackChannels,
  importToTrack,
  removeTrack,
  setActiveTrack,
  updateTrackMix,
} from '../projectActions';
import { lanePeaks } from '../../engine/lanePeaks';
import { currentTheme } from '../../engine/waveDraw';
import { paletteVersionNow } from '../theme';
import { t } from '../../i18n';

/**
 * Multitrack lane stack (M8d): strips + waveform lanes mirroring the main
 * view. Lane 1 is the document; further lanes come from imports. Rendered
 * under the document canvas while `projectOpen`.
 */
export function TrackLanes() {
  const open = projectOpen.value;
  const tracks = projectTracks.value;
  if (!open) return null;
  return (
    <div class="lane-stack" role="list" aria-label={t().trackAdd}>
      {tracks.map((snap) => (
        <Lane key={snap.id} snap={snap} active={activeTrackId.value === snap.id} />
      ))}
      <div class="lane lane-empty" role="listitem">
        <ImportButton />
      </div>
    </div>
  );
}

function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        class="lane-file"
        aria-hidden="true"
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) void importToTrack(file).catch(() => {});
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <button class="btn-secondary lane-import" onClick={() => inputRef.current?.click()}>
        ＋ {t().trackImport}
      </button>
    </>
  );
}

interface Snap {
  id: string;
  name: string;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  channelCount: number;
}

function Lane({ snap, active }: { snap: Snap; active: boolean }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <div
      class={`lane ${active ? 'active' : ''}`}
      role="listitem"
      onPointerDown={() => setActiveTrack(snap.id)}
    >
      <div class="lane-strip">
        <span class="lane-head">
          <span class="lane-name" aria-label={t().trackNameAria} title={snap.name}>
            {snap.name}
          </span>
          <span class="lane-badge">{snap.channelCount === 1 ? 'MONO' : 'STEREO'}</span>
          {confirmRemove ? (
            <span class="lane-confirm">
              <button
                class="chbtn danger"
                aria-label={t().trackRemoveYes}
                onClick={() => {
                  setConfirmRemove(false);
                  removeTrack(snap.id);
                }}
              >
                ✓
              </button>
              <button
                class="chbtn"
                aria-label={t().trackRemoveNo}
                onClick={() => setConfirmRemove(false)}
              >
                ✗
              </button>
            </span>
          ) : (
            <button
              class="chbtn lane-remove"
              aria-label={`${snap.name} ${t().trackRemove}`}
              title={t().trackRemove}
              onClick={() => setConfirmRemove(true)}
            >
              ×
            </button>
          )}
        </span>
        <label class="strip-row">
          <span class="strip-lab">vol</span>
          <input
            type="range"
            class="strip-slider"
            min="0"
            max="1.5"
            step="0.01"
            value={snap.gain}
            aria-label={`${snap.name} ${t().trackVolAria}`}
            onInput={(e) => updateTrackMix(snap.id, { gain: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
        <label class="strip-row">
          <span class="strip-lab">pan</span>
          <input
            type="range"
            class="strip-slider"
            min="-1"
            max="1"
            step="0.01"
            value={snap.pan}
            aria-label={`${snap.name} ${t().trackPanAria}`}
            onInput={(e) => updateTrackMix(snap.id, { pan: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
        <span class="lane-btns">
          <button
            class={`chbtn ${snap.mute ? 'muted' : ''}`}
            aria-pressed={snap.mute}
            aria-label={`${snap.name} ${t().trackMuteAria}`}
            onClick={() => updateTrackMix(snap.id, { mute: !snap.mute })}
          >
            M
          </button>
          <button
            class={`chbtn solo ${snap.solo ? 'soloed' : ''}`}
            aria-pressed={snap.solo}
            aria-label={`${snap.name} ${t().trackSoloAria}`}
            onClick={() => updateTrackMix(snap.id, { solo: !snap.solo })}
          >
            S
          </button>
        </span>
      </div>
      <LaneCanvas trackId={snap.id} />
    </div>
  );
}

/** Lane waveform: mirrors the doc view; envelope cached, playhead cheap. */
function LaneCanvas({ trackId }: { trackId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    interface EnvCache {
      key: string;
      min: Float32Array;
      max: Float32Array;
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

      // envelope cache: view/theme/project changes rebuild, cursor doesn't
      const key = `${trackId}|${spp}|${start}|${w}|${sr}|${projectVersion.value}|${themeVer}`;
      let min: Float32Array;
      let max: Float32Array;
      if (cache?.key === key) {
        min = cache.min;
        max = cache.max;
      } else {
        const channels = getTrackChannels(trackId);
        // view.start is seconds (viewState convention); peak domain is samples
        const peaks = channels
          ? lanePeaks(channels, Math.max(1, Math.round(spp)), Math.round(start * sr), w)
          : null;
        min = peaks?.min ?? new Float32Array(w);
        max = peaks?.max ?? new Float32Array(w);
        cache = { key, min, max };
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
        ctx2d.fillStyle = theme.wave;
        for (let x = 0; x < w; ++x) {
          const lo = min[x]!;
          const hi = max[x]!;
          if (lo === 0 && hi === 0) continue;
          const y1 = ((1 - hi) * h) / 2;
          const y2 = ((1 - lo) * h) / 2;
          ctx2d.fillRect(x, y1, 1, Math.max(1, y2 - y1));
        }
      }
      // playhead (shared timeline; x from the viewState convention)
      const x = xAtTimePx(cursorPos.value, start, sr, spp);
      ctx2d.strokeStyle = theme.playhead;
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, h);
      ctx2d.stroke();
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
    ];
    const onResize = (): void => full();
    window.addEventListener('resize', onResize);
    return () => {
      for (const un of subs) un();
      window.removeEventListener('resize', onResize);
    };
  }, [trackId]);

  return <canvas ref={canvasRef} class="lane-canvas" />;
}

/** Pixel x for time t given the viewState convention (start seconds, spp). */
function xAtTimePx(t: number, startSec: number, sr: number, spp: number): number {
  if (spp <= 0) return -1;
  return ((t - startSec) * sr) / spp;
}

