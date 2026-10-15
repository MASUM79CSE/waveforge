/**
 * Control Bar v2 master zone (CB-3.4/CB-D9): channel strips verbatim, the
 * master slider bound to the CANONICAL masterVolume signal (no local
 * useState — F-08) mirrored into engine.setVolume by an effect. No
 * persistence in v2 (P3 ticket owns that decision).
 */
import { useEffect } from 'preact/hooks';
import {
  channelMutes,
  channelPans,
  channelVolumes,
  channelsSwapped,
  docInfo,
  masterVolume,
} from '../state';
import { setChannelPan, setChannelVolume, toggleChannelMute, toggleChannelsSwapped } from '../editActions';
import { ensureProject } from '../projectActions';
import { engine } from '../runtime';
import { t } from '../../i18n';
import { Zone } from '../components/Zone';

export function MasterZoneV2() {
  const doc = docInfo.value;
  const stereo = doc !== null && doc.channels >= 2;
  const volume = masterVolume.value;

  useEffect(() => {
    engine.setVolume(volume);
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
          data-testid="cb2-master-vol"
          aria-label={t().volume}
          aria-valuetext={`${Math.round((volume / 1.5) * 100)}%`}
          onInput={(e) => {
            masterVolume.value = Number((e.target as HTMLInputElement).value);
          }}
        />
      </div>
    </Zone>
  );
}

/** One reference-style channel strip: M mute, volume, pan (D8). */
export function ChannelStrip({ ch, label, mute }: { ch: number; label: string; mute: boolean }) {
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
