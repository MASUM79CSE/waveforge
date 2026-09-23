import { t } from '../i18n';
import { openAbout, openWelcome, toastNotYet } from './actions';

/**
 * Command registry — one place where menus and keyboard shortcuts meet.
 * Every not-yet-implemented entry names its milestone, so the UI never lies
 * about what the app can do (honest-shell policy for M0).
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
  // File (loading/export land in M1/M4, drafts in M6)
  {
    id: 'file.open',
    label: () => t().fileOpen,
    kbd: 'Ctrl+O',
    run: () => toastNotYet(t().fileOpen, 'M1'),
  },
  { id: 'file.url', label: () => t().fileUrl, run: () => toastNotYet(t().fileUrl, 'M1') },
  { id: 'file.sample', label: () => t().fileSample, run: () => toastNotYet(t().fileSample, 'M1') },
  {
    id: 'file.export',
    label: () => t().fileExport,
    run: () => toastNotYet(t().fileExport, 'M4'),
    sep: true,
  },
  {
    id: 'file.draftSave',
    label: () => t().fileDraftSave,
    run: () => toastNotYet(t().fileDraftSave, 'M6'),
  },
  {
    id: 'file.draftOpen',
    label: () => t().fileDraftOpen,
    run: () => toastNotYet(t().fileDraftOpen, 'M6'),
  },

  // Edit (M2)
  { id: 'edit.undo', label: () => t().editUndo, kbd: 'Shift+Z', run: () => toastNotYet(t().editUndo, 'M2') },
  { id: 'edit.redo', label: () => t().editRedo, kbd: 'Shift+Y', run: () => toastNotYet(t().editRedo, 'M2') },
  {
    id: 'edit.selectAll',
    label: () => t().editSelectAll,
    kbd: 'Shift+A',
    run: () => toastNotYet(t().editSelectAll, 'M2'),
    sep: true,
  },
  {
    id: 'edit.deselect',
    label: () => t().editDeselect,
    kbd: 'Q',
    run: () => toastNotYet(t().editDeselect, 'M2'),
  },

  // View (M1 — renderer)
  { id: 'view.zoomIn', label: () => t().viewZoomIn, kbd: '+', run: () => toastNotYet(t().viewZoomIn, 'M1') },
  { id: 'view.zoomOut', label: () => t().viewZoomOut, kbd: '-', run: () => toastNotYet(t().viewZoomOut, 'M1') },
  {
    id: 'view.zoomReset',
    label: () => t().viewZoomReset,
    kbd: '0',
    run: () => toastNotYet(t().viewZoomReset, 'M1'),
    sep: true,
  },
  {
    id: 'view.center',
    label: () => t().viewCenter,
    kbd: 'Tab',
    run: () => toastNotYet(t().viewCenter, 'M1'),
    sep: true,
  },
  {
    id: 'view.follow',
    label: () => t().viewFollow,
    run: () => toastNotYet(t().viewFollow, 'M1'),
    check: true,
    isChecked: () => false,
  },

  // Help (working now)
  {
    id: 'help.welcome',
    label: () => t().helpWelcome,
    run: () => openWelcome(),
  },
  { id: 'help.about', label: () => t().helpAbout, run: () => openAbout() },
];

export function runCommand(id: string): void {
  commands.find((command) => command.id === id)?.run();
}
