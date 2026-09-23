import { t } from '../i18n';
import * as A from './actions';
import * as EA from './editActions';

/**
 * Command registry — one place where menus and keyboard shortcuts meet.
 * Not-yet-implemented entries name their milestone (honest-shell policy).
 */
export interface Command {
  id: string;
  label: () => string;
  kbd?: string; // display form
  run: () => void;
  check?: boolean; // renders with a checkmark state
  isChecked?: () => boolean;
  sep?: boolean; // separator after this entry
}

export const commands: Command[] = [
  // File
  { id: 'file.open', label: () => t().fileOpen, kbd: 'Ctrl+O', run: () => A.pickAudioFile() },
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
  { id: 'file.draftSave', label: () => t().fileDraftSave, run: () => A.toastNotYet(t().fileDraftSave, 'M6') },
  { id: 'file.draftOpen', label: () => t().fileDraftOpen, run: () => A.toastNotYet(t().fileDraftOpen, 'M6') },

  // Edit
  { id: 'edit.undo', label: () => t().editUndo, kbd: 'Shift+Z', run: () => EA.undo() },
  { id: 'edit.redo', label: () => t().editRedo, kbd: 'Shift+Y', run: () => EA.redo() },
  { id: 'edit.cut', label: () => t().editCut, kbd: 'Shift+X', run: () => EA.cutSelection() },
  { id: 'edit.copy', label: () => t().editCopy, kbd: 'Shift+C', run: () => EA.copySelection() },
  { id: 'edit.paste', label: () => t().editPaste, kbd: 'Shift+V', run: () => EA.pasteFromClipboard() },
  {
    id: 'edit.delete',
    label: () => t().editDelete,
    kbd: 'Del',
    run: () => EA.deleteSelection(),
    sep: true,
  },
  { id: 'edit.trim', label: () => t().editTrim, run: () => EA.trimToSelection() },
  {
    id: 'edit.silence',
    label: () => t().editInsertSilence,
    kbd: 'Shift+N',
    run: () => EA.insertSilence(),
    sep: true,
  },
  {
    id: 'edit.selectAll',
    label: () => t().editSelectAll,
    kbd: 'Shift+A',
    run: () => A.edit.selectAll(),
    sep: true,
  },
  { id: 'edit.deselect', label: () => t().editDeselect, kbd: 'Q', run: () => A.edit.deselect() },

  // Effects (sample ops; native-node effects arrive in M3)
  { id: 'fx.gain', label: () => t().fxGain, run: () => A.openGainPrompt() },
  { id: 'fx.fadeIn', label: () => t().fxFadeIn, run: () => EA.applyFadeIn() },
  { id: 'fx.fadeOut', label: () => t().fxFadeOut, run: () => EA.applyFadeOut() },
  { id: 'fx.normalize', label: () => t().fxNormalize, run: () => A.openNormalizePrompt(), sep: true },
  { id: 'fx.reverse', label: () => t().fxReverse, run: () => EA.applyReverse() },
  { id: 'fx.invert', label: () => t().fxInvert, run: () => EA.applyInvert(), sep: true },
  { id: 'fx.removeSilence', label: () => t().fxRemoveSilence, run: () => EA.applyRemoveSilence() },
  { id: 'fx.compressor', label: () => t().fxCompressor, run: () => A.openEffectDialog('fx.compressor') },
  { id: 'fx.limiter', label: () => t().fxLimiter, run: () => A.openEffectDialog('fx.limiter') },
  { id: 'fx.pgeq', label: () => t().fxPGEQ, run: () => A.openEffectDialog('fx.pgeq') },
  { id: 'fx.geq10', label: () => t().fxGEQ10, run: () => A.openEffectDialog('fx.geq10') },
  { id: 'fx.geq20', label: () => t().fxGEQ20, run: () => A.openEffectDialog('fx.geq20') },
  { id: 'fx.delay', label: () => t().fxDelay, run: () => A.openEffectDialog('fx.delay') },
  { id: 'fx.reverb', label: () => t().fxReverb, run: () => A.openEffectDialog('fx.reverb') },
  { id: 'fx.distortion', label: () => t().fxDistortion, run: () => A.openEffectDialog('fx.distortion') },
  { id: 'fx.gate', label: () => t().fxGate, run: () => A.openEffectDialog('fx.gate') },
  { id: 'fx.rate', label: () => t().fxRate, run: () => A.openEffectDialog('fx.rate') },

  // View
  { id: 'view.zoomIn', label: () => t().viewZoomIn, kbd: '+', run: () => A.view.zoomIn() },
  { id: 'view.zoomOut', label: () => t().viewZoomOut, kbd: '-', run: () => A.view.zoomOut() },
  {
    id: 'view.zoomReset',
    label: () => t().viewZoomReset,
    kbd: '0',
    run: () => A.view.zoomReset(),
    sep: true,
  },
  {
    id: 'view.center',
    label: () => t().viewCenter,
    kbd: 'Tab',
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
  { id: 'help.about', label: () => t().helpAbout, run: () => A.openAbout() },
];

export function runCommand(id: string): void {
  commands.find((command) => command.id === id)?.run();
}
