import { docInfo } from '../state';
import { t } from '../../i18n';

/** M0: transport chrome with honest disabled state. Wiring lands in M1. */
export function TransportBar() {
  const doc = docInfo.value;

  return (
    <div class="transport">
      <div class="transport-group">
        <button class="tbtn" title="Seek Start (Home)" disabled>
          <Svg d="M6 5v14M20 5l-11 7 11 7z" />
        </button>
        <button class="tbtn tbtn-play" title="Play (Space)" disabled>
          <Svg d="M7 4l14 8-14 8z" />
        </button>
        <button class="tbtn" title="Stop" disabled>
          <Svg d="M6 6h12v12H6z" />
        </button>
        <button class="tbtn" title="Toggle Loop (L)" disabled>
          <Svg d="M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3H2a5 5 0 0 1 5-5h10V2zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3h2a5 5 0 0 1-5 5H7v3z" />
        </button>
      </div>

      <div class="transport-time" title="Cursor / duration">
        <span class="time-cursor">0:00.000</span>
        <span class="time-sep">/</span>
        <span class="time-total">{doc ? '0:00.000' : '0:00.000'}</span>
      </div>

      <div class="transport-spacer" />

      <button class="tbtn" title="Record (M4)" disabled>
        <Svg d="M12 7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5zM8 21h8" />
      </button>

      <div class="transport-vol">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 9v6h4l5 5V4L7 9H3z" />
        </svg>
        <input type="range" min="0" max="1.5" step="0.01" value="0.9" disabled title={t().volume} />
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
