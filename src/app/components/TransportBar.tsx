import { useEffect, useState } from 'preact/hooks';
import { cursorPos, docInfo, looping, playing } from '../state';
import { transport } from '../actions';
import { engine } from '../runtime';
import { fmtClock } from '../../core/format';
import { t } from '../../i18n';

export function TransportBar() {
  const doc = docInfo.value;
  const [volume, setVolume] = useState(0.9);

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

      <div class="transport-spacer" />

      <button class="tbtn" title="Record (M4)" disabled>
        <Svg d="M12 7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5zM8 21h8" />
      </button>

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

function Svg({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
