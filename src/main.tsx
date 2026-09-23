import { render } from 'preact';
import './app/styles/tokens.css';
import './app/styles/base.css';
import './app/styles/app.css';
import { Brand } from './brand';
import { logger } from './core/logger-instance';
import { bindKeyboard } from './app/keyboard';
import { App } from './app/components/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';

function bootstrap(): void {
  bindKeyboard();
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
