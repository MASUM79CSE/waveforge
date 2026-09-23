import { t } from '../../i18n';
import { BrandMark } from './MenuBar';
import { MenuBar } from './MenuBar';
import { TransportBar } from './TransportBar';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { AboutDialog, WelcomeDialog } from './Dialogs';

export function App() {
  return (
    <div class="shell">
      <MenuBar />
      <TransportBar />
      <main class="workspace">
        <div class="canvas-region">
          <div class="empty-state">
            <BrandMark />
            <p class="empty-title">{t().noAudio}</p>
            <p class="empty-hint">{t().emptyStateHint}</p>
          </div>
        </div>
      </main>
      <StatusBar />
      <Toasts />
      <WelcomeDialog />
      <AboutDialog />
    </div>
  );
}
