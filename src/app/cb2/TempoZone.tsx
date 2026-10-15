/**
 * Control Bar v2 tempo/grid/metronome cluster (CB-3.2, F-10): BEAT + SNAP
 * toggles (registry-routed, pressed from signals), detected-BPM readout,
 * metronome toggle and the count-in chip — one zone replacing the scattered
 * Beat bar. APG toolbar semantics (inputs excluded — there are none).
 */
import { bpmResult, beatsShown, snapToBeat, recStudio, countInBeat } from '../state';
import { runCommand } from '../commands';
import { t } from '../../i18n';
import { Zone } from '../components/Zone';
import { useRovingToolbar } from './useRovingToolbar';

export function TempoZone() {
  const roving = useRovingToolbar();
  const bpmText = bpmResult.value ? bpmResult.value.bpm.toFixed(1) : '-';

  const stop = (e: KeyboardEvent): void => {
    if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
  };

  return (
    <Zone label="Tempo">
      <div
        class="cb2-tempo"
        role="toolbar"
        aria-label={t().tempoZone}
        data-testid="cb2-tempo"
        ref={roving.ref}
        onKeyDown={roving.onKeyDown}
        onFocusIn={roving.onFocusIn}
      >
        <button
          class={`flagbtn ${beatsShown.value ? 'on' : ''}`}
          tabIndex={0}
          aria-pressed={beatsShown.value}
          aria-label={t().beatsToggle}
          title={t().beatsToggle}
          data-testid="cb2-beat"
          onClick={() => runCommand('view.beatsShown')}
          onKeyDown={stop}
        >
          <span class="flag">BEAT</span>
        </button>
        <button
          class={`flagbtn ${snapToBeat.value ? 'on' : ''}`}
          tabIndex={-1}
          aria-pressed={snapToBeat.value}
          aria-label={t().snapToggle}
          title={t().snapToggle}
          data-testid="cb2-snap"
          onClick={() => runCommand('view.snapToBeat')}
          onKeyDown={stop}
        >
          <span class="flag">SNAP</span>
        </button>
        <span class="beat-bpm" title={t().bpmTitle}>
          <span class="sel-label">BPM</span>
          <span class="sel-val" data-testid="cb2-bpm">
            {bpmText}
          </span>
        </span>
        <button
          class={`tbtn ${recStudio.value.metronome ? 'active' : ''}`}
          tabIndex={-1}
          aria-pressed={recStudio.value.metronome}
          aria-label={t().studioMetronome}
          title={`${t().studioMetronome} (M)`}
          data-testid="cb2-metronome"
          onClick={() => runCommand('record.metronome')}
          onKeyDown={stop}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3a1 1 0 0 1 .94.66l4.9 13.4 1.36.9a1 1 0 0 1-1.1 1.66l-1.4-.94a1 1 0 0 1-.4-.5L12 6.5 7.3 20.18a1 1 0 0 1-.4.5l-1.4.93a1 1 0 0 1-1.1-1.65l1.36-.9 4.9-13.4A1 1 0 0 1 12 3z" />
            <path d="M8.5 14h7l1.2 3.3H7.3z" />
          </svg>
        </button>
        {countInBeat.value > 0 && (
          <span class="count-chip" aria-live="polite" data-testid="count-in">
            {countInBeat.value}
          </span>
        )}
      </div>
    </Zone>
  );
}
