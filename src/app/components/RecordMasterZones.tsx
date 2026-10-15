/**
 * Record + Master zones of the transport row (extracted verbatim from
 * TransportBar.tsx for Control Bar v2 reuse — CB-2.1). v1 renders the same
 * components; the DOM is unchanged (verified by the untouched e2e suite).
 */
import { useEffect, useState } from 'preact/hooks';
import {
  channelMutes,
  channelPans,
  channelVolumes,
  channelsSwapped,
  clipLatched,
  countInBeat,
  docInfo,
  peakHoldDb,
  recLevel,
  recSeconds,
  recStudio,
  recording,
  armed,
  selection,
} from '../state';
import { setChannelPan, setChannelVolume, toggleChannelMute, toggleChannelsSwapped } from '../editActions';
import { punchRecord, resetClipLatch, setMonitoring } from '../recordActions';
import { ensureProject } from '../projectActions';
import { engine } from '../runtime';
import { fmtClock } from '../../core/format';
import { t } from '../../i18n';
import { Zone, Svg } from './Zone';

/** dBFS → 0..100 meter width (-60 dB floor). */
function meterPercent(peakDb: number): number {
  if (!Number.isFinite(peakDb)) return 0;
  return Math.max(0, Math.min(100, Math.round(((peakDb + 60) / 60) * 100)));
}

export function RecordZone() {
  return (
    <Zone label="Record">
      <button
        class={`tbtn ${recStudio.value.monitoring ? 'active' : ''}`}
        title={t().monitorTitle}
        data-testid="monitor-toggle"
        onClick={() => setMonitoring(!recStudio.value.monitoring)}
      >
        <Svg d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-6H4zm16 0a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v-6h1z" />
      </button>
      <button
        class="tbtn"
        title={t().punchIn}
        data-testid="punch-button"
        disabled={recording.value || !selection.value}
        onClick={() => void punchRecord()}
      >
        <Svg d="M9 4h2v16H9zM14 4h1a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-1zM5 6h2v12H5z" />
      </button>
      {(recording.value || armed.value) && (
        <span class="rec-meter" title={`${Math.round(recLevel.value.peakDb)} dB`}>
          <span
            class="rec-meter-fill"
            style={{ width: `${meterPercent(recLevel.value.peakDb)}%` }}
          />
          <span
            class="rec-meter-hold"
            style={{ left: `${meterPercent(peakHoldDb.value)}%` }}
          />
          <button
            class={`rec-clip ${clipLatched.value ? 'latched' : ''}`}
            title="Clip — click to reset"
            aria-label="Clip indicator"
            data-testid="clip-led"
            onClick={resetClipLatch}
          />
          {recording.value && <span class="rec-time">{fmtClock(recSeconds.value)}</span>}
        </span>
      )}
      {countInBeat.value > 0 && (
        <span class="count-chip" data-testid="count-in">
          {countInBeat.value}
        </span>
      )}
    </Zone>
  );
}

/** One reference-style channel strip: M mute, volume, pan (D8). */
function ChannelStrip({ ch, label, mute }: { ch: number; label: string; mute: boolean }) {
  const tag = ch === 0 ? 'L' : 'R';
  return (
    <span class="strip">
      <span class="strip-head">
        <span class={`strip-tag ${mute ? 'dim' : ''}`}>{tag}</span>
        <button
          class={`chbtn ${mute ? 'muted' : ''}`}
          onClick={() => toggleChannelMute(ch)}
          title={`${label} — mute`}
          aria-label={`${label} — mute`}
          aria-pressed={mute}
        >
          M
        </button>
      </span>
      <label class="strip-row">
        <span class="strip-lab">vol</span>
        <input
          type="range"
          class="strip-slider"
          min="0"
          max="1.5"
          step="0.01"
          value={channelVolumes.value[ch] ?? 1}
          aria-label={`${label} volume`}
          onInput={(e) => setChannelVolume(ch, Number((e.target as HTMLInputElement).value))}
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
          value={channelPans.value[ch] ?? 0}
          aria-label={`${label} pan`}
          onInput={(e) => setChannelPan(ch, Number((e.target as HTMLInputElement).value))}
        />
      </label>
    </span>
  );
}

export function MasterZone() {
  const doc = docInfo.value;
  const [volume, setVolume] = useState(0.9);
  const stereo = doc !== null && doc.channels >= 2;

  useEffect(() => {
    engine.setVolume(volume); // v1 behavior (F-08: local state, unpersisted)
  }, [volume]);

  return (
    <Zone label="Master">
      {stereo && (
        <div class="toolbar-group strips" role="group" aria-label="Channel strips">
          <ChannelStrip ch={0} label={t().channelLeft} mute={channelMutes.value[0] ?? false} />
          <ChannelStrip ch={1} label={t().channelRight} mute={channelMutes.value[1] ?? false} />
          <button
            class="chbtn addtrack"
            data-tip={t().trackAdd}
            aria-label={t().trackAdd}
            disabled={!docInfo.value}
            onClick={() => ensureProject()}
          >
            ＋
          </button>
          <button
            class={`chbtn ${channelsSwapped.value ? 'active' : ''}`}
            onClick={() => toggleChannelsSwapped()}
            title={t().channelSwap}
            aria-label={t().channelSwap}
          >
            ⇄
          </button>
        </div>
      )}
      <div class="transport-vol">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 9v6h4l5 5V4L7 9H3z" />
        </svg>
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.01"
          value={volume}
          disabled={!doc}
          title={t().volume}
          onInput={(e) => setVolume(Number((e.target as HTMLInputElement).value))}
        />
      </div>
    </Zone>
  );
}
