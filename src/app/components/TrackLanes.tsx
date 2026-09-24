import { useRef, useState } from 'preact/hooks';
import { activeTrackId, projectOpen, projectTracks } from '../state';
import { automationMode, automationParamFor, setAutomationParamFor, type AutomationParam } from '../automationUi';
import {
  importToTrack,
  removeTrack,
  setActiveTrack,
  updateTrackMix,
} from '../projectActions';
import { t } from '../../i18n';
import { LaneCanvas, useClipCount } from './ClipLaneCanvas';

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
  automation?: Record<string, { at: number; value: number }[]>;
}

function Lane({ snap, active }: { snap: Snap; active: boolean }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const clipCount = useClipCount(snap.id);
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
      {automationMode.value && (
        <span class="lane-automation" role="group" aria-label={`${snap.name} ${t().automationParamAria}`}>
          {(['volume', 'pan'] as AutomationParam[]).map((param) => (
            <button
              key={param}
              class={`chbtn lane-param ${automationParamFor(snap.id) === param ? 'soloed' : ''}`}
              aria-pressed={automationParamFor(snap.id) === param}
              aria-label={`${snap.name} ${t().automationParamAria} ${param === 'volume' ? t().automationVolume : t().automationPan}`}
              title={param === 'volume' ? t().automationVolume : t().automationPan}
              onClick={() => setAutomationParamFor(snap.id, param)}
            >
              {param === 'volume' ? t().automationVolume.slice(0, 3).toUpperCase() : t().automationPan.slice(0, 3).toUpperCase()}
            </button>
          ))}
        </span>
      )}
      <LaneCanvas trackId={snap.id} />
      <span class="visually-hidden" data-testid={`clips-${snap.name}`}>{clipCount}</span>
      <span class="visually-hidden" data-testid={`automation-${snap.name}`}>
        {snap.automation?.[automationParamFor(snap.id)]?.length ?? 0}
      </span>
    </div>
  );
}

