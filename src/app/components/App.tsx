import { CanvasPane } from './CanvasPane';
import { MenuBar } from './MenuBar';
import { TransportBar } from './TransportBar';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { AboutDialog, WelcomeDialog } from './Dialogs';
import { UrlDialog } from './UrlDialog';
import { GainDialog, NormalizeDialog } from './PromptDialogs';
import { EffectDialog } from './EffectDialog';
import { exportOpen, metadataOpen, recordSettingsOpen } from '../state';
import { ExportDialog } from './ExportDialog';
import { RecordSettingsDialog } from './RecordSettingsDialog';
import { AnalysisPanel } from './AnalysisPanel';
import { MetadataDialog } from './MetadataDialog';

export function App() {
  return (
    <div class="shell">
      <MenuBar />
      <TransportBar />
      <main class="workspace">
        <CanvasPane />
      </main>
      <AnalysisPanel />
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
      {metadataOpen.value && <MetadataDialog />}
    </div>
  );
}
