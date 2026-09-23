import { cursorPos, docInfo, selection, viewSpp } from '../state';
import { fmtDuration } from '../../core/format';
import { Brand } from '../../brand';
import { t } from '../../i18n';

export function StatusBar() {
  const doc = docInfo.value;
  const sel = selection.value;
  const spp = viewSpp.value;

  return (
    <div class="statusbar">
      <span class="status-item">{doc ? doc.name : t().noAudio}</span>
      {doc && (
        <>
          <span class="status-item">{(doc.sampleRate / 1000).toFixed(1)} kHz</span>
          <span class="status-item">
            {doc.channels === 1 ? 'Mono' : doc.channels === 2 ? 'Stereo' : `${doc.channels} ch`}
          </span>
          <span class="status-item">{fmtDuration(doc.duration)}</span>
        </>
      )}
      <span class="status-spacer" />
      {sel && (
        <span class="status-item status-sel">
          {fmtDuration(Math.max(0, sel.end - sel.start))}
        </span>
      )}
      <span class="status-item" title="Samples per pixel">
        ×{spp < 1 ? spp.toFixed(2) : Math.round(spp)}
      </span>
      <span class="status-item">{cursorPos.value.toFixed(3)} s</span>
      <span class="status-item status-meta">v{Brand.version}</span>
    </div>
  );
}
