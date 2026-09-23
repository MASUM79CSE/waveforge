/**
 * Crash-recovery banner (M6, §6.3.2): shown at boot when an autosave ring
 * record exists — one click restores the pre-crash session; Discard drops
 * it. Never blocks the UI (fixed strip, dismissible).
 */
import type { JSX } from 'preact';
import { discardAutosave, restoreAutosave } from '../actions';
import { t } from '../../i18n';
import * as S from '../state';

export function RestoreBanner(): JSX.Element | null {
  const stamp = S.restoreStamp.value;
  if (stamp === null) return null;
  const when = new Date(stamp).toLocaleString();

  return (
    <div class="restore-banner" role="status" data-testid="restore-banner">
      <span>
        <strong>{t().restoreTitle}</strong> {t().restoreHint(when)}
      </span>
      <span class="restore-actions">
        <button
          type="button"
          class="btn-primary"
          onClick={() => void restoreAutosave()}
        >
          {t().restoreAccept}
        </button>
        <button
          type="button"
          class="btn-secondary"
          onClick={() => void discardAutosave()}
        >
          {t().restoreDiscard}
        </button>
      </span>
    </div>
  );
}
