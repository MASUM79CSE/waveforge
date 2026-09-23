import { CanvasPane } from './CanvasPane';
import { MenuBar } from './MenuBar';
import { TransportBar } from './TransportBar';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { AboutDialog, WelcomeDialog } from './Dialogs';
import { UrlDialog } from './UrlDialog';
import { GainDialog, NormalizeDialog } from './PromptDialogs';
import { EffectDialog } from './EffectDialog';
import { exportOpen, recordSettingsOpen } from '../state';
import { ExportDialog } from './ExportDialog';
import { RecordSettingsDialog } from './RecordSettingsDialog';

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
      <GainDialog />
      <NormalizeDialog />
      <EffectDialog />
      {exportOpen.value && <ExportDialog />}
      {recordSettingsOpen.value && <RecordSettingsDialog />}
    </div>
  );
}
