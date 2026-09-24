import { useEffect, useState } from 'preact/hooks';
import {
  channelMutes,
  channelPans,
  channelVolumes,
  channelsSwapped,
  cursorPos,
  docInfo,
  looping,
  playing,
} from '../state';
import { transport } from '../actions';
import {
  setChannelPan,
  setChannelVolume,
  toggleChannelMute,
  toggleChannelsSwapped,
} from '../editActions';
import { toggleRecord } from '../recordActions';
import { recording, recLevel, recSeconds } from '../state';
import { engine } from '../runtime';
import { ToolBar } from './ToolBar';
import { SelectionBar } from './SelectionBar';
import { BeatBar } from './ViewBars';
import { fmtClock } from '../../core/format';
import { t } from '../../i18n';

/** dBFS → 0..100 meter width (-60 dB floor). */
function meterPercent(peakDb: number): number {
  if (!Number.isFinite(peakDb)) return 0;
  return Math.max(0, Math.min(100, Math.round(((peakDb + 60) / 60) * 100)));
}

export function TransportBar() {
  const doc = docInfo.value;
  const [volume, setVolume] = useState(0.9);
  const stereo = doc !== null && doc.channels >= 2;

  useEffect(() => {
    engine.setVolume(volume);
  }, [volume]);

  return (
    <div class="transport">
      <div class="transport-group">
        <button class="tbtn" title="Seek Start (Home)" onClick={() => transport.seekStart()} disabled={!doc}>
          <Svg d="M6 5v14M20 5l-11 7 11 7z" />
        </button>
        <button
          class={`tbtn tbtn-play ${playing.value ? 'active' : ''}`}
          title={playing.value ? `${t().pause} (Space)` : `${t().play} (Space)`}
          onClick={() => transport.togglePlay()}
          disabled={!doc}
        >
          {playing.value ? <Svg d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <Svg d="M7 4l14 8-14 8z" />}
        </button>
        <button class="tbtn" title={t().stop} onClick={() => transport.stop()} disabled={!doc}>
          <Svg d="M6 6h12v12H6z" />
        </button>
        <button
          class={`tbtn ${looping.value ? 'active' : ''}`}
          title={`${t().toggleLoop} (L)`}
          onClick={() => transport.toggleLoop()}
          disabled={!doc}
        >
          <Svg d="M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3H2a5 5 0 0 1 5-5h10V2zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3h2a5 5 0 0 1-5 5H7v3z" />
        </button>
      </div>

      <div class="transport-time" title="Cursor / duration">
        <span class="time-cursor">{fmtClock(cursorPos.value)}</span>
        <span class="time-sep">/</span>
        <span class="time-total">{doc ? fmtClock(doc.duration) : '0:00.000'}</span>
      </div>

      <ToolBar />
      <SelectionBar />
      <BeatBar />

      <div class="transport-spacer" />

      {stereo && (
        <div class="toolbar-group strips" role="group" aria-label="Channel strips">
          <ChannelStrip ch={0} label={t().channelLeft} mute={channelMutes.value[0] ?? false} />
          <ChannelStrip ch={1} label={t().channelRight} mute={channelMutes.value[1] ?? false} />
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

      <button
        class={`tbtn ${recording.value ? 'recording' : ''}`}
        title={recording.value ? t().recordStop : t().recordStart}
        onClick={() => void toggleRecord()}
      >
        <Svg d="M12 7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5zM8 21h8" />
      </button>
      {recording.value && (
        <span class="rec-meter" title={`${Math.round(recLevel.value.peakDb)} dB`}>
          <span
            class="rec-meter-fill"
            style={{ width: `${meterPercent(recLevel.value.peakDb)}%` }}
          />
          <span class="rec-time">{fmtClock(recSeconds.value)}</span>
        </span>
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
    </div>
  );
}

/** One AudioMass-style channel strip: M mute, volume, pan (D8). */
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

function Svg({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
