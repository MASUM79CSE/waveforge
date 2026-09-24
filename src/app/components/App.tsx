import { CanvasPane } from './CanvasPane';
import { MenuBar } from './MenuBar';
import { TransportBar } from './TransportBar';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { AboutDialog, WelcomeDialog } from './Dialogs';
import { UrlDialog } from './UrlDialog';
import { GainDialog, NormalizeDialog } from './PromptDialogs';
import { EffectDialog } from './EffectDialog';
import { Pgeq8Dialog } from './Pgeq8Dialog';
import { Reverb2Dialog } from './Reverb2Dialog';
import { NrPrintDialog } from './NrPrintDialog';
import {
  draftSaveOpen,
  effectDialogId,
  exportOpen,
  metadataOpen,
  recordSettingsOpen,
} from '../state';
import { ExportDialog } from './ExportDialog';
import { RecordSettingsDialog } from './RecordSettingsDialog';
import { AnalysisPanel } from './AnalysisPanel';
import { MetadataDialog } from './MetadataDialog';
import { DraftsDialog } from './DraftsDialog';
import { SaveDraftDialog } from './SaveDraftDialog';
import { RestoreBanner } from './RestoreBanner';
import { UpdateBanner } from './UpdateBanner';

export function App() {
  return (
    <div class="shell">
      <RestoreBanner />
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
      {effectDialogId.value === 'fx.pgeq8' ? (
        <Pgeq8Dialog />
      ) : effectDialogId.value === 'fx.reverb2' ? (
        <Reverb2Dialog />
      ) : effectDialogId.value === 'fx.nrPrint' ? (
        <NrPrintDialog />
      ) : (
        <EffectDialog />
      )}
      {exportOpen.value && <ExportDialog />}
      {recordSettingsOpen.value && <RecordSettingsDialog />}
      {metadataOpen.value && <MetadataDialog />}
      {draftSaveOpen.value && <SaveDraftDialog />}
      <DraftsDialog />
      <UpdateBanner />
    </div>
  );
}
