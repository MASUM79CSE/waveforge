/**
 * PWA update banner (M6, ADR 008 D6): a new service worker is waiting —
 * the update never applies mid-session; the user opts in via Reload.
 */
import type { JSX } from 'preact';
import { t } from '../../i18n';
import * as S from '../state';

export function UpdateBanner(): JSX.Element | null {
  if (!S.updateReady.value) return null;

  return (
    <div class="update-banner" role="status" data-testid="update-banner">
      <span>{t().updateReady}</span>
      <button
        type="button"
        class="btn-primary"
        onClick={() => window.location.reload()}
      >
        {t().updateReload}
      </button>
    </div>
  );
}
