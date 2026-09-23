import { useState } from 'preact/hooks';
import { closeUrlDialog, openUrl } from '../actions';
import { urlOpen } from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';

export function UrlDialog() {
  const [value, setValue] = useState('');
  if (!urlOpen.value) return null;

  const load = (): void => {
    closeUrlDialog();
    void openUrl(value);
  };

  return (
    <Modal title={t().urlTitle} onClose={closeUrlDialog}>
      <div class="url-form">
        <p class="url-hint">{t().urlHint}</p>
        <input
          class="url-input"
          type="url"
          placeholder={t().urlPlaceholder}
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) load();
          }}
        />
        <div class="url-actions">
          <button class="btn-secondary" onClick={closeUrlDialog}>
            {t().urlCancel}
          </button>
          <button class="btn-primary" disabled={!value.trim()} onClick={load}>
            {t().urlLoad}
          </button>
        </div>
      </div>
    </Modal>
  );
}
