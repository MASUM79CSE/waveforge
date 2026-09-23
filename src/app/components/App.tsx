import { CanvasPane } from './CanvasPane';
import { MenuBar } from './MenuBar';
import { TransportBar } from './TransportBar';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { AboutDialog, WelcomeDialog } from './Dialogs';
import { UrlDialog } from './UrlDialog';

export function App() {
  return (
    <div class="shell">
      <MenuBar />
      <TransportBar />
      <main class="workspace">
        <CanvasPane />
      </main>
      <StatusBar />
      <Toasts />
      <WelcomeDialog />
      <AboutDialog />
      <UrlDialog />
    </div>
  );
}
