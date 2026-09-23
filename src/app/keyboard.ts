import { runCommand } from './commands';
import { edit, transport, view } from './actions';
import { aboutOpen, welcomeOpen, urlOpen } from './state';

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
      if (urlOpen.value) urlOpen.value = false;
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
      case 'A':
        if (event.shiftKey) edit.selectAll();
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
