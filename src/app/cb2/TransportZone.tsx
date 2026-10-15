/**
 * Control Bar v2 transport zone (CB-2.3): the visual anchor. APG toolbar —
 * one tab stop, roving tabindex via Arrow keys; every control dispatches a
 * registry command (one command system) and its pressed state derives from
 * the authoritative signals. Same testids as v1 so parity specs hold.
 */
import { playing, looping, recording, armed, docInfo } from '../state';
import { runCommand } from '../commands';
import { kbdOf } from './tooltips';
import { t } from '../../i18n';
import { Zone } from '../components/Zone';
import { useRovingToolbar } from './useRovingToolbar';
import { Clock } from './Clock';

export function TransportZone() {
  const doc = docInfo.value;
  const roving = useRovingToolbar();
  const rec = recording.value;
  const isArmed = armed.value && !rec;

  // Space/Enter on a focused button clicks it; stop propagation so the
  // global transport shortcut does not toggle a second time.
  const onButtonKey = (e: KeyboardEvent): void => {
    if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
  };

  return (
    <Zone label="Transport">
      <div
        class="cb2-transport"
        role="toolbar"
        aria-label={t().zoneTransport}
        data-testid="cb2-transport"
        ref={roving.ref}
        onKeyDown={roving.onKeyDown}
        onFocusIn={roving.onFocusIn}
      >
        <Clock />
        <span class="cb2-tsep" aria-hidden="true" />
        <button
          class={`tbtn tbtn-play-big ${playing.value ? 'playing' : ''}`}
          tabIndex={0}
          title={`${playing.value ? t().pause : t().play}${kbdOf('transport.playPause')}`}
          aria-label={playing.value ? t().pause : t().play}
          aria-pressed={playing.value}
          data-testid="transport-play"
          disabled={!doc}
          onClick={() => runCommand('transport.playPause')}
          onKeyDown={onButtonKey}
        >
          {playing.value ? (
            <Svg d="M7 5h4v14H7zM13 5h4v14h-4z" />
          ) : (
            <Svg d="M8 5l12 7-12 7z" />
          )}
        </button>
        <button
          class="tbtn"
          tabIndex={-1}
          title={`${t().stop}${kbdOf('transport.stop')}`}
          aria-label={t().stop}
          data-testid="transport-stop"
          disabled={!doc}
          onClick={() => runCommand('transport.stop')}
          onKeyDown={onButtonKey}
        >
          <Svg d="M6 6h12v12H6z" />
        </button>
        <button
          class={`tbtn rec-btn ${rec ? 'recording' : ''} ${isArmed ? 'armed' : ''}`}
          tabIndex={-1}
          title={`${rec ? t().recordStop : isArmed ? t().recArmed : t().recordStart}${kbdOf('record.toggle')}`}
          aria-label={rec ? t().recordStop : isArmed ? t().recArmed : t().recordStart}
          aria-pressed={rec || isArmed}
          data-testid="record-toggle"
          onClick={() => runCommand('record.toggle')}
          onKeyDown={onButtonKey}
        >
          <Svg d="M12 7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5zM8 21h8" />
        </button>
        <button
          class={`tbtn ${looping.value ? 'active' : ''}`}
          tabIndex={-1}
          title={`${t().toggleLoop}${kbdOf('transport.loop')}`}
          aria-label={t().toggleLoop}
          aria-pressed={looping.value}
          data-testid="cb2-loop"
          disabled={!doc}
          onClick={() => runCommand('transport.loop')}
          onKeyDown={onButtonKey}
        >
          <Svg d="M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3H2a5 5 0 0 1 5-5h10V2zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3h2a5 5 0 0 1-5 5H7v3z" />
        </button>
      </div>
    </Zone>
  );
}

function Svg({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
