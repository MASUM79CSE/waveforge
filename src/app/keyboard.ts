import { runCommand } from './commands';
import {
  closeDoctor,
  closeEffectDialog,
  closeExportDialog,
  closeRecordSettings,
  closeShortcuts,
  edit,
  transport,
  view,
} from './actions';
import { resolveShortcut } from './shortcuts';
import { cancelCountIn } from './recordActions';
import {
  aboutOpen,
  doctorOpen,
  effectDialogId,
  exportOpen,
  recordSettingsOpen,
  shortcutsOpen,
  urlOpen,
  welcomeOpen,
} from './state';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** Global keyboard map — AudioMass-style combos preserved for muscle memory. */
export function bindKeyboard(): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    // Escape closes dialogs (topmost first); a running count-in wins
    if (event.key === 'Escape') {
      cancelCountIn();
      if (effectDialogId.value) closeEffectDialog();
      else if (recordSettingsOpen.value) closeRecordSettings();
      else if (exportOpen.value) closeExportDialog();
      else if (urlOpen.value) urlOpen.value = false;
      else if (doctorOpen.value) closeDoctor();
      else if (shortcutsOpen.value) closeShortcuts();
      else if (aboutOpen.value) aboutOpen.value = false;
      else if (welcomeOpen.value) welcomeOpen.value = false;
      return;
    }

    // modifier layer (standard + legacy combos) — resolved by the pure
    // shortcut table; preventDefault so the browser never hijacks them
    const command = resolveShortcut({
      key: event.key,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      alt: event.altKey,
      shift: event.shiftKey,
    });
    if (command) {
      event.preventDefault();
      runCommand(command);
      return;
    }
    if (event.ctrlKey || event.metaKey) return; // unmapped combos stay with the browser

    switch (event.key) {
      case ' ':
        event.preventDefault();
        transport.togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        transport.nudge(event.shiftKey ? -5 : -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        transport.nudge(event.shiftKey ? 5 : 1);
        break;
      case 'Home':
        event.preventDefault();
        transport.seekStart();
        break;
      case 'End':
        event.preventDefault();
        transport.seekEnd();
        break;
      case 'l':
      case 'L':
        transport.toggleLoop();
        break;
      case '+':
      case '=':
        view.zoomIn();
        break;
      case '-':
      case '_':
        view.zoomOut();
        break;
      case '0':
        view.zoomReset();
        break;
      case 'q':
      case 'Q':
      case '~':
        edit.deselect();
        break;
      default:
        break;
    }
  });
}
