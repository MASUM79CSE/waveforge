/**
 * Frame2 (UX-3.3) — the clean-slate Z-shell with the re-homed Option B
 * command bands: Z1 menu row; Z2 primary band (transport toolbar +
 * position + selection readouts); Z3 secondary band (edit / tools /
 * time-snapping / meters groups + toolbars popover); Z4–Z7 graph block;
 * Z8 status; Z9 overlays. Groups dispatch through the ONE registry
 * (`data-cmd`); overflow folds whole sections into the band ⋯ menu by
 * priority; the Toolbars popover drives visibility + Reset.
 *
 * Flag-ON only. The legacy frame (flag OFF) is untouched.
 */
import { useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { Graph } from './Graph';
import { TrackLanes } from '../components/TrackLanes';
import { MenuBar } from '../components/MenuBar';
import { SelectionBar } from '../components/SelectionBar';
import { ChannelStrip } from '../components/TransportBar';
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
import { engine } from '../runtime';
import { channelMutes, docInfo, projectOpen } from '../state';
import {
  draftSaveOpen,
  doctorOpen,
  effectDialogId,
  exportOpen,
  metadataOpen,
  recordSettingsOpen,
} from '../state';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { FRAME2_GROUPS } from './groups';
import { runCommand } from '../commands';
import { GroupSection, PositionReadout, RecordIndicators, overflowEntriesFor } from './Groups';
import { OverflowMenu, type OverflowEntry } from './Overflow';
import { ToolbarsPopover } from './ToolbarsPopover';
import { useBandOverflow } from './useOverflow';
import { visibility } from './visibilityStore';
import './frame2.css';

const PRIMARY_IDS = ['transport', 'position', 'selection'];
const SECONDARY_IDS = ['edit', 'tools', 'timenap', 'meters'];

function MetersExtras() {
  const doc = docInfo.value;
  const stereo = doc !== null && doc.channels >= 2;
  const [volume, setVolume] = useState(0.9);
  useEffect(() => {
    engine.setVolume(volume);
  }, [volume]);
  return (
    <>
      {stereo && (
        <span class="toolbar-group strips" role="group" aria-label="Channel strips">
          <ChannelStrip ch={0} label={t().channelLeft} mute={channelMutes.value[0] ?? false} />
          <ChannelStrip ch={1} label={t().channelRight} mute={channelMutes.value[1] ?? false} />
        </span>
      )}
      <span class="transport-vol">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 9v6h4l5 5V4L7 9H3z" />
        </svg>
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.01"
          value={volume}
          disabled={!doc}
          title={t().volume}
          aria-label={t().volume}
          onInput={(e) => setVolume(Number((e.target as HTMLInputElement).value))}
        />
      </span>
    </>
  );
}

export function Frame2() {
  const primaryRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  const secondaryRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  const vis = visibility.value;

  const transportDef = FRAME2_GROUPS.find((g) => g.group === 'transport');
  const secondaryDefs = FRAME2_GROUPS.filter((g) => g.group !== 'transport');

  const primaryFolded = useBandOverflow(primaryRef, PRIMARY_IDS);
  const secondaryFolded = useBandOverflow(secondaryRef, SECONDARY_IDS);

  const primaryEntries: OverflowEntry[] = overflowEntriesFor(
    transportDef && primaryFolded.includes('transport') ? [transportDef] : [],
  );
  const foldedSecondaryDefs = secondaryDefs.filter((g) => secondaryFolded.includes(g.group));
  const secondaryEntries: OverflowEntry[] = overflowEntriesFor(foldedSecondaryDefs);
  if (secondaryFolded.includes('selection')) {
    secondaryEntries.push({ id: 'selection:clear', label: 'Clear Selection (Q)', action: () => runCommand('edit.deselect') });
  }

  return (
    <div class="shell f2-shell" data-frame2="1">
      <RestoreBanner />
      <header class="f2-zone f2-menubar" data-zone="Z1">
        <MenuBar />
      </header>
      <div class="f2-zone f2-band f2-band-primary" data-zone="Z2">
        <div class="f2-band-inner" ref={primaryRef}>
          {transportDef && vis.transport && (
            <GroupSection def={transportDef} folded={primaryFolded.includes('transport')}>
              <RecordIndicators />
            </GroupSection>
          )}
          <PositionReadout />
          <span
            class={`f2-section f2-selection ${primaryFolded.includes('selection') ? 'f2-folded' : ''}`}
            data-f2-item="selection"
            data-priority="3"
          >
            <SelectionBar />
          </span>
          <OverflowMenu label="More" entries={primaryEntries} />
        </div>
      </div>
      <div class="f2-zone f2-band f2-band-secondary" data-zone="Z3">
        <div class="f2-band-inner" ref={secondaryRef}>
          {secondaryDefs.map((g) =>
            vis[g.group] ? (
              <GroupSection key={g.group} def={g} folded={secondaryFolded.includes(g.group)}>
                {g.group === 'meters' && <MetersExtras />}
              </GroupSection>
            ) : null,
          )}
          <span class="f2-band-end">
            <ToolbarsPopover />
            <OverflowMenu label="More tools" entries={secondaryEntries} />
          </span>
        </div>
      </div>
      <main class={`workspace ${projectOpen.value ? 'with-lanes' : ''}`} data-zone="Z4-Z7">
        <Graph />
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
