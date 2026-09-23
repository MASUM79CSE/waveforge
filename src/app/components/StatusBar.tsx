import { docInfo } from '../state';
import { Brand } from '../../brand';
import { t } from '../../i18n';

export function StatusBar() {
  const doc = docInfo.value;

  return (
    <div class="statusbar">
      <span class="status-item">{doc ? doc.name : t().noAudio}</span>
      {doc && (
        <>
          <span class="status-item">{(doc.sampleRate / 1000).toFixed(1)} kHz</span>
          <span class="status-item">
            {doc.channels === 1 ? 'Mono' : doc.channels === 2 ? 'Stereo' : `${doc.channels} ch`}
          </span>
        </>
      )}
      <span class="status-spacer" />
      <span class="status-item status-meta">{t().statusBar(Brand.version)}</span>
    </div>
  );
}
