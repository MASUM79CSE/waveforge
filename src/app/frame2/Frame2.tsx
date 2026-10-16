/**
 * Frame2 (UX-2.5) — the clean-slate Z-shell (docs/audits/ui-redesign/phase1/IA.md §1),
 * rendered only when the `ui.cleanSlateLayout` flag is ON. Option B
 * (unified two-row, UX-D6): Z1 menu row, Z2 primary + secondary command
 * bands, Z4–Z7 graph block, Z8 status, Z9 overlays.
 *
 * Phase 2 mounts the existing bars into the zones verbatim (capability
 * function is 100% preserved); Phase 3 decomposes them into the re-homed
 * toolbar groups. All dialogs/banners/toasts are the SAME components as the
 * legacy frame — no capability lives only in one frame.
 */
import { CanvasPane } from '../components/CanvasPane';
import { TrackLanes } from '../components/TrackLanes';
import { MenuBar } from '../components/MenuBar';
import { TransportBar } from '../components/TransportBar';
import { StatusBar } from '../components/StatusBar';
import { Toasts } from '../components/Toasts';
import { AboutDialog, WelcomeDialog } from '../components/Dialogs';
import { UrlDialog } from '../components/UrlDialog';
import { GainDialog, NormalizeDialog } from '../components/PromptDialogs';
import { EffectDialog } from '../components/EffectDialog';
import { FxRackDialog } from '../components/FxRackDialog';
import { Pgeq8Dialog } from '../components/Pgeq8Dialog';
import { Reverb2Dialog } from '../components/Reverb2Dialog';
import { NrPrintDialog } from '../components/NrPrintDialog';
import { StretchPitchDialog } from '../components/StretchPitchDialog';
import { ExportDialog } from '../components/ExportDialog';
import { RecordSettingsDialog } from '../components/RecordSettingsDialog';
import { MetadataDialog } from '../components/MetadataDialog';
import { DraftsDialog } from '../components/DraftsDialog';
import { SaveDraftDialog } from '../components/SaveDraftDialog';
import { RestoreBanner } from '../components/RestoreBanner';
import { DoctorPanel } from '../components/DoctorPanel';
import { ShortcutsOverlay } from '../components/ShortcutsOverlay';
import { UpdateBanner } from '../components/UpdateBanner';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { projectOpen } from '../state';
import {
  draftSaveOpen,
  doctorOpen,
  effectDialogId,
  exportOpen,
  metadataOpen,
  recordSettingsOpen,
} from '../state';
import './frame2.css';

export function Frame2() {
  return (
    <div class="shell f2-shell" data-frame2="1">
      <RestoreBanner />
      <header class="f2-zone f2-menubar" data-zone="Z1">
        <MenuBar />
      </header>
      <div class="f2-zone f2-band f2-band-primary" data-zone="Z2">
        <TransportBar />
      </div>
      <main class={`workspace ${projectOpen.value ? 'with-lanes' : ''}`} data-zone="Z4-Z7">
        <CanvasPane />
        <TrackLanes />
      </main>
      <AnalysisPanel />
      <footer class="f2-zone f2-status" data-zone="Z8">
        <StatusBar />
      </footer>
      {/* Z9 — overlays: identical mount set to the legacy frame */}
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
      ) : effectDialogId.value === 'fx.stretch' ? (
        <StretchPitchDialog />
      ) : (
        <EffectDialog />
      )}
      <FxRackDialog />
      {exportOpen.value && <ExportDialog />}
      {recordSettingsOpen.value && <RecordSettingsDialog />}
      {metadataOpen.value && <MetadataDialog />}
      {doctorOpen.value && <DoctorPanel />}
      <ShortcutsOverlay />
      {draftSaveOpen.value && <SaveDraftDialog />}
      <DraftsDialog />
      <UpdateBanner />
    </div>
  );
}
