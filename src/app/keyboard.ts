import { runCommand } from './commands';
import { closeEffectDialog, edit, transport, view } from './actions';
import * as EA from './editActions';
import { aboutOpen, welcomeOpen, urlOpen, effectDialogId } from './state';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** Global keyboard map — AudioMass-style combos preserved for muscle memory. */
export function bindKeyboard(): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    // Escape closes dialogs (topmost first)
    if (event.key === 'Escape') {
      if (effectDialogId.value) closeEffectDialog();
      else if (urlOpen.value) urlOpen.value = false;
      else if (aboutOpen.value) aboutOpen.value = false;
      else if (welcomeOpen.value) welcomeOpen.value = false;
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        runCommand('file.open');
      }
      return;
    }

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
      case 'Tab':
        event.preventDefault();
        view.center();
        break;
      // shift combos match both cases: real browsers deliver 'Z' for
      // Shift+Z, but synthesized/IME events may deliver 'z'+shiftKey
      case 'a':
      case 'A':
        if (event.shiftKey) edit.selectAll();
        break;
      case 'z':
      case 'Z':
        if (event.shiftKey) EA.undo();
        break;
      case 'y':
      case 'Y':
        if (event.shiftKey) EA.redo();
        break;
      case 'x':
      case 'X':
        if (event.shiftKey) EA.cutSelection();
        break;
      case 'c':
      case 'C':
        if (event.shiftKey) EA.copySelection();
        break;
      case 'v':
      case 'V':
        if (event.shiftKey) EA.pasteFromClipboard();
        break;
      case 'n':
      case 'N':
        if (event.shiftKey) EA.insertSilence();
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        EA.deleteSelection();
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
