import { t } from '../i18n';
import * as A from './actions';

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
    id: 'file.export',
    label: () => t().fileExport,
    run: () => A.toastNotYet(t().fileExport, 'M4'),
    sep: true,
  },
  { id: 'file.draftSave', label: () => t().fileDraftSave, run: () => A.toastNotYet(t().fileDraftSave, 'M6') },
  { id: 'file.draftOpen', label: () => t().fileDraftOpen, run: () => A.toastNotYet(t().fileDraftOpen, 'M6') },

  // Edit
  { id: 'edit.undo', label: () => t().editUndo, kbd: 'Shift+Z', run: () => A.toastNotYet(t().editUndo, 'M2') },
  { id: 'edit.redo', label: () => t().editRedo, kbd: 'Shift+Y', run: () => A.toastNotYet(t().editRedo, 'M2') },
  {
    id: 'edit.selectAll',
    label: () => t().editSelectAll,
    kbd: 'Shift+A',
    run: () => A.edit.selectAll(),
    sep: true,
  },
  { id: 'edit.deselect', label: () => t().editDeselect, kbd: 'Q', run: () => A.edit.deselect() },

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

  // Help
  { id: 'help.welcome', label: () => t().helpWelcome, run: () => A.openWelcome() },
  { id: 'help.about', label: () => t().helpAbout, run: () => A.openAbout() },
];

export function runCommand(id: string): void {
  commands.find((command) => command.id === id)?.run();
}
