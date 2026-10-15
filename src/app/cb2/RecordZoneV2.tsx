/**
 * Control Bar v2 record/monitor cluster (CB-3.3): identical controls to v1
 * (monitor, punch, meter, clip, rec-time, count-in) but the meter + time
 * slots are RESERVED (fixed width, always mounted, visibility-toggled) —
 * kills the measured +122 px arm-time layout shift (F-05, E-CB-007).
 * Visibility toggles, never mounts.
 */
import { clipLatched, countInBeat, peakHoldDb, recLevel, recSeconds, recStudio, recording, armed, selection } from '../state';
import { punchRecord, resetClipLatch, setMonitoring } from '../recordActions';
import { fmtClock } from '../../core/format';
import { Zone, Svg } from '../components/Zone';
import { cmdTitle } from './tooltips';
import { t } from '../../i18n';

/** dBFS → 0..100 meter width (-60 dB floor). */
function meterPercent(peakDb: number): number {
  if (!Number.isFinite(peakDb)) return 0;
  return Math.max(0, Math.min(100, Math.round(((peakDb + 60) / 60) * 100)));
}

export function RecordZoneV2() {
  const rec = recording.value;
  const isArmed = armed.value && !rec;
  return (
    <Zone label="Record">
      <button
        class={`tbtn ${recStudio.value.monitoring ? 'active' : ''}`}
        title={cmdTitle('record.monitor')}
        aria-label={t().monitorTitle}
        aria-pressed={recStudio.value.monitoring}
        data-testid="monitor-toggle"
        onClick={() => setMonitoring(!recStudio.value.monitoring)}
      >
        <Svg d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-6H4zm16 0a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v-6h1z" />
      </button>
      <button
        class="tbtn"
        title={cmdTitle('record.punch')}
        aria-label={t().punchIn}
        data-testid="punch-button"
        disabled={rec || !selection.value}
        onClick={() => void punchRecord()}
      >
        <Svg d="M9 4h2v16H9zM14 4h1a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-1zM5 6h2v12H5z" />
      </button>
      <span class="cb2-rec-slot" data-testid="cb2-rec-slot">
        <span class="rec-meter" title={`${Math.round(recLevel.value.peakDb)} dB`} style={{ visibility: rec || isArmed ? 'visible' : 'hidden' }}>
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
            title={cmdTitle('record.clipReset')}
            aria-label={t().clipReset}
            data-testid="clip-led"
            onClick={resetClipLatch}
          />
        </span>
        <span class="rec-time" style={{ visibility: rec ? 'visible' : 'hidden' }}>
          {rec ? fmtClock(recSeconds.value) : '0:00.000'}
        </span>
      </span>
      <span
        class="cb2-count-slot"
        style={{ visibility: countInBeat.value > 0 ? 'visible' : 'hidden' }}
      >
        {countInBeat.value > 0 ? (
          <span class="count-chip" aria-live="polite" data-testid="count-in">
            {countInBeat.value}
          </span>
        ) : (
          <span class="count-chip" aria-hidden="true" />
        )}
      </span>
    </Zone>
  );
}
