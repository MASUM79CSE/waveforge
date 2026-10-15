import {
  cursorPos,
  docInfo,
  looping,
  playing,
  recording,
  armed,
} from '../state';
import { transport } from '../actions';
import { toggleRecord } from '../recordActions';
import { ToolBar } from './ToolBar';
import { SelectionBar } from './SelectionBar';
import { BeatBar } from './ViewBars';
import { fmtClock } from '../../core/format';
import { Zone, Svg } from './Zone';
import { RecordZone, MasterZone } from './RecordMasterZones';
import { t } from '../../i18n';

export function TransportBar() {
  const doc = docInfo.value;

  return (
    <div class="transport">
      <Zone label="Position">
        <div class="transport-time" title="Cursor / duration">
          <span class="time-cursor">{fmtClock(cursorPos.value)}</span>
          <span class="time-sep">/</span>
          <span class="time-total">{doc ? fmtClock(doc.duration) : '0:00.000'}</span>
        </div>
      </Zone>

      <Zone label="Play">
        <button
          class={`tbtn tbtn-play-big ${playing.value ? 'playing' : ''}`}
          title={playing.value ? t().pause : `${t().play} (Space)`}
          aria-label={playing.value ? t().pause : `${t().play} (Space)`}
          aria-pressed={playing.value}
          data-testid="transport-play"
          onClick={() => transport.togglePlay()}
          disabled={!doc}
        >
          {playing.value ? <Svg d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <Svg d="M8 5l12 7-12 7z" />}
        </button>
      </Zone>

      <Zone label="Transport">
        <div class="transport-group">
          <button
            class="tbtn"
            title="Back 5 s (Shift+←)"
            aria-label="Back 5 seconds"
            data-testid="transport-seek-back"
            onClick={() => transport.nudge(-5)}
            disabled={!doc}
          >
            <Svg d="M11 6v12L2.5 12zM21 6v12l-8.5-6z" />
          </button>
          <button
            class="tbtn"
            title="Forward 5 s (Shift+→)"
            aria-label="Forward 5 seconds"
            data-testid="transport-seek-fwd"
            onClick={() => transport.nudge(5)}
            disabled={!doc}
          >
            <Svg d="M13 6v12l8.5-6zM3 6v12l8.5-6z" />
          </button>
          <button
            class={`tbtn ${looping.value ? 'active' : ''}`}
            title={`${t().toggleLoop} (L)`}
            onClick={() => transport.toggleLoop()}
            disabled={!doc}
          >
            <Svg d="M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3H2a5 5 0 0 1 5-5h10V2zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3h2a5 5 0 0 1-5 5H7v3z" />
          </button>
          <button
            class={`tbtn rec-btn ${recording.value ? 'recording' : ''} ${armed.value && !recording.value ? 'armed' : ''}`}
            title={
              recording.value
                ? t().recordStop
                : armed.value
                  ? t().recArmed
                  : t().recordStart
            }
            data-testid="record-toggle"
            onClick={() => void toggleRecord()}
          >
            <Svg d="M12 7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5zM8 21h8" />
          </button>
        </div>
      </Zone>

      <Zone label="Stop / Pause">
        <div class="transport-group">
          <button
            class="tbtn"
            title={`${t().pause} (Space)`}
            aria-label={`${t().pause} (Space)`}
            data-testid="transport-pause"
            onClick={() => transport.pause()}
            disabled={!doc || !playing.value}
          >
            <Svg d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </button>
          <button
            class="tbtn"
            title={t().stop}
            aria-label={t().stop}
            data-testid="transport-stop"
            onClick={() => transport.stop()}
            disabled={!doc}
          >
            <Svg d="M6 6h12v12H6z" />
          </button>
        </div>
      </Zone>

      <Zone label="Edit tools">
        <ToolBar />
      </Zone>
      <Zone label="Selection">
        <SelectionBar />
      </Zone>
      <Zone label="Beat grid">
        <BeatBar />
      </Zone>

      <div class="transport-spacer" />

      <RecordZone />

      <MasterZone />
    </div>
  );
}


