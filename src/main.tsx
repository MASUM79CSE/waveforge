import { isRagEnabled } from './rag/flag';
import { render } from 'preact';
import './app/styles/tokens.css';
import './app/styles/base.css';
import './app/styles/app.css';
import { Brand } from './brand';
import { logger } from './core/logger-instance';
import { initLocale } from './i18n';
import { bindKeyboard } from './app/keyboard';
import { bindTooltips } from './app/tooltips';
import { App } from './app/components/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import { probeAutosave } from './app/draftActions';
import * as S from './app/state';

function bootstrap(): void {
  initLocale(); // bn browser → full Bangla UI (P6.4); else English
  bindKeyboard();
  bindTooltips();
  // crash recovery probe + PWA update prompt (M6) — both best-effort
  void probeAutosave();
  if ('serviceWorker' in navigator) {
    void import('virtual:pwa-register').then(({ registerSW }) =>
      registerSW({
        immediate: true,
        onNeedRefresh: () => {
          S.updateReady.value = true;
        },
      }),
    );
  }
  const root = document.getElementById('app');
  if (!root) {
    logger.error('Bootstrap failed: #app root element missing');
    return;
  }
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root,
  );
  logger.info('WaveForge booted', { version: Brand.version });
}

bootstrap();

// Smart RAG dark-launch seam (P1.8 wires the full UI; the flag default is OFF)
if (isRagEnabled()) {
  void import('./rag/runtime').then((r) => r.installTestSeam());
}
