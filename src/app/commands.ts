import { t } from '../i18n';
import * as AU from './automationUi';
import * as A from './actions';
import { kbdHints } from './shortcuts';

const HINTS = kbdHints();
import * as EA from './editActions';
import * as CA from './clipActions';
import { projectOpen } from './state';
import { toastInfo } from './toast';

/**
 * Command registry — one place where menus and keyboard shortcuts meet.
 * Not-yet-implemented entries name their milestone (honest-shell policy).
 */
export interface Command {
  id: string;
  label: () => string;
  kbd?: () => string; // display form (platform-aware — see shortcuts.kbdHints)
  run: () => void;
  check?: boolean; // renders with a checkmark state
  isChecked?: () => boolean;
  sep?: boolean; // separator after this entry
  /** Hidden unless settings.experimentalFx is on (E5 gate, effects v2). */
  experimental?: boolean;
}

export const commands: Command[] = [
  // File
  { id: 'file.open', label: () => t().fileOpen, kbd: () => HINTS.open, run: () => A.pickAudioFile() },
  { id: 'file.url', label: () => t().fileUrl, run: () => A.openUrlDialog() },
  { id: 'file.sample', label: () => t().fileSample, run: () => void A.loadSample() },
  {
    id: 'file.recordSettings',
    label: () => t().fileRecord,
    run: () => A.openRecordSettings(),
  },
  {
    id: 'file.export',
    label: () => t().fileExport,
    run: () => A.openExportDialog(),
    sep: true,
  },
  { id: 'file.draftSave', label: () => t().fileDraftSave, run: () => A.openSaveDraftDialog() },
  { id: 'file.draftOpen', label: () => t().fileDraftOpen, run: () => A.openDraftsDialog() },

  // Edit
  { id: 'edit.undo', label: () => t().editUndo, kbd: () => HINTS.undo, run: () => EA.undo() },
  { id: 'edit.redo', label: () => t().editRedo, kbd: () => HINTS.redo, run: () => EA.redo() },
  { id: 'edit.cut', label: () => t().editCut, kbd: () => HINTS.cut, run: () => EA.cutSelection() },
  { id: 'edit.copy', label: () => t().editCopy, kbd: () => HINTS.copy, run: () => EA.copySelection() },
  { id: 'edit.paste', label: () => t().editPaste, kbd: () => HINTS.paste, run: () => EA.pasteFromClipboard() },
  {
    id: 'edit.delete',
    label: () => t().editDelete,
    kbd: () => 'Del',
    run: () => EA.deleteSelection(),
    sep: true,
  },
  { id: 'edit.trim', label: () => t().editTrim, run: () => EA.trimToSelection() },
  {
    id: 'edit.silence',
    label: () => t().editInsertSilence,
    kbd: () => HINTS.insertSilence,
    run: () => EA.insertSilence(),
    sep: true,
  },
  {
    id: 'edit.selectAll',
    label: () => t().editSelectAll,
    kbd: () => HINTS.selectAll,
    run: () => A.edit.selectAll(),
    sep: true,
  },
  { id: 'edit.deselect', label: () => t().editDeselect, kbd: () => 'Q', run: () => A.edit.deselect() },

  // Effects (sample ops; native-node effects arrive in M3)
  { id: 'fx.gain', label: () => t().fxGain, run: () => A.openGainPrompt() },
  { id: 'fx.fadeIn', label: () => t().fxFadeIn, run: () => EA.applyFadeIn() },
  { id: 'fx.fadeOut', label: () => t().fxFadeOut, run: () => EA.applyFadeOut() },
  { id: 'fx.normalize', label: () => t().fxNormalize, run: () => A.openNormalizePrompt() },
  { id: 'fx.normalizeLufs', label: () => t().fxNormalizeLufs, run: () => A.openEffectDialog('fx.normalizeLufs') },
  { id: 'fx.reverse', label: () => t().fxReverse, run: () => EA.applyReverse() },
  { id: 'fx.invert', label: () => t().fxInvert, run: () => EA.applyInvert(), sep: true },
  { id: 'fx.removeSilence', label: () => t().fxRemoveSilence, run: () => EA.applyRemoveSilence() },
  { id: 'fx.compressor', label: () => t().fxCompressor, run: () => A.openEffectDialog('fx.compressor') },
  { id: 'fx.limiter', label: () => t().fxLimiter, run: () => A.openEffectDialog('fx.limiter') },
  { id: 'fx.pgeq8', label: () => t().fxPgeq8, run: () => A.openEffectDialog('fx.pgeq8') },
  { id: 'fx.pgeq', label: () => t().fxPGEQ, run: () => A.openEffectDialog('fx.pgeq') },
  { id: 'fx.geq10', label: () => t().fxGEQ10, run: () => A.openEffectDialog('fx.geq10') },
  { id: 'fx.geq20', label: () => t().fxGEQ20, run: () => A.openEffectDialog('fx.geq20') },
  { id: 'fx.delay', label: () => t().fxDelay, run: () => A.openEffectDialog('fx.delay') },
  { id: 'fx.reverb', label: () => t().fxReverb, run: () => A.openEffectDialog('fx.reverb') },
  { id: 'fx.reverb2', label: () => t().fxReverb2, run: () => A.openEffectDialog('fx.reverb2') },
  { id: 'fx.chorus', label: () => t().fxChorus, run: () => A.openEffectDialog('fx.chorus') },
  { id: 'fx.flanger', label: () => t().fxFlanger, run: () => A.openEffectDialog('fx.flanger') },
  { id: 'fx.phaser', label: () => t().fxPhaser, run: () => A.openEffectDialog('fx.phaser') },
  { id: 'fx.tremolo', label: () => t().fxTremolo, run: () => A.openEffectDialog('fx.tremolo') },
  { id: 'fx.vibrato', label: () => t().fxVibrato, run: () => A.openEffectDialog('fx.vibrato') },
  { id: 'fx.distortion', label: () => t().fxDistortion, run: () => A.openEffectDialog('fx.distortion') },
  { id: 'fx.gate', label: () => t().fxGate, run: () => A.openEffectDialog('fx.gate') },
  { id: 'fx.deesser', label: () => t().fxDeesser, run: () => A.openEffectDialog('fx.deesser') },
  { id: 'fx.nr3', label: () => t().fxNr3, run: () => A.openEffectDialog('fx.nr3') },
  { id: 'fx.nrPrint', label: () => t().fxNrPrint, run: () => A.openEffectDialog('fx.nrPrint') },
  { id: 'fx.rnvoice', label: () => t().fxRnvoice, run: () => A.openEffectDialog('fx.rnvoice') },
  { id: 'fx.rate', label: () => t().fxRate, run: () => A.openEffectDialog('fx.rate') },
  { id: 'fx.stretch', label: () => t().fxStretch, run: () => A.openEffectDialog('fx.stretch'), experimental: true },

  // View
  { id: 'view.zoomIn', label: () => t().viewZoomIn, kbd: () => '+', run: () => A.view.zoomIn() },
  { id: 'view.zoomOut', label: () => t().viewZoomOut, kbd: () => '-', run: () => A.view.zoomOut() },
  {
    id: 'view.zoomReset',
    label: () => t().viewZoomReset,
    kbd: () => '0',
    run: () => A.view.zoomReset(),
    sep: true,
  },
  {
    id: 'view.center',
    label: () => t().viewCenter,
    kbd: () => 'Tab',
    run: () => A.view.center(),
    sep: true,
  },
  {
    id: 'view.follow',
    label: () => t().viewFollow,
    run: () => A.view.toggleFollow(),
    check: true,
    isChecked: () => A.isFollowOn(),
  },
  {
    id: 'view.zerocross',
    label: () => t().zeroCrossSnap,
    run: () => A.toggleZeroCross(),
    check: true,
    isChecked: () => A.isZeroCrossOn(),
  },
  {
    id: 'view.theme',
    label: () => t().viewLightTheme,
    run: () => A.toggleLightTheme(),
    check: true,
    isChecked: () => A.isLightTheme(),
  },
  {
    id: 'view.accent',
    label: () => `${t().viewAccent} — ${A.accentLabel()}`,
    run: () => A.cycleAccentColor(),
  },
  {
    id: 'view.axis',
    label: () => t().viewAmplitudeAxis,
    run: () => A.toggleAmplitudeAxis(),
    check: true,
    isChecked: () => A.isAmplitudeAxisOn(),
  },
  {
    id: 'view.experimental',
    label: () => t().viewExperimental,
    run: () => A.toggleExperimentalFx(),
    check: true,
    isChecked: () => A.isExperimentalFxOn(),
  },

  // Analyze (M5)
  {
    id: 'analyze.lufs',
    label: () => t().analyzeLoudness,
    run: () => A.measureLoudness(),
  },
  {
    id: 'analyze.bpm',
    label: () => t().analyzeBpm,
    run: () => A.detectBpm(),
  },
  {
    id: 'analyze.beats',
    label: () => t().analyzeBeats,
    run: () => A.toggleBeatsShown(),
    check: true,
    isChecked: () => A.isBeatsShown(),
  },
  {
    id: 'analyze.panel',
    label: () => t().analyzePanel,
    run: () => A.toggleAnalysisPanel(),
    check: true,
    isChecked: () => A.isAnalysisPanelOn(),
  },

  // Help
  { id: 'help.welcome', label: () => t().helpWelcome, run: () => A.openWelcome() },
  // Clip arrangement (M9d2) — keyboard-first; canvas gestures commit here too
  {
    id: 'clip.split',
    label: () => t().clipSplit,
    kbd: () => 'S',
    run: () => {
      if (!CA.splitSelectedAtCursor() && projectOpen.value) toastInfo(t().clipNone);
    },
  },
  {
    id: 'clip.duplicate',
    label: () => t().clipDuplicate,
    kbd: () => HINTS.duplicateClip ?? 'Ctrl+D',
    run: () => {
      if (!CA.duplicateSelectedClip()) toastInfo(t().clipNone);
    },
  },
  {
    id: 'clip.delete',
    label: () => t().clipDelete,
    kbd: () => 'Del',
    run: () => {
      // doc fallback: with no clip selected, Delete keeps its M1 meaning
      if (!CA.deleteSelectedClip()) EA.deleteSelection();
    },
  },
  // Automation envelopes (A4) — per-lane overlay + gestures
  {
    id: 'automation.toggle',
    label: () => t().automationToggle,
    kbd: () => 'A',
    check: true,
    isChecked: () => AU.automationMode.value,
    run: () => AU.toggleAutomationMode(),
  },
  { id: 'help.about', label: () => t().helpAbout, run: () => A.openAbout() },
  { id: 'help.doctor', label: () => t().helpDoctor, run: () => A.openDoctor() },
  { id: 'help.shortcuts', label: () => t().helpShortcuts, run: () => A.openShortcuts() },
];

export function runCommand(id: string): void {
  commands.find((command) => command.id === id)?.run();
}
